# Unified Dockerfile Guide

## 📋 Overview

This project now uses a **single, unified Dockerfile** that supports both CPU and GPU builds through build arguments. No need for multiple Dockerfile variants!

## 🚀 Quick Start

### GPU Build (Default - CUDA 12.x)

```bash
# Using build script (recommended)
./buildDocker.sh gpu

# Or directly with docker
docker build -t sinopsis-worker-diarizer:latest .
```

### CPU Build

```bash
# Using build script
./buildDocker.sh cpu

# Or directly with docker
docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker-diarizer:cpu .
```

### Different CUDA Versions

```bash
# CUDA 12.x (default)
./buildDocker.sh gpu cu121

# CUDA 11.8
./buildDocker.sh gpu cu118

# CPU-only
./buildDocker.sh cpu
```

## 🎯 Build Arguments

The Dockerfile accepts the following build arguments:

| Argument              | Default  | Options                 | Description          |
| --------------------- | -------- | ----------------------- | -------------------- |
| `CUDA_VERSION`        | `cu121`  | `cu121`, `cu118`, `cpu` | PyTorch CUDA version |
| `TORCH_VERSION`       | `2.1.0`  | Any valid version       | PyTorch version      |
| `TORCHAUDIO_VERSION`  | `2.1.0`  | Any valid version       | TorchAudio version   |
| `TORCHVISION_VERSION` | `0.16.0` | Any valid version       | TorchVision version  |

## 📊 Build Examples

### Standard Builds

```bash
# GPU with CUDA 12.x (recommended for CUDA 12.2)
docker build -t sinopsis-worker-diarizer:gpu .

# GPU with CUDA 11.8
docker build --build-arg CUDA_VERSION=cu118 -t sinopsis-worker-diarizer:gpu .

# CPU-only (smaller image, no GPU)
docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker-diarizer:cpu .
```

### Custom PyTorch Version

```bash
# Use PyTorch 2.2.0 with CUDA 12.1
docker build \
  --build-arg CUDA_VERSION=cu121 \
  --build-arg TORCH_VERSION=2.2.0 \
  --build-arg TORCHAUDIO_VERSION=2.2.0 \
  --build-arg TORCHVISION_VERSION=0.17.0 \
  -t sinopsis-worker-diarizer:pytorch2.2 .
```

## 🏃 Run Commands

### GPU Mode

```bash
docker run -d \
  --name sinopsis-diarization-worker \
  --gpus all \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  -v sinopsis-torch-cache:/tmp/torch \
  -v sinopsis-hf-cache:/tmp/huggingface \
  sinopsis-worker-diarizer:latest
```

### CPU Mode

```bash
docker run -d \
  --name sinopsis-diarization-worker \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  sinopsis-worker-diarizer:cpu
```

## ✅ What Changed

### Before (Multiple Dockerfiles)

- ❌ `Dockerfile` - Main GPU build
- ❌ `Dockerfile.gpu` - GPU with custom CUDA
- ❌ `Dockerfile.optimized` - CPU-only build
- ❌ Confusion about which one to use

### After (Single Dockerfile)

- ✅ **One `Dockerfile`** - Supports everything
- ✅ Build arguments control CPU vs GPU
- ✅ Cleaner, easier to maintain
- ✅ No confusion

## 🔧 Using build.sh Script

The `build.sh` script makes it even easier:

```bash
# Show usage
./buildDocker.sh

# Build GPU version (CUDA 12.x)
./buildDocker.sh gpu

# Build GPU version (CUDA 11.8)
./buildDocker.sh gpu cu118

# Build CPU version
./buildDocker.sh cpu

# Build with custom tag
./buildDocker.sh gpu cu121 v1.0
```

## 📦 Image Tags

After building, you'll have:

| Build Command          | Resulting Tags                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| `./buildDocker.sh gpu`       | `sinopsis-worker-diarizer:latest`, `sinopsis-worker-diarizer:gpu`     |
| `./buildDocker.sh gpu cu118` | `sinopsis-worker-diarizer:latest`, `sinopsis-worker-diarizer:gpu`     |
| `./buildDocker.sh cpu`       | `sinopsis-worker-diarizer:cpu`, `sinopsis-worker-diarizer:latest-cpu` |

