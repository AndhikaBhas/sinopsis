# 🔴 CRITICAL: std::bad_alloc During PyAnnote Import

## Problem Identified

The error occurs during `from pyannote.audio import Pipeline`, **not during model loading**.

```
[3/5] Importing PyAnnote Pipeline...
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
Aborted
```

This means PyAnnote's library initialization itself is trying to allocate memory and failing.

---

## Root Cause

PyAnnote imports several heavy dependencies during `from pyannote.audio import Pipeline`:
- PyTorch tensors for internal use
- TorchAudio components
- NumPy arrays
- Internal model metadata structures

On Linux with **strict memory overcommit** settings, even these small allocations can fail if:
1. `vm.overcommit_memory = 2` (strict mode - never overcommit)
2. Transparent Huge Pages are causing allocation delays
3. Memory is fragmented from previous operations
4. glibc malloc is holding onto freed memory

---

## Solution: Fix Linux Host Configuration

### **IMMEDIATE FIX (Run This First)**

```bash
# Run as root
sudo bash fix-pyannote-import.sh
```

This automated script will:
1. ✅ Set `vm.overcommit_memory=1` (always overcommit)
2. ✅ Disable Transparent Huge Pages
3. ✅ Install jemalloc (better allocator)
4. ✅ Increase system limits
5. ✅ Make changes persist across reboots

---

## Manual Fix Steps

If you can't run the script, do these manually:

### **1. Fix Memory Overcommit (CRITICAL)**

```bash
# Check current setting
cat /proc/sys/vm/overcommit_memory

# If it shows "2", that's the problem!
# Change to "1" (always overcommit)
sudo sysctl -w vm.overcommit_memory=1

# Make it permanent
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf
```

**Why this matters**:
- `0` = Heuristic (default on most systems) - usually OK
- `1` = Always overcommit - BEST for PyTorch/PyAnnote
- `2` = Strict mode - **WILL CAUSE std::bad_alloc**

### **2. Disable Transparent Huge Pages**

```bash
# Disable THP
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag

# Make it permanent (create startup script)
sudo bash -c 'cat > /etc/rc.local << EOF
#!/bin/bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag
exit 0
EOF'

sudo chmod +x /etc/rc.local
```

### **3. Install and Use jemalloc**

```bash
# Install jemalloc
sudo apt-get update
sudo apt-get install -y libjemalloc2

# Find the library path
JEMALLOC_PATH=$(find /usr/lib -name "libjemalloc.so.2" | head -n 1)
echo $JEMALLOC_PATH

# Use it (set before running Python)
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
```

### **4. Increase System Limits**

```bash
# Increase limits
sudo bash -c 'cat >> /etc/security/limits.conf << EOF
*    soft    memlock    unlimited
*    hard    memlock    unlimited
*    soft    stack      unlimited
*    hard    stack      unlimited
EOF'

# Apply for current session
ulimit -l unlimited
ulimit -s unlimited
```

---

## Verification Steps

### **Step 1: Verify Host Configuration**

```bash
# Check overcommit (should be 0 or 1, NOT 2)
cat /proc/sys/vm/overcommit_memory

# Check THP (should show [never])
cat /sys/kernel/mm/transparent_hugepage/enabled

# Check if jemalloc is installed
dpkg -l | grep jemalloc

# Check limits
ulimit -a
```

### **Step 2: Test with jemalloc**

```bash
# Set LD_PRELOAD
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Test Python import
python3 -c "from pyannote.audio import Pipeline; print('✅ SUCCESS!')"
```

If this works, jemalloc solved it!

### **Step 3: Run Verification Script**

```bash
# With jemalloc
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
python verify_fix.py
```

Expected output:
```
[3/5] Importing PyAnnote Pipeline...
     ✓ PyAnnote Pipeline imported successfully!
✅ SUCCESS: Safe loader is properly configured!
```

---

## Docker-Specific Fixes

If running in Docker, the Dockerfile already includes jemalloc, but you may need additional runtime flags:

```bash
docker run -d \
  --name sinopsis-worker-diarizer \
  --restart always \
  --shm-size=4g \
  --ulimit memlock=-1:-1 \
  --ulimit stack=-1:-1 \
  --memory=10g \
  --memory-swap=14g \
  --env-file .env \
  sinopsis-worker-diarizer:latest
```

The `--shm-size=4g` is **critical** - Docker's default 64MB is too small.

---

## Testing After Fixes

### **Test 1: Simple Import**

```bash
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
python3 -c "
import torch
torch.set_num_threads(4)
torch.set_num_interop_threads(2)
print('PyTorch OK')

from pyannote.audio import Pipeline
print('✅ PyAnnote import SUCCESS!')
"
```

### **Test 2: Verification Script**

```bash
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
python verify_fix.py
```

### **Test 3: Full Worker**

```bash
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
# Set all required environment variables
export HUGGINGFACE_AUTH_TOKEN="your_token"
export DATABASE_URL="your_db"
# ... etc
python main.py
```

---

## Why This Happens on Linux but Not Windows

1. **Different Memory Allocators**:
   - Linux: glibc malloc (fragments easily)
   - Windows: HeapAlloc API (better fragmentation handling)

2. **Different Overcommit Policies**:
   - Linux: Can be strict (`vm.overcommit_memory=2`)
   - Windows: Always allows overcommit

3. **Different PyTorch Builds**:
   - Linux: Compiled with GCC/LLVM
   - Windows: Compiled with MSVC
   - Different C++ memory allocation patterns

4. **Transparent Huge Pages**:
   - Linux: THP can cause allocation delays
   - Windows: No THP

---

## Success Criteria

After applying fixes, you should see:

```
[1/5] Importing safe_pyannote_loader module...
     ✓ safe_pyannote_loader imported

[2/5] Importing torch...
     ✓ PyTorch 2.8.0+cu128 imported
     ✓ Thread config: num_threads=4, interop=2

[2.5/5] Setting up memory optimizations...
     ✓ Environment variables set
     ✓ jemalloc loaded

[3/5] Importing PyAnnote Pipeline...
     ✓ PyAnnote Pipeline imported successfully!  ← THIS IS THE KEY!

[4/5] Applying safe loader patch...
     ✓ Patch applied successfully

[5/5] Verifying patch is active...
     ✓ Patch state flag is True
     ✓ Original method was saved

✅ SUCCESS: Safe loader is properly configured!
```

---

## If Still Failing

1. **Check system logs**:
```bash
dmesg | tail -50
journalctl -xe
```

2. **Check available memory**:
```bash
free -h
cat /proc/meminfo | grep -i commit
```

3. **Try with minimal Python**:
```bash
python3 -c "import sys; print(sys.version)"
python3 -c "import torch; print(torch.__version__)"
python3 -c "import pyannote; print(pyannote.__version__)"
```

4. **Check for other processes using memory**:
```bash
ps aux --sort=-%mem | head -20
```

---

## Summary

The `std::bad_alloc` during import is a **Linux kernel configuration issue**, not a Python code bug.

**Required fixes** (in order of importance):
1. 🔴 **CRITICAL**: Set `vm.overcommit_memory=1`
2. 🟠 **IMPORTANT**: Install and use jemalloc
3. 🟡 **RECOMMENDED**: Disable Transparent Huge Pages
4. 🟢 **OPTIONAL**: Increase system limits

Run the automated script: `sudo bash fix-pyannote-import.sh`

---

**After applying these fixes, re-run `python verify_fix.py`**
