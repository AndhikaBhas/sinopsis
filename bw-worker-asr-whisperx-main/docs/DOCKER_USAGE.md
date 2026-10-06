# Docker Scripts Usage

This project uses two simple Docker scripts for building and running the ASR WhisperX Worker container.

## Available Scripts

### 1. `build-docker.sh` - Build Docker Images

**Usage:**

```bash
# Build GPU version (default)
./build-docker.sh

# Build GPU version with custom tag
./build-docker.sh gpu v1.0

# Build CPU-only version
./build-docker.sh cpu

# Build CPU version with custom tag
./build-docker.sh cpu dev
```

**Features:**

- ✅ GPU and CPU build support
- ✅ Custom tagging
- ✅ BuildKit optimization
- ✅ Size reporting
- ✅ Automatic cleanup

**Output Tags:**

- GPU builds: `sinopsis-worker-asr:latest` and `sinopsis-worker-asr:TAG`
- CPU builds: `sinopsis-worker-asr:cpu` and `sinopsis-worker-asr:TAG-cpu`

### 2. `run-docker.sh` - Run Docker Container

**Usage:**

```bash
# Run with latest tag
./run-docker.sh

# Run with specific version
./run-docker.sh v1.0
```

**Features:**

- ✅ GPU support enabled (`--gpus all`)
- ✅ Automatic restart (`--restart always`)
- ✅ Environment file loading (`--env-file .env`)
- ✅ Detached mode (`-d`)

## Quick Workflow

```bash
# 1. Build the image
./build-docker.sh

# 2. Run the container
./run-docker.sh

# 3. Check container status
sudo docker ps

# 4. View logs
sudo docker logs -f sinopsis-worker-asr
```

## Manual Docker Commands

If you prefer manual control:

```bash
# Build GPU version
sudo docker build --build-arg CUDA_VERSION=cu121 -t sinopsis-worker-asr:gpu .

# Build CPU version
sudo docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker-asr:cpu .

# Run GPU container
sudo docker run -d --name asr-worker --gpus all --env-file .env sinopsis-worker-asr:latest

# Run CPU container
sudo docker run -d --name asr-worker --env-file .env sinopsis-worker-asr:cpu
```

## Requirements

- Docker with BuildKit support
- NVIDIA Docker runtime (for GPU builds)
- `.env` file with required configuration

## Troubleshooting

```bash
# Check available images
sudo docker images sinopsis-worker-asr

# Check running containers
sudo docker ps

# View container logs
sudo docker logs asr-worker

# Stop container
sudo docker stop asr-worker

# Remove container
sudo docker rm asr-worker
```

---

_For complete Docker documentation, see [DOCS/DOCKER.md](DOCS/DOCKER.md)_
