"""Diarization per potongan audio + cross-segment speaker tracking.

Alur (Bab 3.2.2 – 3.2.4):
    audio --splice--> potongan_1, potongan_2, ...
    tiap potongan --diarize--> label lokal + embedding per pembicara
    tracker --cosine >= threshold--> label global yang konsisten
    gabungkan semua potongan (waktu digeser ke posisi aslinya)
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
from pyannote.core import Annotation

from ..splicing import SpliceParams, splice
from ..tracking import CrossSegmentTracker, MatchDecision, label_durations, relabel
from .pipelines import Diarizer


@dataclass
class SegmentedResult:
    annotation: Annotation
    chunks: List[Tuple[float, float]]
    decisions: List[List[MatchDecision]] = field(default_factory=list)


def diarize_segmented(
    diarizer: Diarizer,
    audio: dict,
    splice_params: SpliceParams = SpliceParams(),
    tracking_threshold: float = 0.85,
    use_tracking: bool = True,
    chunk_cache: Optional[Dict[str, object]] = None,
) -> SegmentedResult:
    """Diarization per potongan.

    use_tracking=False menghasilkan baseline "tanpa tracking": label lokal tiap
    potongan dianggap identitas baru (SPEAKER_cXX_YY), untuk membuktikan
    manfaat tracker pada evaluasi DER.

    chunk_cache: dict opsional untuk menyimpan hasil diarization tiap potongan,
    sehingga pemanggilan ulang (mis. dengan ambang tracker berbeda) tidak
    menjalankan ulang model.
    """
    waveform = audio["waveform"]
    sample_rate = audio["sample_rate"]
    uri = audio.get("uri")
    chunks = splice(waveform.numpy(), sample_rate, splice_params)
    tracker = CrossSegmentTracker(threshold=tracking_threshold)

    merged = Annotation(uri=uri)
    for index, (start, end) in enumerate(chunks):
        piece = {
            "waveform": waveform[:, int(start * sample_rate) : int(end * sample_rate)],
            "sample_rate": sample_rate,
            "uri": f"{uri}_chunk{index:03d}",
        }
        if chunk_cache is not None and piece["uri"] in chunk_cache:
            output = chunk_cache[piece["uri"]]
        else:
            output = diarizer(piece)
            if chunk_cache is not None:
                chunk_cache[piece["uri"]] = output
        labels = output.annotation.labels()
        if not labels:
            continue

        if use_tracking:
            embeddings = output.speaker_embeddings
            if embeddings is None or len(embeddings) < len(labels):
                # tanpa embedding, tracker tidak bisa mencocokkan -> semua jadi pembicara baru
                embeddings = np.full((len(labels), 1), np.nan)
            mapping = tracker.assign(labels, embeddings[: len(labels)], label_durations(output.annotation, labels))
        else:
            mapping = {label: f"SPEAKER_c{index:03d}_{label.rsplit('_', 1)[-1]}" for label in labels}

        for segment, track, label in relabel(output.annotation, mapping, offset=start).itertracks(yield_label=True):
            merged[segment, f"{index}_{track}"] = label

    return SegmentedResult(annotation=merged, chunks=chunks, decisions=tracker.history)
