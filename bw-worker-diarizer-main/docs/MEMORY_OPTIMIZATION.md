# Memory Optimization Guide

## Problem: `std::bad_alloc` Error on Linux

When running the diarization worker on Linux or in Docker containers, you may encounter:

```
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
```

This error indicates that the system ran out of memory while loading the PyAnnote speaker diarization model.

## Root Causes

1. **Large Model Size**: PyAnnote's speaker-diarization-community-1 model is memory-intensive
2. **Model Loading**: All model components load into memory simultaneously during initialization
3. **PyTorch Memory Allocation**: Default PyTorch settings can be inefficient with memory
4. **Container Memory Limits**: Docker containers may have restricted memory allocation

## Solutions Implemented

### 1. Environment Variable Configuration (Automatic)

The following environment variables are now set to optimize memory usage:

```bash
# Limit PyTorch memory fragmentation
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Reduce number of threads for lower memory overhead
OMP_NUM_THREADS=2
MKL_NUM_THREADS=2

# Enable PyTorch memory management optimizations
PYTORCH_ENABLE_MPS_FALLBACK=1
```

### 2. Lazy Model Loading

Models are now loaded on-demand rather than at worker startup, reducing initial memory requirements.

### 3. Memory-Efficient Inference

- Gradients disabled during inference (no_grad context)
- Efficient audio loading (streaming where possible)
- Automatic garbage collection after processing

### 4. Docker Memory Configuration

#### Check Current Memory Limit

```bash
# Check container memory limit
docker inspect <container_id> | grep Memory
```

#### Increase Container Memory

**Option A: docker run command**
```bash
docker run -d --name sinopsis-worker \
  --memory=8g \
  --memory-swap=12g \
  -e DATABASE_URL="..." \
  -e RABBITMQ_URL="..." \
  sinopsis-worker:latest
```

**Option B: docker-compose.yml**
```yaml
services:
  diarizer:
    image: sinopsis-worker:latest
    mem_limit: 8g
    mem_reservation: 6g
    memswap_limit: 12g
    environment:
      - DATABASE_URL=...
      - RABBITMQ_URL=...
```

**Option C: Kubernetes**
```yaml
resources:
  requests:
    memory: "6Gi"
  limits:
    memory: "8Gi"
```

### 5. System Requirements

#### Minimum System Requirements
- **RAM**: 8GB (4GB container + 4GB host)
- **Swap**: 4GB recommended
- **CPU**: 2 cores minimum

#### Recommended System Requirements
- **RAM**: 16GB (8GB container + 8GB host)
- **Swap**: 8GB
- **CPU**: 4+ cores
- **GPU**: Optional (reduces RAM requirements if using CUDA)

### 6. Linux-Specific Optimizations

#### Check Available Memory

```bash
# Check free memory
free -h

# Check swap
swapon --show

# Monitor memory during startup
watch -n 1 free -h
```

#### Add Swap Space (if needed)

```bash
# Create 8GB swap file
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### Adjust Swappiness

```bash
# Check current swappiness
cat /proc/sys/vm/swappiness

# Set to 60 for better memory management
sudo sysctl vm.swappiness=60

# Make permanent
echo 'vm.swappiness=60' | sudo tee -a /etc/sysctl.conf
```

## Troubleshooting

### Still Getting OOM Errors?

1. **Monitor memory usage during startup:**
   ```bash
   docker stats <container_id>
   ```

2. **Check logs for memory-related warnings:**
   ```bash
   docker logs <container_id> | grep -i memory
   ```

3. **Try CPU-only build (uses less memory):**
   ```bash
   docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker:cpu .
   ```

4. **Use the low-memory Dockerfile:**
   ```bash
   docker build -f Dockerfile.low-memory -t sinopsis-worker:low-mem .
   ```

### Performance Tips

1. **Use GPU if available** - Offloads memory from RAM to VRAM
2. **Process smaller audio chunks** - Reduces peak memory usage
3. **Enable model caching** - Faster subsequent starts
4. **Monitor and tune** - Use `htop`, `docker stats` to identify bottlenecks

## Memory Usage Breakdown

Typical memory usage during operation:

| Component | Memory Usage | Notes |
|-----------|-------------|-------|
| Base Python + Libraries | ~500MB | Core runtime |
| PyAnnote Model Loading | ~2-3GB | Initial load |
| Model in Memory | ~1.5-2GB | Steady state |
| Audio Processing | ~500MB-1GB | Depends on file size |
| **Peak Total** | **4-6GB** | During initialization |
| **Steady State** | **2-3GB** | After warm-up |

## Best Practices

1. ✅ Always allocate at least 8GB to Docker containers
2. ✅ Enable swap space on Linux systems
3. ✅ Use GPU when available (reduces RAM pressure)
4. ✅ Monitor memory usage and set appropriate limits
5. ✅ Cache models in persistent volumes
6. ❌ Don't run multiple workers in low-memory environments
7. ❌ Don't disable swap without increasing RAM
