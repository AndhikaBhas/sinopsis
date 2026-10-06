# 🐧 LINUX-SPECIFIC FIX for std::bad_alloc

## ⚠️ Important: This Error Only Happens on Linux!

You've confirmed the `std::bad_alloc` error **only appears on Linux**, not Windows. This is because:

1. **Linux Memory Overcommit**: Linux's `vm.overcommit_memory` setting can restrict allocations
2. **Transparent Huge Pages**: Can cause memory fragmentation on Linux
3. **ulimit restrictions**: Linux enforces virtual memory limits
4. **glibc malloc behavior**: Different on Linux vs Windows

## 🔴 Why Linux is Different

### Windows Docker
- Uses WSL2 with more permissive memory management
- No `vm.overcommit_memory` restrictions
- Different memory allocator behavior

### Linux Docker
- Direct kernel memory management
- Strict `vm.overcommit_memory` settings (especially mode 2)
- Transparent Huge Pages can fragment memory
- ulimits enforced at kernel level

## ✅ Complete Linux Fix (3 Levels)

### Level 1: Linux Host Configuration (CRITICAL!)

**Run this FIRST on your Linux host:**

```bash
# Download and run the host fix script
sudo bash fix-linux-host.sh
```

This fixes:
- ✅ Sets `vm.overcommit_memory=1` (allows overcommit)
- ✅ Disables Transparent Huge Pages (reduces fragmentation)
- ✅ Makes changes persistent across reboots

**Manual alternative:**
```bash
# Fix memory overcommit (CRITICAL - mode 2 causes std::bad_alloc!)
echo 1 | sudo tee /proc/sys/vm/overcommit_memory

# Disable transparent huge pages
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag

# Make permanent
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Level 2: Docker Image (Already Fixed)

The Dockerfile now includes:
- ✅ `libjemalloc2` - Better memory allocator
- ✅ `LD_PRELOAD` for jemalloc
- ✅ Optimized `MALLOC_*` environment variables
- ✅ `PYTORCH_CUDA_ALLOC_CONF` optimizations

### Level 3: Docker Runtime (Already Fixed)

The `run-docker.sh` script now includes:
- ✅ `--shm-size=4g` - Critical for PyTorch
- ✅ `--ulimit memlock=-1:-1` - Remove memory limits
- ✅ `--ulimit stack=-1:-1` - Remove stack limits
- ✅ `--memory=10g` - Reasonable cap
- ✅ `--memory-swap=14g` - Allow swap

### Level 4: Code (Already Fixed)

The `processors/diarizer.py` now uses:
- ✅ Librosa for resampling (not TorchAudio)
- ✅ No C++ buffer allocations
- ✅ Memory-efficient processing

## 🚀 Complete Fix Procedure for Linux

### Step 1: Fix Linux Host (One-Time Setup)
```bash
# On your Linux server
cd /path/to/Sinopsis-Worker-Diarizer
sudo bash fix-linux-host.sh
```

### Step 2: Rebuild Docker Image
```bash
# Build with all fixes
docker build -t sinopsis-worker-diarizer:latest .
```

### Step 3: Stop Old Container
```bash
# Stop and remove old container
docker stop sinopsis-worker-diarizer 2>/dev/null || true
docker rm sinopsis-worker-diarizer 2>/dev/null || true
```

### Step 4: Run with Fixed Settings
```bash
# Run with memory-optimized flags
bash run-docker.sh

# Or manually:
docker run -d \
  --name sinopsis-worker-diarizer \
  --restart always \
  --gpus all \
  --shm-size=4g \
  --ulimit memlock=-1:-1 \
  --ulimit stack=-1:-1 \
  --memory=10g \
  --memory-swap=14g \
  --env-file .env \
  sinopsis-worker-diarizer:latest
```

### Step 5: Verify Success
```bash
# Watch logs for success indicators
docker logs -f sinopsis-worker-diarizer

# Verify jemalloc is loaded
docker exec sinopsis-worker-diarizer bash -c "echo \$LD_PRELOAD"
# Should show: /usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Check memory settings
docker exec sinopsis-worker-diarizer bash -c "env | grep -E 'MALLOC|PYTORCH'"
```

## 🎯 Success Indicators

In the logs, you should see:
```
✓ jemalloc detected and loaded
✓ Successfully loaded audio with pydub (in-memory)
✓ Resampled using librosa (memory-efficient)  ← NEW!
✓ Running diarization inference...
✓ Diarization completed. Found 2 speakers
```

**NO MORE**:
```
✗ terminate called after throwing an instance of 'std::bad_alloc'
✗ Aborted
```

## 🔍 Linux-Specific Diagnostics

### Check Current Linux Settings
```bash
# Check memory overcommit (should be 0 or 1, NOT 2!)
cat /proc/sys/vm/overcommit_memory

