"""Pipeline aplikasi notulensi: audio rapat -> Risalah Rapat.

Dua tahap, dipisah oleh penamaan pembicara oleh notulis:

  analyze(job)          audio -> diarization -> gender -> transkripsi -> contoh suara
                        status: "menunggu_nama"
  finalize(job, names)  nama -> ringkasan LLM -> risalah.md / risalah.docx
                        status: "selesai"

Ringkasan dibuat SETELAH penamaan agar LLM langsung menulis nama asli
sebagai PIC. Tahap yang perangkatnya belum tersedia (model gender, whisperx,
Ollama) dilewati dengan keterangan, sehingga aplikasi tetap menghasilkan
risalah berisi daftar peserta.
"""

import json
import re
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import soundfile as sf
import yaml

from ..audio import duration, load_audio
from ..diarization.pipelines import DiarizationConfig, Diarizer
from ..gender import GenderClassifier, label_speakers, speaker_segments
from ..preprocessing import preprocess
from ..risalah import MeetingInfo, RisalahStyle, render_docx, render_markdown
from ..rttm import write_rttm
from ..splicing import SpliceParams
from .. import summarizer, transcription

ROOT = Path(__file__).resolve().parents[2]

STEPS = [
    ("audio", "Memuat audio"),
    ("diarization", "Diarization (siapa bicara kapan)"),
    ("gender", "Klasifikasi gender"),
    ("transkripsi", "Transkripsi (WhisperX)"),
    ("contoh", "Contoh suara per pembicara"),
    ("ringkasan", "Ringkasan (LLM)"),
    ("risalah", "Membuat risalah"),
]
ANALYZE_STEPS = ["audio", "diarization", "gender", "transkripsi", "contoh"]
AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg"}


@dataclass
class AppConfig:
    diarization: Path
    preprocess: bool = False
    segmented: bool = False
    tracking_threshold: float = 0.85
    gender_model: Optional[Path] = None
    asr: transcription.ASRParams = field(default_factory=transcription.ASRParams)
    llm: summarizer.LLMParams = field(default_factory=summarizer.LLMParams)
    risalah: RisalahStyle = field(default_factory=RisalahStyle)
    hasil_dir: Path = ROOT / "hasil"

    @classmethod
    def load(cls, path: Path = ROOT / "configs" / "app.yaml") -> "AppConfig":
        raw = yaml.safe_load(Path(path).read_text())
        resolve = lambda p: (ROOT / p) if p and not Path(p).is_absolute() else (Path(p) if p else None)  # noqa: E731
        return cls(
            diarization=resolve(raw["diarization"]),
            preprocess=raw.get("preprocess", False),
            segmented=raw.get("segmented", False),
            tracking_threshold=raw.get("tracking_threshold", 0.85),
            gender_model=resolve(raw.get("gender_model")),
            asr=transcription.ASRParams(**(raw.get("asr") or {})),
            llm=summarizer.LLMParams(**(raw.get("llm") or {})),
            risalah=RisalahStyle(**(raw.get("risalah") or {})),
            hasil_dir=resolve(raw.get("hasil_dir", "hasil")),
        )


# --------------------------------------------------------------------------
# Penyimpanan job (satu folder per rapat, meta.json sebagai sumber kebenaran)
# --------------------------------------------------------------------------

class Job:
    _lock = threading.Lock()

    def __init__(self, directory: Path):
        self.dir = Path(directory)

    @property
    def id(self) -> str:
        return self.dir.name

    @property
    def meta_path(self) -> Path:
        return self.dir / "meta.json"

    def read(self) -> dict:
        return json.loads(self.meta_path.read_text())

    def update(self, **changes) -> dict:
        with self._lock:
            meta = self.read() if self.meta_path.exists() else {}
            meta.update(changes)
            tmp = self.meta_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
            tmp.replace(self.meta_path)
            return meta

    def step(self, key: str, status: str, detail: str = "", seconds: Optional[float] = None) -> None:
        with self._lock:
            meta = self.read()
            entry = meta["steps"][key]
            entry.update(status=status, detail=detail)
            if seconds is not None:
                entry["detik"] = round(seconds, 1)
            tmp = self.meta_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
            tmp.replace(self.meta_path)

    @property
    def audio_path(self) -> Path:
        return self.dir / self.read()["audio"]


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "rapat"


