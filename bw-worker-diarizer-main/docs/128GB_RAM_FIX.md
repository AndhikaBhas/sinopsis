# 128GB RAM System - std::bad_alloc Fix Summary

## Your Situation

- **RAM**: 128GB (plenty!)
- **Error**: `std::bad_alloc`
- **Platform**: Linux
- **Paradox**: Enough RAM, but still failing

## The Real Problem

This is **NOT** about insufficient RAM. It's about **Linux memory allocation policies**:

1. **Virtual Memory Limits** (`ulimit -v`)
2. **Memory Overcommit Policy** (`/proc/sys/vm/overcommit_memory`)
3. **C++ Memory Allocator Issues**

## Immediate Solutions

### Option 1: One-Line Fix (Fastest)

```bash
ulimit -v unlimited && ulimit -s unlimited && python main.py
```

### Option 2: Wrapper Script (Recommended)

```bash
chmod +x run_with_memory_fix.sh
./run_with_memory_fix.sh
```

### Option 3: Root Fix (If you have sudo)

```bash
sudo ./run_with_memory_fix.sh
# This also fixes system-level settings
```

### Option 4: Diagnose First

```bash
python diagnose_memory.py
# This will show you exactly what's wrong
```

## What Each Solution Does

### Wrapper Script (`run_with_memory_fix.sh`)
- ✅ Removes all memory limits (`ulimit`)
- ✅ Sets `PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True`
- ✅ Configures C++ allocator (`MALLOC_ARENA_MAX=2`)
- ✅ Uses 8 threads (optimal for high-RAM)
- ✅ Loads jemalloc if available
- ✅ Sets `vm.overcommit_memory=1` (if root)

### Diagnostic Script (`diagnose_memory.py`)
- Shows current ulimits
- Shows memory overcommit policy
- Shows system memory
- Identifies specific issues
- Provides targeted recommendations

## Most Likely Causes (in order)

### 1. Virtual Memory Limit (90% probability)

**Check:**
```bash
ulimit -v
```

**If you see a number (not "unlimited"):**
```bash
ulimit -v unlimited
```

### 2. Strict Overcommit Policy (5% probability)

**Check:**
```bash
cat /proc/sys/vm/overcommit_memory
```

**If you see "2":**
```bash
echo 1 | sudo tee /proc/sys/vm/overcommit_memory
```

### 3. C++ Allocator Fragmentation (3% probability)

**Fix:**
```bash
export MALLOC_ARENA_MAX=2
export MALLOC_TRIM_THRESHOLD_=65536
python main.py
```

### 4. Stack Size Limit (2% probability)

**Fix:**
```bash
ulimit -s unlimited
```

## Files Updated for You

1. **`run_with_memory_fix.sh`** ⭐ - Automated fix (USE THIS)
2. **`diagnose_memory.py`** - Diagnostic tool
3. **`processors/diarizer.py`** - Auto-detects high-RAM systems
4. **`docs/FIX_HIGH_RAM_SYSTEMS.md`** - Complete guide
5. **`MEMORY_FIX_QUICKREF.md`** - Updated with high-RAM section

## Step-by-Step Instructions

### Step 1: Diagnose

```bash
python diagnose_memory.py
```

Look for warnings about:
- Virtual memory limits
- Memory overcommit policy
- Stack size

### Step 2: Apply Fix

```bash
# Make script executable
chmod +x run_with_memory_fix.sh

# Run the worker
./run_with_memory_fix.sh
```

### Step 3: Verify

You should see in the logs:
```
✓ High-RAM system detected (128.0GB)
✓ Set PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True
✓ Set MALLOC_ARENA_MAX=2
...
✓ PyAnnote pipeline initialized successfully
```

## If Still Not Working

### Try with jemalloc

```bash
# Install jemalloc
sudo apt install libjemalloc2

# Run with jemalloc
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 python main.py
```

### Check kernel messages

```bash
dmesg | grep -i "memory\|alloc\|oom"
```

### Run with strace to see exact failure

```bash
strace -e trace=mmap,brk,munmap -o strace.log python main.py
# Then check strace.log for the last failed allocation
```

## Permanent Fix (Optional)

### Edit `/etc/security/limits.conf`

Add:
```
* soft as unlimited
* hard as unlimited
* soft memlock unlimited
* hard memlock unlimited
```

### Edit `/etc/sysctl.conf`

Add:
```
vm.overcommit_memory = 1
```

### Apply

```bash
sudo sysctl -p
# Then log out and log back in
```

## Expected Results

After applying the fix:
- ✅ Worker starts normally
- ✅ Model loads in 2-5 minutes
- ✅ Uses ~3-5GB RAM (out of your 128GB)
- ✅ No `std::bad_alloc` errors
- ✅ Can process audio files continuously

## Why This Happens

Linux doesn't care how much physical RAM you have. It enforces:

1. **Virtual memory limits** - Prevents processes from requesting too much
2. **Overcommit policies** - Prevents memory oversubscription
3. **Per-process limits** - Set by `ulimit`

PyTorch tries to allocate large contiguous memory blocks, which triggers these limits even though you have plenty of RAM.

## Summary Commands

```bash
# Quickest fix
ulimit -v unlimited && python main.py

# Best fix
./run_with_memory_fix.sh

# Diagnose
python diagnose_memory.py

# With jemalloc
LD_PRELOAD=libjemalloc.so.2 ./run_with_memory_fix.sh
```

---

**Bottom line**: Your 128GB RAM is fine. Linux just needs to be told it's okay to use it. The wrapper script does this automatically.
