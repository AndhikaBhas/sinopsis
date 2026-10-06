import json

from sinopsis_research import summarizer
from sinopsis_research.summarizer import (
    LLMParams,
    build_participants,
    chunk_transcript,
    normalize_point,
    summarize,
)
from sinopsis_research.transcription import Utterance

PARTICIPANTS = [{"label": "SPEAKER_00", "nama": "Budi Santoso"}, {"label": "SPEAKER_01", "nama": "Sari Dewi"}]


def test_chunk_transcript_respects_word_budget():
    lines = ["satu dua tiga"] * 5
    chunks = chunk_transcript(lines, max_words=7)
    assert len(chunks) == 3
    assert all(len(c.split()) <= 7 for c in chunks)


def test_normalize_point_matches_pic_to_participant():
    point = normalize_point({"topik": "Switch", "pic": "sari", "waktu": "[00:12:40]"}, PARTICIPANTS)
    assert point["pic"] == "Sari Dewi"
    assert point["waktu"] == "00:12:40"
    assert point["keputusan"] == ""


def test_build_participants_sorted_by_share():
    speakers = {"SPEAKER_00": {"porsi": 0.2, "gender": "pria"}, "SPEAKER_01": {"porsi": 0.5, "gender": "wanita"}}
    result = build_participants(speakers, {"SPEAKER_01": "Sari"})
    assert [p["nama"] for p in result] == ["Sari", "SPEAKER_00"]


def test_summarize_map_reduce(monkeypatch):
    prompts = []

    def fake_generate(prompt, params):
        prompts.append(prompt)
        if "pokok_bahasan\": [ ... ]" in prompt:
            return {"pokok_bahasan": [{"topik": "Switch", "keputusan": "12 unit", "pic": "Sari Dewi", "waktu": "00:00:05"}]}
        return {"topik_pembahasan": ["Pengadaan switch"], "ringkasan_eksekutif": "Rapat menyetujui 12 unit switch."}

    monkeypatch.setattr(summarizer, "generate_json", fake_generate)
    utterances = [Utterance("SPEAKER_01", 5.0, 7.0, "dua belas unit pak")]
    result = summarize(utterances, {"SPEAKER_01": "Sari Dewi"}, PARTICIPANTS, LLMParams())
    assert "[00:00:05] Sari Dewi: dua belas unit pak" in prompts[0]
    assert result["pokok_bahasan"][0]["pic"] == "Sari Dewi"
    assert result["ringkasan_eksekutif"].startswith("Rapat")
    assert json.dumps(result)  # dapat diserialisasi
