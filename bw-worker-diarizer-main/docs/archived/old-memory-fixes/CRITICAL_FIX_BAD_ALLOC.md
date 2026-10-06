# CRITICAL FIX: std::bad_alloc Error - Complete Solution

## Problem
You're experiencing:
```
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
Aborted
```

This error occurs during audio processing, specifically when TorchAudio's Resampler tries to allocate C++ memory buffers.

## Root Causes Identified

1. **TorchAudio Resampler Memory Allocation**: The `torchaudio.transforms.Resample` class allocates large C++ buffers that can fail even when plenty of RAM is available due to:
   - Memory fragmentation
   - Virtual memory limits
   - Default glibc malloc allocator inefficiency

2. **Docker Default Limits**: Docker's default shared memory is only 64MB, which is insufficient for PyTorch operations

3. **Stack Size Limits**: Default stack sizes can be too restrictive

## Solution Applied

### 1. Code Fix - Use Librosa for Resampling ✅
**File Modified**: `processors/diarizer.py`

Changed from TorchAudio's memory-hungry Resampler to Librosa's more efficient implementation:
- Librosa uses less memory
- Better handling of memory allocation
- Avoids C++ std::bad_alloc issue

### 2. Docker Configuration Fix ✅
**File Modified**: `Dockerfile`

Added critical components:
- **jemalloc**: A better memory allocator (replaces default glibc malloc)
- **Memory environment variables**: Optimized for fragmentation prevention
- **LD_PRELOAD**: Forces use of jemalloc for all memory allocations

### 3. Docker Run Fix ✅
**File Modified**: `run-docker.sh`

Added critical flags:
- `--shm-size=4g`: Increases shared memory (PyTorch needs this!)
- `--ulimit memlock=-1:-1`: Removes memory lock limits
- `--ulimit stack=-1:-1`: Removes stack size limits  
- `--memory=10g`: Sets reasonable memory limit
- `--memory-swap=14g`: Allows swap usage

## How to Apply the Fix

### Step 1: Rebuild the Docker Image
```bash
# On Windows PowerShell
cd "d:\Projects\Sinopsis-Worker-Diarizer"

# Stop and remove old container
docker stop sinopsis-worker-diarizer
docker rm sinopsis-worker-diarizer

# Rebuild with the fixes
docker build -t sinopsis-worker-diarizer:latest .
```

### Step 2: Run with New Configuration
```bash
# The run-docker.sh script now includes all necessary flags
bash run-docker.sh

# Or manually on Windows PowerShell:
docker run -d `
  --name sinopsis-worker-diarizer `
  --restart always `
  --gpus all `
  --shm-size=4g `
  --ulimit memlock=-1:-1 `
  --ulimit stack=-1:-1 `
  --memory=10g `
  --memory-swap=14g `
  --env-file .env `
  sinopsis-worker-diarizer:latest
```

### Step 3: Monitor the Container
```bash
# Watch the logs in real-time
docker logs -f sinopsis-worker-diarizer

# Check if jemalloc is loaded
docker exec sinopsis-worker-diarizer bash -c "ldd /usr/bin/python3 | grep jemalloc"
```

## What Each Fix Does

### Code Level (processors/diarizer.py)
- **Before**: Used `torchaudio.transforms.Resample` → triggers std::bad_alloc
- **After**: Uses `librosa.resample` → memory-efficient, no C++ allocation issues

### Docker Level (Dockerfile)
- **jemalloc**: Prevents memory fragmentation (main cause of std::bad_alloc)
- **LD_PRELOAD**: Forces ALL allocations to use jemalloc
- **MALLOC_ARENA_MAX=2**: Reduces memory fragmentation
- **PYTORCH_CUDA_ALLOC_CONF**: Optimizes PyTorch's GPU memory management

### Runtime Level (run-docker.sh)
- **--shm-size=4g**: Critical for PyTorch IPC and shared tensors
- **--ulimit memlock=-1:-1**: Removes memory locking restrictions
- **--ulimit stack=-1:-1**: Prevents stack overflow during recursion
- **--memory**: Prevents runaway memory usage

