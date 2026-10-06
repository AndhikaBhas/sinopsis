"""Baca/tulis berkas RTTM dan UEM.

RTTM (Rich Transcription Time Marked) adalah format standar keluaran dan
referensi diarization. Satu baris = satu giliran bicara:

    SPEAKER <uri> 1 <start> <duration> <NA> <NA> <speaker> <NA> <NA>

UEM menandai rentang waktu yang dievaluasi:

    <uri> 1 <start> <end>
"""

from collections import defaultdict
from pathlib import Path
from typing import Dict, Union

from pyannote.core import Annotation, Segment, Timeline

PathLike = Union[str, Path]


def load_rttm(path: PathLike) -> Dict[str, Annotation]:
    """Muat RTTM menjadi {uri: Annotation}. Satu berkas bisa memuat banyak uri."""
    annotations: Dict[str, Annotation] = {}
    track_counter = defaultdict(int)
    with open(path, encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            fields = line.split()
            if fields[0] != "SPEAKER":
                continue
            if len(fields) < 8:
                raise ValueError(f"{path}:{line_no}: baris RTTM tidak lengkap: {line!r}")
            uri, start, duration, speaker = fields[1], float(fields[3]), float(fields[4]), fields[7]
            if duration <= 0:
                continue
            annotation = annotations.setdefault(uri, Annotation(uri=uri))
            segment = Segment(start, start + duration)
            annotation[segment, track_counter[uri]] = speaker
            track_counter[uri] += 1
    return annotations


def write_rttm(annotation: Annotation, path: PathLike, uri: str = None) -> None:
    """Tulis satu Annotation ke berkas RTTM."""
    uri = uri or annotation.uri or Path(path).stem
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for segment, _, speaker in annotation.itertracks(yield_label=True):
            f.write(
                f"SPEAKER {uri} 1 {segment.start:.3f} {segment.duration:.3f} "
                f"<NA> <NA> {speaker} <NA> <NA>\n"
            )


def load_uem(path: PathLike) -> Dict[str, Timeline]:
    """Muat UEM menjadi {uri: Timeline}."""
    uems: Dict[str, Timeline] = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            fields = line.split()
            if len(fields) < 4:
                continue
            uri, start, end = fields[0], float(fields[2]), float(fields[3])
            uems.setdefault(uri, Timeline(uri=uri)).add(Segment(start, end))
    return uems


def load_rttm_dir(directory: PathLike) -> Dict[str, Annotation]:
    """Muat semua *.rttm dalam satu folder menjadi satu dict {uri: Annotation}."""
    annotations: Dict[str, Annotation] = {}
    for path in sorted(Path(directory).glob("*.rttm")):
        annotations.update(load_rttm(path))
    return annotations


def load_uem_dir(directory: PathLike) -> Dict[str, Timeline]:
    uems: Dict[str, Timeline] = {}
    for path in sorted(Path(directory).glob("*.uem")):
        uems.update(load_uem(path))
    return uems
