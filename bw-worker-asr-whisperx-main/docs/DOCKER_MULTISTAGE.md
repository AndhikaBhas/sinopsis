# Docker Usage Guide - Sinopsis ASR Worker

This guide covers using the multistage Docker setup for the Sinopsis ASR Worker with WhisperX.

## Overview

The Dockerfile uses a **multistage build strategy** with two stages:

1. **Builder Stage** (`python:3.11-slim`): Installs dependencies, builds packages, and prepares the environment
2. **Runtime Stage** (`python:3.11-slim`): Creates a minimal runtime image with only necessary components

## Benefits of Multistage Build

- **Smaller final image**: Removes build tools and unnecessary files
- **Better security**: Minimal attack surface with fewer installed packages
- **Faster deployments**: Smaller images transfer and start faster
- **Cleaner separation**: Build-time vs runtime dependencies are clearly separated

## Quick Start

### 1. Build the Image

```bash
# Build GPU-enabled image (recommended)
./build-docker.sh gpu

# Build CPU-only image
./build-docker.sh cpu

# Build with custom tag
./build-docker.sh gpu v3.0.3
```

### 2. Run with Docker Compose (Recommended)

```bash
# Create .env file first
cp .env.example .env
# Edit .env with your configuration

# Run the service
docker-compose up -d

# View logs
docker-compose logs -f sinopsis-worker-asr

# Stop the service
docker-compose down
```

### 3. Run with Docker Command

```bash
# GPU-enabled run
docker run -d \
  --name sinopsis-worker-asr \
  --gpus all \
  --env-file .env \
  --restart unless-stopped \
  -v ./logs:/app/logs \
  sinopsis-worker-asr:latest

# CPU-only run
docker run -d \
  --name sinopsis-worker-asr \
  --env-file .env \
  --restart unless-stopped \
  -v ./logs:/app/logs \
  -e ASR_DEVICE=cpu \
  -e ASR_COMPUTE_TYPE=int8 \
  sinopsis-worker-asr:cpu
```

## Image Sizes

Expected image sizes after multistage build:

- **GPU builds**: ~12-13GB (includes CUDA runtime ~4-5GB + PyTorch ML dependencies ~7-8GB)
- **CPU builds**: ~5-6GB (no CUDA runtime)
- **Savings**: ~1-2GB compared to single-stage builds

## Environment Variables

The container supports all environment variables documented in the main README. Key ones for Docker:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname
RABBITMQ_URL=amqp://user:pass@host:5672/%2F
MINIO_ENDPOINT=http://host:9000
MINIO_USER=admin
MINIO_PASSWORD=admin123
MINIO_BUCKET=audio-files

# ASR Configuration
ASR_MODEL=medium
ASR_DEVICE=cuda                # Use 'cpu' for CPU-only containers
ASR_COMPUTE_TYPE=float16       # Use 'int8' for CPU
ASR_LANGUAGE=id

# Performance
USE_MEMORY_MODE=true
MEMORY_CLEANUP_INTERVAL=10
```

## Volume Mounts

### Recommended Persistent Volumes

```bash
# Model cache (persistent across container restarts)
-v whisperx_cache:/app/.cache/whisperx
-v huggingface_cache:/app/.cache/huggingface

# Logs (for debugging)
-v ./logs:/app/logs
```

### Host Directory Mounts

```bash
# If you prefer host directories
-v /opt/sinopsis/cache/whisperx:/app/.cache/whisperx
-v /opt/sinopsis/cache/huggingface:/app/.cache/huggingface
-v /opt/sinopsis/logs:/app/logs
```

## GPU Support

### Requirements

- NVIDIA GPU with CUDA 12.1+ support
- NVIDIA Container Toolkit installed on host
- Docker 19.03+ with nvidia-docker2

### Test GPU Access

```bash
# Test NVIDIA Docker
docker run --rm --gpus all nvidia/cuda:12.1-base-ubuntu20.04 nvidia-smi

# Test in our container
docker run --rm --gpus all --env-file .env sinopsis-worker-asr:latest \
  python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

### GPU Memory Management

```bash
# Limit GPU memory usage (optional)
docker run --gpus all --env-file .env \
  --runtime=nvidia \
  -e NVIDIA_VISIBLE_DEVICES=0 \
  -e NVIDIA_DRIVER_CAPABILITIES=compute,utility \
  sinopsis-worker-asr:latest
```

## Development Setup

### Full Development Stack with Docker Compose

```yaml
# docker-compose.dev.yml
version: "3.8"
services:
  sinopsis-worker-asr:
    build: .
    depends_on:
      - rabbitmq
      - minio
      - postgres
    # ... (see docker-compose.yml for full config)

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "15672:15672" # Management UI

  minio:
    image: minio/minio:latest
    ports:
      - "9001:9001" # Console UI

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: sinopsis
```

