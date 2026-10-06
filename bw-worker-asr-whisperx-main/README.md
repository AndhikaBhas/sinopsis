# Si## Version

**Current Ver- 📝 **Minimal Impact:** 99.8% performance maintained (see [DOCS/BUGFIX_BYTESIO.md](DOCS/BUGFIX_BYTESIO.md))ion:** 3.0.3 (Stable In-Memory Release)  
**Release Date:** October 1, 2025

**What's New in 3.0.3:**

- 🐛 **Fixed:** Audio format recognition with BytesIO (soundfile issue)
- ✅ **Solution:** Use ffmpeg with stdin/stdout pipes (100% in-memory)
- 🚀 **Status:** Production-ready, all formats supported
- 📝 **Maintained:** Zero disk I/O via memory pipes

**Previous releases:**

- v3.0.2: Attempted soundfile+librosa (format detection issue)
- v3.0.1: Fixed BytesIO with temp file workaround
- v3.0.0: Code cleanup, removed legacy subprocess modeer (WhisperX)

Python worker that transcribes audio chunks with WhisperX and phoneme-based force alignment for Indonesian language, stores highly accurate word-level timestamped segments in PostgreSQL, and optionally merges chunk transcripts into a meeting-level transcript when the meeting is complete.

## Version

**Current Version:** 3.0.1 (Bug Fix Release)  
**Release Date:** October 1, 2025

**What's New in 3.0.1:**

- 🐛 **Critical Fix:** Resolved WhisperX BytesIO incompatibility
- ✅ **Transcription Working:** All jobs now process successfully
- � **Minimal Impact:** 99.8% performance maintained (see [docs/BUGFIX_BYTESIO.md](docs/BUGFIX_BYTESIO.md))

**What's New in 3.0:**

- �🗑️ **Code Cleanup:** Removed 600 lines of legacy code (-24%)
- ✨ **Simplified Architecture:** Single code path (memory mode always enabled)
- 📚 **Better Documentation:** Consolidated and reorganized
- ⚠️ **Breaking Change:** `USE_MEMORY_MODE=false` no longer supported (see [DOCS/CLEANUP_SUMMARY.md](DOCS/CLEANUP_SUMMARY.md))

## Features

- ASR with WhisperX (GPU acceleration with CUDA 12.2 support, CPU fallback)
- **NEW**: Phoneme-based force alignment for Indonesian language using Wikidepia wav2vec2 model
- Highly accurate word-level timestamps
- **NEW: Memory Mode** - All-in-memory model persistence for 30-40% faster throughput
- **NEW: Zero Temp Files** - 100% in-memory audio processing via ffmpeg pipes (ZERO disk I/O)
- RabbitMQ single-message worker
- MinIO download for audio files
- PostgreSQL writes to `rapat_chunk.transkrip` (JSON array of word-level or segment-level entries)
- Optional meeting-level merge into `rapat.transkrip` when complete
- Configurable via `.env`
- Docker-ready with CUDA 12.2 support

## WhisperX Advantages

This version uses WhisperX instead of faster-whisper for superior transcription quality:

- **Word-level Alignment**: Phoneme-based force alignment provides precise word-level timestamps
- **Indonesian Language Support**: Custom Wikidepia wav2vec2 model for Indonesian phoneme recognition (5.046% WER)
- **Higher Accuracy**: Better transcription quality especially for Indonesian language
- **Flexible Output**: Can provide both word-level and segment-level transcripts
- **Memory Efficient**: Automatic model cleanup and GPU memory management
- **High Performance**: Memory mode keeps models loaded for 30-40% faster throughput

## System Requirements

- **GPU (Recommended)**: NVIDIA GPU with CUDA 12.2+ support
- **CPU**: Multi-core processor (fallback mode)
- **Memory**: 8GB+ RAM (16GB+ recommended for large models)
- **Storage**: 10GB+ free space for models and results
- **Python**: 3.8+ (3.10+ recommended)
- **Docker**: With nvidia-docker2 for GPU support

