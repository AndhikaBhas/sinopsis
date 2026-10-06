# Sinopsis Worker - Diarizer

Speaker diarization worker for Sinopsis project using PyAnnote Audio.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt -c constraints.txt

# Verify installation
python verify_fix.py

# Start worker
python start_worker.py
```

## Docker

**✨ New: Full Offline Support** - The Docker image now works without internet at runtime!

```bash
# Build image (requires internet to download models)
./build-docker.sh gpu

# Verify offline capability
./verify-offline.sh

# Run container (no internet required!)
./run-docker.sh
```

The build process downloads all required models (~2-3GB) and caches them in the image. At runtime, the container uses only cached models and never attempts to connect to the internet.

See [Offline Runtime Documentation](docs/OFFLINE_RUNTIME.md) for details.

## Documentation

All documentation is in the [`docs/`](docs/) folder:

- **[Getting Started](docs/README.md)** - Main documentation index
- **[Quick Start Guide](docs/QUICKSTART.md)** - Fast setup guide
- **[GPU Setup](docs/GPU_SETUP.md)** - CUDA configuration
- **[Docker Guide](docs/DOCKER.md)** - Docker deployment
- **[Offline Runtime](docs/OFFLINE_RUNTIME.md)** - ✨ **NEW**: Run without internet
- **[Offline Build](docs/OFFLINE_BUILD.md)** - Build without internet

### Recent Fixes

- **[Torchcodec Fix](docs/TORCHCODEC_FIX.md)** - Fix for std::bad_alloc error
- **[Inference Mode Fix](docs/INFERENCE_MODE_FIX.md)** - Fix for PyTorch 2.8+ compatibility
- **[Code Simplification](docs/CODE_SIMPLIFICATION_COMPLETE.md)** - Cleanup summary

## Requirements

- Python 3.11+
- PyTorch 2.8.0+cu128 (CUDA 12.8)
- PyAnnote Audio 4.0.1
- RabbitMQ, PostgreSQL, MinIO (for production)

## Configuration

Edit `config.py` or set environment variables:

```bash
export RABBITMQ_HOST=localhost
export RABBITMQ_PORT=5672
export DATABASE_URL=postgresql://user:pass@localhost/db
export MINIO_ENDPOINT=localhost:9000
```

## License

[Your License Here]
