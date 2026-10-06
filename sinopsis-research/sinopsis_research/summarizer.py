"""Peringkasan notulensi dengan LLM lokal via Ollama (Bab 3.2.8, Tabel 3.1 proposal).

Keluaran (dict, disimpan sebagai notulensi.json):
    peserta              dari diarization (BUKAN dari LLM), lihat `build_participants`
    topik_pembahasan     daftar topik singkat
    pokok_bahasan        [{topik, pembahasan, keputusan, tindak_lanjut, pic, waktu}]
    ringkasan_eksekutif  2–3 kalimat

Transkrip panjang melebihi konteks Gemma 2B (8192 token), sehingga dipakai
pola map-reduce:
    map    : setiap potongan transkrip -> pokok_bahasan (JSON)
    reduce : seluruh pokok_bahasan -> topik_pembahasan + ringkasan_eksekutif
Ollama dipanggil dengan format="json" agar keluaran selalu JSON valid.
"""

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Dict, List, Optional

from .transcription import Utterance, format_timestamp


@dataclass
class LLMParams:
    host: str = "http://127.0.0.1:11434"
    model: str = "gemma2:2b"
    num_ctx: int = 8192
    temperature: float = 0.2
    chunk_words: int = 1200
    timeout: int = 900


MAP_PROMPT = """Anda adalah notulis rapat profesional. Berikut potongan transkrip rapat berbahasa Indonesia.
Setiap baris berformat: [jam:menit:detik] Nama: ucapan.

Peserta rapat: {peserta}

Tugas: identifikasi pokok bahasan yang dibicarakan pada potongan ini. Untuk setiap pokok bahasan, tuliskan:
- "topik": judul singkat (maks. 8 kata)
- "pembahasan": ringkasan diskusi 1-2 kalimat, bahasa formal
- "keputusan": keputusan yang diambil, atau "" jika tidak ada
- "tindak_lanjut": tindakan yang disepakati, atau "" jika tidak ada
- "pic": nama penanggung jawab tindak lanjut, HARUS salah satu nama peserta di atas, atau "" jika tidak disebut
- "waktu": timestamp [jam:menit:detik] saat keputusan/tindak lanjut diucapkan

Aturan: hanya gunakan informasi yang ada di transkrip. Jangan mengarang. Abaikan basa-basi.
Jawab HANYA dengan JSON berbentuk: {{"pokok_bahasan": [ ... ]}}

Transkrip:
{transkrip}
"""

REDUCE_PROMPT = """Anda adalah notulis rapat profesional. Berikut daftar pokok bahasan dari sebuah rapat (format JSON):

{pokok}

Tugas:
1. "topik_pembahasan": daftar 1-6 topik utama rapat (masing-masing maks. 8 kata, tanpa duplikasi)
2. "ringkasan_eksekutif": ringkasan seluruh rapat dalam 2-3 kalimat formal, sebutkan keputusan terpenting

Jawab HANYA dengan JSON berbentuk: {{"topik_pembahasan": [...], "ringkasan_eksekutif": "..."}}
"""


class OllamaError(RuntimeError):
    pass


def is_available(params: LLMParams = LLMParams()) -> bool:
    try:
        with urllib.request.urlopen(f"{params.host}/api/tags", timeout=3) as r:
            models = [m["name"] for m in json.loads(r.read()).get("models", [])]
    except Exception:
        return False
    return any(m == params.model or m.split(":")[0] == params.model for m in models)


def generate_json(prompt: str, params: LLMParams) -> dict:
    body = json.dumps(
        {
            "model": params.model,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "options": {"num_ctx": params.num_ctx, "temperature": params.temperature},
        }
    ).encode()
    request = urllib.request.Request(
        f"{params.host}/api/generate", data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=params.timeout) as r:
            response = json.loads(r.read())["response"]
    except urllib.error.URLError as e:
        raise OllamaError(f"Ollama tidak bisa dihubungi di {params.host}: {e}") from e
    try:
        return json.loads(response)
    except json.JSONDecodeError as e:
        raise OllamaError(f"Keluaran LLM bukan JSON valid: {response[:200]!r}") from e