## Installation

See [DOCS/INSTALL.md](DOCS/INSTALL.md) for detailed steps and dependencies.

### Quick Install for CUDA 12.2

```bash
# Install PyTorch with CUDA 12.1 support (compatible with CUDA 12.2)
pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install WhisperX and other dependencies
pip3 install -r requirements.txt

# Note: WhisperX will automatically download required models on first use
```

## Configuration (.env)

Copy `.env.example` to `.env` and configure the following variables:

- Database
  - `DATABASE_URL` (e.g. `postgresql://user:pass@host:5432/dbname`)
- RabbitMQ
  - `RABBITMQ_URL`
  - `RABBIT_MQ_EXCHANGE`
  - `RABBIT_MQ_INPUT_QUEUE`
  - `RABBIT_MQ_OUTPUT_QUEUE`
  - `RABBITMQ_REQUEUE_ON_FAILURE` (default: `false`) - Whether to requeue failed jobs or reject them
- MinIO
  - `MINIO_ENDPOINT` (e.g. `http://localhost:9000`)
  - `MINIO_USER`
  - `MINIO_PASSWORD`
  - `MINIO_BUCKET`
- ASR
  - `ASR_MODEL` (default: `medium`)
  - `ASR_DEVICE` (default: `cuda`, falls back to `cpu` automatically)
  - `ASR_COMPUTE_TYPE` (default: `float16`, CPU fallback uses `int8`)
  - `ASR_LANGUAGE` (default: `id`)
  - `ASR_BATCH_SIZE` (default: `16`)
  - `FORCE_ALIGN` (default: `false`) - Enable phoneme-based force alignment (requires compatible Indonesian model)
  - `ALIGN_MODEL` (default: `auto`) - Indonesian phoneme model for alignment ('auto' uses WhisperX default)
- Memory Mode (Performance)
  - `USE_MEMORY_MODE` (default: `true`) - Keep models in memory for faster processing (30-40% throughput gain)
  - `MEMORY_CLEANUP_INTERVAL` (default: `10`) - Force garbage collection every N jobs
- Text Cleaning
  - `ENABLE_REPETITION_CLEANING` (default: `true`) - Enable repetitive text removal
  - `CLEANING_MODE` (default: `fast`) - Cleaning strategy: `basic`, `fast`, `thorough`
  - `MIN_REPETITION_COUNT` (default: `2`) - Minimum repetitions to trigger cleaning
  - `MAX_PHRASE_LENGTH` (default: `4`) - Maximum phrase length for repetition detection
  - `CLEANING_SIMILARITY_THRESHOLD` (default: `0.85`) - N-gram similarity threshold

## Testing the Installation

Before running the full worker, validate your setup:

```bash
# Validate environment configuration
python validate_env.py

# Test WhisperX installation and configuration
python test_whisperx_integration.py

# Test text cleaning functions
python test_text_cleaning.py
```

The validation and tests will verify:

- All required environment variables are configured
- No deprecated faster-whisper settings remain
- WhisperX and dependencies are properly installed
- Models can be loaded successfully
- Indonesian phoneme alignment model is accessible
- Text cleaning functions work correctly

## Running the worker

The worker runs as a continuous service, monitoring RabbitMQ for new tasks and processing them automatically.

### Development Mode

```bash
python worker.py
```

### Production Service (Linux)

Deploy as a systemd service for automatic startup and monitoring:

````bash
# Deploy the service
sudo ./deploy.sh

# Configure environment
sudo nano /opt/sinopsis-worker-asr/.env

```bash
sudo systemctl enable sinopsis-worker-asr
sudo systemctl start sinopsis-worker-asr

# Check service status
sudo systemctl status sinopsis-worker-asr
sudo journalctl -u sinopsis-worker-asr -f
````

### Service Management

````bash
```bash
sudo systemctl start sinopsis-worker-asr
sudo systemctl stop sinopsis-worker-asr
sudo systemctl restart sinopsis-worker-asr

