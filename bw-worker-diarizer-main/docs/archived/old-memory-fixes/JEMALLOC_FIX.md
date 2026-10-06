# std::bad_alloc Fix - jemalloc Preload Solution

## Problem Analysis

Your `verify_fix.py` is failing with `std::bad_alloc` **during the PyAnnote Pipeline import**, not during model loading. This means:

1. ✅ Your system settings are correct (overcommit=1, THP=never)
2. ✅ Your safe loader patch is correctly implemented
3. ❌ **The C++ standard allocator is failing during library initialization**

## Root Cause

PyTorch 2.8.0 with CUDA 12.8 and PyAnnote 4.0 perform heavy C++ memory allocations during import. The glibc allocator can fragment memory and fail even with 125GB RAM available.

## Solution: Preload jemalloc

**jemalloc** is a better memory allocator that handles fragmentation much better than glibc's malloc.

### Quick Fix

Instead of:
```bash
python verify_fix.py
```

Use:
```bash
./verify_with_jemalloc.sh
```

Or manually:
```bash
LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 python verify_fix.py
```

### For the Worker

Instead of:
```bash
python main.py
```

Use:
```bash
./run_worker_with_jemalloc.sh
```

Or:
```bash
./run_worker_with_jemalloc.sh main.py
```

## Why This Works

1. **LD_PRELOAD** loads jemalloc before Python starts
2. **All malloc/free calls** use jemalloc instead of glibc
3. **jemalloc handles fragmentation** much better during PyTorch/PyAnnote C++ library loading
4. **No code changes needed** - it's a runtime replacement

## Verification Steps

1. **Test the fix:**
   ```bash
   ./verify_with_jemalloc.sh
   ```

2. **Expected output:**
   ```
   [3/5] Importing PyAnnote Pipeline...
        ✓ PyAnnote Pipeline imported successfully!
   [4/5] Applying safe loader patch...
        ✓ Patch applied successfully
   ```

3. **Run the worker:**
   ```bash
   ./run_worker_with_jemalloc.sh
   ```

## Alternative: Global jemalloc

To use jemalloc for ALL Python processes:

```bash
# Add to ~/.bashrc or /etc/environment
export LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
```

Then restart your shell and run normally:
```bash
python verify_fix.py
python main.py
```

## Docker Integration

For Docker, update your `Dockerfile`:

```dockerfile
# Install jemalloc
RUN apt-get update && apt-get install -y libjemalloc2

# Set jemalloc as default allocator
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

# Your existing CMD/ENTRYPOINT will now use jemalloc automatically
CMD ["python", "main.py"]
```

## Technical Details

### Why std::bad_alloc Happens

1. **PyTorch CUDA initialization** allocates large contiguous memory blocks
2. **PyAnnote sub-models** (segmentation, embedding, clustering) each trigger allocations
3. **glibc malloc** fragments the virtual address space
4. **Even with free RAM**, the allocator cannot find contiguous virtual memory
5. **std::bad_alloc** is thrown by C++ new operator

### Why jemalloc Fixes It

1. **Better arena management** - reduces fragmentation
2. **Aggressive memory reuse** - fills gaps efficiently
3. **Thread-local caches** - reduces contention
4. **Metadata separation** - doesn't fragment user data

## Troubleshooting

### If still failing with jemalloc:

1. **Check jemalloc is actually loaded:**
   ```bash
   LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 python -c "import ctypes; print(ctypes.CDLL('').malloc_stats)"
   ```

2. **Try even more aggressive settings:**
   ```bash
   export MALLOC_CONF="narenas:2,dirty_decay_ms:0,muzzy_decay_ms:0"
   ./verify_with_jemalloc.sh
   ```

3. **Verify the library path:**
   ```bash
   find /usr/lib -name "libjemalloc.so*"
   ```

4. **Check for other memory limits:**
   ```bash
   ulimit -a  # Check virtual memory limit
   ```

## Summary

- ✅ **Use wrapper scripts** for easy execution
- ✅ **jemalloc is already installed** on your system
- ✅ **No code changes needed** - just preload the library
- ✅ **Works with Docker** - just set ENV variable

The fix is ready to use. Run `./verify_with_jemalloc.sh` to test!
