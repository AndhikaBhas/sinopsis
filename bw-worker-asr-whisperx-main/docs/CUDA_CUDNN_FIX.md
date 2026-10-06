# CUDA/cuDNN Fix for Debian 12

**Issue:** `libcudnn_ops_infer.so.8: cannot open shared object file`  
**Platform:** Debian 12 with CUDA  
**Date:** October 1, 2025

---

## 🐛 Problem

```
Could not load library libcudnn_ops_infer.so.8. Error: libcudnn_ops_infer.so.8: cannot open shared object file: No such file or directory
Aborted
```

**Root Cause:** Missing or mismatched cuDNN library version.

---

## ✅ Solution Options

### Option 1: Install cuDNN 8 (Recommended)

```bash
# 1. Check CUDA version
nvidia-smi
# Note your CUDA version (e.g., 12.1, 12.2, etc.)

# 2. Download cuDNN 8 from NVIDIA
# Visit: https://developer.nvidia.com/cudnn
# Download cuDNN for your CUDA version

# 3. For Debian 12, install via apt (if available)
sudo apt update
sudo apt install libcudnn8 libcudnn8-dev

# OR manually install .deb packages
wget https://developer.download.nvidia.com/compute/cuda/repos/debian12/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update
sudo apt install libcudnn8 libcudnn8-dev

# 4. Verify installation
ldconfig -p | grep cudnn
```

---

### Option 2: Use CPU Mode (Temporary Workaround)

If you need the worker running immediately while fixing CUDA:

**Edit `.env`:**

```bash
# Change from cuda to cpu
ASR_DEVICE=cpu
ASR_COMPUTE_TYPE=int8
```

**Pros:**

- ✅ Works immediately
- ✅ No GPU dependencies

**Cons:**

- ⚠️ Much slower (~10x slower transcription)
- ⚠️ Not recommended for production

---

### Option 3: Install PyTorch with Bundled cuDNN

PyTorch wheels can include cuDNN, avoiding system installation:

```bash
# Activate your virtual environment
cd /opt/sinopsis-worker-asr
source venv/bin/activate

# Uninstall current PyTorch
pip uninstall torch torchvision torchaudio -y

# Reinstall with CUDA 12.1 (includes cuDNN)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Verify
python -c "import torch; print('CUDA:', torch.cuda.is_available()); print('cuDNN:', torch.backends.cudnn.version())"
```

---

### Option 4: Create Symbolic Links (If cuDNN is Installed but Not Found)

```bash
# Find cuDNN libraries
find /usr -name "libcudnn*" 2>/dev/null

# If you find libcudnn_ops_infer.so.9 but not .so.8, create symlink
sudo ln -s /usr/lib/x86_64-linux-gnu/libcudnn_ops_infer.so.9 /usr/lib/x86_64-linux-gnu/libcudnn_ops_infer.so.8

# Update library cache
sudo ldconfig

# Verify
ldconfig -p | grep cudnn
```

⚠️ **Warning:** Version mismatch may cause issues. Use with caution.

---

## 🔧 TF32 Warning Fix

The TF32 warning is harmless but can be suppressed. Add this to `worker.py`:

```python
# At the top of worker.py, after imports
import torch
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True
```

Or disable the warning without enabling TF32:

```python
import warnings
warnings.filterwarnings('ignore', category=UserWarning, module='pyannote.audio')
```

**Note:** We already filter warnings, but this specific one comes from pyannote initialization before our filter is active.

---

## 📋 Step-by-Step Fix Guide

### For Production (Recommended)

```bash
# 1. SSH to your Debian 12 server
ssh user@your-server

# 2. Stop the worker
sudo systemctl stop sinopsis-worker-asr

# 3. Check CUDA installation
nvidia-smi
nvcc --version

# 4. Install cuDNN 8
sudo apt update
sudo apt install libcudnn8 libcudnn8-dev

# If not available in apt:
# Visit https://developer.nvidia.com/cudnn and download .deb for Debian

# 5. Verify installation
ldconfig -p | grep cudnn
# Should show: libcudnn_ops_infer.so.8

# 6. Restart worker
sudo systemctl start sinopsis-worker-asr

# 7. Monitor logs
sudo journalctl -u sinopsis-worker-asr -f
```

### For Quick Fix (Temporary)

```bash
# 1. Edit .env to use CPU
sudo nano /opt/sinopsis-worker-asr/.env

# Change:
# ASR_DEVICE=cuda  →  ASR_DEVICE=cpu
# ASR_COMPUTE_TYPE=float16  →  ASR_COMPUTE_TYPE=int8

# 2. Restart worker
sudo systemctl restart sinopsis-worker-asr

# 3. Worker will run on CPU (slower but working)
# Fix CUDA properly when convenient
```

---