def create_job(hasil_dir: Path, audio_name: str, judul: str, tanggal: str = "", tempat: str = "", mulai: str = "") -> Job:
    ext = Path(audio_name).suffix.lower()
    if ext not in AUDIO_EXTENSIONS:
        raise ValueError(
            f"Format {ext or '(tanpa ekstensi)'} belum didukung. Gunakan {', '.join(sorted(AUDIO_EXTENSIONS))} "
            f"(rekaman .m4a dapat dikonversi dulu, mis. dengan ffmpeg atau Audacity)."
        )
    job_id = f"{datetime.now():%Y%m%d-%H%M%S}_{slugify(judul)}_{uuid.uuid4().hex[:4]}"
    job = Job(Path(hasil_dir) / job_id)
    job.dir.mkdir(parents=True)
    job.update(
        id=job_id,
        judul=judul.strip() or "Rapat",
        tanggal=tanggal or None,
        tempat=tempat.strip(),
        mulai=mulai or None,
        audio=f"audio{ext}",
        dibuat=datetime.now().isoformat(timespec="seconds"),
        status="antri",
        error=None,
        steps={key: {"label": label, "status": "menunggu", "detail": ""} for key, label in STEPS},
        speakers={},
        names={},
    )
    return job


def list_jobs(hasil_dir: Path) -> List[dict]:
    jobs = []
    for meta_path in sorted(Path(hasil_dir).glob("*/meta.json"), reverse=True):
        try:
            jobs.append(json.loads(meta_path.read_text()))
        except (OSError, json.JSONDecodeError):
            continue
    return jobs


# --------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------

