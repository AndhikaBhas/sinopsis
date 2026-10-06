import pytest
from pyannote.core import Annotation, Segment

from sinopsis_research.evaluation.der import evaluate_der
from sinopsis_research.evaluation.overlap import overlap_stats
from sinopsis_research.evaluation.wer import compute_wer, wer_per_speaker
from sinopsis_research.rttm import load_rttm, write_rttm


def make(uri, turns):
    ann = Annotation(uri=uri)
    for i, (start, end, label) in enumerate(turns):
        ann[Segment(start, end), i] = label
    return ann


def test_rttm_roundtrip(tmp_path):
    ann = make("m1", [(0.0, 2.5, "A"), (3.0, 4.0, "B")])
    write_rttm(ann, tmp_path / "m1.rttm")
    loaded = load_rttm(tmp_path / "m1.rttm")["m1"]
    assert loaded.labels() == ["A", "B"]
    assert loaded.get_timeline().duration() == pytest.approx(3.5)


def test_der_perfect_hypothesis_with_renamed_labels():
    ref = make("m1", [(0, 10, "A"), (10, 20, "B")])
    hyp = make("m1", [(0, 10, "SPEAKER_00"), (10, 20, "SPEAKER_01")])
    results = evaluate_der({"m1": ref}, {"m1": hyp}, collar_per_side=0.0)
    assert results[-1].uri == "TOTAL"
    assert results[0].der == pytest.approx(0.0)


def test_der_components():
    ref = make("m1", [(0, 10, "A"), (10, 20, "B")])
    # 2 detik miss di awal, 5 detik confusion, 3 detik false alarm di akhir
    hyp = make("m1", [(2, 10, "X"), (10, 15, "X"), (15, 23, "Y")])
    r = evaluate_der({"m1": ref}, {"m1": hyp}, collar_per_side=0.0)[0]
    assert r.total == pytest.approx(20)
    assert r.missed_detection == pytest.approx(2)
    assert r.false_alarm == pytest.approx(3)
    assert r.confusion == pytest.approx(5)
    assert r.der == pytest.approx(0.5)


def test_collar_is_per_side():
    ref = make("m1", [(0, 10, "A")])
    hyp = make("m1", [(0.2, 10, "A")])  # meleset 0,2 detik di awal
    assert evaluate_der({"m1": ref}, {"m1": hyp}, collar_per_side=0.25)[0].der == pytest.approx(0.0)
    assert evaluate_der({"m1": ref}, {"m1": hyp}, collar_per_side=0.0)[0].der > 0


def test_missing_hypothesis_counts_as_miss():
    ref = make("m1", [(0, 10, "A")])
    r = evaluate_der({"m1": ref}, {}, collar_per_side=0.0)[0]
    assert r.der == pytest.approx(1.0)


def test_overlap_stats():
    ref = make("m1", [(0, 10, "A"), (8, 20, "B")])
    stats = overlap_stats(ref)
    assert stats.speech == pytest.approx(20)
    assert stats.overlap == pytest.approx(2)
    assert stats.ratio == pytest.approx(0.1)
    assert stats.overlap_class == "menengah"


def test_wer_normalizes_case_and_punctuation():
    assert compute_wer("Rapat dimulai, pukul 9.", "rapat dimulai pukul 9").wer == pytest.approx(0.0)
    assert compute_wer("satu dua tiga empat", "satu dua tiga").wer == pytest.approx(0.25)


def test_wer_per_speaker_uses_mapping():
    results = wer_per_speaker(
        {"A": "halo semua", "B": "setuju"},
        {"SPEAKER_00": "halo semua", "SPEAKER_01": "tidak setuju"},
        {"SPEAKER_00": "A", "SPEAKER_01": "B"},
    )
    by_key = {r.key: r.wer for r in results}
    assert by_key["A"] == pytest.approx(0.0)
    assert by_key["B"] == pytest.approx(1.0)
