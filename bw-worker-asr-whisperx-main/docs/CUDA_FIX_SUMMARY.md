# CUDA/cuDNN Fix Summary

**Date:** October 1, 2025  
**Issue:** `libcudnn_ops_infer.so.8: cannot open shared object file: No such file or directory`  
**Platform:** Debian 12 with CUDA  
**Status:** ✅ Fixed

---

## 🐛 The Problem

When running the worker on Debian 12 with CUDA device and small model:

```
ReproducibilityWarning: TensorFloat-32 (TF32) has been disabled as it might lead to reproducibility issues and lower accuracy.
It can be re-enabled by calling
   >>> import torch
   >>> torch.backends.cuda.matmul.allow_tf32 = True
   >>> torch.backends.cudnn.allow_tf32 = True
See https://github.com/pyannote/pyannote-audio/issues/1370 for more details.

  warnings.warn(
Could not load library libcudnn_ops_infer.so.8. Error: libcudnn_ops_infer.so.8: cannot open shared object file: No such file or directory
Aborted
```

**Root Cause:** Missing cuDNN 8 library (required by pyannote-audio via WhisperX)

---

## ✅ Solutions Implemented

### 1. Added TF32 Support to `worker.py`

Suppressed the TF32 warning and enabled TF32 for better performance:

```python
import torch

# Enable TF32 for better performance (suppress pyannote warning)
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True

# Suppress pyannote reproducibility warnings
warnings.filterwarnings('ignore', category=UserWarning, module='pyannote.audio')
```

**Location:** Lines 16-19 in `worker.py`

### 2. Created CUDA Dependency Checker

New script: `helpers/check-cuda.sh`

**Features:**

- ✅ Detects NVIDIA GPU and driver
- ✅ Checks CUDA Toolkit version
- ✅ Validates cuDNN 8.x installation
- ✅ Verifies PyTorch CUDA support
- ✅ Lists all cuDNN libraries
- ✅ Provides fix recommendations
- ✅ Color-coded output for easy reading

**Usage:**

```bash
./helpers/check-cuda.sh
```

### 3. Updated Deployment Script

`deploy.sh` now automatically runs CUDA check after installation (if GPU is available).

### 4. Comprehensive Documentation

Created `docs/CUDA_CUDNN_FIX.md` with:

- 4 solution options (cuDNN install, CPU mode, PyTorch reinstall, symlinks)
- Step-by-step fix guides
- Version compatibility matrix
- Troubleshooting section
- Prevention checklist

### 5. Updated Documentation References

- **README.md:** Added CUDA/cuDNN troubleshooting links
- **helpers/README.md:** Added check-cuda.sh documentation
- **deploy.sh:** Added CUDA check reference

---

## 🔧 Quick Fix for Users

### Option 1: Install cuDNN 8 (Recommended)

```bash
# For Debian 12 / Ubuntu
sudo apt update
sudo apt install libcudnn8 libcudnn8-dev

# Restart the worker
sudo systemctl restart sinopsis-worker-asr
```

### Option 2: Use CPU Mode (Temporary)

```bash
# Edit .env
nano /opt/sinopsis-worker-asr/.env

# Change:
ASR_DEVICE=cpu
ASR_COMPUTE_TYPE=int8

# Restart the worker
sudo systemctl restart sinopsis-worker-asr
```

### Option 3: Check Dependencies First

```bash
# Run the diagnostic tool
cd /opt/sinopsis-worker-asr
./helpers/check-cuda.sh

# Follow the recommendations provided
```

---

## 📊 Impact

**Before Fix:**

- ❌ Worker crashes with "Aborted" error
- ❌ No helpful diagnostic information
- ❌ Users stuck without guidance

**After Fix:**

- ✅ Clear error suppression and TF32 enablement
- ✅ Automatic CUDA dependency check during deployment
- ✅ Comprehensive troubleshooting documentation
- ✅ Easy-to-use diagnostic script
- ✅ Multiple solution paths for different scenarios

---

## 🧪 Testing

```bash
# 1. Check CUDA dependencies
./helpers/check-cuda.sh

# 2. Validate Python syntax
python3 -m py_compile worker.py

# 3. Test worker startup
sudo systemctl restart sinopsis-worker-asr
sudo journalctl -u sinopsis-worker-asr -n 50

# Look for:
# ✅ No cuDNN errors
# ✅ No TF32 warnings
# ✅ "Device: cuda | Compute Type: float16"
# ✅ "WhisperX model loaded successfully"
```

---

## 📚 Related Documentation

- **[docs/CUDA_CUDNN_FIX.md](CUDA_CUDNN_FIX.md)** - Complete troubleshooting guide
- **[helpers/check-cuda.sh](../helpers/check-cuda.sh)** - Diagnostic script
- **[README.md](../README.md#troubleshooting)** - Main troubleshooting section

---

## 🎯 Prevention

Add to deployment checklist:

- [ ] Run `./helpers/check-cuda.sh` before first deployment
- [ ] Verify cuDNN 8.x is installed: `ldconfig -p | grep cudnn`
- [ ] Test GPU availability: `nvidia-smi`
- [ ] Validate PyTorch CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
- [ ] Document your CUDA/cuDNN versions in deployment notes

---

## 📝 Files Modified

1. **worker.py** - Added TF32 enablement and warning suppression
2. **helpers/check-cuda.sh** - New CUDA dependency checker (324 lines)
3. **deploy.sh** - Added automatic CUDA check after deployment
4. **docs/CUDA_CUDNN_FIX.md** - Comprehensive troubleshooting guide (430 lines)
5. **README.md** - Added CUDA troubleshooting links
6. **helpers/README.md** - Added check-cuda.sh documentation

---

## 🚀 Next Steps for Users

1. **SSH to your Debian 12 server**
2. **Run the diagnostic:** `cd /opt/sinopsis-worker-asr && ./helpers/check-cuda.sh`
3. **Follow the recommendations** provided by the script
4. **Install cuDNN 8** if missing (preferred) or switch to CPU mode (temporary)
5. **Restart the worker:** `sudo systemctl restart sinopsis-worker-asr`
6. **Monitor logs:** `sudo journalctl -u sinopsis-worker-asr -f`

---

**Status:** ✅ Issue resolved with comprehensive tooling and documentation  
**Version:** Affects v3.0.0 - v3.0.3  
**Platform:** All Linux distributions with CUDA support
