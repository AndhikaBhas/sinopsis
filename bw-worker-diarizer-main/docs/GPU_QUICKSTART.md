# Quick Reference: GPU Docker Setup

## 🎯 The Problem

Your Docker image was built with **CPU-only PyTorch**, which is why GPU is not available inside the container.

## ✅ The Solution

Use the GPU-enabled Dockerfile which installs PyTorch with CUDA support.

---

## 🚀 Quick Start (3 Steps)

### Step 1: Rebuild with GPU Support

```bash
./buildDocker.sh gpu
```

Or manually:

```bash
docker build -f Dockerfile.gpu -t sinopsis-worker-diarizer:gpu .
```

### Step 2: Run with GPU Access

```bash
docker run -d \
  --name sinopsis-diarization-worker \
  --gpus all \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  sinopsis-worker-diarizer:gpu
```

### Step 3: Verify GPU Works

```bash
./test-gpu.sh
```

Or manually:

```bash
docker exec -it sinopsis-diarization-worker python -c "import torch; print('CUDA:', torch.cuda.is_available())"
```

**Expected output:** `CUDA: True` ✅

---

## 📋 Available Scripts

| Script        | Purpose                  | Usage                                |
| ------------- | ------------------------ | ------------------------------------ |
| `build.sh`    | Build with GPU or CPU    | `./buildDocker.sh gpu` or `./buildDocker.sh cpu` |
| `test-gpu.sh` | Verify GPU accessibility | `./test-gpu.sh`                      |

---

## 📁 Available Dockerfiles

| Dockerfile             | Purpose                      | When to Use         |
| ---------------------- | ---------------------------- | ------------------- |
| `Dockerfile`           | Main (GPU-enabled CUDA 11.8) | Default production  |
| `Dockerfile.gpu`       | GPU with custom CUDA version | Specific CUDA needs |
| `Dockerfile.optimized` | CPU-only (smaller)           | No GPU available    |

---

## 🔧 Common Commands

### Build Commands

```bash
# GPU with CUDA 11.8 (recommended for most)
./buildDocker.sh gpu

# GPU with CUDA 12.1 (newer drivers)
./buildDocker.sh gpu cu121

# CPU-only (no GPU)
./buildDocker.sh cpu
```

### Run Commands

```bash
# Run with GPU (all GPUs)
docker run -d --name worker --gpus all --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:latest

# Run with specific GPU
docker run -d --name worker --gpus '"device=0"' --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:latest

# Run without GPU (CPU only)
docker run -d --name worker --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:cpu
```

### Test Commands

```bash
# Full GPU test
./test-gpu.sh

# Quick CUDA check
docker exec -it worker python -c "import torch; print(f'CUDA: {torch.cuda.is_available()}')"

# View GPU usage
docker exec -it worker nvidia-smi
```

---

## 🐛 Troubleshooting

### GPU Not Available After Build?

**Most likely cause:** Built with CPU-only PyTorch

**Fix:**

```bash
# Rebuild with GPU support
./buildDocker.sh gpu

# Run with --gpus flag
docker run -d --name worker --gpus all --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:latest
```

### Container Exits with CUDA Error?

**Cause:** CUDA version mismatch

**Fix:** Check your driver version and rebuild with matching CUDA:

```bash
# Check driver version
nvidia-smi

# Build with CUDA 12.1 if driver is newer
./buildDocker.sh gpu cu121
```

### nvidia-smi Not Found in Container?

**This is normal** for slim images. GPU can still work. Test with PyTorch:

```bash
docker exec -it worker python -c "import torch; print(torch.cuda.is_available())"
```

---

## 📊 CUDA Version Reference

| Your nvidia-smi shows | Use CUDA Version | Build Command              |
| --------------------- | ---------------- | -------------------------- |
| CUDA 11.x             | cu118            | `./buildDocker.sh gpu cu118`     |
| CUDA 12.x (12.1-12.4) | cu121            | `./buildDocker.sh gpu` (default) |
| No GPU                | CPU-only         | `./buildDocker.sh cpu`           |

---

## ✅ Pre-deployment Checklist

Before running in production:

- [ ] NVIDIA driver installed on host (`nvidia-smi` works)
- [ ] NVIDIA Container Toolkit installed (see `GPU_SETUP.md`)
- [ ] Built with GPU-enabled Dockerfile
- [ ] Running with `--gpus all` flag
- [ ] Verified with `./test-gpu.sh` (shows CUDA: True)
- [ ] Logs show GPU detection at startup

---

## 📚 Documentation Files

- **`GPU_SETUP.md`** - Complete GPU setup guide for Debian 12
- **`DOCKER_TROUBLESHOOTING.md`** - Docker build errors and fixes
- **`DOCKER.md`** - General Docker usage guide

---

## 🎓 Understanding the Fix

### What was wrong?

The original Dockerfile used:

```dockerfile
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu
```

This installs **CPU-only PyTorch** which cannot use GPU.

### What's fixed?

The new Dockerfile uses:

```dockerfile
RUN pip install torch --index-url https://download.pytorch.org/whl/cu118
```

This installs **CUDA-enabled PyTorch** which can use GPU.

### How to verify?

```bash
# Inside container, check PyTorch version
python -c "import torch; print(torch.__version__)"

# CPU-only shows: 2.1.0+cpu  ❌
# GPU-enabled shows: 2.1.0+cu118  ✅
```

---

## 💡 Pro Tips

1. **Always test GPU** after building: `./test-gpu.sh`
2. **Use specific CUDA versions** for consistency across deployments
3. **Keep GPU drivers updated** on host system
4. **Monitor GPU usage** during processing: `watch -n 1 nvidia-smi`
5. **Cache model downloads** using volumes to speed up container restarts

---

## 🆘 Still Need Help?

1. Check if GPU works on host: `nvidia-smi`
2. Test Docker GPU support: `docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi`
3. Read full guide: `GPU_SETUP.md`
4. Check build logs for errors
5. Verify CUDA version compatibility

---

**Remember:** The key difference is building with `--index-url .../cu118` instead of `.../cpu` when installing PyTorch! 🚀
