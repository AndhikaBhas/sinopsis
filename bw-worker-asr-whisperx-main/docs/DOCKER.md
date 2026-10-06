# Docker Setup for ASR WhisperX Worker

This document describes the optimized Docker setup for the ASR (Automatic Speech Recognition) WhisperX Worker service.

## Overview

The Docker setup uses a **multi-stage build strategy** to create the smallest possible production image:

- **Builder Stage**: Contains all build dependencies and compiles/installs Python packages
- **Runtime Stage**: Minimal production image with only runtime dependencies and compiled packages

## Key Features

- **Size Optimized**: ~8-10GB (down from 14GB+ in typical builds)
- **Multi-architecture**: Supports both GPU (CUDA 12.x) and CPU-only builds
- **Security**: Runs as non-root user
- **Performance**: Optimized for WhisperX ASR workloads
- **Minimal Attack Surface**: Only essential runtime dependencies

## Quick Start

### Build Images

```bash
# GPU version (default - requires NVIDIA Docker runtime)
./build-docker.sh

# GPU version with custom tag
./build-docker.sh gpu v1.0

# CPU-only version
./build-docker.sh cpu

# CPU version with custom tag
./build-docker.sh cpu v1.0
```

### Run Container

````bash
# Run with default latest tag
./run-docker.sh

# Run with specific version
./run-docker.sh v1.0

# Manual run with GPU version
sudo docker run --rm -it --gpus all sinopsis-worker-asr:latest

# Manual run with CPU version
sudo docker run --rm -it sinopsis-worker-asr:latest-cpu

# Production with environment file
sudo docker run -d --name asr-worker \
  --env-file .env \
  --gpus all \
  sinopsis-worker-asr:latest
```## Build Arguments

| Argument             | Description        | Default | Options           |
| -------------------- | ------------------ | ------- | ----------------- |
| `CUDA_VERSION`       | CUDA support       | `cu121` | `cu121`, `cpu`    |
| `TORCH_VERSION`      | PyTorch version    | `2.8.0` | Any valid version |
| `TORCHAUDIO_VERSION` | TorchAudio version | `2.8.0` | Any valid version |

## Image Variants

### GPU Version (`sinopsis-worker-asr:gpu`)

- **CUDA Support**: CUDA 12.1+
- **Size**: ~8-10GB
- **Use Case**: Production ASR workloads with GPU acceleration
- **Requirements**: NVIDIA Docker runtime, compatible GPU

### CPU Version (`sinopsis-worker-asr:cpu`)

- **CUDA Support**: None
- **Size**: ~6-8GB
- **Use Case**: Development, testing, or CPU-only deployments
- **Requirements**: Standard Docker runtime

## Architecture

### Stage 1: Builder (`python:3.13-slim`)

```dockerfile
# Install build dependencies
apt-get install build-essential gcc g++ git...

# Create virtual environment
python -m venv /opt/venv

# Install Python packages
pip install torch whisperx pyannote.audio...

# Aggressive cleanup
find /opt/venv -name "*.pyc" -delete...
````

### Stage 2: Runtime (`python:3.13-slim`)

```dockerfile
# Install minimal runtime dependencies
apt-get install ffmpeg libsndfile1...

# Copy compiled packages from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY worker.py transcript_merger.py...

# Run as non-root user
USER worker
```

## Optimization Techniques

### Size Reduction

- **Multi-stage builds**: Build dependencies not included in final image
- **Aggressive cleanup**: Remove caches, test files, documentation
- **Minimal base**: Use `python:3.13-slim` instead of full Ubuntu
- **Strip binaries**: Remove debug symbols from compiled libraries
- **Virtual environment**: Isolate and optimize Python package installation

### Security

- **Non-root user**: Container runs as `worker` user (UID 1000)
- **Minimal packages**: Only essential runtime dependencies installed
- **No secrets in image**: Environment variables provided at runtime

### Performance

- **TF32 enabled**: Better GPU performance for compatible operations
- **Optimized cache paths**: Temporary directories for model downloads
- **Health checks**: Verify core dependencies can be imported

## Environment Variables

### Required

