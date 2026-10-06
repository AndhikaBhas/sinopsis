# Fixing `std::bad_alloc` Error on Linux

## Quick Fix Summary

The `std::bad_alloc` error occurs due to insufficient memory when loading the PyAnnote model. Here are the solutions:

### 1. **Increase Docker Memory** (Easiest Solution)

```bash
# Run with explicit memory limit
docker run -d --name sinopsis-worker \
  --memory=8g \
  --memory-swap=12g \
  sinopsis-worker:latest
```

### 2. **Use Memory-Optimized Code** (Already Implemented)

The code now includes automatic memory optimizations:
- ✅ PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
- ✅ OMP_NUM_THREADS=4
- ✅ Reduced thread counts
- ✅ torch.no_grad() during inference
- ✅ Aggressive garbage collection
- ✅ CUDA cache clearing

### 3. **System Requirements**

**Minimum:**
- RAM: 8GB total (4GB for container)
- Swap: 4GB
- CPU: 2 cores

**Recommended:**
- RAM: 16GB total (8GB for container)
- Swap: 8GB
- CPU: 4+ cores
- GPU: Any NVIDIA GPU (reduces RAM requirements)

## Step-by-Step Troubleshooting

### Step 1: Check Current Memory

```bash
# On Linux host
free -h
docker info | grep Memory

# Inside container
docker exec <container_id> free -h
```

### Step 2: Increase Docker Memory

#### Docker Run
```bash
docker run -d \
  --name sinopsis-worker \
  --memory=8g \
  --memory-swap=12g \
  --cpus=4 \
  -e DATABASE_URL="postgresql://..." \
  -e RABBITMQ_URL="amqp://..." \
  -e HUGGINGFACE_AUTH_TOKEN="hf_..." \
  sinopsis-worker:latest
```

#### Docker Compose
```yaml
version: '3.8'
services:
  diarizer:
    image: sinopsis-worker:latest
    mem_limit: 8g
    mem_reservation: 6g
    memswap_limit: 12g
    cpus: 4
    environment:
      - DATABASE_URL=postgresql://...
      - RABBITMQ_URL=amqp://...
      - HUGGINGFACE_AUTH_TOKEN=hf_...
```

#### Kubernetes
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sinopsis-worker
spec:
  containers:
  - name: worker
    image: sinopsis-worker:latest
    resources:
      requests:
        memory: "6Gi"
        cpu: "2"
      limits:
        memory: "8Gi"
        cpu: "4"
```

### Step 3: Add Swap Space (Linux)

```bash
# Check current swap
swapon --show

# Create 8GB swap file
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Verify
free -h

# Make permanent (add to /etc/fstab)
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Step 4: Optimize Swappiness

```bash
# Check current value
cat /proc/sys/vm/swappiness

# Set to 60 (better for memory-intensive apps)
sudo sysctl vm.swappiness=60

# Make permanent
echo 'vm.swappiness=60' | sudo tee -a /etc/sysctl.conf
```

### Step 5: Monitor Memory Usage

```bash
# Real-time monitoring
docker stats <container_id>

# Or use htop
htop

# Watch memory
watch -n 1 free -h
```

## Alternative Solutions

### Option A: Use CPU-Only Build (Uses Less Memory)

```bash
# Build CPU-only version
docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker:cpu .

# Run with less memory required
docker run -d --memory=6g sinopsis-worker:cpu
```

### Option B: Use Low-Memory Dockerfile

```bash
# Build with low-memory Dockerfile
docker build -f Dockerfile.low-memory -t sinopsis-worker:low-mem .

# Model will download on first run
docker run -d --memory=6g sinopsis-worker:low-mem
```

### Option C: Use Startup Script

The included `start_worker.py` automatically configures memory settings:

```bash
# Run with startup script
docker run -d sinopsis-worker:latest python start_worker.py
```

## Understanding the Error

### What is `std::bad_alloc`?

This is a C++ exception thrown when memory allocation fails. It occurs in PyTorch/PyAnnote because:

