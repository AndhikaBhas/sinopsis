# Code Simplification Summary

## Date: October 21, 2025

## Reason for Simplification

After discovering that **torchcodec 0.8.0** was the root cause of the `std::bad_alloc` error (not memory management issues), we simplified the code by removing all workarounds that were attempting to fix the wrong problem.

---

## What Was Removed

### **Phase 1: Obsolete Files Deleted (9 files)**

1. ✅ `safe_pyannote_loader.py` (180 lines) - Monkey-patching PyAnnote loader
2. ✅ `run_with_memory_fix.py` - Python wrapper with jemalloc
3. ✅ `run_with_memory_fix.sh` - Shell wrapper with jemalloc
4. ✅ `run_worker_with_jemalloc.sh` - Another jemalloc wrapper
5. ✅ `verify_with_jemalloc.sh` - Jemalloc verification
6. ✅ `fix-linux-host.sh` - Linux kernel settings script
7. ✅ `fix-pyannote-import.sh` - Import fixes
8. ✅ `diagnose_memory.py` - Memory diagnostics
9. ✅ `test_memory.py` - Memory testing

**Total removed**: ~1000+ lines of code

### **Phase 2: Code Simplified**

#### **1. `processors/diarizer.py`**
**Before**: 695 lines (with all memory workarounds)
**After**: 458 lines (clean, simple)
**Reduction**: 237 lines (34% reduction)

**Removed:**
- `safe_pyannote_loader` import and usage
- Extensive print statements about memory management
- jemalloc loading attempts
- glibc malloc_trim calls
- `_setup_memory_optimizations()` method (120 lines)
- Complex high-RAM system detection
- Virtual memory limit checking
- Extensive error handling for std::bad_alloc
- Verbose logging during initialization

**Kept:**
- `suppress_warnings` import (still useful)
- Basic torch threading configuration
- Simple environment variables (PYTORCH_CUDA_ALLOC_CONF, thread limits)
- Device detection
- HuggingFace token setup
- Pipeline loading
- CUDA cache management

#### **2. `verify_fix.py`**
**Before**: 246 lines (testing safe_pyannote_loader patch)
**After**: 97 lines (simple torchcodec check)
**Reduction**: 149 lines (61% reduction)

**Removed:**
- safe_pyannote_loader patch testing
- Memory optimization settings checks
- Linux-specific checks (overcommit, THP)
- Complex verification logic

**Kept:**
- torchcodec installation check (the actual fix!)
- Basic PyTorch import test
- PyAnnote Pipeline import test

---

## Code Quality Improvements

### **Before (Complex):**
```python
# Import with extensive setup
print("⏳ Loading safe_pyannote_loader module...")
import safe_pyannote_loader
print("✓ safe_pyannote_loader loaded")

# Lots of memory setup
try:
    import ctypes
    import sys
    if sys.platform.startswith('linux'):
        try:
            ctypes.CDLL('libjemalloc.so.2', mode=ctypes.RTLD_GLOBAL)
            print("✓ jemalloc loaded for better memory allocation")
        except OSError:
            try:
                libc = ctypes.CDLL('libc.so.6')
                libc.malloc_trim(0)
                print("✓ Trimmed glibc malloc arena")
            except Exception:
                pass
except Exception:
    pass

# Apply patch
patch_success = safe_pyannote_loader.patch_pyannote()
if not patch_success:
    print("❌ WARNING: Failed to apply safe loader patch!")
```

### **After (Simple):**
```python
# Clean imports
import suppress_warnings
import torch
import os

# Basic config
torch.set_num_threads(4)
torch.set_num_interop_threads(2)

os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'max_split_size_mb:256,expandable_segments:True')
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('MKL_NUM_THREADS', '4')

from pyannote.audio import Pipeline
# Works! (because torchcodec is removed)
```

---

## Benefits of Simplification

### **1. Maintainability**
- ✅ **34% less code** in main processor
- ✅ **Removed 9 utility files**
- ✅ **Clearer code flow**
- ✅ **Fewer edge cases**

