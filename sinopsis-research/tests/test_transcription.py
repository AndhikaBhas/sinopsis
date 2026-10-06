from pyannote.core import Annotation, Segment

from sinopsis_research.transcription import (
    Word,
    assign_speakers,
    format_transcript,
    group_utterances,
    words_from_segments,
)


def diarization():
    ann = Annotation(uri="m")
    ann[Segment(0, 5), 0] = "SPEAKER_00"
    ann[Segment(5, 10), 1] = "SPEAKER_01"
    return ann


def test_words_from_segments_fills_missing_timestamps():
    words = words_from_segments(
        [{"start": 0.0, "end": 2.0, "text": "ada 12 unit", "words": [
            {"word": "ada", "start": 0.0, "end": 0.4},
            {"word": "12"},  # angka sering gagal di-align
            {"word": "unit", "start": 1.5, "end": 2.0},
        ]}]
    )
    assert [w.text for w in words] == ["ada", "12", "unit"]
    assert words[1].start is not None and 0.0 < words[1].start < 2.0


def test_assign_speakers_by_largest_overlap():
    words = [Word("halo", 1.0, 1.5), Word("baik", 4.8, 5.6), Word("setuju", 7.0, 7.5)]
    assign_speakers(words, diarization())
    assert [w.speaker for w in words] == ["SPEAKER_00", "SPEAKER_01", "SPEAKER_01"]


def test_word_in_gap_takes_nearest_or_previous():
    words = [Word("a", 1.0, 1.2), Word("b", 10.3, 10.5), Word("c", 30.0, 30.5)]
    assign_speakers(words, diarization(), max_gap=1.0)
    assert words[1].speaker == "SPEAKER_01"  # 0,3 s dari giliran terdekat
    assert words[2].speaker == "SPEAKER_01"  # terlalu jauh -> warisi kata sebelumnya


def test_group_utterances_splits_on_speaker_change_and_pause():
    words = [
        Word("jadi", 0.0, 0.3, "A"),
        Word("begitu", 0.4, 0.8, "A"),
        Word("oke", 1.0, 1.2, "B"),
        Word("lanjut", 5.0, 5.3, "B"),
    ]
    utterances = group_utterances(words, max_pause=2.0)
    assert [(u.speaker, u.text) for u in utterances] == [("A", "jadi begitu"), ("B", "oke"), ("B", "lanjut")]


def test_format_transcript_uses_names():
    utterances = group_utterances([Word("halo", 61.0, 61.5, "SPEAKER_00")])
    assert format_transcript(utterances, {"SPEAKER_00": "Budi"}) == "[00:01:01] Budi: halo"
