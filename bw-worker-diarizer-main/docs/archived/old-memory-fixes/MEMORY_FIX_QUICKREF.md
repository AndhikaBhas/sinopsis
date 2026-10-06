# Memory Error Quick Reference

## The Error
```
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
```

## For HIGH-RAM Systems (64GB+) 🚨

**This is NOT about insufficient RAM - it's a Linux policy issue!**

```bash
# Quick Fix (run BEFORE starting worker)
ulimit -v unlimited
echo 1 | sudo tee /proc/sys/vm/overcommit_memory
python main.py

# OR use the wrapper script (EASIEST)
chmod +x run_with_memory_fix.sh
./run_with_memory_fix.sh

# OR diagnose first
python diagnose_memory.py
```

**See**: [docs/FIX_HIGH_RAM_SYSTEMS.md](docs/FIX_HIGH_RAM_SYSTEMS.md) for complete guide.

---

## For Regular Systems (8-16GB)

### 1️⃣ Increase Docker Memory (FASTEST FIX)
```bash
docker run -d --memory=8g --memory-swap=12g sinopsis-worker:latest
```

### 2️⃣ Add Linux Swap Space
```bash
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 3️⃣ Use CPU-Only Build
```bash
docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker:cpu .
docker run -d --memory=6g sinopsis-worker:cpu
```

## Memory Requirements

| Configuration | Min RAM | Recommended RAM | Swap |
|--------------|---------|-----------------|------|
| CPU-only | 6GB | 8GB | 4GB |
| GPU | 4GB | 8GB | 4GB |
| Production | 8GB | 16GB | 8GB |

## Test Your Setup
```bash
# Quick test
python test_memory.py

# Full test with model loading
export HUGGINGFACE_AUTH_TOKEN="your_token"
python test_memory.py
```

## Files Updated

✅ **processors/diarizer.py** - Memory-optimized model loading
✅ **download_models.py** - Optimized model download
✅ **Dockerfile** - Memory environment variables
✅ **Dockerfile.low-memory** - Memory environment variables
✅ **start_worker.py** - NEW - Startup script with memory checks
✅ **test_memory.py** - NEW - Memory verification script

## Environment Variables (Auto-configured)

```bash
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
OMP_NUM_THREADS=4
MKL_NUM_THREADS=4
PYTORCH_JIT=0
MALLOC_TRIM_THRESHOLD_=100000
```

## Verify Fix

✓ Container starts without crashing
✓ Logs show: "PyAnnote pipeline initialized successfully"
✓ Memory usage: ~2-3GB steady state
✓ No `std::bad_alloc` errors

## Still Having Issues?

1. Check memory: `free -h`
2. Check Docker: `docker info | grep Memory`
3. Monitor usage: `docker stats <container>`
4. Read full guide: `docs/FIX_BAD_ALLOC.md`
5. Memory optimization guide: `docs/MEMORY_OPTIMIZATION.md`