### **2. Readability**
- ✅ **No complex monkey-patching**
- ✅ **No extensive error handling for wrong problem**
- ✅ **Clear, straightforward initialization**
- ✅ **Less logging noise**

### **3. Performance**
- ✅ **Faster imports** (no safe_pyannote_loader)
- ✅ **Faster startup** (less setup code)
- ✅ **Less memory overhead** (no extra wrappers)

### **4. Debugging**
- ✅ **Easier to trace** (no monkey-patching)
- ✅ **Clearer stack traces**
- ✅ **Less noise in logs**

---

## What We Kept (Still Important)

### **1. Thread Configuration**
```python
torch.set_num_threads(4)
torch.set_num_interop_threads(2)
```
**Why**: Prevents "cannot set number of interop threads after parallel work" error

### **2. Basic Environment Variables**
```python
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'max_split_size_mb:256,expandable_segments:True')
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('MKL_NUM_THREADS', '4')
```
**Why**: Good practice for PyTorch/CUDA memory management

### **3. Warnings Suppression**
```python
import suppress_warnings
```
**Why**: Keeps logs clean (unrelated to std::bad_alloc issue)

### **4. CUDA Cache Management**
```python
torch.cuda.empty_cache()
```
**Why**: Good practice after model loading

---

## The Actual Fix (What Matters)

### **Root Cause:**
- `torchcodec==0.8.0` causes `std::bad_alloc` during import
- Has memory allocation bug with PyTorch 2.8.0+cu128

### **Solution:**
```bash
pip uninstall -y torchcodec
```

### **In Dockerfile:**
```dockerfile
RUN pip uninstall -y torchcodec || true
```

### **Verification:**
```python
# This should fail (torchcodec not installed)
try:
    import torchcodec
    print("ERROR: torchcodec still installed!")
except ImportError:
    print("GOOD: torchcodec removed")
```

---

## Testing Results

### **Before Simplification:**
- ✅ Works (with all workarounds)
- ⚠️ Complex, hard to maintain
- ⚠️ Slow startup

### **After Simplification:**
- ✅ Works (simple, clean code)
- ✅ Easy to maintain
- ✅ Fast startup
- ✅ **verify_fix.py passes**
- ✅ **No syntax errors**

---

## Files Changed

| File | Before | After | Change |
|------|--------|-------|--------|
| `processors/diarizer.py` | 695 lines | 458 lines | -237 (-34%) |
| `verify_fix.py` | 246 lines | 97 lines | -149 (-61%) |
| Utility scripts | 9 files | 0 files | -9 files |
| **Total Impact** | **~2000 lines** | **~555 lines** | **-1445 lines (-72%)** |

---

## Migration Notes

### **If You Have Existing Deployment:**

1. **Pull latest code** with simplifications
2. **Verify torchcodec is removed**:
   ```bash
   pip list | grep torchcodec
   # Should return nothing
   ```
3. **Run verification**:
   ```bash
   python verify_fix.py
   ```
4. **Test the worker**:
   ```bash
   python main.py
   ```

### **For Docker Builds:**

The Dockerfile already has the fix:
```dockerfile
RUN pip uninstall -y torchcodec || true
```

Just rebuild:
```bash
docker build --build-arg HF_TOKEN=xxx -t sinopsis-worker:gpu .
```

---

## Key Takeaway

**We spent significant effort building workarounds for memory management issues, when the real problem was a simple dependency (torchcodec) that could be removed without any loss of functionality.**

**Lesson**: Always verify the root cause before building complex solutions!

---

## Related Documentation

- `TORCHCODEC_FIX.md` - Explains the torchcodec issue
- `INFERENCE_MODE_FIX.md` - Explains the inference mode issue (separate from torchcodec)
- `docs/OFFLINE_IMPLEMENTATION.md` - Offline model caching (still relevant)

---

**Status**: ✅ **Simplification Complete**
**Date**: October 21, 2025
**Impact**: 72% code reduction, significantly improved maintainability
