# GPU Support Guide for Docker

## Problem: "GPU is not available" in Docker Container

If PyTorch reports that CUDA/GPU is not available inside your Docker container, it's usually because:

1. **PyTorch was built for CPU-only** (most common)
2. Docker is not configured to expose GPU
3. NVIDIA Container Toolkit is not installed
4. CUDA version mismatch

---

## ✅ Solution Overview

### 1. Use GPU-Enabled Dockerfile

### 2. Install NVIDIA Container Toolkit

### 3. Run Container with GPU Access

---

## Step 1: Build with GPU Support

### Option A: Use Dockerfile.gpu (Recommended)

```bash
# Build with default CUDA 11.8
docker build -f Dockerfile.gpu -t sinopsis-worker-diarizer:gpu .

# Or specify CUDA version (for newer drivers)
docker build -f Dockerfile.gpu \
  --build-arg CUDA_VERSION=cu121 \
  -t sinopsis-worker-diarizer:gpu .
```

### Option B: Update Main Dockerfile

The main `Dockerfile` has been updated to use CUDA 11.8. Build normally:

```bash
docker build -t sinopsis-worker-diarizer:latest .
```

### Check CUDA Version Compatibility

| CUDA Version | Docker Build Arg | Min NVIDIA Driver | PyTorch Index URL |
| ------------ | ---------------- | ----------------- | ----------------- |
| CUDA 11.8    | `cu118`          | 450.80.02         | `whl/cu118`       |
| CUDA 12.1    | `cu121`          | 525.60.13         | `whl/cu121`       |

**Check your NVIDIA driver version:**

```bash
nvidia-smi
```

Look at the "CUDA Version" in the top right. Use the matching build arg.

---

## Step 2: Install NVIDIA Container Toolkit (Debian 12)

### Install Prerequisites

```bash
# Update package list
sudo apt-get update

# Install required packages
sudo apt-get install -y curl gnupg
```

### Add NVIDIA Repository

```bash
# Add GPG key
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

# Add repository
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
```

### Install NVIDIA Container Toolkit

```bash
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
```

### Configure Docker to Use NVIDIA Runtime

```bash
# Configure the runtime
sudo nvidia-ctk runtime configure --runtime=docker

# Restart Docker
sudo systemctl restart docker
```

### Verify Installation

```bash
# Test GPU access in a container
sudo docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

You should see your GPU listed. ✅

---

## Step 3: Run Container with GPU Access

### Basic GPU Run

```bash
docker run -d \
  --name sinopsis-diarization-worker \
  --gpus all \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  sinopsis-worker-diarizer:gpu
```

### Specify GPU Device

```bash
# Use specific GPU (device 0)
docker run -d \
  --name sinopsis-diarization-worker \
  --gpus '"device=0"' \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  sinopsis-worker-diarizer:gpu
```

### With Resource Limits

```bash
docker run -d \
  --name sinopsis-diarization-worker \
  --gpus all \
  --memory="8g" \
  --cpus="4" \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  -v sinopsis-torch-cache:/tmp/torch \
  -v sinopsis-hf-cache:/tmp/huggingface \
  sinopsis-worker-diarizer:gpu
```

---

## 🧪 Verify GPU Access Inside Container

### Test PyTorch CUDA

```bash
docker exec -it sinopsis-diarization-worker python -c "
import torch
print(f'PyTorch Version: {torch.__version__}')
print(f'CUDA Available: {torch.cuda.is_available()}')
print(f'CUDA Version: {torch.version.cuda}')
print(f'GPU Count: {torch.cuda.device_count()}')
if torch.cuda.is_available():
    print(f'GPU Name: {torch.cuda.get_device_name(0)}')
    print(f'GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f}GB')
"
```

**Expected Output:**

```
PyTorch Version: 2.1.0+cu118
CUDA Available: True
CUDA Version: 11.8
GPU Count: 1
GPU Name: NVIDIA GeForce RTX 3080
GPU Memory: 10.0GB
```

### Check nvidia-smi Inside Container

```bash
docker exec -it sinopsis-diarization-worker nvidia-smi
```

---

## 📋 Docker Compose with GPU

Update your `docker-compose.yml`:

```yaml
version: "3.8"

