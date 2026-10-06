"""Voice Activity Detection dengan Silero VAD (Bab 2.2.1, 3.2.3, 3.3.1 proposal).

Segmentasi pyannote 3.x/4.x berbasis *powerset* sehingga tidak lagi memiliki
parameter onset/offset. Parameter VAD pada proposal karenanya diterapkan
lewat Silero VAD sebagai tahap terpisah:

    threshold            ambang probabilitas ucapan (onset)
    offset               ambang untuk mengakhiri ucapan (default threshold - 0,15,
                         sama seperti Silero)
    min_speech_duration  ucapan lebih pendek dari ini dibuang (proposal: 0,2–0,5 s)
    min_silence_duration jeda lebih pendek dari ini digabung

Probabilitas per frame dihitung sekali (`speech_probabilities`) lalu
di-binarisasi berkali-kali dengan parameter berbeda (`binarize`), sehingga
grid search parameter VAD tidak perlu menjalankan ulang model.
"""

from dataclasses import dataclass
from typing import Optional

import numpy as np
import torch
from pyannote.core import Segment, Timeline

SAMPLE_RATE = 16000
FRAME_SAMPLES = 512  # Silero v5 @16 kHz: 32 ms per frame
FRAME_SECONDS = FRAME_SAMPLES / SAMPLE_RATE


@dataclass
class VADParams:
    threshold: float = 0.5
    offset: Optional[float] = None
    min_speech_duration: float = 0.25
    min_silence_duration: float = 0.1


class SileroVAD:
    def __init__(self):
        from silero_vad import load_silero_vad

        self.model = load_silero_vad()

    @torch.no_grad()
    def speech_probabilities(self, waveform: torch.Tensor, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
        """Probabilitas ucapan per frame 32 ms. `waveform`: Tensor[1, time] atau [time]."""
        if sample_rate != SAMPLE_RATE:
            raise ValueError(f"Silero VAD membutuhkan {SAMPLE_RATE} Hz, didapat {sample_rate}")
        audio = waveform.reshape(-1).float()
        remainder = audio.shape[0] % FRAME_SAMPLES
        if remainder:
            audio = torch.nn.functional.pad(audio, (0, FRAME_SAMPLES - remainder))
        self.model.reset_states()
        if hasattr(self.model, "audio_forward"):
            probs = self.model.audio_forward(audio.unsqueeze(0), SAMPLE_RATE)
        else:
            probs = torch.stack([self.model(chunk, SAMPLE_RATE) for chunk in audio.split(FRAME_SAMPLES)])
        self.model.reset_states()
        return probs.reshape(-1).cpu().numpy()


def binarize(probs: np.ndarray, params: VADParams, uri: str = None) -> Timeline:
    """Ubah probabilitas per frame menjadi Timeline wilayah ucapan (dengan histeresis)."""
    onset = params.threshold
    offset = params.offset if params.offset is not None else max(onset - 0.15, 0.01)

    regions = []
    active, start = False, 0.0
    for i, p in enumerate(probs):
        t = i * FRAME_SECONDS
        if not active and p >= onset:
            active, start = True, t
        elif active and p < offset:
            active = False
            regions.append([start, t])
    if active:
        regions.append([start, len(probs) * FRAME_SECONDS])

    # gabungkan jeda pendek
    merged = []
    for region in regions:
        if merged and region[0] - merged[-1][1] < params.min_silence_duration:
            merged[-1][1] = region[1]
        else:
            merged.append(region)

    timeline = Timeline(uri=uri)
    for start, end in merged:
        if end - start >= params.min_speech_duration:
            timeline.add(Segment(start, end))
    return timeline