def chunk_transcript(lines: List[str], max_words: int) -> List[str]:
    chunks, current, count = [], [], 0
    for line in lines:
        n = len(line.split())
        if current and count + n > max_words:
            chunks.append("\n".join(current))
            current, count = [], 0
        current.append(line)
        count += n
    if current:
        chunks.append("\n".join(current))
    return chunks


def summarize(
    utterances: List[Utterance],
    names: Dict[str, str],
    participants: List[dict],
    params: LLMParams = LLMParams(),
    progress=None,
) -> dict:
    """Susun notulensi terstruktur. `progress(i, n)` opsional untuk melaporkan kemajuan."""
    lines = [f"[{format_timestamp(u.start)}] {names.get(u.speaker) or u.speaker}: {u.text}" for u in utterances]
    peserta = ", ".join(p["nama"] for p in participants)
    chunks = chunk_transcript(lines, params.chunk_words)

    points: List[dict] = []
    for i, chunk in enumerate(chunks, 1):
        result = generate_json(MAP_PROMPT.format(peserta=peserta, transkrip=chunk), params)
        points.extend(normalize_point(p, participants) for p in result.get("pokok_bahasan", []) if isinstance(p, dict))
        if progress:
            progress(i, len(chunks) + 1)

    reduced = {"topik_pembahasan": [], "ringkasan_eksekutif": ""}
    if points:
        reduced = generate_json(REDUCE_PROMPT.format(pokok=json.dumps(points, ensure_ascii=False, indent=1)), params)
    if progress:
        progress(len(chunks) + 1, len(chunks) + 1)

    return {
        "peserta": participants,
        "topik_pembahasan": [str(t) for t in reduced.get("topik_pembahasan", []) if str(t).strip()],
        "pokok_bahasan": points,
        "ringkasan_eksekutif": str(reduced.get("ringkasan_eksekutif", "")).strip(),
        "model": params.model,
    }


def normalize_point(point: dict, participants: List[dict]) -> dict:
    """Rapikan satu pokok bahasan; cocokkan PIC dengan nama peserta (tidak peka huruf besar)."""
    fields = ("topik", "pembahasan", "keputusan", "tindak_lanjut", "pic", "waktu")
    clean = {k: str(point.get(k) or "").strip() for k in fields}
    by_lower = {p["nama"].lower(): p["nama"] for p in participants}
    pic = clean["pic"]
    if pic:
        clean["pic"] = by_lower.get(pic.lower()) or next(
            (name for low, name in by_lower.items() if pic.lower() in low or low in pic.lower()), pic
        )
    clean["waktu"] = clean["waktu"].strip("[]")
    return clean


def build_participants(speakers: Dict[str, dict], names: Dict[str, str]) -> List[dict]:
    """Daftar peserta dari hasil diarization, urut berdasarkan porsi bicara."""
    participants = []
    for label, info in sorted(speakers.items(), key=lambda kv: -kv[1].get("porsi", 0)):
        participants.append(
            {
                "label": label,
                "nama": names.get(label) or label,
                "gender": info.get("gender"),
                "porsi": info.get("porsi", 0.0),
            }
        )
    return participants


def empty_notulensi(participants: List[dict], reason: str) -> dict:
    """Notulensi tanpa ringkasan LLM (mis. Ollama belum terpasang)."""
    return {
        "peserta": participants,
        "topik_pembahasan": [],
        "pokok_bahasan": [],
        "ringkasan_eksekutif": "",
        "catatan": reason,
    }


def first_sentence(utterances: List[Utterance], speaker: str, min_words: int = 5) -> Optional[str]:
    """Kalimat contoh untuk membantu notulis mengenali pembicara."""
    candidates = [u.text for u in utterances if u.speaker == speaker and len(u.text.split()) >= min_words]
    if not candidates:
        candidates = [u.text for u in utterances if u.speaker == speaker]
    if not candidates:
        return None
    text = max(candidates[:20], key=lambda t: len(t.split()))
    words = text.split()
    return " ".join(words[:20]) + (" …" if len(words) > 20 else "")
