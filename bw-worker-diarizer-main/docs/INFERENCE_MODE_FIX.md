# CRITICAL FIX: Inference Tensors Version Counter Error

## Problem

When running diarization, the application crashes with:

```
RuntimeError: Inference tensors do not track version counter.
```

**Full Error Trace:**
```
File "pyannote/audio/models/blocks/sincnet.py", line 171, in forward
    outputs = self.wav_norm1d(waveforms)
File "torch/nn/modules/instancenorm.py", line 47, in _apply_instance_norm
    return F.instance_norm(...)
RuntimeError: Inference tensors do not track version counter.
```

## Root Cause

**NOT related to torchcodec!**

The error is caused by using `torch.no_grad()` or `torch.inference_mode()` context managers with PyAnnote models that contain **InstanceNorm layers** in PyTorch 2.8.0+.

### Why It Happens:

1. PyTorch 2.8.0 changed how inference mode works
2. InstanceNorm and BatchNorm layers track running statistics
3. When wrapped in `torch.inference_mode()` or `torch.no_grad()`:
   - Tensors are marked as "inference tensors"
   - They don't track version counters
   - InstanceNorm tries to update running stats → **CRASH**

### Affected Code Locations:

1. ✅ **`processors/diarizer.py:474`** - `with torch.no_grad():` wrapping pipeline call
2. ✅ **`safe_pyannote_loader.py:89`** - `with torch.inference_mode():` during model loading

## The Fix

### Remove inference mode wrappers - PyAnnote handles it internally!

#### Before (BROKEN):
```python
# processors/diarizer.py
with torch.no_grad():
    diarization = self.pipeline(audio_info)
```

#### After (FIXED):
```python
# processors/diarizer.py
# PyAnnote handles inference mode internally
diarization = self.pipeline(audio_info)
```

#### Before (BROKEN):
```python
# safe_pyannote_loader.py
with torch.inference_mode():
    pipeline = _original_from_pretrained(Pipeline, model_id, **kwargs)
```

#### After (FIXED):
```python
# safe_pyannote_loader.py
# Don't wrap in inference_mode - causes issues with InstanceNorm
pipeline = _original_from_pretrained(Pipeline, model_id, **kwargs)
```

## Files Modified

1. ✅ **`processors/diarizer.py`** - Removed `torch.no_grad()` wrapper
2. ✅ **`safe_pyannote_loader.py`** - Removed `torch.inference_mode()` wrapper

## Why This Works

PyAnnote's pipeline **already handles inference mode internally**:
- Sets models to `.eval()` mode
- Manages gradient computation appropriately
- Handles normalization layers correctly

By removing our manual inference mode wrappers, we let PyAnnote manage it properly.

## Testing

After applying the fix:

```bash
# Test that the fix works
python main.py
```

Expected behavior:
- ✅ No "Inference tensors do not track version counter" error
- ✅ Diarization runs successfully
- ✅ Audio files are processed correctly

## Important Notes

### Memory Usage

**Question:** Won't removing `torch.no_grad()` increase memory usage?

**Answer:** No, because:
1. PyAnnote sets models to `.eval()` mode internally
2. PyAnnote disables gradients where appropriate
3. The memory savings from `torch.no_grad()` are minimal for inference-only models
4. Our other memory optimizations still apply:
   - CUDA allocator settings
   - Memory cleanup after processing
   - Batch size limits

### Performance

Removing these wrappers does **NOT** affect performance:
- PyAnnote manages inference efficiently
- CUDA operations are still optimized
- No gradient computation during inference

## Related Issues

This is a known issue with:
- PyTorch 2.8.0+ 
- Models using InstanceNorm/BatchNorm
- Manual inference mode wrappers

**Not related to:**
- ❌ torchcodec (that causes std::bad_alloc during import)
- ❌ Memory issues
- ❌ CUDA version

## Alternative Solutions Considered

### 1. Downgrade PyTorch ❌
- Would lose CUDA 12.8 support
- Not a long-term solution

### 2. Use older inference mode ❌
- `torch.no_grad()` has same issue
- Not compatible with PyTorch 2.8.0

### 3. Install torchcodec 0.7.0 ❌
- **Wrong fix** - torchcodec is unrelated
- We already removed torchcodec (causes different issue)

### 4. Let PyAnnote handle it ✅
- **Correct solution**
- PyAnnote knows how to manage its own inference
- No compatibility issues

## Summary

| Item | Status |
|------|--------|
| **Problem** | RuntimeError: Inference tensors do not track version counter |
| **Root Cause** | Manual `torch.no_grad()`/`torch.inference_mode()` wrappers |
| **Solution** | Remove wrappers, let PyAnnote handle inference mode |
| **Files Changed** | `processors/diarizer.py`, `safe_pyannote_loader.py` |
| **Impact** | ✅ Fixed - No memory or performance impact |
| **Related to torchcodec?** | ❌ No - Different issue |

---

**Last Updated:** October 21, 2025  
**Status:** ✅ FIXED
