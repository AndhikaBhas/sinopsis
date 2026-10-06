import numpy as np
import pytest
import torch

from sinopsis_research.diarization.postprocess import apply_vad_mask, remove_short_turns
from sinopsis_research.preprocessing import PreprocessParams, bandpass, normalize_rms, preprocess
from sinopsis_research.splicing import SpliceParams, silence_cut_points, frame_dbfs, splice
from sinopsis_research.vad import FRAME_SECONDS, VADParams, binarize

SR = 16000


def tone(freq, seconds, sr=SR, amplitude=0.5):
    t = np.arange(int(seconds * sr)) / sr
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def rms(x):
    return float(np.sqrt(np.mean(x**2)))


def test_bandpass_removes_hum_keeps_voice_band():
    hum, voice = tone(30, 2), tone(300, 2)
    assert rms(bandpass(hum[None], SR, 80, 8000)) < 0.1 * rms(hum)
    assert rms(bandpass(voice[None], SR, 80, 8000)) > 0.9 * rms(voice)


def test_normalize_rms_hits_target():
    out = normalize_rms(tone(300, 1, amplitude=0.01)[None], target_dbfs=-20)
    assert 20 * np.log10(rms(out)) == pytest.approx(-20, abs=0.1)


def test_preprocess_resamples_to_16k():
    audio = {"waveform": torch.from_numpy(tone(300, 1, sr=44100)[None]), "sample_rate": 44100}
    out = preprocess(audio, PreprocessParams())
    assert out["sample_rate"] == 16000
    assert out["waveform"].shape[-1] == 16000


def speech_with_gaps(pattern):
    """pattern: list of (detik, bersuara?)"""
    parts = [tone(300, s) if voiced else np.zeros(int(s * SR), np.float32) for s, voiced in pattern]
    return np.concatenate(parts)[None]


def test_silence_cut_points_respect_min_silence():
    wav = speech_with_gaps([(2, True), (0.3, False), (2, True), (1.0, False), (2, True)])
    cuts = silence_cut_points(frame_dbfs(wav, SR), SpliceParams(min_silence=0.5))
    assert len(cuts) == 1
    assert cuts[0] == pytest.approx(4.8, abs=0.1)


def test_splice_cuts_at_silence_and_covers_everything():
    wav = speech_with_gaps([(50, True), (1, False), (50, True), (1, False), (50, True)])
    chunks = splice(wav, SR, SpliceParams(max_chunk=80, min_chunk=10))
    assert chunks[0][0] == 0 and chunks[-1][1] == pytest.approx(152)
    assert chunks[0][1] == pytest.approx(50.5, abs=0.1)
    assert all(a[1] == b[0] for a, b in zip(chunks, chunks[1:]))


def test_splice_hard_cut_without_silence():
    wav = speech_with_gaps([(100, True)])
    assert splice(wav, SR, SpliceParams(max_chunk=40, min_chunk=10)) == [(0.0, 40.0), (40.0, 80.0), (80.0, 100.0)]


def test_vad_binarize_hysteresis_and_min_duration():
    frames_per_s = int(round(1 / FRAME_SECONDS))
    probs = np.concatenate(
        [np.zeros(frames_per_s), np.full(frames_per_s, 0.9), np.zeros(frames_per_s), np.full(3, 0.9), np.zeros(10)]
    )
    speech = binarize(probs, VADParams(threshold=0.5, min_speech_duration=0.25))
    assert len(speech) == 1  # ledakan 3 frame (~0,1 s) dibuang
    assert speech[0].duration == pytest.approx(1.0, abs=0.05)


def test_vad_mask_and_short_turns():
    from pyannote.core import Annotation, Segment, Timeline

    ann = Annotation(uri="m")
    ann[Segment(0, 10), 0] = "A"
    ann[Segment(20, 20.1), 1] = "B"
    masked = apply_vad_mask(ann, Timeline([Segment(2, 8)]))
    assert masked.get_timeline().duration() == pytest.approx(6)
    assert remove_short_turns(ann, 0.2).labels() == ["A"]
