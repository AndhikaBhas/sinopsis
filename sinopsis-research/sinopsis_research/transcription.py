"""Transkripsi WhisperX + penggabungan dengan label pembicara (Bab 3.2.7 proposal).

    audio --WhisperX--> segmen teks --forced alignment--> timestamp per kata
    kata + RTTM diarization --overlap terbesar--> kata berlabel pembicara
    kata berurutan dengan pembicara sama --> ujaran (utterance)

`transcribe` membutuhkan paket whisperx (dipasang oleh scripts/night_download.sh).
Penggabungan kata-pembicara (`assign_speakers`, `group_utterances`) tidak
bergantung pada whisperx sehingga bisa diuji terpisah.
"""

from dataclasses import asdict, dataclass
from typing import Dict, List, Optional

import numpy as np
from pyannote.core import Annotation, Segment


@dataclass
class Word:
    text: str
    start: Optional[float]
    end: Optional[float]
    speaker: Optional[str] = None


@dataclass
class Utterance:
    speaker: str
    start: float
    end: float
    text: str

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class ASRParams:
    model: str = "medium"
    language: str = "id"
    compute_type: str = "int8"  # CPU; "float16" untuk GPU
    batch_size: int = 8
    align: bool = True


def is_available() -> bool:
    try:
        import whisperx  # noqa: F401
    except Exception:
        return False
    return True


class Transcriber:
    """Memuat model WhisperX sekali, dipakai berulang."""

    def __init__(self, params: ASRParams = ASRParams(), device: str = "cpu"):
        import whisperx

        self.params = params
        self.device = device
        self._whisperx = whisperx
        self.model = whisperx.load_model(
            params.model, device, compute_type=params.compute_type, language=params.language
        )
        self.align_model, self.align_metadata = (None, None)
        if params.align:
            self.align_model, self.align_metadata = whisperx.load_align_model(
                language_code=params.language, device=device
            )

    def __call__(self, waveform: np.ndarray) -> List[Word]:
        """`waveform`: mono float32 16 kHz. Mengembalikan daftar kata (dengan timestamp bila ada)."""
        audio = np.asarray(waveform, dtype=np.float32).reshape(-1)
        result = self.model.transcribe(audio, batch_size=self.params.batch_size, language=self.params.language)
        segments = result["segments"]
        if self.align_model is not None and segments:
            aligned = self._whisperx.align(
                segments, self.align_model, self.align_metadata, audio, self.device, return_char_alignments=False
            )
            segments = aligned["segments"]
        return words_from_segments(segments)


def words_from_segments(segments: List[dict]) -> List[Word]:
    """Ubah keluaran WhisperX menjadi daftar Word.

    Kata yang tidak berhasil di-align (mis. angka) tidak punya timestamp;
    kata seperti itu diberi timestamp perkiraan dengan membagi rata durasi
    segmennya, agar tetap bisa diberi label pembicara.
    """
    words: List[Word] = []
    for segment in segments:
        seg_words = segment.get("words")
        if not seg_words:
            words.append(Word(segment["text"].strip(), segment.get("start"), segment.get("end")))
            continue
        n = len(seg_words)
        seg_start, seg_end = segment.get("start"), segment.get("end")
        for i, w in enumerate(seg_words):
            start, end = w.get("start"), w.get("end")
            if (start is None or end is None) and seg_start is not None and seg_end is not None:
                step = (seg_end - seg_start) / n
                start, end = seg_start + i * step, seg_start + (i + 1) * step
            words.append(Word(w["word"].strip(), start, end))
    return [w for w in words if w.text]


def assign_speakers(words: List[Word], diarization: Annotation, max_gap: float = 1.0) -> List[Word]:
    """Beri label pembicara pada setiap kata: pembicara dengan overlap waktu terbesar.

    Kata yang jatuh di celah (tidak overlap dengan giliran bicara mana pun)
    mendapat pembicara dari giliran terdekat bila jaraknya <= `max_gap` detik,
    selain itu mewarisi pembicara kata sebelumnya.
    """
    turns = list(diarization.itertracks(yield_label=True))
    previous = None
    for word in words:
        speaker = None
        if word.start is not None and word.end is not None:
            span = Segment(word.start, max(word.end, word.start + 1e-3))
            overlaps: Dict[str, float] = {}
            for segment, _, label in turns:
                inter = segment & span
                if inter:
                    overlaps[label] = overlaps.get(label, 0.0) + inter.duration
            if overlaps:
                speaker = max(overlaps, key=overlaps.get)
            else:
                nearest = min(
                    turns,
                    key=lambda t: min(abs(t[0].start - span.end), abs(span.start - t[0].end)),
                    default=None,
                )
                if nearest is not None:
                    gap = min(abs(nearest[0].start - span.end), abs(span.start - nearest[0].end))
                    if gap <= max_gap:
                        speaker = nearest[2]
        word.speaker = speaker or previous
        previous = word.speaker
    return words


def group_utterances(words: List[Word], max_pause: float = 2.0) -> List[Utterance]:
    """Gabungkan kata berurutan dari pembicara yang sama menjadi ujaran.

    Ujaran baru dimulai saat pembicara berganti atau ada jeda > `max_pause` detik.
    """
    utterances: List[Utterance] = []
    for word in words:
        speaker = word.speaker or "TIDAK_DIKENAL"
        start = word.start if word.start is not None else (utterances[-1].end if utterances else 0.0)
        end = word.end if word.end is not None else start
        if utterances and utterances[-1].speaker == speaker and start - utterances[-1].end <= max_pause:
            last = utterances[-1]
            last.text = f"{last.text} {word.text}"
            last.end = max(last.end, end)
        else:
            utterances.append(Utterance(speaker, start, end, word.text))
    return utterances


def format_timestamp(seconds: float) -> str:
    seconds = int(round(seconds))
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}:{seconds % 60:02d}"


def format_transcript(utterances: List[Utterance], names: Optional[Dict[str, str]] = None) -> str:
    names = names or {}
    return "\n".join(
        f"[{format_timestamp(u.start)}] {names.get(u.speaker) or u.speaker}: {u.text}" for u in utterances
    )
