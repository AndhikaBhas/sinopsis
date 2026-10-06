"""Pemuatan audio ke memori.

Audio diberikan ke pyannote sebagai {"waveform", "sample_rate"} (bukan path),
sama seperti bw-worker-diarizer, sehingga tidak bergantung pada torchcodec
atau ffmpeg untuk berkas WAV/FLAC.
"""

from pathlib import Path
from typing import Union

import numpy as np
import soundfile as sf
import torch

TARGET_SAMPLE_RATE = 16000


def load_audio(path: Union[str, Path], sample_rate: int = TARGET_SAMPLE_RATE, mono: bool = True) -> dict:
    """Muat audio menjadi dict siap pakai untuk pyannote.

    Returns:
        {"waveform": Tensor[channel, time] float32, "sample_rate": int, "uri": str}
    """
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)  # (time, channel)
    data = data.T  # (channel, time)
    if mono and data.shape[0] > 1:
        data = data.mean(axis=0, keepdims=True)
    if sr != sample_rate:
        import librosa

        data = librosa.resample(data, orig_sr=sr, target_sr=sample_rate, axis=-1)
        sr = sample_rate
    return {
        "waveform": torch.from_numpy(np.ascontiguousarray(data)),
        "sample_rate": sr,
        "uri": Path(path).stem,
    }


def duration(audio: dict) -> float:
    return audio["waveform"].shape[-1] / audio["sample_rate"]