- `RABBITMQ_HOST`: RabbitMQ server hostname
- `RABBITMQ_PORT`: RabbitMQ server port
- `RABBITMQ_USER`: RabbitMQ username
- `RABBITMQ_PASS`: RabbitMQ password
- `MINIO_ENDPOINT`: MinIO server endpoint
- `MINIO_ACCESS_KEY`: MinIO access key
- `MINIO_SECRET_KEY`: MinIO secret key
- `DATABASE_URL`: PostgreSQL connection string

### Optional

- `CUDA_VISIBLE_DEVICES`: GPU device selection
- `TORCH_HOME`: PyTorch model cache directory
- `HF_HOME`: Hugging Face model cache directory
- `WHISPER_CACHE`: Whisper model cache directory

## File Structure

```
/app/                           # Application directory
├── worker.py                   # Main worker script
├── transcript_merger.py        # Transcript processing
├── validate_env.py            # Environment validation
├── requirements.txt           # Python dependencies
└── logs/                      # Log directory

/opt/venv/                     # Python virtual environment
├── bin/                       # Python executables
├── lib/python3.13/site-packages/  # Installed packages
└── ...

/tmp/                          # Temporary directories
├── torch/                     # PyTorch cache
├── huggingface/              # HF model cache
└── whisper/                  # Whisper cache
```

## Health Checks

The container includes a health check that verifies core dependencies:

```dockerfile
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
    CMD python -c "import torch, whisperx, pika, minio, psycopg2; print('Health check passed')"
```

## Troubleshooting

### Build Issues

**Problem**: `pip install whisperx` fails

```bash
# Solution: Ensure build dependencies are installed
docker build --no-cache -t sinopsis-worker-asr:gpu .
```

**Problem**: CUDA version mismatch

```bash
# Solution: Check NVIDIA driver compatibility
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.1-runtime-ubuntu20.04 nvidia-smi
```

### Runtime Issues

**Problem**: GPU not detected

```bash
# Check NVIDIA Docker runtime
docker run --rm --gpus all nvidia/cuda:12.1-runtime-ubuntu20.04 nvidia-smi

# Verify GPU support in container
docker run --rm --gpus all sinopsis-worker-asr:gpu python -c "import torch; print(torch.cuda.is_available())"
```

**Problem**: Out of memory

```bash
# Monitor GPU memory
nvidia-smi

# Use CPU version for testing
docker run --rm sinopsis-worker-asr:cpu
```

## Development

### Building Custom Versions

```bash
# Custom PyTorch version
sudo docker build --build-arg TORCH_VERSION=2.7.0 -t sinopsis-worker-asr:custom .

# GPU build with custom tag
./build-docker.sh gpu dev

# CPU build with custom tag
./build-docker.sh cpu dev
```

### Debugging

```bash
# Interactive shell in container
sudo docker run --rm -it --gpus all sinopsis-worker-asr:latest bash

# Check installed packages
sudo docker run --rm sinopsis-worker-asr:latest pip list

# Verify model loading
docker run --rm --gpus all sinopsis-worker-asr:gpu python -c "import whisperx; print('WhisperX loaded successfully')"
```

## Production Deployment

### Docker Compose

```yaml
version: "3.8"
services:
  asr-worker:
    image: sinopsis-worker-asr:gpu
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - RABBITMQ_HOST=rabbitmq
      - MINIO_ENDPOINT=minio:9000
      - DATABASE_URL=postgresql://user:pass@postgres:5432/db
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: asr-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: asr-worker
  template:
    metadata:
      labels:
        app: asr-worker
    spec:
      containers:
        - name: asr-worker
          image: sinopsis-worker-asr:gpu
          resources:
            limits:
              nvidia.com/gpu: 1
            requests:
              memory: "8Gi"
              cpu: "2"
          envFrom:
            - secretRef:
                name: asr-worker-secrets
```

## Monitoring

### Container Metrics

```bash
# Resource usage
docker stats sinopsis-worker-asr

# GPU utilization
nvidia-smi -l 1

# Container logs
docker logs -f asr-worker
```

### Health Monitoring

```bash
# Health check status
docker inspect asr-worker | grep -A 5 Health

# Manual health check
docker exec asr-worker python -c "import torch, whisperx; print('OK')"
```
