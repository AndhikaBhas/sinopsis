"""Statistik overlap untuk Overlap Sensitivity Test (Bab 3.3.2).

Proposal membagi rekaman menjadi dua kelas:
  - "teratur"      : rasio overlap < 10 %
  - "tumpang tindih": rasio overlap > 20 %
Rekaman di antaranya (10–20 %) masuk kelas "menengah" agar tidak dibuang.
"""

from dataclasses import dataclass

from pyannote.core import Annotation

LOW_OVERLAP_MAX = 0.10
HIGH_OVERLAP_MIN = 0.20


@dataclass
class OverlapStats:
    uri: str
    speech: float  # detik ada minimal satu pembicara
    overlap: float  # detik ada minimal dua pembicara bersamaan
    num_speakers: int

    @property
    def ratio(self) -> float:
        return self.overlap / self.speech if self.speech else 0.0

    @property
    def overlap_class(self) -> str:
        if self.ratio < LOW_OVERLAP_MAX:
            return "teratur"
        if self.ratio > HIGH_OVERLAP_MIN:
            return "tumpang_tindih"
        return "menengah"


def overlap_stats(reference: Annotation) -> OverlapStats:
    speech = reference.get_timeline().support().duration()
    overlap = reference.get_overlap().duration()
    return OverlapStats(
        uri=reference.uri,
        speech=speech,
        overlap=overlap,
        num_speakers=len(reference.labels()),
    )
