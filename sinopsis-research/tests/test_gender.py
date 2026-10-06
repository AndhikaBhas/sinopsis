import numpy as np
import pytest
from pyannote.core import Annotation, Segment

from sinopsis_research.gender import (
    FEATURE_NAMES,
    GenderClassifier,
    ami_gender,
    extract_features,
    speaker_segments,
)

SR = 16000
rng = np.random.default_rng(0)


def voice(f0, seconds=2.0):
    """Sinyal mirip vokal: harmonik dari f0 dengan sedikit vibrato & noise."""
    t = np.arange(int(seconds * SR)) / SR
    f = f0 * (1 + 0.02 * np.sin(2 * np.pi * 5 * t))
    phase = 2 * np.pi * np.cumsum(f) / SR
    y = sum(np.sin(k * phase) / k for k in range(1, 8))
    return (0.1 * y + 0.002 * rng.normal(size=t.size)).astype(np.float32)


def test_feature_vector_shape_and_f0():
    low = extract_features(voice(110))
    high = extract_features(voice(220))
    assert low.shape == (len(FEATURE_NAMES),)
    assert low[0] == pytest.approx(110, rel=0.1)
    assert high[0] == pytest.approx(220, rel=0.1)


def test_silence_and_short_segments_rejected():
    assert extract_features(np.zeros(SR * 2, np.float32)) is None
    assert extract_features(voice(120, seconds=0.2)) is None


def test_classifier_separates_low_and_high_pitch():
    x, y = [], []
    for _ in range(30):
        x.append(extract_features(voice(rng.uniform(90, 150))))
        y.append("pria")
        x.append(extract_features(voice(rng.uniform(180, 260))))
        y.append("wanita")
    clf = GenderClassifier.train(np.stack(x), y)
    gender, confidence = clf.predict_speaker([extract_features(voice(100)), extract_features(voice(115))])
    assert gender == "pria" and confidence > 0.8
    assert clf.predict_speaker([extract_features(voice(240))])[0] == "wanita"


def test_speaker_segments_excludes_overlap():
    ann = Annotation(uri="m")
    ann[Segment(0, 10), 0] = "A"
    ann[Segment(8, 15), 1] = "B"
    segments = speaker_segments(ann)
    assert segments["A"] == [Segment(0, 8)]
    assert segments["B"] == [Segment(10, 15)]


def test_ami_gender():
    assert ami_gender("MEO015") == "pria"
    assert ami_gender("FEE013") == "wanita"
    assert ami_gender("SPEAKER_00") is None
