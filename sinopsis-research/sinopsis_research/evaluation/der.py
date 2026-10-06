"""Diarization Error Rate (DER) — Bab 2.2.6 & 3.5.1 proposal.

    DER = (False Alarm + Missed Detection + Speaker Confusion) / Total

Konvensi collar
---------------
Proposal memakai collar 250 ms di awal *dan* akhir setiap segmen referensi
(konvensi NIST md-eval: ±0,25 detik). pyannote.metrics mengartikan `collar`
sebagai *lebar total* (setengah sebelum, setengah sesudah batas), sehingga
nilai yang dikirim ke pyannote adalah 2 × collar_per_sisi.
"""

from dataclasses import asdict, dataclass
from typing import Dict, List, Optional

from pyannote.core import Annotation, Timeline
from pyannote.metrics.diarization import DiarizationErrorRate


@dataclass
class DERResult:
    uri: str
    der: float
    false_alarm: float  # detik
    missed_detection: float  # detik
    confusion: float  # detik
    total: float  # detik bicara pada referensi (setelah collar)

    @property
    def false_alarm_rate(self) -> float:
        return self.false_alarm / self.total if self.total else 0.0

    @property
    def missed_rate(self) -> float:
        return self.missed_detection / self.total if self.total else 0.0

    @property
    def confusion_rate(self) -> float:
        return self.confusion / self.total if self.total else 0.0

    def as_dict(self) -> dict:
        data = asdict(self)
        data.update(
            false_alarm_rate=self.false_alarm_rate,
            missed_rate=self.missed_rate,
            confusion_rate=self.confusion_rate,
        )
        return data


def make_metric(collar_per_side: float = 0.25, skip_overlap: bool = False) -> DiarizationErrorRate:
    return DiarizationErrorRate(collar=2 * collar_per_side, skip_overlap=skip_overlap)


def evaluate_der(
    references: Dict[str, Annotation],
    hypotheses: Dict[str, Annotation],
    uems: Optional[Dict[str, Timeline]] = None,
    collar_per_side: float = 0.25,
    skip_overlap: bool = False,
) -> List[DERResult]:
    """Hitung DER per berkas, ditambah satu baris agregat dengan uri "TOTAL".

    Agregat dihitung dari penjumlahan durasi (bukan rata-rata DER per berkas),
    sesuai cara pyannote.metrics dan NIST menghitung DER korpus.
    Berkas referensi tanpa hipotesis dianggap seluruhnya *missed*.
    """
    metric = make_metric(collar_per_side, skip_overlap)
    results: List[DERResult] = []

    for uri in sorted(references):
        reference = references[uri]
        hypothesis = hypotheses.get(uri, Annotation(uri=uri))
        uem = uems.get(uri) if uems else None
        components = metric(reference, hypothesis, uem=uem, detailed=True)
        results.append(_to_result(uri, components))

    totals = {
        "false alarm": sum(r.false_alarm for r in results),
        "missed detection": sum(r.missed_detection for r in results),
        "confusion": sum(r.confusion for r in results),
        "total": sum(r.total for r in results),
    }
    totals["diarization error rate"] = (
        (totals["false alarm"] + totals["missed detection"] + totals["confusion"]) / totals["total"]
        if totals["total"]
        else 0.0
    )
    results.append(_to_result("TOTAL", totals))
    return results


def _to_result(uri: str, components: dict) -> DERResult:
    return DERResult(
        uri=uri,
        der=components["diarization error rate"],
        false_alarm=components["false alarm"],
        missed_detection=components["missed detection"],
        confusion=components["confusion"],
        total=components["total"],
    )


def optimal_mapping(reference: Annotation, hypothesis: Annotation) -> Dict[str, str]:
    """Pemetaan label hipotesis -> label referensi yang meminimalkan confusion.

    Dipakai untuk WER per pembicara dan evaluasi klasifikasi gender.
    """
    return DiarizationErrorRate().optimal_mapping(reference, hypothesis)