# View logs
sudo journalctl -u sinopsis-worker-asr -f
sudo journalctl -u sinopsis-worker-asr --since "1 hour ago"
````

If there is a message, it will:

1. Download the audio from MinIO
2. Transcribe with WhisperX
3. Apply phoneme-based force alignment for Indonesian language (if enabled)
4. Save highly accurate word-level or segment-level timestamped entries to `rapat_chunk.transkrip`
5. If `rapat_id` was provided in the job, check if the meeting is complete and, if all chunks are transcribed, merge into `rapat.transkrip`

The worker runs continuously, checking for new messages every 5 seconds when the queue is empty.

## Quick Setup for Development

If you need to set up RabbitMQ quickly for development:

```bash
# Use our setup script (recommended)
./setup_rabbitmq.sh

# Or manually:
# macOS: brew install rabbitmq && brew services start rabbitmq
# Linux: sudo apt install rabbitmq-server && sudo systemctl start rabbitmq-server
# Docker: docker run -d --name rabbitmq-dev -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

## Troubleshooting

Common issues and solutions:

- **"Connection refused" error**: RabbitMQ is not running. See [DOCS/RABBITMQ_TROUBLESHOOTING.md](DOCS/RABBITMQ_TROUBLESHOOTING.md)
- **"Authentication failed"**: Check username/password in `RABBITMQ_URL`
- **Missing .env**: Copy `.env.example` to `.env` and configure
- **Environment validation**: Run `python worker.py validate`
- **"libcudnn_ops_infer.so.8: cannot open shared object file"**: Missing cuDNN library. See [DOCS/CUDA_CUDNN_FIX.md](DOCS/CUDA_CUDNN_FIX.md)
- **CUDA/cuDNN issues**: Run `./helpers/check-cuda.sh` to diagnose GPU dependencies

## RabbitMQ job format

The worker accepts the following JSON message (fields are case-sensitive):

```json
{
  "rapat_chunk_id": 123,
  "filename": "79_003_20250923_002851_standardized.webm",
  "rapat_id": 45
}
```

- `rapat_chunk_id` (required): Target chunk ID to update in `rapat_chunk.transkrip`.
- `filename` (required): Object name in MinIO to download and transcribe.
- `rapat_id` (optional): If provided, the worker will attempt meeting-level merge after saving the chunk.

Backward-compatibility: the worker also accepts `chunk_id` and `audio_filename` as fallbacks.

## Timestamp policy

- Base time is extracted from the filename pattern: `..._{YYYYMMDD}_{HHMMSS}_...`
- Word-level or segment-level times are stored as `HH:MM:SS` strings, computed as base time + alignment offsets
- With force alignment enabled, each word gets precise timestamps based on phoneme alignment
- Database payload is a strict JSON array of objects: `{ start, end, text }`
- When force alignment is successful, text contains individual words with highly accurate timestamps
- Fallback to segment-level timestamps if force alignment fails or is disabled

## Meeting transcript merge

Meeting logic lives in `transcript_merger.py` and is invoked automatically by the worker when `rapat_id` is included in the job. Merge conditions:

- `rapat.status_rapat = '2'` (complete)
- All `rapat_chunk` rows for the meeting have non-null `transkrip`

When conditions are met, the module merges all chunk transcripts (ordered by `urutan_chunk`) into `rapat.transkrip` and publishes a completion message to the output queue.

## Output Queue Messages

When a meeting transcript merge is completed, the worker publishes a message to `RABBIT_MQ_OUTPUT_QUEUE` with the following format:

```json
{
  "rapat_id": 45,
  "timestamp": "2025-09-24T10:30:00.123456"
}
```

- `rapat_id`: The ID of the completed meeting
- `timestamp`: ISO format timestamp when the merge was completed

You can also trigger a batch merge of all complete meetings from a small script:

```python
from transcript_merger import merge_all_complete_meetings

if __name__ == "__main__":
    merge_all_complete_meetings()
