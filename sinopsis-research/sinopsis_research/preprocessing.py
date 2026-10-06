"""Audio preprocessing (Bab 3.2.1, Gambar 3.1 proposal).

  1. Bandpass 80 – 8000 Hz untuk membuang dengung perangkat di luar rentang
     suara manusia (dilakukan pada sample rate asli, sebelum resampling).
  2. Resample ke 16 kHz.
  3. Normalisasi volume ke level RMS yang seragam.

Konversi stereo -> mono dilakukan oleh pemanggil, sebelum masuk embedding
(pipeline pyannote menerima mono). Fungsi di sini memproses setiap kanal
secara independen sehingga informasi stereo tetap terjaga.
"""

from dataclasses import dataclass

import numpy as np
import torch
from scipy.signal import butter, sosfiltfilt

TARGET_SAMPLE_RATE = 16000


@dataclass
class PreprocessParams:
    low_hz: float = 80.0
    high_hz: float = 8000.0
    filter_order: int = 4
    target_rms_dbfs: float = -20.0
    peak_limit_dbfs: float = -1.0
    sample_rate: int = TARGET_SAMPLE_RATE


def bandpass(waveform: np.ndarray, sample_rate: int, low_hz: float, high_hz: float, order: int = 4) -> np.ndarray:
    """Filter Butterworth zero-phase. Jika `high_hz` >= Nyquist, hanya highpass."""
    nyquist = sample_rate / 2
    if high_hz >= nyquist * 0.99:
        sos = butter(order, low_hz, btype="highpass", fs=sample_rate, output="sos")
    else:
        sos = butter(order, [low_hz, high_hz], btype="bandpass", fs=sample_rate, output="sos")
    return sosfiltfilt(sos, waveform, axis=-1).astype(np.float32)


def normalize_rms(waveform: np.ndarray, target_dbfs: float = -20.0, peak_limit_dbfs: float = -1.0) -> np.ndarray:
    """Samakan level RMS (seluruh kanal bersama), lalu batasi puncak agar tidak clipping."""
    rms = np.sqrt(np.mean(waveform**2))
    if rms < 1e-8:
        return waveform
    gain = 10 ** (target_dbfs / 20) / rms
    out = waveform * gain
    peak = np.max(np.abs(out))
    limit = 10 ** (peak_limit_dbfs / 20)
    if peak > limit:
        out = out * (limit / peak)
    return out.astype(np.float32)


def preprocess(audio: dict, params: PreprocessParams = PreprocessParams()) -> dict:
    """Terapkan bandpass -> resample -> normalisasi pada dict audio {"waveform", "sample_rate"}."""
    waveform = audio["waveform"].numpy() if isinstance(audio["waveform"], torch.Tensor) else audio["waveform"]
    sample_rate = audio["sample_rate"]

    waveform = bandpass(waveform, sample_rate, params.low_hz, params.high_hz, params.filter_order)
    if sample_rate != params.sample_rate:
        import librosa

        waveform = librosa.resample(waveform, orig_sr=sample_rate, target_sr=params.sample_rate, axis=-1)
        sample_rate = params.sample_rate
    waveform = normalize_rms(waveform, params.target_rms_dbfs, params.peak_limit_dbfs)

    return {**audio, "waveform": torch.from_numpy(np.ascontiguousarray(waveform)), "sample_rate": sample_rate}