# Check THP status (should show [never])
cat /sys/kernel/mm/transparent_hugepage/enabled

# Check available memory
free -h

# Check ulimits
ulimit -a

# Check Docker memory
docker info | grep -i memory
```

### Verify Host Fix Applied
```bash
# Should return "1"
cat /proc/sys/vm/overcommit_memory

# Should show "[never]"
cat /sys/kernel/mm/transparent_hugepage/enabled

# Should show "vm.overcommit_memory = 1"
grep overcommit /etc/sysctl.conf
```

## ⚠️ Critical Linux Settings Explained

### vm.overcommit_memory Values
- **0** (Heuristic): OK - Allows reasonable overcommit
- **1** (Always): BEST - Always allows overcommit
- **2** (Never): BAD - Strict mode, CAUSES std::bad_alloc!

If set to **2**, Linux refuses allocations even with plenty of RAM!

### Why This Causes std::bad_alloc

1. Application requests memory (e.g., PyTorch model loading)
2. Linux checks if physical RAM is available
3. With mode 2, Linux refuses if total requested > available
4. C++ `operator new` throws `std::bad_alloc`
5. Python shows plenty of RAM, but C++ allocation fails

### Transparent Huge Pages (THP)
- **Enabled**: Can cause memory fragmentation over time
- **Disabled**: Better for applications with large allocations
- Redis, MongoDB, and ML frameworks recommend disabling THP

## 🆘 If Still Failing on Linux

### Additional Fix 1: Increase Docker Limits
```bash
# If you have 32GB+ RAM
docker run -d \
  --memory=16g \
  --memory-swap=24g \
  --shm-size=8g \
  ... other flags ...
```

### Additional Fix 2: Use Host IPC
```bash
# Alternative to --shm-size
docker run -d \
  --ipc=host \
  ... other flags ...
```

### Additional Fix 3: Disable GPU
```bash
# Force CPU-only processing
docker run -d \
  --gpus '"device=none"' \
  -e CUDA_VISIBLE_DEVICES=-1 \
  ... other flags ...
```

### Additional Fix 4: Check Docker Storage Driver
```bash
# Some storage drivers have memory issues
docker info | grep "Storage Driver"

# If using devicemapper, consider switching to overlay2
# Edit /etc/docker/daemon.json:
{
  "storage-driver": "overlay2"
}

# Restart Docker
sudo systemctl restart docker
```

## 📊 Linux vs Windows Comparison

| Aspect | Linux (Your Issue) | Windows Docker |
|--------|-------------------|----------------|
| Memory Overcommit | Can be strict (mode 2) | Always permissive |
| THP | Can cause fragmentation | Not applicable |
| ulimits | Enforced strictly | More relaxed |
| std::bad_alloc | **Common issue** | Rare |
| Fix Required | **Host + Docker + Code** | Usually just Docker |

## 🎯 Why Our Fix Works on Linux

1. **Host Fix**: Removes Linux kernel restrictions
2. **jemalloc**: Better allocator for Linux glibc
3. **Docker Flags**: Override Linux ulimits
4. **Code Fix**: Avoids problematic C++ allocations
5. **Librosa**: Uses Python heap, not C++ allocator

All fixes work together to eliminate Linux-specific allocation failures!

## 📝 Files for Linux

- `fix-linux-host.sh` - Run this first on Linux host ⭐
- `run-docker.sh` - Use this to start container
- `Dockerfile` - Already includes jemalloc
- `processors/diarizer.py` - Already uses librosa

## ✅ Expected Outcome

After applying ALL fixes:
- ✅ No std::bad_alloc errors on Linux
- ✅ Stable memory allocation
- ✅ Successful audio processing
- ✅ Completed diarization jobs

---
**Status**: ✅ LINUX-SPECIFIC FIX APPLIED
**Priority**: 🔴 HIGH - Run `fix-linux-host.sh` FIRST!
**Date**: 2025-10-20