1. **Model is large**: ~1.5-2GB when loaded into memory
2. **Initialization peak**: Temporary memory spike during loading (3-4GB)
3. **Limited resources**: Container/system doesn't have enough RAM

### Memory Usage Timeline

```
Startup        → ~500MB  (Python + libraries)
Model Loading  → ~4GB    (PEAK - temporary)
Model Loaded   → ~2GB    (Steady state)
Processing     → ~3GB    (During inference)
```

## Verification Steps

### Test 1: Check Memory After Changes

```bash
# Start container with monitoring
docker run -it --rm \
  --memory=8g \
  sinopsis-worker:latest \
  python -c "
import torch
from pyannote.audio import Pipeline
print('Testing model load...')
pipeline = Pipeline.from_pretrained('pyannote/speaker-diarization-community-1')
print('✓ Model loaded successfully!')
"
```

### Test 2: Monitor During Actual Run

```bash
# Terminal 1: Start worker
docker run -d --name test-worker --memory=8g sinopsis-worker:latest

# Terminal 2: Monitor
docker stats test-worker

# Terminal 3: Check logs
docker logs -f test-worker
```

### Test 3: Validate Environment Variables

```bash
docker run --rm sinopsis-worker:latest python -c "
import os
print('Memory Optimizations:')
print(f'PYTORCH_CUDA_ALLOC_CONF: {os.getenv(\"PYTORCH_CUDA_ALLOC_CONF\")}')
print(f'OMP_NUM_THREADS: {os.getenv(\"OMP_NUM_THREADS\")}')
print(f'MKL_NUM_THREADS: {os.getenv(\"MKL_NUM_THREADS\")}')
print(f'PYTORCH_JIT: {os.getenv(\"PYTORCH_JIT\")}')
"
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Error during model loading | Increase Docker memory to 8GB+ |
| Slow startup | Normal - model loading takes 2-5 minutes |
| OOM after running for hours | Add memory limits and restart policy |
| High memory on Windows | Windows handles memory differently; 8GB+ recommended |
| Container crashes immediately | Check logs: `docker logs <container>` |

## Performance Tuning

### For Limited RAM (4-6GB available)

```bash
# Use CPU with aggressive optimizations
docker run -d \
  --memory=4g \
  --memory-swap=8g \
  -e OMP_NUM_THREADS=2 \
  -e MKL_NUM_THREADS=2 \
  sinopsis-worker:cpu
```

### For Adequate RAM (8GB+ available)

```bash
# Standard configuration
docker run -d \
  --memory=8g \
  --memory-swap=12g \
  sinopsis-worker:latest
```

### For High RAM (16GB+ available)

```bash
# Optimal configuration
docker run -d \
  --memory=12g \
  --memory-swap=16g \
  -e OMP_NUM_THREADS=8 \
  -e MKL_NUM_THREADS=8 \
  sinopsis-worker:latest
```

## Getting Help

If you still experience issues:

1. **Collect Information:**
   ```bash
   # System info
   free -h
   docker info
   
   # Container info
   docker inspect <container_id>
   docker logs <container_id>
   ```

2. **Check Documentation:**
   - `docs/MEMORY_OPTIMIZATION.md` - Complete memory guide
   - `docs/DOCKER_MEMORY_FIX.md` - Docker-specific fixes
   - `docs/QUICKSTART.md` - Quick start guide

3. **Common Solutions:**
   - ✅ Increase Docker memory to 8GB minimum
   - ✅ Add swap space (8GB recommended)
   - ✅ Use CPU-only build if GPU not needed
   - ✅ Monitor memory usage during startup
   - ✅ Ensure HuggingFace token is valid

## Success Indicators

You'll know it's working when you see:

```
✓ PyAnnote pipeline initialized successfully on device: cuda
✓ Model loaded successfully
✓ Waiting for messages. To exit press CTRL+C
```

Memory usage should stabilize around 2-3GB after initial startup.
