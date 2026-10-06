# Docker Deployment Guide

This document provides instructions for building and running the Sinopsis Diarization Worker using Docker.

## Prerequisites

- Docker Engine 20.10 or later
- Docker Compose V2 (optional, for compose deployment)
- At least 8GB RAM available
- (Optional) NVIDIA GPU with CUDA support and nvidia-docker2 for GPU acceleration

## Quick Start

### 1. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
nano .env
```

Ensure all required variables are set:

- `DATABASE_URL`
- `RABBITMQ_URL`
- `RABBIT_MQ_EXCHANGE`
- `RABBIT_MQ_INPUT_QUEUE`
- `RABBIT_MQ_OUTPUT_QUEUE`
- `MINIO_ENDPOINT`
- `MINIO_USER`
- `MINIO_PASSWORD`
- `MINIO_INPUT_BUCKET`
- `HUGGINGFACE_AUTH_TOKEN`

### 2. Build the Docker Image

#### Using Docker directly:

```bash
docker build -t sinopsis-worker-diarizer:latest .
```

#### Using Docker Compose:

```bash
docker compose build
```

### 3. Run the Worker

#### Using Docker directly:

```bash
docker run -d \
  --name sinopsis-diarization-worker \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  sinopsis-worker-diarizer:latest
```

#### Using Docker Compose:

```bash
docker compose up -d
```

## Multi-Stage Build Architecture

The Dockerfile uses a multi-stage build approach for optimization:

### Stage 1: Builder

- Based on `python:3.10-slim`
- Installs build dependencies (gcc, g++, build-essential)
- Creates virtual environment
- Installs Python packages from `requirements.txt`
- Includes PyTorch, TorchAudio, TorchVision, and PyAnnote

### Stage 2: Runtime

- Based on `python:3.10-slim`
- Copies only the virtual environment from builder stage
- Installs minimal runtime dependencies
- Creates non-root user for security
- Runs application as non-root user
- Final image size: ~4-5GB (much smaller than single-stage build)

## GPU Support

To enable GPU acceleration with NVIDIA GPUs:

1. Install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

2. Uncomment the GPU configuration in `docker-compose.yml`:

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: 1
          capabilities: [gpu]
```

3. Or run with Docker directly:

```bash
docker run -d \
  --gpus all \
  --name sinopsis-diarization-worker \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  sinopsis-worker-diarizer:latest
```

## Docker Commands

### View Logs

```bash
# Using Docker
docker logs -f sinopsis-diarization-worker

# Using Docker Compose
docker compose logs -f
```

### Stop the Worker

```bash
# Using Docker
docker stop sinopsis-diarization-worker

# Using Docker Compose
docker compose stop
```

### Restart the Worker

```bash
# Using Docker
docker restart sinopsis-diarization-worker

# Using Docker Compose
docker compose restart
```

### Remove the Container

```bash
# Using Docker
docker stop sinopsis-diarization-worker
docker rm sinopsis-diarization-worker

# Using Docker Compose
docker compose down
```

### Access Container Shell

```bash
# Using Docker
docker exec -it sinopsis-diarization-worker bash

# Using Docker Compose
docker compose exec diarization-worker bash
```

## Resource Management

The default `docker-compose.yml` sets resource limits:

- CPU: 2-4 cores
- Memory: 4-8GB

Adjust these based on your requirements:

```yaml
deploy:
  resources:
    limits:
      cpus: "4"
      memory: 8G
    reservations:
      cpus: "2"
      memory: 4G
```

## Volume Mounts

The container uses the following volumes:

- `./logs:/app/logs` - Application logs
- `torch-cache:/tmp/torch` - PyTorch model cache
- `hf-cache:/tmp/huggingface` - HuggingFace model cache

This ensures:

- Logs persist on the host
- Models are cached between container restarts
- Faster subsequent startups

## Troubleshooting

### Container Exits Immediately

Check logs for configuration errors:

```bash
docker logs sinopsis-diarization-worker
```

Common issues:

- Missing or invalid environment variables
- Cannot connect to RabbitMQ/Database/MinIO
- Invalid HuggingFace token

### Out of Memory

Increase Docker memory limit:

- Docker Desktop: Settings → Resources → Memory
- Linux: Adjust `docker-compose.yml` resource limits

### Model Download Issues

Ensure:

- Valid `HUGGINGFACE_AUTH_TOKEN`
- Internet connectivity from container
- Sufficient disk space for models (~2-3GB)

### Permission Issues

The container runs as non-root user (UID 1000). Ensure log directory is writable:

```bash
chmod -R 755 logs/
```

## Building for Production

### Build with BuildKit

Enable BuildKit for faster builds:

```bash
DOCKER_BUILDKIT=1 docker build -t sinopsis-worker-diarizer:latest .
```

### Multi-Platform Builds

Build for multiple architectures:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t sinopsis-worker-diarizer:latest .
```

### Push to Registry

Tag and push to your container registry:

```bash
docker tag sinopsis-worker-diarizer:latest your-registry.com/sinopsis-worker-diarizer:latest
docker push your-registry.com/sinopsis-worker-diarizer:latest
```

## Health Checks

The container includes a health check that runs every 30 seconds:

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' sinopsis-diarization-worker
```

Possible statuses:

- `starting` - Container is starting
- `healthy` - Container is healthy
- `unhealthy` - Health check failed

## Security Considerations

The Docker image implements security best practices:

- ✅ Runs as non-root user (UID 1000)
- ✅ Minimal base image (python:3.10-slim)
- ✅ Multi-stage build reduces attack surface
- ✅ No sensitive data in image layers
- ✅ Environment variables for secrets (never hardcoded)
- ✅ Read-only filesystem for application code

## Performance Optimization

- Models are cached in volumes to avoid re-downloading
- BuildKit cache speeds up rebuilds
- Virtual environment is copied (not rebuilt) in runtime stage
- Minimal runtime dependencies reduce image size
- Health checks ensure container is responsive

## Next Steps

- Set up monitoring with Prometheus/Grafana
- Implement log aggregation (ELK, Loki)
- Configure auto-restart policies
- Set up container orchestration (Kubernetes, Docker Swarm)
- Implement CI/CD pipeline for automated builds