## 🎓 Understanding Build Arguments

### How It Works

The Dockerfile uses `ARG` instructions to accept build-time variables:

```dockerfile
ARG CUDA_VERSION=cu121
ARG TORCH_VERSION=2.1.0

RUN pip install torch==${TORCH_VERSION} \
    --index-url https://download.pytorch.org/whl/${CUDA_VERSION}
```

When you build:

- **Without args**: Uses defaults (cu121, PyTorch 2.1.0)
- **With args**: Uses your specified values

### CUDA Version Mapping

| Your System | CUDA_VERSION Arg  | Result      |
| ----------- | ----------------- | ----------- |
| CUDA 12.2   | `cu121` (default) | GPU-enabled |
| CUDA 11.8   | `cu118`           | GPU-enabled |
| No GPU      | `cpu`             | CPU-only    |

## 🔍 Verify Your Build

After building, check what you got:

```bash
# List images
docker images sinopsis-worker-diarizer

# Run and check PyTorch
docker run --rm sinopsis-worker-diarizer:latest python -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA: {torch.cuda.is_available()}')
"
```

**GPU build output:**

```
PyTorch: 2.1.0+cu121
CUDA: True
```

**CPU build output:**

```
PyTorch: 2.1.0+cpu
CUDA: False
```

## 💡 Pro Tips

1. **Use build.sh**: Simpler than remembering docker build commands
2. **Tag properly**: Use descriptive tags like `v1.0-gpu` or `v1.0-cpu`
3. **BuildKit**: Already enabled in build.sh for faster builds
4. **Cache layers**: Build arguments don't invalidate early layers
5. **CI/CD friendly**: Single Dockerfile works great in pipelines

## 📝 Docker Compose

Update your `docker-compose.yml` to use build args:

```yaml
version: "3.8"

services:
  diarization-worker:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        CUDA_VERSION: cu121 # or cu118, or cpu
    image: sinopsis-worker-diarizer:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    # ... rest of config
```

Build with:

```bash
docker compose build
```

## 🎯 Migration from Old Dockerfiles

If you were using the old Dockerfiles:

| Old Command                                | New Command                                                           |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `docker build -f Dockerfile.gpu ...`       | `docker build --build-arg CUDA_VERSION=cu121 ...` or `./buildDocker.sh gpu` |
| `docker build -f Dockerfile.optimized ...` | `docker build --build-arg CUDA_VERSION=cpu ...` or `./buildDocker.sh cpu`   |
| `docker build -f Dockerfile ...`           | `docker build ...` (same!)                                            |

## ✅ Benefits of Single Dockerfile

1. **Simpler maintenance**: One file to update
2. **Less confusion**: No "which Dockerfile should I use?"
3. **Consistent builds**: Same base image, same structure
4. **Easy testing**: Test both CPU and GPU from same source
5. **Better for CI/CD**: One pipeline, multiple build variations
6. **DRY principle**: Don't repeat yourself

## 🆘 Troubleshooting

### Wrong PyTorch Version Installed?

Check your build command:

```bash
# This shows what was actually built
docker run --rm sinopsis-worker-diarizer:latest python -c "import torch; print(torch.__version__)"
```

If wrong, rebuild with correct args:

```bash
docker build --build-arg CUDA_VERSION=cu121 -t sinopsis-worker-diarizer:latest .
```

### GPU Not Working?

1. Check you built with GPU support:

   ```bash
   docker run --rm sinopsis-worker-diarizer:latest python -c "import torch; print('Has CUDA' if '+cu' in torch.__version__ else 'CPU only')"
   ```

2. If says "CPU only", rebuild with GPU:

   ```bash
   ./buildDocker.sh gpu
   ```

3. Run with `--gpus all`:
   ```bash
   docker run --gpus all ...
   ```

## 📚 Summary

- ✅ **One Dockerfile** handles all use cases
- ✅ Use **build arguments** to control CPU vs GPU
- ✅ Use **`./buildDocker.sh`** for convenience
- ✅ Default is **GPU with CUDA 12.x**
- ✅ Add `--build-arg CUDA_VERSION=cpu` for CPU-only

Simple, clean, and maintainable! 🎉
