"""Word Error Rate (WER) — Bab 3.5.2 proposal, dihitung dengan jiwer.

WER dihitung keseluruhan dan per pembicara, supaya terlihat apakah kesalahan
transkripsi terkonsentrasi pada pembicara tertentu.
"""

import re
from dataclasses import dataclass
from typing import Dict, List

import jiwer

_PUNCT = re.compile(r"[^\w\s]", flags=re.UNICODE)
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Huruf kecil, buang tanda baca, rapikan spasi."""
    text = _PUNCT.sub(" ", text.lower())
    return _SPACES.sub(" ", text).strip()


@dataclass
class WERResult:
    key: str  # uri, nama pembicara, atau "TOTAL"
    wer: float
    substitutions: int
    deletions: int
    insertions: int
    reference_words: int


def compute_wer(reference: str, hypothesis: str, key: str = "TOTAL") -> WERResult:
    reference, hypothesis = normalize(reference), normalize(hypothesis)
    if not reference:
        n_hyp = len(hypothesis.split())
        return WERResult(key, float(n_hyp > 0), 0, 0, n_hyp, 0)
    out = jiwer.process_words(reference, hypothesis)
    return WERResult(
        key=key,
        wer=out.wer,
        substitutions=out.substitutions,
        deletions=out.deletions,
        insertions=out.insertions,
        reference_words=out.substitutions + out.deletions + out.hits,
    )


def wer_per_speaker(
    reference_by_speaker: Dict[str, str],
    hypothesis_by_speaker: Dict[str, str],
    mapping: Dict[str, str],
) -> List[WERResult]:
    """WER per pembicara referensi.

    `mapping` memetakan label hipotesis (mis. SPEAKER_00) ke label referensi,
    biasanya dari `der.optimal_mapping`. Teks dari label hipotesis yang tidak
    terpetakan tidak ikut dihitung per pembicara (tetap masuk WER total).
    """
    hyp_for_ref: Dict[str, List[str]] = {}
    for hyp_label, text in hypothesis_by_speaker.items():
        ref_label = mapping.get(hyp_label)
        if ref_label is not None:
            hyp_for_ref.setdefault(ref_label, []).append(text)

    return [
        compute_wer(ref_text, " ".join(hyp_for_ref.get(speaker, [])), key=speaker)
        for speaker, ref_text in sorted(reference_by_speaker.items())
    ]
