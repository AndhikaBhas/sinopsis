"""Pasca-pemrosesan hasil diarization."""

from pyannote.core import Annotation, Timeline


def apply_vad_mask(annotation: Annotation, speech: Timeline) -> Annotation:
    """Pertahankan hanya bagian giliran bicara yang berada di dalam wilayah ucapan VAD.

    Mengurangi *false alarm* (suara AC, ketukan meja, dsb. yang terlanjur
    diberi label pembicara), dengan risiko menambah *missed detection*
    bila VAD terlalu ketat — trade-off inilah yang dicari lewat grid search.
    """
    return annotation.crop(speech, mode="intersection")


def remove_short_turns(annotation: Annotation, min_duration: float) -> Annotation:
    """Buang giliran bicara yang lebih pendek dari `min_duration` detik."""
    if min_duration <= 0:
        return annotation
    filtered = Annotation(uri=annotation.uri)
    for segment, track, label in annotation.itertracks(yield_label=True):
        if segment.duration >= min_duration:
            filtered[segment, track] = label
    return filtered