services:
  diarization-worker:
    build:
      context: .
      dockerfile: Dockerfile.gpu
      args:
        CUDA_VERSION: cu118
    image: sinopsis-worker-diarizer:gpu
    container_name: sinopsis-diarization-worker
    restart: unless-stopped

    env_file:
      - .env

    # GPU configuration
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all # or specific number: count: 1
              capabilities: [gpu]

    volumes:
      - ./logs:/app/logs
      - torch-cache:/tmp/torch
      - hf-cache:/tmp/huggingface

    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  torch-cache:
  hf-cache:
```

Run with:

```bash
docker compose up -d
```

---

## 🔍 Troubleshooting

### GPU Not Detected After Build

**Problem:** Container reports no GPU even though host has GPU.

**Solution:** Ensure you're running with `--gpus all`:

```bash
docker run --gpus all ...
```

### CUDA Version Mismatch

**Problem:** `RuntimeError: CUDA error: invalid device function`

**Solution:** Rebuild with matching CUDA version:

```bash
# Check your driver's CUDA version
nvidia-smi

# Build with matching version
docker build -f Dockerfile.gpu --build-arg CUDA_VERSION=cu121 -t sinopsis-worker-diarizer:gpu .
```

### NVIDIA Container Toolkit Not Found

**Problem:** `docker: Error response from daemon: could not select device driver "" with capabilities: [[gpu]]`

**Solution:** Install NVIDIA Container Toolkit (see Step 2 above).

### Permission Denied on GPU

**Problem:** Container can't access GPU due to permissions.

**Solution:** Ensure user has access to docker group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## 📊 Performance Comparison

| Configuration | Build Time | Image Size | GPU Speed        |
| ------------- | ---------- | ---------- | ---------------- |
| CPU-only      | ~5 min     | ~3.5 GB    | ❌ N/A           |
| CUDA 11.8     | ~8 min     | ~6.5 GB    | ✅ 10-50x faster |
| CUDA 12.1     | ~8 min     | ~6.5 GB    | ✅ 10-50x faster |

**Recommendation:** Use GPU-enabled build for production workloads.

---

## 🎯 Quick Reference

### Build Commands

```bash
# CPU-only (smaller, slower)
docker build -f Dockerfile.optimized -t sinopsis-worker-diarizer:cpu .

# GPU-enabled CUDA 11.8 (recommended)
docker build -f Dockerfile.gpu -t sinopsis-worker-diarizer:gpu .

# GPU-enabled CUDA 12.1 (newer drivers)
docker build -f Dockerfile.gpu --build-arg CUDA_VERSION=cu121 -t sinopsis-worker-diarizer:gpu .
```

### Run Commands

```bash
# CPU-only
docker run -d --name worker --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:cpu

# GPU-enabled
docker run -d --name worker --gpus all --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:gpu
```

### Test GPU

```bash
# Quick test
docker exec -it worker python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# Detailed test
docker exec -it worker python -c "
import torch
if torch.cuda.is_available():
    print('✅ GPU Available')
    print(f'Device: {torch.cuda.get_device_name(0)}')
else:
    print('❌ GPU Not Available')
"
```

---

## ✅ Success Checklist

Before running GPU-enabled container:

- [ ] NVIDIA GPU is installed and working (`nvidia-smi` works on host)
- [ ] NVIDIA drivers are installed (version 450.80.02+)
- [ ] NVIDIA Container Toolkit is installed
- [ ] Docker is configured with NVIDIA runtime
- [ ] Built with GPU-enabled Dockerfile (`Dockerfile.gpu` or updated `Dockerfile`)
- [ ] Running with `--gpus all` flag
- [ ] PyTorch reports CUDA is available inside container

---

## 🆘 Still Having Issues?

### Check Everything:

```bash
# 1. Host GPU
nvidia-smi

# 2. Docker GPU support
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi

# 3. Container PyTorch
docker exec -it sinopsis-diarization-worker python -c "import torch; print(torch.cuda.is_available())"
```

If step 1 works but step 2 fails → Install NVIDIA Container Toolkit
If step 2 works but step 3 fails → Rebuild with GPU-enabled Dockerfile

---

## 📚 Additional Resources

- [NVIDIA Container Toolkit Docs](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
- [PyTorch CUDA Installation](https://pytorch.org/get-started/locally/)
- [Docker GPU Support](https://docs.docker.com/config/containers/resource_constraints/#gpu)
