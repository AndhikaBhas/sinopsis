# 🔧 URGENT: Fix Applied for std::bad_alloc Error

## ⚠️ What Was Wrong

Your worker was crashing with:
```
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
Aborted
```

**Root Cause**: The `torchaudio.transforms.Resample` function allocates large C++ buffers that fail to allocate even when you have plenty of RAM. This is due to memory fragmentation in the default glibc allocator.

## ✅ What I Fixed

### 1. **Code Fix**: Use Librosa Instead of TorchAudio Resampler
**File**: `processors/diarizer.py`
- Changed audio resampling from TorchAudio → Librosa
- Librosa is more memory-efficient and doesn't trigger C++ allocation errors
- Falls back gracefully if needed

### 2. **Docker Fix**: Added jemalloc Memory Allocator
**File**: `Dockerfile`
- Installed `libjemalloc2` package
- Set `LD_PRELOAD` to force using jemalloc
- jemalloc prevents memory fragmentation (main cause of std::bad_alloc)

### 3. **Docker Run Fix**: Added Critical Memory Flags
**Files**: `run-docker.sh`, `run-docker.ps1` (new)
- `--shm-size=4g`: Critical for PyTorch operations
- `--ulimit memlock=-1:-1`: Removes memory limits
- `--ulimit stack=-1:-1`: Prevents stack overflow
- `--memory=10g`: Reasonable memory limit

## 🚀 How to Apply the Fix (Windows)

### Step 1: Rebuild the Docker Image
Open PowerShell in your project directory and run:

```powershell
cd "d:\Projects\Sinopsis-Worker-Diarizer"
.\rebuild-docker.ps1
```

This will:
- Stop the old container
- Build a new image with jemalloc and all fixes
- Take ~5-15 minutes

### Step 2: Run with New Settings
```powershell
.\run-docker.ps1
```

This automatically applies all the memory-optimized flags.

### Step 3: Monitor for Success
Watch the logs for these SUCCESS indicators:
```powershell
docker logs -f sinopsis-worker-diarizer
```

**Look for**:
- ✅ `"Successfully loaded audio with..."`
- ✅ `"Resampled using librosa (memory-efficient)"` ← NEW!
- ✅ `"Diarization completed. Found X speakers"`
- ❌ NO MORE `"std::bad_alloc"` errors

## 🎯 Quick Commands (Copy-Paste)

```powershell
# Navigate to project
cd "d:\Projects\Sinopsis-Worker-Diarizer"

# Rebuild image with fixes
.\rebuild-docker.ps1

# Run with memory-optimized settings
.\run-docker.ps1

# Watch logs in real-time
docker logs -f sinopsis-worker-diarizer

# Verify jemalloc is loaded
docker exec sinopsis-worker-diarizer bash -c "echo `$LD_PRELOAD"
# Should output: /usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Check memory settings
docker exec sinopsis-worker-diarizer bash -c "env | grep -E 'MALLOC|PYTORCH'"
```

## 📊 What Changed

| Component | Before | After |
|-----------|--------|-------|
| **Audio Resampling** | TorchAudio (C++ alloc) | Librosa (Python heap) |
| **Memory Allocator** | glibc malloc | jemalloc |
| **Shared Memory** | 64MB default | 4GB |
| **Memory Limits** | Restricted | Unlimited (-1) |
| **Docker Memory** | No limit | 10GB with 14GB swap |

## 🔍 Troubleshooting

### If Build Fails
```powershell
# Check Docker is running
docker version

# Check disk space
docker system df

# Clean up old images
docker system prune -a
```

### If Still Getting std::bad_alloc

**Option A**: Increase memory limits
```powershell
# Edit run-docker.ps1, change:
--memory=10g   →   --memory=16g
--memory-swap=14g   →   --memory-swap=20g
```

**Option B**: Use host IPC (alternative to --shm-size)
```powershell
# Edit run-docker.ps1, replace --shm-size=4g with:
--ipc=host
```

**Option C**: Force CPU-only (disable GPU)
```powershell
# Edit run-docker.ps1, change:
--gpus all   →   --gpus '"device=none"'
```

### If Audio Processing Fails
Check the logs for:
```
"Successfully loaded audio with soundfile"  ← Good
"Successfully loaded audio with pydub"      ← Good
"Resampled using librosa"                   ← Good!
```

## 📝 Technical Details

### Why This Works

1. **jemalloc**: 
   - Better memory pooling
   - Less fragmentation
   - Used by Facebook, Firefox, Redis
   - Handles large C++ allocations better

2. **Librosa Resampling**:
   - Uses NumPy arrays (Python heap)
   - No large C++ buffer allocations
   - More predictable memory usage

3. **Docker Flags**:
   - `--shm-size`: PyTorch needs shared memory for IPC
   - `--ulimit`: Removes artificial limits
   - `--memory`: Prevents runaway usage

### System Requirements
- **RAM**: 8GB minimum (16GB recommended)
- **Swap**: 4GB minimum
- **Disk**: 15GB for Docker image

## 📚 Additional Resources

- Full guide: `CRITICAL_FIX_BAD_ALLOC.md`
- Original diagnostics: `diagnose_memory.py`
- Memory cheat sheet: `CHEAT_SHEET_128GB.txt`

## ✨ Expected Results

After these fixes:
- ✅ No more std::bad_alloc errors
- ✅ Faster audio processing
- ✅ More stable memory usage
- ✅ Successful diarization jobs

## 🆘 Still Need Help?

If the error persists, please provide:

```powershell
# Full logs
docker logs sinopsis-worker-diarizer > error.log

# Memory stats
docker stats sinopsis-worker-diarizer --no-stream

# Image info
docker images sinopsis-worker-diarizer

# jemalloc verification
docker exec sinopsis-worker-diarizer dpkg -l | grep jemalloc
```

---
**Status**: ✅ CRITICAL FIXES APPLIED
**Date**: 2025-10-20
**Action Required**: Rebuild image and run with new settings
