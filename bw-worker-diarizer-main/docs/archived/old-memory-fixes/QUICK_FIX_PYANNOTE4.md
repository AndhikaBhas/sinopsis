# ⚡ QUICK FIX - PyAnnote 4.0 std::bad_alloc on Linux

## 🎯 Problem
After upgrading from **PyAnnote 3.4 → 4.0**, getting:
```
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
Aborted
```

**Only on Linux!** (Windows works fine)

---

## ✅ Solution (5 Commands)

```bash
# 1. Fix Linux kernel settings (CRITICAL!)
sudo bash fix-linux-host.sh

# 2. Stop old container
docker stop sinopsis-worker-diarizer; docker rm sinopsis-worker-diarizer

# 3. Rebuild with PyAnnote 4.0 fixes
docker build -t sinopsis-worker-diarizer:latest .

# 4. Run with memory flags
bash run-docker.sh

# 5. Watch for success
docker logs -f sinopsis-worker-diarizer
```

**Time**: 10-20 minutes total

---

## 🔍 What to Look For

### ✅ SUCCESS - You Should See:
```
[SafePipeline] Auto-patching enabled
[SafePipeline] Loading PyAnnote 4.0 model with Linux-safe memory management...
[SafePipeline] Step 1: Cleaning up memory before loading...
[SafePipeline] Step 2: Limiting threading to prevent fragmentation...
[SafePipeline] Step 3: Loading model 'pyannote/speaker-diarization-community-1'...
[SafePipeline] Note: This loads 3 sub-models (segmentation, embedding, clustering)
[SafePipeline] ✓ Model loaded successfully!
[SafePipeline] Set inference threads: num_threads=4, interop=2
✓ PyAnnote pipeline initialized successfully
✓ Resampled using librosa (memory-efficient)
✓ Diarization completed. Found 2 speakers
```

### ❌ FAILURE - Should NOT See:
```
terminate called after throwing an instance of 'std::bad_alloc'
Aborted
```

---

## 🔧 What Gets Fixed

### **NEW Critical Fix**: `safe_pyannote_loader.py`
- Patches PyAnnote 4.0's model loading
- Prevents fragmentation from 3 sub-models
- Garbage collection between loads
- Thread limiting during load
- **This is the KEY fix for PyAnnote 4.0!**

### Host Fix: `fix-linux-host.sh`
- Sets `vm.overcommit_memory=1`
- Disables Transparent Huge Pages
- Permanent changes

### Docker Fix: `Dockerfile`
- Adds jemalloc allocator
- Optimizes memory settings
- PyAnnote 4.0-specific tuning

### Runtime Fix: `run-docker.sh`
- `--shm-size=4g`
- `--ulimit` flags
- Memory limits

---

## 🎓 Why PyAnnote 4.0 Different?

| Version 3.x | Version 4.0 |
|-------------|-------------|
| 1 model | **3 separate models** |
| Single allocation | **Multiple allocations** |
| Rarely fails | **Often fails on Linux** |
| Simple fix | **Multi-level fix needed** |

**PyAnnote 4.0 loads:**
1. Segmentation model (~500MB)
2. Embedding model (~80MB)
3. Clustering components

Each triggers memory fragmentation on Linux!

---

## 🆘 Still Failing?

### Check 1: Host Setting
```bash
cat /proc/sys/vm/overcommit_memory  # MUST be 1, not 2!
```

### Check 2: Safe Loader Active
```bash
docker logs sinopsis-worker-diarizer 2>&1 | grep "SafePipeline"
# Should show patching messages
```

### Check 3: jemalloc Loaded
```bash
docker exec sinopsis-worker-diarizer bash -c "echo \$LD_PRELOAD"
# Should show: /usr/lib/x86_64-linux-gnu/libjemalloc.so.2
```

### If All Checks Pass But Still Fails:

**Option A**: Increase Docker memory
```bash
# Edit run-docker.sh, change:
--memory=10g → --memory=16g
--memory-swap=14g → --memory-swap=24g
```

**Option B**: Downgrade to PyAnnote 3.x
```bash
# Edit requirements.txt:
pyannote.audio==3.4.0

# Edit Dockerfile:
pip install pyannote.audio==3.4.0

# Edit processors/diarizer.py:
"pyannote/speaker-diarization-3.1"

# Rebuild
docker build -t sinopsis-worker-diarizer:latest .
```

---

## 📝 Key Files

1. **`safe_pyannote_loader.py`** ⭐ - NEW! Critical for PyAnnote 4.0
2. **`fix-linux-host.sh`** - Run first on Linux host
3. **`PYANNOTE_4_FIX.md`** - Complete technical details
4. **`processors/diarizer.py`** - Now imports safe loader

---

## ⏱️ Quick Timeline

1. Host fix: **1 min**
2. Stop container: **10 sec**
3. Rebuild: **10-15 min**
4. Run: **30 sec**
5. Verify: **2 min**

**Total**: ~15-20 minutes

---

**Status**: ✅ FIX READY
**Critical**: `safe_pyannote_loader.py` is the key!
**Action**: Run the 5 commands above
