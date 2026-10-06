# Fixing std::bad_alloc on High-RAM Systems (64GB+)

## The Paradox

You have **128GB of RAM**, yet you're getting:
```
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
Aborted
```

This is **NOT** about having insufficient RAM. It's a **Linux memory allocation policy issue**.

## Root Causes

### 1. **Virtual Memory Limits (ulimit)**
Linux limits how much virtual memory a process can allocate, regardless of physical RAM:

```bash
# Check current limit
ulimit -v
# If this shows a number (not "unlimited"), that's your problem!
```

### 2. **Memory Overcommit Policy**
Linux has three memory overcommit modes:
- `0` = Heuristic (default, usually OK)
- `1` = Always overcommit (permissive)
- `2` = **Strict mode (CAUSES THE ERROR)**

```bash
# Check current setting
cat /proc/sys/vm/overcommit_memory
# If this shows "2", that's likely your problem!
```

### 3. **C++ Memory Allocator Fragmentation**
PyTorch/C++ may fragment memory on large allocations.

## SOLUTION 1: Quick Fix (Immediate)

Run this **BEFORE** starting the worker:

```bash
# Remove all memory limits
ulimit -v unlimited
ulimit -s unlimited
ulimit -d unlimited

# Set permissive memory overcommit
echo 1 | sudo tee /proc/sys/vm/overcommit_memory

# Now run the worker
python main.py
```

## SOLUTION 2: Use the Wrapper Script (Recommended)

```bash
# Make the script executable
chmod +x run_with_memory_fix.sh

# Run the worker with the script
./run_with_memory_fix.sh

# Or with sudo for system-level optimizations
sudo ./run_with_memory_fix.sh
```

The wrapper script automatically:
- ✅ Removes memory limits
- ✅ Sets optimal environment variables
- ✅ Configures memory allocator
- ✅ Uses jemalloc if available
- ✅ Adjusts overcommit policy (if root)

## SOLUTION 3: Diagnose First

Run the diagnostic tool to see exactly what's wrong:

```bash
python diagnose_memory.py
```

This will show:
- Current ulimits
- Memory overcommit settings
- Available memory
- Specific issues found
- Recommended fixes

## SOLUTION 4: Permanent System-Wide Fix

### Step 1: Edit `/etc/security/limits.conf`

Add these lines:
```
* soft memlock unlimited
* hard memlock unlimited
* soft as unlimited
* hard as unlimited
* soft stack unlimited
* hard stack unlimited
```

### Step 2: Edit `/etc/sysctl.conf`

Add this line:
```
vm.overcommit_memory = 1
```

### Step 3: Apply changes

```bash
# Reload sysctl
sudo sysctl -p

# Log out and log back in for limits to take effect
# Or reboot
```

## SOLUTION 5: Docker-Specific

If running in Docker:

```bash
docker run -d \
  --name sinopsis-worker \
  --ulimit memlock=-1:-1 \
  --ulimit stack=-1:-1 \
  --ulimit as=-1:-1 \
  --shm-size=16g \
  -e PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True \
  -e MALLOC_ARENA_MAX=2 \
  sinopsis-worker:latest
```

Or in `docker-compose.yml`:
```yaml
services:
  diarizer:
    image: sinopsis-worker:latest
    ulimits:
      memlock: -1
      stack: 67108864
      as: -1
    shm_size: '16gb'
    environment:
      - PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True
      - MALLOC_ARENA_MAX=2
      - OMP_NUM_THREADS=8
```

## Verification Steps

### 1. Check ulimits BEFORE running

```bash
ulimit -a
# Should show "unlimited" for virtual memory
```

### 2. Check overcommit setting

```bash
cat /proc/sys/vm/overcommit_memory
# Should be 0 or 1, NOT 2
```

### 3. Test with diagnostic script

```bash
python diagnose_memory.py
# Should show "✓ No obvious configuration issues detected"
```

### 4. Run the worker

```bash
./run_with_memory_fix.sh
# Or
python main.py
```

### 5. Check logs

You should see:
```
✓ High-RAM system detected (128.0GB)
✓ Set PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True
✓ Set MALLOC_ARENA_MAX=2
...
✓ PyAnnote pipeline initialized successfully on device: cuda
```

## Advanced Troubleshooting

### If still failing after removing limits

1. **Install jemalloc** (better memory allocator):
   ```bash
   sudo apt install libjemalloc2
   
   # Run with jemalloc
   LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 python main.py
   ```

2. **Check for memory fragmentation**:
   ```bash
   cat /proc/buddyinfo
   # Look for available contiguous memory blocks
   ```

3. **Disable Transparent Huge Pages**:
   ```bash
   echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
   echo never | sudo tee /sys/kernel/mm/transparent_hugepage/defrag
   ```

4. **Check kernel messages**:
   ```bash
   dmesg | grep -i "memory\|alloc"
   # Look for OOM killer or allocation failures
   ```

5. **Monitor during startup**:
   ```bash
   # Terminal 1: Run worker
   python main.py
   
   # Terminal 2: Monitor memory
   watch -n 0.5 'free -h && echo && ps aux | grep python | head -5'
   ```

## Why This Happens on High-RAM Systems

1. **Default limits are conservative**: Set for typical systems (8-32GB)
2. **Overcommit protection**: Prevents runaway processes
3. **Virtual memory != Physical RAM**: Linux tracks both separately
4. **C++ allocator assumptions**: Not optimized for huge allocations

## Expected Behavior After Fix

- ✅ Worker starts successfully
- ✅ Model loads in 2-5 minutes
- ✅ Memory usage: ~3-5GB steady state
- ✅ No `std::bad_alloc` errors
- ✅ Can use more threads (8 instead of 4)

## Quick Reference

| Problem | Command |
|---------|---------|
| Check ulimit | `ulimit -v` |
| Remove limit | `ulimit -v unlimited` |
| Check overcommit | `cat /proc/sys/vm/overcommit_memory` |
| Fix overcommit | `echo 1 \| sudo tee /proc/sys/vm/overcommit_memory` |
| Run with wrapper | `./run_with_memory_fix.sh` |
| Diagnose | `python diagnose_memory.py` |
| Use jemalloc | `LD_PRELOAD=libjemalloc.so.2 python main.py` |

## Files to Use

1. **`run_with_memory_fix.sh`** - Automated wrapper script (EASIEST)
2. **`diagnose_memory.py`** - Diagnostic tool
3. **`test_memory.py`** - Verify PyTorch/PyAnnote work

## Still Not Working?

1. Run: `python diagnose_memory.py > diagnosis.txt`
2. Run: `ulimit -a > ulimits.txt`
3. Run: `cat /proc/meminfo > meminfo.txt`
4. Run: `dmesg | tail -100 > dmesg.txt`
5. Share these files for further diagnosis

---

**The key insight**: On high-RAM systems, the error is almost always due to **virtual memory limits** or **strict overcommit policy**, not actual memory shortage.