```

## Docker

### Build and Run

```bash
# Build the container (includes CUDA 12.2 support)
docker build -t sinopsis-worker-asr .

# Run with GPU support
docker run --gpus all --env-file .env sinopsis-worker-asr

# Run with CPU only (if GPU unavailable)
docker run --env-file .env -e ASR_DEVICE=cpu -e ASR_COMPUTE_TYPE=int8 sinopsis-worker-asr
```

### Docker Requirements

- **NVIDIA Container Toolkit**: For GPU support
- **CUDA 12.2+**: On host system
- **8GB+ RAM**: For container

### Troubleshooting Docker

If you encounter GPU issues:

```bash
# Check GPU availability
nvidia-smi

# Test NVIDIA Docker
docker run --rm --gpus all nvidia/cuda:12.2-base-ubuntu20.04 nvidia-smi

# Force CPU mode
docker run --env-file .env -e ASR_DEVICE=cpu sinopsis-worker-asr
```

## Performance Notes

- **Memory Mode**: 30-40% faster throughput (models loaded once and reused)
- **GPU Processing**: ~2-5x faster than CPU, depends on model size and audio length
- **Model Sizes**: `tiny` (fastest), `small`, `medium`, `large-v2` (most accurate)
- **Timeout**: 15 minutes per job (configurable in code)
- **First Job**: ~30-60s model loading, subsequent jobs are instant
- **Memory Usage**: ~8-12GB GPU RAM in memory mode (medium model + alignment)

See [DOCS/MEMORY_MODE.md](DOCS/MEMORY_MODE.md) for detailed performance optimization guide.

## Project Structure

```
sinopsis-worker-asr-whisperx/
├── README.md                      # This file - Project overview
├── worker.py                      # Main ASR worker application
├── transcript_merger.py           # Meeting transcript merger
├── requirements.txt               # Python dependencies
├── .env.example                   # Environment configuration template
├── Dockerfile                     # Docker image definition
├── sinopsis-worker-asr.service   # Systemd service file
├── deploy.sh                      # Deployment script
├── validate_env.py               # Environment validator
│
├── DOCS/                          # 📚 Documentation
│   ├── README.md                  # Documentation index
│   ├── INSTALL.md                 # Installation guide
│   ├── DEPLOYMENT_GUIDE.md        # Deployment scenarios
│   ├── MEMORY_MODE.md             # Architecture details
│   ├── ZERO_TEMP_FILES.md         # In-memory processing
│   ├── UPGRADE_TO_MEMORY_MODE.md  # Migration guide
│   ├── CLEANUP_SUMMARY.md         # v3.0 changes
│   ├── TESTING_CHECKLIST.md       # Test procedures
│   ├── RABBITMQ_TROUBLESHOOTING.md# RabbitMQ debugging
│   ├── MIGRATION.md               # General migration
│   └── CHANGELOG.md               # Version history
│
├── helpers/                       # 🛠️ Utility Scripts
│   ├── README.md                  # Helper scripts guide
│   ├── troubleshoot.sh            # Automated diagnostics
│   ├── fix-permissions.sh         # Permission fixer
│   └── monitor.sh                 # System monitor
│
└── tests/                         # 🧪 Test Files
    ├── test_memory_mode.py        # Memory mode tests
    └── test_text_cleaning.py      # Text cleaning tests
