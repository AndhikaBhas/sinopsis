#!/usr/bin/env bash
# Unduh model besar untuk tahap transkripsi & ringkasan (dijalankan malam hari).
#
#   1. Paket whisperx (ke .venv yang sama; torch & pyannote tidak berubah)
#   2. Model faster-whisper "medium" + model alignment bahasa Indonesia
#   3. Ollama (tarball, tanpa sudo, ke ~/.local/ollama) + model gemma2:2b
#
# Semua langkah bisa dijalankan ulang: yang sudah selesai dilewati,
# unduhan yang terputus dilanjutkan.
#
# Pemakaian:
#   scripts/night_download.sh            # mulai sekarang
#   START_AT=21:00 scripts/night_download.sh

set -u
cd "$(dirname "$0")/.."

OLLAMA_DIR="${OLLAMA_DIR:-$HOME/.local/ollama}"
OLLAMA_URL="https://ollama.com/download/ollama-linux-amd64.tar.zst"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma2:2b}"
WHISPER_REPO="Systran/faster-whisper-medium"
ALIGN_REPO="cahya/wav2vec2-large-xlsr-indonesian"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

retry() {
  # retry <percobaan> <perintah...>
  local tries=$1; shift
  for ((i = 1; i <= tries; i++)); do
    "$@" && return 0
    log "  gagal (percobaan $i/$tries), coba lagi dalam 60 s"
    sleep 60
  done
  return 1
}

if [[ -n "${START_AT:-}" ]]; then
  target=$(date -d "$START_AT" +%s)
  now=$(date +%s)
  if ((target > now)); then
    log "Menunggu sampai $START_AT"
    sleep $((target - now))
  fi
fi

# Jangan mengubah paket Python selagi evaluasi test masih berjalan.
if [[ -f logs/test_eval.log ]]; then
  until grep -q '^exit' logs/test_eval.log; do
    log "Menunggu evaluasi test selesai..."
    sleep 300
  done
fi

log "1/3 Memasang whisperx"
retry 5 .venv/bin/pip install whisperx "torch==2.8.0" "torchaudio==2.8.0" \
  --extra-index-url https://download.pytorch.org/whl/cpu || { log "GAGAL memasang whisperx"; exit 1; }

log "2/3 Mengunduh model Whisper & alignment"
for repo in "$WHISPER_REPO" "$ALIGN_REPO"; do
  retry 20 .venv/bin/python -c "
from huggingface_hub import snapshot_download
path = snapshot_download('$repo')
print('  ok', path)
" || { log "GAGAL mengunduh $repo"; exit 1; }
done

log "3/3 Memasang Ollama di $OLLAMA_DIR"
mkdir -p "$OLLAMA_DIR"
if [[ ! -x "$OLLAMA_DIR/bin/ollama" ]]; then
  retry 30 curl -fL --retry 5 -C - -o "$OLLAMA_DIR/ollama.tar.zst" "$OLLAMA_URL" || { log "GAGAL mengunduh Ollama"; exit 1; }
  tar --zstd -xf "$OLLAMA_DIR/ollama.tar.zst" -C "$OLLAMA_DIR" && rm -f "$OLLAMA_DIR/ollama.tar.zst"
fi
"$OLLAMA_DIR/bin/ollama" --version

log "   Mengunduh model $OLLAMA_MODEL"
"$OLLAMA_DIR/bin/ollama" serve > logs/ollama_serve.log 2>&1 &
server=$!
sleep 5
retry 20 "$OLLAMA_DIR/bin/ollama" pull "$OLLAMA_MODEL" || { log "GAGAL pull $OLLAMA_MODEL"; kill $server; exit 1; }
"$OLLAMA_DIR/bin/ollama" list
kill $server

log "Cek ulang test"
.venv/bin/python -m pytest -q 2>&1 | tail -1

log "SELESAI"
