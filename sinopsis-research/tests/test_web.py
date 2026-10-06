import io
import time

import numpy as np
import pytest
import soundfile as sf
from pyannote.core import Annotation, Segment

from sinopsis_research.app import pipeline as pipeline_module
from sinopsis_research.app.pipeline import AppConfig, NotulensiPipeline
from sinopsis_research.diarization.pipelines import DiarizationOutput
from sinopsis_research.web.app import create_app

SR = 16000


class FakeDiarizer:
    def __call__(self, audio):
        ann = Annotation(uri=audio["uri"])
        ann[Segment(0.0, 3.0), 0] = "SPEAKER_00"
        ann[Segment(3.0, 4.0), 1] = "SPEAKER_01"
        return DiarizationOutput(annotation=ann, speaker_embeddings=None)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(NotulensiPipeline, "diarizer", lambda self: FakeDiarizer())
    monkeypatch.setattr(pipeline_module.transcription, "is_available", lambda: False)
    config = AppConfig(diarization=tmp_path / "unused.yaml", gender_model=None, hasil_dir=tmp_path / "hasil")
    app = create_app(config)
    app.testing = True
    return app.test_client(), config


def wav_bytes(seconds=4.0):
    t = np.arange(int(seconds * SR)) / SR
    buf = io.BytesIO()
    sf.write(buf, (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), SR, format="WAV")
    buf.seek(0)
    return buf


def wait_for(client, url, statuses, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        page = client.get(url).get_data(as_text=True)
        if any(f'badge {s}"' in page for s in statuses):
            return page
        time.sleep(0.2)
    raise AssertionError(f"status {statuses} tidak tercapai:\n{page}")


def test_full_flow_upload_name_download(client):
    client, config = client
    response = client.post(
        "/proses",
        data={"judul": "Rapat Uji", "tanggal": "2026-10-06", "tempat": "Lab", "mulai": "09:00",
              "audio": (wav_bytes(), "rapat.wav")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 302
    url = response.headers["Location"]

    page = wait_for(client, url, ["menunggu_nama", "gagal"])
    assert "menunggu_nama" in page, page
    assert "SPEAKER_00" in page and "75% waktu bicara" in page
    assert "whisperx belum terpasang" in page

    job_id = url.rstrip("/").split("/")[-1]
    assert client.get(f"/rapat/{job_id}/berkas/contoh/SPEAKER_00.wav").status_code == 200

    response = client.post(f"/rapat/{job_id}/nama", data={"nama_SPEAKER_00": "Budi", "nama_SPEAKER_01": "Sari"})
    assert response.status_code == 302
    page = wait_for(client, url, ["selesai", "gagal"])
    assert 'badge selesai"' in page, page
    assert "| 1 | Budi |" in page  # pratinjau risalah

    docx = client.get(f"/rapat/{job_id}/berkas/risalah.docx")
    assert docx.status_code == 200 and docx.data[:2] == b"PK"
    assert "Rapat Uji" in client.get("/").get_data(as_text=True)


def test_rejects_unsupported_format_and_path_traversal(client):
    client, _ = client
    response = client.post(
        "/proses", data={"judul": "x", "audio": (io.BytesIO(b"x"), "rapat.m4a")}, content_type="multipart/form-data"
    )
    assert response.status_code == 302
    assert "belum didukung" in client.get("/").get_data(as_text=True)
    assert client.get("/rapat/..%2F..%2Fetc/berkas/meta.json").status_code == 404