```

## Documentation

All documentation is organized in the [`DOCS/`](DOCS/) directory. See [DOCS/INDEX.md](DOCS/INDEX.md) for the complete documentation index.

### 📖 Getting Started

- **[DOCS/INSTALL.md](DOCS/INSTALL.md)** - Complete installation guide
- **[DOCS/DEPLOYMENT_GUIDE.md](DOCS/DEPLOYMENT_GUIDE.md)** - Deployment and update procedures
- **[DOCS/QUICK_REFERENCE.md](DOCS/QUICK_REFERENCE.md)** ⭐ - Quick diagnostic commands & common errors

### 🏗️ Architecture

- **[DOCS/MEMORY_MODE.md](DOCS/MEMORY_MODE.md)** - In-memory model architecture
- **[DOCS/ZERO_TEMP_FILES.md](DOCS/ZERO_TEMP_FILES.md)** - Zero temporary files design

### 🔄 Upgrades & Changes

- **[DOCS/CHANGELOG.md](DOCS/CHANGELOG.md)** - Version history
- **[DOCS/CLEANUP_SUMMARY.md](DOCS/CLEANUP_SUMMARY.md)** - v3.0.0 cleanup details
- **[DOCS/UPGRADE_TO_MEMORY_MODE.md](DOCS/UPGRADE_TO_MEMORY_MODE.md)** - Migration guide
- **[DOCS/VERSION_COMPATIBILITY.md](DOCS/VERSION_COMPATIBILITY.md)** - PyTorch/PyAnnote version tracking

### 🚑 Operations & Troubleshooting

- **[DOCS/SYSTEMD_SERVICE.md](DOCS/SYSTEMD_SERVICE.md)** ⭐ - Complete systemd service guide
- **[DOCS/FFMPEG_FIX.md](DOCS/FFMPEG_FIX.md)** ⭐ - Fix "ffmpeg not found" error
- **[DOCS/SERVICE_FIXES.md](DOCS/SERVICE_FIXES.md)** - Recent service fixes explained
- **[DOCS/TESTING_CHECKLIST.md](DOCS/TESTING_CHECKLIST.md)** - Testing procedures
- **[DOCS/RABBITMQ_TROUBLESHOOTING.md](DOCS/RABBITMQ_TROUBLESHOOTING.md)** - RabbitMQ debugging
- **[helpers/troubleshoot.sh](helpers/troubleshoot.sh)** - Automated diagnostics

See [DOCS/INDEX.md](DOCS/INDEX.md) for complete documentation index.

## Helper Scripts

Utility scripts are in the [`helpers/`](helpers/) directory:

- **[helpers/fix-ffmpeg.sh](helpers/fix-ffmpeg.sh)** ⭐ NEW - Automated ffmpeg installation & fix
- **[helpers/check-service.sh](helpers/check-service.sh)** ⭐ NEW - Service health check
- **[helpers/deploy-service.sh](helpers/deploy-service.sh)** ⭐ NEW - Deploy/update systemd service
- **[helpers/troubleshoot.sh](helpers/troubleshoot.sh)** - Diagnose common issues
- **[helpers/fix-permissions.sh](helpers/fix-permissions.sh)** - Fix file permissions
- **[helpers/monitor.sh](helpers/monitor.sh)** - Monitor system resources
- **[helpers/check-cuda.sh](helpers/check-cuda.sh)** - Verify CUDA/GPU setup

See [DOCS/HELPERS_README.md](DOCS/HELPERS_README.md) for usage details.

## License

## Message Handling & Reliability

- **Manual Acknowledgment**: Uses `auto_ack=False` to ensure messages stay in queue until processing completes
- **Failed Job Handling**:
  - Failed jobs are `nack`ed based on `RABBITMQ_REQUEUE_ON_FAILURE` setting
  - `true`: Failed jobs are requeued for retry
  - `false`: Failed jobs are rejected (recommended with dead letter queue)
- **Connection Safety**: Unacknowledged messages are automatically requeued if connection is lost
- **Invalid Messages**: JSON parsing errors are rejected without requeue

## Text Cleaning & Quality

- **Hybrid Approach**: Combines regex and n-gram methods for optimal cleaning
- **Cleaning Modes**:
  - `basic`: No cleaning (original transcription)
  - `fast`: Regex-based cleaning (recommended for real-time)
  - `thorough`: Regex + n-gram cleaning (best quality, slower)
- **Repetition Removal**: Eliminates word and phrase repetitions common in ASR output
- **Performance Impact**: Fast mode adds <1ms per segment, thorough mode adds ~5-10ms
- **Configurable**: All cleaning parameters adjustable via environment variables