```bash
# Run development stack
docker-compose -f docker-compose.dev.yml up -d
```

## Build Optimization

### Build Arguments

The Dockerfile supports build arguments for customization:

```bash
# Custom CUDA version
docker build --build-arg CUDA_VERSION=cu118 -t sinopsis-worker-asr:cu118 .

# CPU-only build
docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker-asr:cpu .
```

### Build Cache Optimization

```bash
# Use BuildKit for better caching
export DOCKER_BUILDKIT=1

# Build with cache from registry
docker build --cache-from sinopsis-worker-asr:latest -t sinopsis-worker-asr:new .
```

### Multi-platform Builds

```bash
# Build for multiple architectures (requires buildx)
docker buildx build --platform linux/amd64,linux/arm64 -t sinopsis-worker-asr:multi .
```

## Health Checks

The container includes built-in health checks:

```bash
# Check container health
docker ps  # Shows health status
docker inspect sinopsis-worker-asr | grep Health -A 10

# Manual health check
docker exec sinopsis-worker-asr python -c "import whisperx; import torch; print('OK')"
```

## Monitoring and Logs

### Logging Configuration

The container uses structured JSON logging:

```bash
# View logs
docker logs -f sinopsis-worker-asr

# With timestamps
docker logs -f --timestamps sinopsis-worker-asr

# Recent logs only
docker logs --tail 100 sinopsis-worker-asr
```

### Resource Monitoring

```bash
# Container resource usage
docker stats sinopsis-worker-asr

# Detailed inspection
docker exec sinopsis-worker-asr cat /proc/meminfo
docker exec sinopsis-worker-asr nvidia-smi  # If GPU enabled
```

## Troubleshooting

### Common Issues

1. **GPU not detected**:

   ```bash
   # Check NVIDIA Docker installation
   docker run --rm --gpus all nvidia/cuda:12.1-base-ubuntu20.04 nvidia-smi
   ```

2. **Memory issues**:

   ```bash
   # Increase container memory limit
   docker run --memory=16g --env-file .env sinopsis-worker-asr:latest
   ```

3. **Model download failures**:

   ```bash
   # Check internet connectivity and cache permissions
   docker run --rm -v whisperx_cache:/cache ubuntu ls -la /cache
   ```

4. **Permission errors**:
   ```bash
   # Container runs as non-root user (worker:1001)
   # Ensure volume permissions allow user 1001
   sudo chown -R 1001:1001 /path/to/volume
   ```

### Debug Mode

```bash
# Run with debug shell
docker run -it --rm --gpus all --env-file .env sinopsis-worker-asr:latest bash

# Run with verbose logging
docker run --env-file .env -e PYTHONPATH=/app -e PYTHON_LOG_LEVEL=DEBUG sinopsis-worker-asr:latest
```

## Production Deployment

### Resource Recommendations

- **CPU**: 4+ cores
- **Memory**: 16GB+ (8GB minimum)
- **GPU Memory**: 8GB+ VRAM for medium model
- **Storage**: 50GB+ for models and cache

### Production Docker Compose

```yaml
version: "3.8"
services:
  sinopsis-worker-asr:
    image: sinopsis-worker-asr:latest
    deploy:
      resources:
        limits:
          memory: 16G
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "5"
```

### Security Considerations

- Container runs as non-root user (UID 1001)
- Minimal base image reduces attack surface
- No SSH or unnecessary services
- Read-only root filesystem (can be enabled with `--read-only`)

## Registry and Distribution

### Push to Registry

```bash
# Tag for registry
docker tag sinopsis-worker-asr:latest your-registry.com/sinopsis-worker-asr:v3.0.3

# Push to registry
docker push your-registry.com/sinopsis-worker-asr:v3.0.3
```

### Pull and Deploy

```bash
# Pull from registry
docker pull your-registry.com/sinopsis-worker-asr:v3.0.3

# Run from registry
docker run -d --gpus all --env-file .env your-registry.com/sinopsis-worker-asr:v3.0.3
```

## Updates and Maintenance

### Update Procedure

1. **Build new image**:

   ```bash
   ./build-docker.sh gpu v3.0.4
   ```

2. **Test new image**:

   ```bash
   docker run --rm --env-file .env sinopsis-worker-asr:v3.0.4 python validate_env.py
   ```

3. **Deploy update**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Cleanup Old Images

```bash
# Remove old images
docker image prune -f

# Remove specific old version
docker rmi sinopsis-worker-asr:v3.0.2

# Full system cleanup
docker system prune -af
```
