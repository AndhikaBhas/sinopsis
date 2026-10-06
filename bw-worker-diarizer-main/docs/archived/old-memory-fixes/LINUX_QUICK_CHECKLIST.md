# ✅ Linux Quick Fix Checklist - std::bad_alloc

## 🎯 Before You Start

**Symptom**: Your worker crashes with `std::bad_alloc` error on Linux
**Root Cause**: Linux kernel memory restrictions (vm.overcommit_memory)
**Solution**: Fix Linux host → Rebuild Docker → Run with flags

---

## 📋 Step-by-Step Checklist

### ☐ Step 1: Fix Linux Host (MOST IMPORTANT!)

**On your Linux server, run:**
```bash
cd /path/to/Sinopsis-Worker-Diarizer
sudo bash fix-linux-host.sh
```

**What this does:**
- ✅ Sets `vm.overcommit_memory=1` (allows memory overcommit)
- ✅ Disables Transparent Huge Pages (reduces fragmentation)
- ✅ Makes changes permanent (survives reboot)

**Verify it worked:**
```bash
# Should return "1" (not 2!)
cat /proc/sys/vm/overcommit_memory

# Should show "[never]"
cat /sys/kernel/mm/transparent_hugepage/enabled
```

---

### ☐ Step 2: Stop Old Container

```bash
docker stop sinopsis-worker-diarizer 2>/dev/null || true
docker rm sinopsis-worker-diarizer 2>/dev/null || true
```

---

### ☐ Step 3: Rebuild Docker Image

**With all fixes:**
```bash
docker build -t sinopsis-worker-diarizer:latest .
```

**This takes 5-15 minutes and includes:**
- ✅ jemalloc memory allocator
- ✅ Optimized memory environment variables
- ✅ Librosa for audio resampling (not TorchAudio)

---

### ☐ Step 4: Run with Memory-Optimized Flags

**Easy way:**
```bash
bash run-docker.sh
```

**Manual way:**
```bash
docker run -d \
  --name sinopsis-worker-diarizer \
  --restart always \
  --gpus all \
  --shm-size=4g \
  --ulimit memlock=-1:-1 \
  --ulimit stack=-1:-1 \
  --memory=10g \
  --memory-swap=14g \
  --env-file .env \
  sinopsis-worker-diarizer:latest
```

**What these flags do:**
- `--shm-size=4g` → Increases shared memory (PyTorch needs this!)
- `--ulimit memlock=-1:-1` → Removes memory lock limits
- `--ulimit stack=-1:-1` → Removes stack size limits
- `--memory=10g` → Sets reasonable memory cap
- `--memory-swap=14g` → Allows swap usage

---

### ☐ Step 5: Verify Success

**Watch logs:**
```bash
docker logs -f sinopsis-worker-diarizer
```

**Look for these SUCCESS indicators:**
```
✅ "jemalloc detected and loaded"
✅ "Successfully loaded audio with..."
✅ "Resampled using librosa (memory-efficient)"  ← NEW!
✅ "Running diarization inference..."
✅ "Diarization completed. Found X speakers"
```

**Should NOT see:**
```
❌ "terminate called after throwing an instance of 'std::bad_alloc'"
❌ "Aborted"
```

**Verify jemalloc:**
```bash
docker exec sinopsis-worker-diarizer bash -c "echo \$LD_PRELOAD"
# Expected: /usr/lib/x86_64-linux-gnu/libjemalloc.so.2
```

**Check memory settings:**
```bash
docker exec sinopsis-worker-diarizer bash -c "env | grep -E 'MALLOC|PYTORCH'"
# Should show optimized settings
```

---

## 🎉 Success Criteria

All of these must be true:

- ☐ `vm.overcommit_memory = 1` on Linux host
- ☐ THP disabled on Linux host (`[never]`)
- ☐ Docker image rebuilt with jemalloc
- ☐ Container running with memory flags
- ☐ Logs show "Resampled using librosa"
- ☐ No std::bad_alloc errors in logs
- ☐ Audio processing completes successfully

---

## 🆘 Troubleshooting

### If Step 1 Fails (Host Fix)
```bash
# Check if running as root
whoami  # Should be "root"

# Manual fix
sudo -i
echo 1 > /proc/sys/vm/overcommit_memory
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo "vm.overcommit_memory = 1" >> /etc/sysctl.conf
```

### If Still Getting std::bad_alloc

**Check host settings:**
```bash
cat /proc/sys/vm/overcommit_memory  # MUST be 1, not 2!
```

**Increase memory if needed:**
```bash
# Edit run-docker.sh, change:
--memory=10g  →  --memory=16g
--memory-swap=14g  →  --memory-swap=24g
```

**Try host IPC:**
```bash
# Replace --shm-size=4g with:
--ipc=host
```

### If Build Fails
```bash
# Check Docker
docker version

# Clean up
docker system prune -a

# Check disk space
df -h
```

---

## 📚 Additional Resources

- **Complete Guide**: [LINUX_FIX_README.md](LINUX_FIX_README.md)
- **Technical Details**: [CRITICAL_FIX_BAD_ALLOC.md](CRITICAL_FIX_BAD_ALLOC.md)
- **High RAM Systems**: [docs/FIX_HIGH_RAM_SYSTEMS.md](docs/FIX_HIGH_RAM_SYSTEMS.md)

---

## 🔑 Key Points

1. **Host Fix is CRITICAL** - Without it, Docker fixes won't work
2. **vm.overcommit_memory=2 causes the error** - Must be 0 or 1
3. **All 3 levels needed** - Host + Docker + Code fixes
4. **Linux-only issue** - Windows/Mac don't have this problem
5. **Not a RAM shortage** - It's a kernel policy issue

---

## ⏱️ Time Estimate

- Step 1 (Host fix): 1 minute
- Step 2 (Stop container): 10 seconds
- Step 3 (Rebuild): 5-15 minutes
- Step 4 (Run): 30 seconds
- Step 5 (Verify): 2 minutes

**Total**: ~10-20 minutes

---

**Last Updated**: 2025-10-20
**Status**: ✅ ALL FIXES APPLIED
**OS**: 🐧 Linux Only
