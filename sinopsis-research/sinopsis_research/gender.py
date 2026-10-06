"""Klasifikasi gender berbasis akustik (Bab 2.2.7 & 3.2.5 proposal).

Fitur per segmen (librosa):
    F0 (YIN)            median & simpangan baku pada frame bersuara
    13 MFCC             rata-rata & simpangan baku
    spectral flatness   rata-rata
    spectral entropy    rata-rata
Model: jaringan saraf sederhana (MLP, scikit-learn) dengan standardisasi fitur.

Label: "pria" / "wanita". Pada AMI, huruf pertama ID pembicara (M/F)
menjadi ground truth, sehingga model dapat dilatih & dievaluasi tanpa
anotasi manual tambahan.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
from pyannote.core import Annotation, Segment

SAMPLE_RATE = 16000
LABELS = ("pria", "wanita")
F0_MIN, F0_MAX = 65.0, 400.0
N_MFCC = 13
FEATURE_NAMES = (
    ["f0_median", "f0_std", "voiced_ratio"]
    + [f"mfcc{i}_mean" for i in range(N_MFCC)]
    + [f"mfcc{i}_std" for i in range(N_MFCC)]
    + ["flatness_mean", "entropy_mean"]
)


def extract_features(waveform: np.ndarray, sample_rate: int = SAMPLE_RATE) -> Optional[np.ndarray]:
    """Vektor fitur untuk satu segmen mono. None jika segmen terlalu pendek/hening."""
    import librosa

    y = np.asarray(waveform, dtype=np.float32).reshape(-1)
    if len(y) < 0.5 * sample_rate or np.sqrt(np.mean(y**2)) < 1e-4:
        return None

    frame_length = 1024
    hop_length = 256
    f0 = librosa.yin(y, fmin=F0_MIN, fmax=F0_MAX, sr=sample_rate, frame_length=frame_length, hop_length=hop_length)
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    n = min(len(f0), len(rms))
    f0, rms = f0[:n], rms[:n]
    # YIN tidak punya keputusan voiced/unvoiced; anggap frame bersuara bila
    # energinya cukup dan F0 tidak menempel di batas pencarian.
    voiced = (rms > 0.5 * np.median(rms)) & (f0 > F0_MIN * 1.05) & (f0 < F0_MAX * 0.95)
    if voiced.sum() < 5:
        return None
    f0_voiced = f0[voiced]

    mfcc = librosa.feature.mfcc(y=y, sr=sample_rate, n_mfcc=N_MFCC, n_fft=frame_length, hop_length=hop_length)
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=frame_length, hop_length=hop_length)[0]
    power = np.abs(librosa.stft(y, n_fft=frame_length, hop_length=hop_length)) ** 2
    prob = power / np.maximum(power.sum(axis=0, keepdims=True), 1e-12)
    entropy = -(prob * np.log2(np.maximum(prob, 1e-12))).sum(axis=0) / np.log2(prob.shape[0])

    return np.concatenate(
        [
            [np.median(f0_voiced), np.std(f0_voiced), voiced.mean()],
            mfcc.mean(axis=1),
            mfcc.std(axis=1),
            [flatness.mean(), entropy.mean()],
        ]
    ).astype(np.float32)


def speaker_segments(
    annotation: Annotation, min_duration: float = 1.0, max_total: float = 60.0
) -> Dict[str, List[Segment]]:
    """Segmen bersih (tanpa overlap) per pembicara, terpanjang dulu, total <= max_total detik."""
    overlap = annotation.get_overlap()
    result: Dict[str, List[Segment]] = {}
    for label in annotation.labels():
        clean = annotation.label_timeline(label).support().extrude(overlap)
        segments = sorted((s for s in clean if s.duration >= min_duration), key=lambda s: -s.duration)
        chosen, total = [], 0.0
        for segment in segments:
            if total >= max_total:
                break
            chosen.append(segment)
            total += segment.duration
        result[label] = chosen
    return result


def segment_features(waveform: np.ndarray, sample_rate: int, segments: Iterable[Segment], max_seconds: float = 10.0):
    """Fitur untuk setiap segmen; segmen panjang dipotong maksimal `max_seconds`."""
    features = []
    for segment in segments:
        start = int(segment.start * sample_rate)
        end = int(min(segment.end, segment.start + max_seconds) * sample_rate)
        vector = extract_features(waveform[..., start:end], sample_rate)
        if vector is not None:
            features.append(vector)
    return features


def ami_gender(speaker_id: str) -> Optional[str]:
    """ID pembicara AMI: huruf pertama M = pria, F = wanita."""
    return {"M": "pria", "F": "wanita"}.get(speaker_id[:1].upper())


@dataclass
class GenderClassifier:
    model: object = None  # sklearn Pipeline

    @classmethod
    def train(cls, features: np.ndarray, labels: List[str], seed: int = 0) -> "GenderClassifier":
        from sklearn.neural_network import MLPClassifier
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler

        model = make_pipeline(
            StandardScaler(),
            MLPClassifier(hidden_layer_sizes=(32, 16), alpha=1e-3, max_iter=1000, early_stopping=True, random_state=seed),
        )
        model.fit(features, labels)
        return cls(model)

    def predict_proba(self, features: np.ndarray) -> np.ndarray:
        """Probabilitas per kelas, kolom sesuai LABELS."""
        proba = self.model.predict_proba(np.atleast_2d(features))
        order = [list(self.model.classes_).index(label) for label in LABELS]
        return proba[:, order]

    def predict_speaker(self, features: List[np.ndarray]) -> Tuple[Optional[str], float]:
        """Gender satu pembicara dari banyak segmen: rata-rata probabilitas."""
        if not features:
            return None, 0.0
        mean = self.predict_proba(np.stack(features)).mean(axis=0)
        index = int(np.argmax(mean))
        return LABELS[index], float(mean[index])

    def save(self, path: Path) -> None:
        import joblib

        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, path)

    @classmethod
    def load(cls, path: Path) -> "GenderClassifier":
        import joblib

        return cls(joblib.load(path))


def label_speakers(
    classifier: GenderClassifier,
    waveform: np.ndarray,
    sample_rate: int,
    annotation: Annotation,
    min_confidence: float = 0.0,
) -> Dict[str, Tuple[Optional[str], float]]:
    """{label_pembicara: (gender, keyakinan)} untuk setiap pembicara di `annotation`."""
    result = {}
    for label, segments in speaker_segments(annotation).items():
        gender, confidence = classifier.predict_speaker(segment_features(waveform, sample_rate, segments))
        result[label] = (gender if confidence >= min_confidence else None, confidence)
    return result
