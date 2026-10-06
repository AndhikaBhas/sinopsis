# CUDA 12.2 Setup

## ✅ Your System Configuration

- **CUDA Version**: 12.2
- **PyTorch Index**: cu121 (supports all CUDA 12.x versions)
- **Minimum Driver**: 525.60.13 or higher

## 🚀 Build & Run Commands for CUDA 12.2

### Build the Image

```bash
# Using the main Dockerfile (already updated for CUDA 12.2)
docker build -t sinopsis-worker-diarizer:latest .

# Or using build.sh (will use cu121 by default now)
./buildDocker.sh gpu
```

### Run the Container

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

### Verify GPU Access

```bash
# Run the test script
./test-gpu.sh

# Or manually check
docker exec -it sinopsis-diarization-worker python -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA Available: {torch.cuda.is_available()}')
print(f'CUDA Version: {torch.version.cuda}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
"
```

**Expected Output:**

```
PyTorch: 2.1.0+cu121
CUDA Available: True
CUDA Version: 12.1
GPU: NVIDIA GeForce RTX 3080 (or your GPU model)
```

## 📝 Important Notes

1. **PyTorch cu121 supports CUDA 12.x**: The `cu121` build works with CUDA 12.1, 12.2, 12.3, and 12.4
2. **No need to change anything**: Your Dockerfile is now configured for CUDA 12.2
3. **Driver requirement**: Ensure your NVIDIA driver is 525.60.13 or higher

## 🔍 Verify Your CUDA Version

On your Debian 12 host:

```bash
# Check CUDA version
nvidia-smi

# Check driver version
cat /proc/driver/nvidia/version
```

## 🎯 What Changed

### Before (CUDA 11.8):

```dockerfile
RUN pip install torch==2.1.0 --index-url https://download.pytorch.org/whl/cu118
```

### After (CUDA 12.2):

```dockerfile
RUN pip install torch==2.1.0 --index-url https://download.pytorch.org/whl/cu121
```

## ✅ Build Now

You can now build and run with full CUDA 12.2 support:

```bash
# Clean build
docker build -t sinopsis-worker-diarizer:latest .

# Run with GPU
docker run -d --name worker --gpus all --env-file .env -v $(pwd)/logs:/app/logs sinopsis-worker-diarizer:latest

# Test
./test-gpu.sh
```

Your container will now properly use CUDA 12.2! 🚀

## 📊 CUDA Compatibility Matrix

| Your CUDA | PyTorch Index | Min Driver | Status                    |
| --------- | ------------- | ---------- | ------------------------- |
| 11.8      | cu118         | 450.80.02  | ✅ Supported              |
| 12.1      | cu121         | 525.60.13  | ✅ Supported              |
| 12.2      | cu121         | 525.60.13  | ✅ Supported (Your Setup) |
| 12.3      | cu121         | 525.60.13  | ✅ Supported              |
| 12.4      | cu121         | 530.30.02  | ✅ Supported              |

**Note**: PyTorch doesn't have separate builds for each minor CUDA version. The cu121 build works across all CUDA 12.x versions.
