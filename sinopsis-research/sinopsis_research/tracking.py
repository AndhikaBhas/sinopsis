"""Cross-segment speaker tracking (Bab 2.2.3 & 3.2.2, Gambar 3.2 proposal).

Ketika audio rapat diproses per potongan, setiap potongan mendapat label lokal
(SPEAKER_00, SPEAKER_01, ...) yang tidak konsisten antar potongan. Tracker ini
memetakan label lokal ke identitas global:

  1. Hitung matriks cosine similarity S (m × k) antara centroid embedding
     m cluster lokal dan k pembicara global yang sudah dikenal.
  2. Pencocokan greedy: ambil pasangan dengan similarity tertinggi, selama
     S >= threshold (default 0,85) dan kedua sisi belum terpakai.
  3. Cluster lokal tanpa pasangan didaftarkan sebagai pembicara global baru.
  4. Centroid global diperbarui dengan rata-rata berbobot durasi bicara.

Satu pembicara global hanya boleh dipasangkan dengan satu cluster lokal per
potongan, karena dalam satu potongan dua cluster berbeda diasumsikan dua orang
berbeda (keputusan clustering lokal dihormati).
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

import numpy as np
from pyannote.core import Annotation


@dataclass
class GlobalSpeaker:
    label: str
    centroid: np.ndarray  # sudah dinormalisasi L2
    weight: float  # total durasi bicara (detik) yang membentuk centroid
    gender: Optional[str] = None


@dataclass
class MatchDecision:
    local_label: str
    global_label: str
    similarity: Optional[float]  # None jika pembicara baru
    is_new: bool


@dataclass
class CrossSegmentTracker:
    threshold: float = 0.85
    label_format: str = "SPEAKER_{:02d}"
    speakers: List[GlobalSpeaker] = field(default_factory=list)
    history: List[List[MatchDecision]] = field(default_factory=list)

    def assign(
        self,
        local_labels: Sequence[str],
        embeddings: np.ndarray,
        durations: Optional[Sequence[float]] = None,
        genders: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        """Petakan label lokal satu potongan ke label global.

        Args:
            local_labels: label cluster lokal, urutan sama dengan `embeddings`.
            embeddings: array (m, dim) centroid embedding per cluster lokal.
                Baris berisi NaN (cluster tanpa embedding valid) selalu jadi
                pembicara baru.
            durations: durasi bicara tiap cluster lokal, bobot pembaruan centroid.
            genders: opsional {label_lokal: "pria"/"wanita"}. Jika kedua sisi
                punya gender dan berbeda, pasangan tidak dicocokkan.

        Returns:
            {label_lokal: label_global}
        """
        embeddings = np.asarray(embeddings, dtype=np.float64)
        if embeddings.ndim != 2 or embeddings.shape[0] != len(local_labels):
            raise ValueError("embeddings harus berukuran (jumlah_label, dim)")
        durations = list(durations) if durations is not None else [1.0] * len(local_labels)
        genders = genders or {}

        local = _normalize(embeddings)
        valid = ~np.isnan(local).any(axis=1)

        mapping: Dict[str, str] = {}
        decisions: List[MatchDecision] = []

        if self.speakers and valid.any():
            centroids = np.stack([s.centroid for s in self.speakers])
            matchable = ~np.isnan(centroids).any(axis=1)
            similarity = np.full((len(local_labels), len(self.speakers)), -np.inf)
            rows, cols = np.ix_(np.flatnonzero(valid), np.flatnonzero(matchable))
            similarity[rows, cols] = local[valid] @ centroids[matchable].T
            for i, label in enumerate(local_labels):
                for j, speaker in enumerate(self.speakers):
                    g_local, g_global = genders.get(label), speaker.gender
                    if g_local and g_global and g_local != g_global:
                        similarity[i, j] = -np.inf

            used_local, used_global = set(), set()
            for flat in np.argsort(similarity, axis=None)[::-1]:
                i, j = np.unravel_index(flat, similarity.shape)
                score = similarity[i, j]
                if score < self.threshold:
                    break
                if i in used_local or j in used_global:
                    continue
                used_local.add(i)
                used_global.add(j)
                speaker = self.speakers[j]
                mapping[local_labels[i]] = speaker.label
                decisions.append(MatchDecision(local_labels[i], speaker.label, float(score), False))
                self._update(speaker, local[i], durations[i], genders.get(local_labels[i]))

        for i, label in enumerate(local_labels):
            if label in mapping:
                continue
            new_label = self.label_format.format(len(self.speakers))
            centroid = local[i] if valid[i] else None
            if centroid is not None:
                self.speakers.append(GlobalSpeaker(new_label, centroid, float(durations[i]), genders.get(label)))
            else:
                # tanpa embedding, beri label baru tetapi tidak bisa dicocokkan di masa depan
                self.speakers.append(
                    GlobalSpeaker(new_label, np.full(local.shape[1], np.nan), 0.0, genders.get(label))
                )
            mapping[label] = new_label
            decisions.append(MatchDecision(label, new_label, None, True))

        self.history.append(decisions)
        return mapping

    def _update(self, speaker: GlobalSpeaker, embedding: np.ndarray, weight: float, gender: Optional[str]) -> None:
        total = speaker.weight + weight
        if total > 0:
            speaker.centroid = _normalize((speaker.centroid * speaker.weight + embedding * weight)[None] / total)[0]
            speaker.weight = total
        if speaker.gender is None and gender:
            speaker.gender = gender


def _normalize(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=-1, keepdims=True)
    with np.errstate(invalid="ignore", divide="ignore"):
        return x / norms


def relabel(annotation: Annotation, mapping: Dict[str, str], offset: float = 0.0) -> Annotation:
    """Ganti label lokal dengan label global, dan geser waktu sebesar `offset` detik."""
    shifted = Annotation(uri=annotation.uri)
    for segment, track, label in annotation.itertracks(yield_label=True):
        new_segment = type(segment)(segment.start + offset, segment.end + offset)
        shifted[new_segment, track] = mapping.get(label, label)
    return shifted


def label_durations(annotation: Annotation, labels: Sequence[str]) -> List[float]:
    return [annotation.label_duration(label) for label in labels]