class NotulensiPipeline:
    """Memegang model yang mahal dimuat (diarizer, ASR, gender) agar dipakai ulang antar rapat."""

    def __init__(self, config: AppConfig):
        self.config = config
        self._diarizer = None
        self._transcriber = None
        self._gender = None
        self._model_lock = threading.Lock()

    # --- model (dimuat malas) ---
    def diarizer(self) -> Diarizer:
        with self._model_lock:
            if self._diarizer is None:
                self._diarizer = Diarizer(DiarizationConfig.from_yaml(self.config.diarization))
            return self._diarizer

    def transcriber(self):
        with self._model_lock:
            if self._transcriber is None:
                self._transcriber = transcription.Transcriber(self.config.asr)
            return self._transcriber

    def gender_classifier(self) -> Optional[GenderClassifier]:
        path = self.config.gender_model
        if not path or not path.exists():
            return None
        if self._gender is None:
            self._gender = GenderClassifier.load(path)
        return self._gender

    # --- tahap 1 ---
    def analyze(self, job: Job) -> None:
        try:
            self._analyze(job)
        except Exception as e:  # noqa: BLE001 — kesalahan apa pun dilaporkan ke halaman
            job.update(status="gagal", error=f"{type(e).__name__}: {e}", traceback=traceback.format_exc())
            for key in ANALYZE_STEPS:
                if job.read()["steps"][key]["status"] == "berjalan":
                    job.step(key, "gagal", str(e))

    def _analyze(self, job: Job) -> None:
        job.update(status="proses", error=None)

        t0 = time.perf_counter()
        job.step("audio", "berjalan")
        audio = load_audio(job.audio_path)
        audio["uri"] = job.id
        if self.config.preprocess:
            audio = preprocess(audio)
        total = duration(audio)
        job.update(durasi_detik=round(total, 2))
        job.step("audio", "selesai", f"{total / 60:.1f} menit", time.perf_counter() - t0)

        t0 = time.perf_counter()
        job.step("diarization", "berjalan", "biasanya ±40 detik per menit audio di CPU")
        annotation = self._diarize(audio)
        write_rttm(annotation, job.dir / "diarization.rttm", uri=job.id)
        labels = annotation.labels()
        speech = sum(annotation.label_duration(label) for label in labels) or 1.0
        speakers = {label: {"porsi": round(annotation.label_duration(label) / speech, 4)} for label in labels}
        job.update(speakers=speakers)
        job.step("diarization", "selesai", f"{len(labels)} pembicara", time.perf_counter() - t0)

        waveform = audio["waveform"].numpy()
        sr = audio["sample_rate"]

        t0 = time.perf_counter()
        classifier = self.gender_classifier()
        if classifier is None:
            job.step("gender", "dilewati", "model gender belum dilatih (scripts/train_gender.py)")
        else:
            job.step("gender", "berjalan")
            for label, (gender, confidence) in label_speakers(classifier, waveform, sr, annotation).items():
                speakers[label].update(gender=gender, gender_yakin=round(confidence, 3))
            job.update(speakers=speakers)
            job.step("gender", "selesai", "", time.perf_counter() - t0)

        t0 = time.perf_counter()
        utterances: List[transcription.Utterance] = []
        if not transcription.is_available():
            job.step("transkripsi", "dilewati", "whisperx belum terpasang (scripts/night_download.sh)")
        else:
            job.step("transkripsi", "berjalan", f"model {self.config.asr.model}")
            words = self.transcriber()(waveform.mean(axis=0))
            transcription.assign_speakers(words, annotation)
            utterances = transcription.group_utterances(words)
            (job.dir / "transkrip.json").write_text(
                json.dumps([u.as_dict() for u in utterances], indent=1, ensure_ascii=False)
            )
            job.step("transkripsi", "selesai", f"{len(words)} kata", time.perf_counter() - t0)

        t0 = time.perf_counter()
        job.step("contoh", "berjalan")
        samples_dir = job.dir / "contoh"
        samples_dir.mkdir(exist_ok=True)
        for label, segments in speaker_segments(annotation, min_duration=0.5).items():
            if segments:
                seg = segments[0]  # segmen bersih terpanjang
                start, end = seg.start, min(seg.end, seg.start + 6.0)
                sf.write(samples_dir / f"{label}.wav", waveform[:, int(start * sr):int(end * sr)].T, sr)
                speakers[label]["contoh_detik"] = round(start, 2)
            sentence = summarizer.first_sentence(utterances, label) if utterances else None
            if sentence:
                speakers[label]["contoh_kalimat"] = sentence
        job.update(speakers=speakers)
        job.step("contoh", "selesai", "", time.perf_counter() - t0)

        job.update(status="menunggu_nama")

    def _diarize(self, audio: dict):
        diarizer = self.diarizer()
        if self.config.segmented:
            from ..diarization.segmented import diarize_segmented

            return diarize_segmented(
                diarizer, audio, SpliceParams(), tracking_threshold=self.config.tracking_threshold
            ).annotation
        return diarizer(audio).annotation

    # --- tahap 2 ---
    def finalize(self, job: Job, names: Dict[str, str]) -> None:
        try:
            self._finalize(job, names)
        except Exception as e:  # noqa: BLE001
            job.update(status="gagal", error=f"{type(e).__name__}: {e}", traceback=traceback.format_exc())
            for key in ("ringkasan", "risalah"):
                if job.read()["steps"][key]["status"] == "berjalan":
                    job.step(key, "gagal", str(e))

    def _finalize(self, job: Job, names: Dict[str, str]) -> None:
        names = {k: v.strip() for k, v in names.items() if v and v.strip()}
        meta = job.update(names=names, status="meringkas", error=None)
        participants = summarizer.build_participants(meta["speakers"], names)
        utterances = load_utterances(job)
        transcript = transcription.format_transcript(utterances, names) if utterances else ""

        t0 = time.perf_counter()
        if not utterances:
            notulensi = summarizer.empty_notulensi(participants, "Ringkasan belum tersedia: transkripsi belum dijalankan.")
            job.step("ringkasan", "dilewati", "tidak ada transkrip")
        elif not summarizer.is_available(self.config.llm):
            notulensi = summarizer.empty_notulensi(
                participants, f"Ringkasan belum tersedia: Ollama/model {self.config.llm.model} belum berjalan."
            )
            job.step("ringkasan", "dilewati", f"Ollama/{self.config.llm.model} tidak ditemukan")
        else:
            job.step("ringkasan", "berjalan", f"model {self.config.llm.model}")
            notulensi = summarizer.summarize(
                utterances, names, participants, self.config.llm,
                progress=lambda i, n: job.step("ringkasan", "berjalan", f"bagian {i}/{n}"),
            )
            job.step("ringkasan", "selesai", f"{len(notulensi['pokok_bahasan'])} pokok bahasan", time.perf_counter() - t0)

        t0 = time.perf_counter()
        job.step("risalah", "berjalan")
        info = MeetingInfo(
            judul=meta["judul"], tanggal=meta.get("tanggal"), tempat=meta.get("tempat", ""),
            mulai=meta.get("mulai"), durasi_detik=meta.get("durasi_detik", 0.0),
        )
        (job.dir / "notulensi.json").write_text(json.dumps(notulensi, indent=2, ensure_ascii=False))
        if transcript:
            (job.dir / "transkrip.txt").write_text(transcript + "\n")
        (job.dir / "risalah.md").write_text(render_markdown(info, notulensi, transcript, self.config.risalah))
        render_docx(info, notulensi, job.dir / "risalah.docx", transcript, self.config.risalah)
        job.step("risalah", "selesai", "", time.perf_counter() - t0)
        job.update(status="selesai")


def load_utterances(job: Job) -> List[transcription.Utterance]:
    path = job.dir / "transkrip.json"
    if not path.exists():
        return []
    return [transcription.Utterance(**u) for u in json.loads(path.read_text())]
