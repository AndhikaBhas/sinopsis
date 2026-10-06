# Docker Quick Reference

## 🚀 Build & Run (Quick Start)

### GPU Version (Default)

```bash
# Build
./buildDocker.sh gpu

# Run
docker run -d --name worker --gpus all --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:latest
```

### CPU Version

```bash
# Build
./buildDocker.sh cpu

# Run
docker run -d --name worker --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:cpu
```

## 📋 Build Options

### Using build.sh (Recommended)

```bash
./buildDocker.sh gpu        # GPU with CUDA 12.x (default)
./buildDocker.sh gpu cu118  # GPU with CUDA 11.8
./buildDocker.sh cpu        # CPU-only
```

### Using docker build directly

```bash
# GPU (CUDA 12.x)
docker build -t sinopsis-worker-diarizer:latest .

# GPU (CUDA 11.8)
docker build --build-arg CUDA_VERSION=cu118 -t sinopsis-worker-diarizer:latest .

# CPU-only
docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker-diarizer:cpu .
```

## 🎯 Key Features

- ✅ **Single Dockerfile** for both CPU and GPU
- ✅ **Multi-stage build** for smaller images
- ✅ **CUDA 12.x support** (default)
- ✅ **Configurable** via build arguments
- ✅ **Security**: Runs as non-root user
- ✅ **Fixed**: No torchvision warnings

## 🧪 Test GPU

```bash
./test-gpu.sh
```

## 📚 Documentation

- **DOCKERFILE_UNIFIED.md** - Complete unified Dockerfile guide
- **GPU_SETUP.md** - GPU setup for Debian 12
- **GPU_QUICKSTART.md** - Quick GPU reference
- **DOCKER_TROUBLESHOOTING.md** - Common issues & fixes
- **TORCHVISION_WARNING_FIX.md** - Torchvision warning solution

## 🔧 Common Commands

```bash
# Build
./buildDocker.sh gpu

# Run
docker run -d --name worker --gpus all --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:latest

# Logs
docker logs -f worker

# Stop
docker stop worker

# Test GPU
./test-gpu.sh
```

## 📊 CUDA Compatibility

| Your System | Build Command          | Run Command        |
| ----------- | ---------------------- | ------------------ |
| CUDA 12.x   | `./buildDocker.sh gpu`       | Add `--gpus all`   |
| CUDA 11.8   | `./buildDocker.sh gpu cu118` | Add `--gpus all`   |
| No GPU      | `./buildDocker.sh cpu`       | No GPU flag needed |

## ✅ What's New

- Unified single Dockerfile (no more Dockerfile.gpu, Dockerfile.optimized)
- Build arguments for flexibility
- Cleaner, simpler maintenance
- Same great features, better organization

---

**For detailed information, see [DOCKERFILE_UNIFIED.md](DOCKERFILE_UNIFIED.md)**