## 🧪 Testing After Fix

```bash
# 1. Check CUDA availability
cd /opt/sinopsis-worker-asr
source venv/bin/activate
python -c "import torch; print('CUDA available:', torch.cuda.is_available())"
# Should print: CUDA available: True

# 2. Check cuDNN
python -c "import torch; print('cuDNN version:', torch.backends.cudnn.version())"
# Should print: cuDNN version: 8xxx

# 3. Test GPU
python -c "import torch; print(torch.cuda.get_device_name(0))"
# Should print your GPU name

# 4. Test worker startup
sudo systemctl status sinopsis-worker-asr
sudo journalctl -u sinopsis-worker-asr -n 50

# Look for:
# ✅ "Device: cuda | Compute Type: float16"
# ✅ "WhisperX model loaded successfully"
# ❌ No "libcudnn" errors
```

---

## 📊 Version Compatibility Matrix

| CUDA Version | cuDNN Version | PyTorch Version | Status               |
| ------------ | ------------- | --------------- | -------------------- |
| 12.1         | 8.x           | 2.1.0+          | ✅ Recommended       |
| 12.2         | 8.x           | 2.1.0+          | ✅ Recommended       |
| 11.8         | 8.x           | 2.0.0+          | ✅ Works             |
| 12.x         | 9.x           | Latest          | ⚠️ May need symlinks |

---

## 🔍 Troubleshooting

### Issue: cuDNN Still Not Found After Installation

```bash
# 1. Check if library exists
find /usr -name "libcudnn_ops_infer.so*" 2>/dev/null

# 2. Check library search path
echo $LD_LIBRARY_PATH

# 3. Add to library path (if needed)
export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH

# 4. Update systemd service to include library path
sudo nano /etc/systemd/system/sinopsis-worker-asr.service

# Add under [Service]:
Environment="LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/usr/local/cuda/lib64"

# 5. Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart sinopsis-worker-asr
```

### Issue: CUDA Version Mismatch

```bash
# Check CUDA version
nvcc --version
nvidia-smi  # May show different version

# PyTorch needs to match CUDA toolkit version
# Reinstall PyTorch with correct CUDA version:

# For CUDA 12.1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# For CUDA 11.8
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Issue: Permission Denied

```bash
# Ensure library is readable
sudo chmod 644 /usr/lib/x86_64-linux-gnu/libcudnn*

# Update cache
sudo ldconfig

# Check permissions
ls -la /usr/lib/x86_64-linux-gnu/libcudnn*
```

---

## 📝 Update Deployment Script

Add cuDNN check to `deploy.sh`:

```bash
# Add after PyTorch installation in deploy.sh

echo "🔍 Checking CUDA/cuDNN installation..."
if command -v nvidia-smi &> /dev/null; then
    nvidia-smi

    if ldconfig -p | grep -q "libcudnn_ops_infer.so.8"; then
        echo "✅ cuDNN 8 is installed"
    else
        echo "⚠️  WARNING: cuDNN 8 not found!"
        echo "   Install with: sudo apt install libcudnn8 libcudnn8-dev"
        echo "   Or set ASR_DEVICE=cpu in .env"
    fi
else
    echo "ℹ️  CUDA not available, will use CPU mode"
fi
```

---

## 🐳 Docker Solution

If using Docker, ensure cuDNN is included:

```dockerfile
# Dockerfile
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# Or use PyTorch base image (includes cuDNN)
FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime

# Your application code...
```

---

## 📚 Resources

- [NVIDIA cuDNN Download](https://developer.nvidia.com/cudnn)
- [PyTorch CUDA Installation](https://pytorch.org/get-started/locally/)
- [cuDNN Installation Guide](https://docs.nvidia.com/deeplearning/cudnn/install-guide/)
- [Debian CUDA Installation](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/)

---

## ✅ Recommended Solution Summary

**For immediate fix:**

```bash
# Option 1: Install cuDNN (BEST)
sudo apt install libcudnn8 libcudnn8-dev

# Option 2: Use CPU mode (TEMPORARY)
# Edit .env: ASR_DEVICE=cpu
```

**For long-term:**

- Install proper cuDNN version matching your CUDA
- Keep libraries updated
- Add validation to deployment script
- Document your CUDA/cuDNN versions

---

## 🎯 Prevention

Add to your deployment checklist:

- [ ] CUDA toolkit installed
- [ ] cuDNN 8.x installed
- [ ] PyTorch CUDA version matches system CUDA
- [ ] Libraries in LD_LIBRARY_PATH
- [ ] Test GPU availability before deployment
- [ ] Document versions in README

---

**Status:** Issue resolved with cuDNN installation  
**Version:** Affects v3.0.0 - v3.0.3  
**Platform:** Debian 12, CUDA 12.x
