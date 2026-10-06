# Debug Console Output Guide

## Purpose
Added detailed console logging to debug PyAnnote 4.0 std::bad_alloc errors on Linux.

## What You'll See

### ✅ Successful Initialization

```
================================================================================
🚀 DIARIZER INITIALIZATION STARTED
================================================================================
📋 Step 1: Setting up memory optimizations...
✓ Memory optimizations configured

📋 Step 2: Configuring PyTorch threading...
✓ PyTorch threads configured: num_threads=4, interop_threads=2

📋 Step 3: Configuring HuggingFace settings...
✓ HuggingFace cache: /opt/huggingface_cache
✓ Offline mode enabled

📋 Step 4: Detecting device...
✓ Device: cuda:0 - NVIDIA GeForce RTX 3080 (10.0GB)

================================================================================
🔄 STARTING PYANNOTE MODEL LOADING (This is where std::bad_alloc may occur)
================================================================================
📦 Model: pyannote/speaker-diarization-community-1 (PyAnnote 4.0)
⚠️  Note: PyAnnote 4.0 loads 3 sub-models sequentially:
   1. Segmentation model (~500MB)
   2. Embedding model (~80MB)
   3. Clustering components

🔧 Safe loader is active - will handle memory between sub-models
⏳ Loading may take 2-5 minutes... Please wait...

[SafePipeline] Loading PyAnnote 4.0 model with Linux-safe memory management...
[SafePipeline] Step 1: Cleaning up memory before loading...
[SafePipeline] Step 2: Limiting threading to prevent fragmentation...
[SafePipeline] Step 3: Loading model 'pyannote/speaker-diarization-community-1'...
[SafePipeline] Note: This loads 3 sub-models (segmentation, embedding, clustering)
[SafePipeline] ✓ Model loaded successfully!
[SafePipeline] Step 4: Cleaning up post-load memory...
[SafePipeline] Set inference threads: num_threads=4, interop=2

================================================================================
✅ PYANNOTE MODEL LOADED SUCCESSFULLY!
================================================================================

📋 Step 5: Moving model to GPU device: cuda:0
✓ Model moved to cuda:0

📋 Step 6: Clearing CUDA cache...
✓ CUDA cache cleared

================================================================================
🎉 INITIALIZATION COMPLETE!
================================================================================
✓ Model: pyannote/speaker-diarization-community-1
✓ Device: cuda:0
✓ Ready to process audio files
================================================================================
```

---

### ❌ Failed Initialization (std::bad_alloc)

```
================================================================================
🚀 DIARIZER INITIALIZATION STARTED
================================================================================
📋 Step 1: Setting up memory optimizations...
✓ Memory optimizations configured

📋 Step 2: Configuring PyTorch threading...
✓ PyTorch threads configured: num_threads=4, interop_threads=2

📋 Step 3: Configuring HuggingFace settings...
✓ HuggingFace cache: /opt/huggingface_cache
✓ Offline mode enabled

📋 Step 4: Detecting device...
✓ Device: cpu - 8 CPU cores available

================================================================================
🔄 STARTING PYANNOTE MODEL LOADING (This is where std::bad_alloc may occur)
================================================================================
📦 Model: pyannote/speaker-diarization-community-1 (PyAnnote 4.0)
⚠️  Note: PyAnnote 4.0 loads 3 sub-models sequentially:
   1. Segmentation model (~500MB)
   2. Embedding model (~80MB)
   3. Clustering components

🔧 Safe loader is active - will handle memory between sub-models
⏳ Loading may take 2-5 minutes... Please wait...

[SafePipeline] Loading PyAnnote 4.0 model with Linux-safe memory management...
[SafePipeline] Step 1: Cleaning up memory before loading...
[SafePipeline] Step 2: Limiting threading to prevent fragmentation...
[SafePipeline] Step 3: Loading model 'pyannote/speaker-diarization-community-1'...
[SafePipeline] Note: This loads 3 sub-models (segmentation, embedding, clustering)

terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc

================================================================================
❌ ERROR DURING INITIALIZATION!
================================================================================
Error type: RuntimeError
Error message: std::bad_alloc

🔴 DETECTED: std::bad_alloc error!

This error occurred during PyAnnote 4.0 model loading.
The model tries to load 3 sub-models and one of them failed to allocate memory.

Possible causes:
  1. Linux vm.overcommit_memory is set to 2 (strict mode)
  2. Memory fragmentation in glibc malloc
  3. Insufficient Docker memory limits
  4. TorchAudio/PyTorch memory allocation issue

To fix:
  1. Run: sudo bash fix-linux-host.sh
  2. Rebuild Docker: docker build -t sinopsis-worker-diarizer:latest .
  3. Use run-docker.sh with memory flags

See: PYANNOTE_4_FIX.md for complete guide
================================================================================
```

