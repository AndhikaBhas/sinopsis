import numpy as np
from pyannote.core import Annotation, Segment

from sinopsis_research.tracking import CrossSegmentTracker, relabel

rng = np.random.default_rng(0)
ALICE, BOB, CARA = (rng.normal(size=192) for _ in range(3))


def noisy(v, scale=0.05):
    return v + rng.normal(scale=scale, size=v.shape) * np.linalg.norm(v) / np.sqrt(v.size)


def test_same_speaker_keeps_label_across_segments_even_if_local_labels_swap():
    tracker = CrossSegmentTracker(threshold=0.85)
    first = tracker.assign(["SPEAKER_00", "SPEAKER_01"], np.stack([noisy(ALICE), noisy(BOB)]))
    # di potongan kedua, clustering lokal kebetulan menukar urutan label
    second = tracker.assign(["SPEAKER_00", "SPEAKER_01"], np.stack([noisy(BOB), noisy(ALICE)]))
    assert second["SPEAKER_00"] == first["SPEAKER_01"]
    assert second["SPEAKER_01"] == first["SPEAKER_00"]
    assert len(tracker.speakers) == 2


def test_new_speaker_gets_new_label():
    tracker = CrossSegmentTracker(threshold=0.85)
    tracker.assign(["A"], np.stack([noisy(ALICE)]))
    mapping = tracker.assign(["A", "B"], np.stack([noisy(ALICE), noisy(CARA)]))
    assert mapping["A"] == "SPEAKER_00"
    assert mapping["B"] == "SPEAKER_01"
    assert tracker.history[-1][1].is_new


def test_one_global_speaker_matches_at_most_one_local_cluster():
    tracker = CrossSegmentTracker(threshold=0.5)
    tracker.assign(["A"], np.stack([noisy(ALICE)]))
    mapping = tracker.assign(["X", "Y"], np.stack([noisy(ALICE), noisy(ALICE)]))
    assert sorted(mapping.values()) == ["SPEAKER_00", "SPEAKER_01"]


def test_gender_mismatch_blocks_match():
    tracker = CrossSegmentTracker(threshold=0.5)
    tracker.assign(["A"], np.stack([noisy(ALICE)]), genders={"A": "pria"})
    mapping = tracker.assign(["A"], np.stack([noisy(ALICE)]), genders={"A": "wanita"})
    assert mapping["A"] == "SPEAKER_01"


def test_nan_embedding_never_matches():
    tracker = CrossSegmentTracker(threshold=0.5)
    tracker.assign(["A"], np.full((1, 192), np.nan))
    mapping = tracker.assign(["B", "C"], np.stack([noisy(ALICE), np.full(192, np.nan)]))
    assert mapping == {"B": "SPEAKER_01", "C": "SPEAKER_02"}


def test_relabel_shifts_time():
    ann = Annotation(uri="m")
    ann[Segment(1, 2), 0] = "SPEAKER_00"
    out = relabel(ann, {"SPEAKER_00": "SPEAKER_05"}, offset=60)
    (segment, _, label), = list(out.itertracks(yield_label=True))
    assert (segment.start, segment.end, label) == (61, 62, "SPEAKER_05")
