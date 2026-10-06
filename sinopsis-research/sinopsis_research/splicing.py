"""Audio splicing berbasis keheningan (Bab 3.2.2, Gambar 3.1 proposal).

Rekaman panjang dipotong di wilayah hening (level < -40 dBFS selama minimal
0,5 detik) sehingga tidak ada kalimat yang terpotong di tengah. Potongan
dibatasi `max_chunk` detik; jika tidak ada keheningan sebelum batas itu,
audio dipotong paksa tepat di batas.

Catatan: worker splicer di Sinopsis (bw-worker-splicer) justru
*menggabungkan* potongan rekaman dari browser menjadi satu berkas. Modul ini
melakukan hal sebaliknya sesuai proposal, sehingga mekanisme
cross-segment speaker tracking (tracking.py) dapat diuji.
"""

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np

FRAME_SECONDS = 0.032


@dataclass
class SpliceParams:
    silence_dbfs: float = -40.0
    min_silence: float = 0.5  # detik
    max_chunk: float = 300.0  # detik
    min_chunk: float = 30.0  # detik; potongan terakhir yang lebih pendek digabung ke sebelumnya


def frame_dbfs(waveform: np.ndarray, sample_rate: int, frame_seconds: float = FRAME_SECONDS) -> np.ndarray:
    """Level RMS per frame dalam dBFS. `waveform`: (channel, time) atau (time,)."""
    mono = waveform.mean(axis=0) if waveform.ndim == 2 else waveform
    hop = int(round(frame_seconds * sample_rate))
    n_frames = len(mono) // hop
    if n_frames == 0:
        return np.array([])
    frames = mono[: n_frames * hop].reshape(n_frames, hop)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-10))


def silence_cut_points(levels: np.ndarray, params: SpliceParams, frame_seconds: float = FRAME_SECONDS) -> List[float]:
    """Titik tengah setiap wilayah hening yang cukup panjang (detik)."""
    silent = levels < params.silence_dbfs
    min_frames = int(np.ceil(params.min_silence / frame_seconds))
    cuts, start = [], None
    for i, is_silent in enumerate(np.append(silent, False)):
        if is_silent and start is None:
            start = i
        elif not is_silent and start is not None:
            if i - start >= min_frames:
                cuts.append((start + i) / 2 * frame_seconds)
            start = None
    return cuts


def splice(waveform: np.ndarray, sample_rate: int, params: SpliceParams = SpliceParams()) -> List[Tuple[float, float]]:
    """Kembalikan daftar (start, end) potongan dalam detik, menutupi seluruh audio."""
    total = waveform.shape[-1] / sample_rate
    if total <= params.max_chunk:
        return [(0.0, total)]

    cuts = silence_cut_points(frame_dbfs(waveform, sample_rate), params)
    chunks, start = [], 0.0
    while total - start > params.max_chunk:
        limit = start + params.max_chunk
        candidates = [c for c in cuts if start + params.min_chunk <= c <= limit]
        end = candidates[-1] if candidates else limit
        chunks.append((start, end))
        start = end
    if chunks and total - start < params.min_chunk:
        chunks[-1] = (chunks[-1][0], total)
    else:
        chunks.append((start, total))
    return chunks
