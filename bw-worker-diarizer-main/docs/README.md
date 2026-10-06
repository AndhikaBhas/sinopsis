# Speaker Diarization Worker

A Python background worker for speaker diarization using PyAnnote. Processes audio files from RabbitMQ queues, performs speaker diarization, and updates results to PostgreSQL database.

## 🚨 Common Issues & Quick Fixes

### `std::bad_alloc` Error?

**Root Cause**: `torchcodec` 0.8.0 has a memory bug with PyTorch 2.8.0+

**Fix**:
```bash
pip uninstall -y torchcodec
```

**Verify**:
```bash
python verify_fix.py
```

See: [TORCHCODEC_FIX.md](TORCHCODEC_FIX.md) for details.

### `RuntimeError: Inference tensors do not track version counter`?

**Root Cause**: PyTorch 2.8.0 inference mode issue with InstanceNorm layers

**Fix**: Already applied in code (removed manual `torch.no_grad()` wrappers)

See: [INFERENCE_MODE_FIX.md](INFERENCE_MODE_FIX.md) for details.

---

## Features

- 🎯 **Speaker Diarization**: State-of-the-art PyAnnote model
- 📨 **RabbitMQ Integration**: Queue-based job processing
- 🗄️ **MinIO Storage**: S3-compatible object storage
- 💾 **PostgreSQL Database**: Persistent result storage
- 🎵 **Multiple Formats**: WAV, MP3, M4A, FLAC, OGG, WebM
- 🚀 **GPU Support**: CUDA acceleration (optional)
- 📊 **Structured Logging**: Detailed operation logs
- 🐳 **Docker Ready**: Containerized deployment

---

## Quick Start

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install packages
pip install -r requirements.txt

# IMPORTANT: Remove torchcodec (causes std::bad_alloc)
pip uninstall -y torchcodec
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
# RabbitMQ
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
RABBITMQ_VHOST=/

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sinopsis
DB_USER=postgres
DB_PASS=password

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=audio-files
MINIO_SECURE=False

# HuggingFace (for PyAnnote model)
HUGGINGFACE_AUTH_TOKEN=hf_your_token_here
```

### 3. Get HuggingFace Token

1. Create account at https://huggingface.co
2. Accept license: https://huggingface.co/pyannote/speaker-diarization-community-1
3. Get token: https://huggingface.co/settings/tokens
4. Add to `.env` file

### 4. Run Worker

```bash
python main.py
```

---

## Docker Deployment

### Build Image

```bash
# GPU version (CUDA 12.8)
docker build --build-arg HF_TOKEN=hf_xxx -t sinopsis-worker:gpu .

# CPU version
docker build --build-arg CUDA_VERSION=cpu --build-arg HF_TOKEN=hf_xxx -t sinopsis-worker:cpu .
```

### Run Container

```bash
docker run -d \
  --name sinopsis-worker \
  --gpus all \
  --env-file .env \
  sinopsis-worker:gpu
```

Or use the provided script:
```bash
./run-docker.sh
```

---

## System Requirements

### Minimum
- **Python**: 3.11+
- **RAM**: 8GB
- **Storage**: 10GB
- **GPU** (optional): NVIDIA with CUDA support

### Recommended
- **RAM**: 16GB+
- **GPU**: NVIDIA RTX 2060 or better
- **Storage**: 20GB SSD

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  RabbitMQ   │────▶│    Worker    │────▶│ PostgreSQL  │
│   Queue     │     │  (PyAnnote)  │     │  Database   │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    MinIO    │
                    │   Storage   │
                    └─────────────┘
```

### Workflow

1. **Subscribe**: Listen to RabbitMQ queue for jobs
2. **Download**: Fetch audio from MinIO
3. **Process**: Run speaker diarization
4. **Update**: Store results in PostgreSQL
5. **Publish**: Send completion message to RabbitMQ

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RABBITMQ_HOST` | RabbitMQ server | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ port | `5672` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `MINIO_ENDPOINT` | MinIO endpoint | `localhost:9000` |
| `HUGGINGFACE_AUTH_TOKEN` | HF token | Required |

### PyTorch Configuration

The worker automatically configures:
- Thread count: 4
- Interop threads: 2
- CUDA memory allocation: `max_split_size_mb:256`
- OMP/MKL threads: 4

---

## Troubleshooting

### Issue: Import errors after update

**Solution**: Reinstall dependencies
```bash
pip install -r requirements.txt
pip uninstall -y torchcodec
```

### Issue: CUDA out of memory

**Solution**: Reduce batch size or use CPU
```bash
# In .env
CUDA_VISIBLE_DEVICES=""  # Force CPU
```

### Issue: Model download fails

**Solution**: Check HuggingFace token
1. Verify token is valid
2. Accept model license
3. Check internet connection

### Issue: RabbitMQ connection refused

**Solution**: Check RabbitMQ is running
```bash
docker ps | grep rabbitmq
# Or
systemctl status rabbitmq-server
```

---

## Development

### Project Structure

```
sinopsis-worker-diarizer/
├── main.py                  # Main worker entry point
├── config.py                # Configuration management
├── requirements.txt         # Python dependencies
├── Dockerfile              # Container definition
├── processors/
│   └── diarizer.py         # Diarization processor
├── utils/
│   ├── database.py         # PostgreSQL handler
│   ├── rabbitmq.py         # RabbitMQ handler
│   ├── minio_client.py     # MinIO handler
│   └── logger.py           # Logging utilities
├── docs/                   # Documentation
└── tests/                  # Test files
```

### Running Tests

```bash
# Verify setup
python verify_fix.py

# Test offline mode (Docker)
python test_offline_mode.py
```

### Logging

Logs are written to:
- **Console**: INFO level and above
- **File**: `logs/worker.log` (all levels)

---

## Performance

### Typical Processing Times

| Audio Duration | GPU (RTX 3080) | CPU (8-core) |
|----------------|----------------|--------------|
| 1 minute       | ~3 seconds     | ~15 seconds  |
| 10 minutes     | ~15 seconds    | ~90 seconds  |
| 1 hour         | ~90 seconds    | ~9 minutes   |

*Times vary based on audio quality and speaker count*

### Memory Usage

- **Idle**: ~500MB
- **Processing (10min audio)**: ~2-3GB
- **Peak (1hr audio)**: ~4-5GB

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## License

[Your License Here]

---

## Documentation

### Key Documents
- [TORCHCODEC_FIX.md](TORCHCODEC_FIX.md) - Fix for std::bad_alloc error
- [INFERENCE_MODE_FIX.md](INFERENCE_MODE_FIX.md) - Fix for inference mode error
- [CODE_SIMPLIFICATION_SUMMARY.md](CODE_SIMPLIFICATION_SUMMARY.md) - Codebase cleanup details

### Additional Docs
- [docs/OFFLINE_IMPLEMENTATION.md](docs/OFFLINE_IMPLEMENTATION.md) - Offline model caching
- [docs/QUICKSTART.md](docs/QUICKSTART.md) - Quick start guide
- [docs/GPU_SETUP.md](docs/GPU_SETUP.md) - GPU configuration

### Archived Docs
Old memory fix attempts (before discovering torchcodec issue):
- See `docs/archived/old-memory-fixes/` for historical reference

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review [TORCHCODEC_FIX.md](TORCHCODEC_FIX.md)
3. Open an issue on GitHub

---

**Last Updated**: October 21, 2025  
**Version**: 2.0 (Simplified)