## Verification Steps

### 1. Check if jemalloc is Active
```bash
docker exec sinopsis-worker-diarizer bash -c "echo \$LD_PRELOAD"
# Should output: /usr/lib/x86_64-linux-gnu/libjemalloc.so.2
```

### 2. Verify Memory Settings
```bash
docker exec sinopsis-worker-diarizer bash -c "env | grep -E 'MALLOC|PYTORCH'"
# Should show:
# PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True
# MALLOC_ARENA_MAX=2
# MALLOC_TRIM_THRESHOLD_=65536
# MALLOC_MMAP_THRESHOLD_=65536
```

### 3. Test Audio Processing
Watch the logs for successful processing:
```bash
docker logs -f sinopsis-worker-diarizer
```

Look for:
- ✅ "Resampled using librosa (memory-efficient)"
- ✅ "Diarization completed. Found X speakers"
- ❌ NO "std::bad_alloc" errors

## If Still Failing

### Additional Fix 1: Increase Memory Limits
If you have 16GB+ RAM, increase Docker memory:
```bash
docker run -d \
  --memory=16g \
  --memory-swap=20g \
  --shm-size=8g \
  ... other flags ...
```

### Additional Fix 2: Use --ipc=host
Replace `--shm-size` with host IPC namespace:
```bash
docker run -d \
  --ipc=host \
  ... other flags ...
```

### Additional Fix 3: Check Host System
On your Linux host:
```bash
# Check and set memory overcommit to permissive
echo 1 | sudo tee /proc/sys/vm/overcommit_memory

# Check available memory
free -h

# Remove ulimits
ulimit -v unlimited
ulimit -s unlimited
```

### Additional Fix 4: Force CPU-Only Mode
If GPU is causing issues, disable it:
```bash
docker run -d \
  --gpus '"device=none"' \
  ... other flags ...
```

## System Requirements

After these fixes:
- **Minimum RAM**: 8GB (10GB allocated to container)
- **Recommended RAM**: 16GB+
- **Swap**: 4GB minimum
- **Disk Space**: 15GB for Docker image

## Technical Details

### Why TorchAudio Resampler Fails
1. Allocates large FFT buffers in C++ (not Python heap)
2. Uses `std::vector` which calls `operator new`
3. If C++ heap is fragmented → std::bad_alloc
4. Python may show plenty of RAM, but C++ allocator fails

### Why jemalloc Fixes This
1. Better memory pooling → less fragmentation
2. Thread-local caching → faster allocations
3. Adaptive memory management → handles large buffers better
4. Used by Facebook, Firefox, Redis for stability

### Why Librosa Works
1. Uses NumPy arrays (Python heap, different allocator)
2. Smaller memory footprint
3. No large C++ buffer allocations
4. More predictable memory usage

## Success Indicators

After applying fixes, you should see:
```
✓ jemalloc detected and loaded
✓ Resampled using librosa (memory-efficient)
✓ Diarization completed. Found 2 speakers
✓ Job completed successfully
```

## Need More Help?

If the error persists:
1. Share the full error log: `docker logs sinopsis-worker-diarizer > error.log`
2. Check memory: `docker stats sinopsis-worker-diarizer`
3. Verify build: `docker images sinopsis-worker-diarizer`
4. Check jemalloc: `docker exec sinopsis-worker-diarizer dpkg -l | grep jemalloc`

## Files Modified

1. ✅ `processors/diarizer.py` - Use librosa for resampling
2. ✅ `Dockerfile` - Add jemalloc, optimize memory settings
3. ✅ `run-docker.sh` - Add critical Docker flags

## Quick Test

```bash
# Rebuild
docker build -t sinopsis-worker-diarizer:latest .

# Run with new settings
bash run-docker.sh

# Watch logs
docker logs -f sinopsis-worker-diarizer

# Send test job and watch for success
```

---
**Last Updated**: 2025-10-20
**Status**: CRITICAL FIX APPLIED ✅
