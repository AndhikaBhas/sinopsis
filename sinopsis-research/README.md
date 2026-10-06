# sinopsis-research

Sistem mandiri untuk Proyek Akhir **"Optimasi Speaker Diarization Berbasis Pyannote
untuk Notulensi Rapat Berbahasa Indonesia"**. Berjalan lokal, terpisah dari sistem
Sinopsis (`bw-*` di folder induk), tanpa RabbitMQ/MinIO/PostgreSQL — sesuai Tujuan 4
proposal. Kode Sinopsis yang ada **tidak diubah**; sistem Sinopsis menjadi baseline.

## Varian yang dibandingkan

| Varian | Config | Isi | Peran |
|---|---|---|---|
| A | `configs/baseline_a.yaml` | `pyannote/speaker-diarization-community-1`, default | Sistem Sinopsis saat ini (identik dengan `bw-worker-diarizer`) |
| B | `configs/baseline_b.yaml` | segmentation-3.0 + ECAPA-TDNN + AHC, default 3.1 | Pipeline sesuai proposal, belum di-tuning |
| C | `configs/tuned.yaml` | B + parameter hasil grid search (+ masker Silero VAD) | Kontribusi penelitian |

A → B menunjukkan efek pergantian pipeline; B → C menunjukkan efek tuning.

## Pemetaan ke proposal

| Proposal | Modul |
|---|---|
| 2.2.1, 3.2.3 Silero VAD | `sinopsis_research/vad.py` |
| 2.2.2–2.2.3, 3.2.4 Pyannote + ECAPA + AHC | `sinopsis_research/diarization/pipelines.py` |
| 2.2.3, 3.2.2 Cross-segment speaker tracking | `sinopsis_research/tracking.py` |
| 2.2.6, 3.5.1 DER (collar 0,25 s) | `sinopsis_research/evaluation/der.py` |
| 3.5.2 WER (jiwer) | `sinopsis_research/evaluation/wer.py` |
| 3.3.2 Kelas overlap (<10 % / >20 %) | `sinopsis_research/evaluation/overlap.py` |
| 3.5.3 Waktu proses & puncak RAM | `scripts/run_diarization.py` (`run.json`) |
| 3.3.1 Grid search | `scripts/grid_search.py`, `configs/grid.yaml` |
| 3.4.2 AMI Meeting Corpus | `sinopsis_research/data/ami.py` |

| 2.2.7, 3.2.5 Klasifikasi gender (F0 + MFCC, MLP) | `sinopsis_research/gender.py`, `scripts/train_gender.py` |
| 3.2.1 Preprocessing, 3.2.2 Splicing −40 dBFS | `sinopsis_research/preprocessing.py`, `splicing.py` |
| 3.2.7 WhisperX + label pembicara per kata | `sinopsis_research/transcription.py` |
| 3.2.8, Tabel 3.1 Ringkasan Gemma 2B (Ollama) | `sinopsis_research/summarizer.py` |
| Risalah Rapat (.md/.docx) | `sinopsis_research/risalah.py` |

## Aplikasi (web MVP)

```bash
.venv/bin/python scripts/web.py      # buka http://127.0.0.1:5000
```

Alur: **Unggah** audio + agenda → **Proses** (diarization, gender, transkripsi) →
**Beri nama** pembicara (dengan contoh suara & kalimat) → **Hasil**: `risalah.docx`,
`risalah.md`, `notulensi.json`, `transkrip.txt`. Semua hasil tersimpan di `hasil/`.

Versi terminal (pipeline yang sama):

```bash
.venv/bin/python scripts/run_pipeline.py rapat.wav --judul "Evaluasi Pengadaan Q3"
```

Pengaturan (varian diarization, model ASR/LLM, kop risalah) ada di `configs/app.yaml`.
Tahap yang perangkatnya belum ada dilewati dengan keterangan: model gender
(`scripts/train_gender.py`), whisperx & Ollama (`scripts/night_download.sh`).
Ollama harus berjalan saat membuat risalah: `~/.local/ollama/bin/ollama serve`.

## Persiapan

```bash
python3.11 -m venv .venv
# Versi CPU (unduhan kecil). Untuk GPU, ganti index-url ke .../whl/cu128
.venv/bin/pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install -r requirements.txt

cp .env.example .env   # isi HF_TOKEN
```

Setujui syarat model di Hugging Face (login, klik "Agree"):
- https://huggingface.co/pyannote/speaker-diarization-community-1
- https://huggingface.co/pyannote/segmentation-3.0

## Alur eksperimen

```bash
source .venv/bin/activate

# 1. Data (dev untuk tuning, test untuk evaluasi akhir)
python scripts/download_ami.py --subset dev --limit 4
python scripts/download_ami.py --subset test --limit 4

# 2. Grid search pada dev -> menghasilkan configs/tuned.yaml
python scripts/grid_search.py --config configs/baseline_b.yaml \
    --subset-dir data/ami/dev --out results/grid_dev.csv --write-best configs/tuned.yaml

# 3. Jalankan ketiga varian pada test
for v in baseline_a baseline_b tuned; do
  python scripts/run_diarization.py --config configs/$v.yaml \
      --audio-dir data/ami/test/audio --out-dir outputs/test
  python scripts/evaluate_der.py --ref data/ami/test/rttm --uem data/ami/test/uem \
      --hyp outputs/test/$v --out results/test_$v.csv
done
```

Untuk rekaman rapat lokal, gunakan struktur folder yang sama
(`data/lokal/{audio,rttm,uem}`) — anotasi RTTM bisa dibuat dengan Audacity
(label track) atau ELAN lalu dikonversi.

## Test

```bash
.venv/bin/python -m pytest
```