---

## Key Points to Watch

### 1. **Before Model Loading**
Look for these steps completing successfully:
- ✓ Memory optimizations configured
- ✓ PyTorch threads configured
- ✓ HuggingFace cache configured
- ✓ Device detected

If these fail, the problem is in basic setup.

### 2. **During Model Loading** ⚠️ CRITICAL SECTION
This is where std::bad_alloc typically occurs:
```
🔄 STARTING PYANNOTE MODEL LOADING
```

Watch for:
- `[SafePipeline]` messages showing progress
- If it crashes here, it's the memory allocation issue

### 3. **After Model Loading**
If you see this, the hard part is done:
```
✅ PYANNOTE MODEL LOADED SUCCESSFULLY!
```

### 4. **Final Steps**
- Model moved to GPU (if available)
- CUDA cache cleared
- Initialization complete

---

## Diagnostic Information

### Where the Error Occurs

The console output will show **exactly** where the failure happens:

1. **Before "STARTING PYANNOTE MODEL LOADING"**: Setup issue
2. **During "[SafePipeline] Step 3"**: Model loading issue (std::bad_alloc)
3. **After "MODEL LOADED SUCCESSFULLY"**: Post-load issue (rare)

### Quick Debug Steps

```bash
# Watch logs in real-time
docker logs -f sinopsis-worker-diarizer

# If error occurs, check:
1. At what step did it fail?
2. Did SafePipeline activate?
3. What was the error type?
```

### Common Patterns

**Pattern 1: Fails at SafePipeline Step 3**
```
[SafePipeline] Step 3: Loading model...
terminate called after throwing an instance of 'std::bad_alloc'
```
→ Memory allocation failed during sub-model loading
→ Apply PYANNOTE_4_FIX.md solutions

**Pattern 2: SafePipeline doesn't appear**
```
🔄 STARTING PYANNOTE MODEL LOADING
terminate called after throwing an instance of 'std::bad_alloc'
```
→ safe_pyannote_loader.py not imported correctly
→ Check imports in processors/diarizer.py

**Pattern 3: Succeeds but crashes on audio processing**
```
✅ INITIALIZATION COMPLETE!
... later ...
Error during diarization: std::bad_alloc
```
→ Different issue (resampling or inference)
→ Check librosa resampling is working

---

## Files Modified

**File**: `processors/diarizer.py`

**Changes**:
1. Added console output at initialization start
2. Added step-by-step progress messages
3. Added detailed model loading section
4. Added success confirmation
5. Added error detection and guidance

**Purpose**: 
- See exactly where std::bad_alloc occurs
- Verify safe_pyannote_loader is active
- Get immediate feedback on fixes

---

## Usage

### During Testing:
1. Start container: `bash run-docker.sh`
2. Watch logs: `docker logs -f sinopsis-worker-diarizer`
3. Look for the initialization messages
4. Note where it fails (if it does)

### After Fix:
You should see all steps complete with ✓ marks:
- ✓ Memory optimizations
- ✓ PyTorch threads
- ✓ HuggingFace settings
- ✓ Device detection
- ✓ Model loaded successfully
- ✓ Initialization complete

---

**Status**: ✅ DEBUG LOGGING ADDED
**Purpose**: Identify exact failure point for std::bad_alloc
**Next**: Run container and observe console output
