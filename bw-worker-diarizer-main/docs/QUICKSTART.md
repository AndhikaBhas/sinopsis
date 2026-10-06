# Quick Start Guide - Building with Increased Memory

## Prerequisites

### 1. Accept HuggingFace Model Terms
Visit and accept terms: https://huggingface.co/pyannote/speaker-diarization-community-1

### 2. Get HuggingFace Token
1. Go to: https://huggingface.co/settings/tokens
2. Create a new token (read permission is sufficient)
3. Copy the token (starts with `hf_...`)

### 3. Configure Docker Desktop Memory

**IMPORTANT:** You must increase Docker memory allocation before building!

1. Open **Docker Desktop**
2. Click **Settings** (gear icon)
3. Go to **Resources** → **Memory**
4. Set to **10GB minimum** (12GB recommended for GPU builds)
5. Click **Apply & Restart**
6. Wait for Docker to restart

![Docker Memory Settings](https://docs.docker.com/desktop/images/settings-resources.png)

## Building the Image

### Step 1: Set Your HuggingFace Token
```bash
# Replace with your actual token
export HF_TOKEN="hf_your_token_here"
```

### Step 2: Build GPU Version (Recommended)
```bash
chmod +x build-docker.sh
./build-docker.sh gpu
```

**OR Build CPU Version:**
```bash
./build-docker.sh cpu
```

## What Happens During Build

1. ✅ Docker allocates 10GB memory (GPU) or 8GB (CPU)
2. ✅ Downloads and installs dependencies
3. ✅ Downloads PyAnnote speaker-diarization-community-1 model (~35MB)
4. ✅ Caches model in image (no runtime download needed!)
5. ✅ Creates optimized final image (~10-12GB)

**Build Time:** 15-20 minutes (depends on internet speed)

## Verification

### Check Image Was Created
```powershell
docker images sinopsis-worker-diarizer
```

Expected output:
```
REPOSITORY                    TAG       SIZE
sinopsis-worker-diarizer     latest    10-12GB
```

### Verify Model Is Cached
```powershell
docker run --rm sinopsis-worker-diarizer:latest ls -lah /opt/huggingface_cache
```

Should show:
```
models--pyannote--speaker-diarization-community-1/
```

## Running the Container

### With GPU (Recommended)
```powershell
docker run -d `
  --name sinopsis-diarization-worker `
  --gpus all `
  --env-file .env `
  -v ${PWD}/logs:/app/logs `
  sinopsis-worker-diarizer:latest
```

### CPU Only
```powershell
docker run -d `
  --name sinopsis-diarization-worker `
  --env-file .env `
  -v ${PWD}/logs:/app/logs `
  sinopsis-worker-diarizer:cpu
```

### View Logs
```powershell
docker logs -f sinopsis-diarization-worker
```

## Troubleshooting

### ❌ Build fails with "std::bad_alloc"

**Solution:** Increase Docker memory!
1. Docker Desktop → Settings → Resources → Memory
2. Set to 10GB+ for GPU or 8GB+ for CPU
3. Apply & Restart Docker
4. Rebuild

### ❌ "HUGGINGFACE_HUB_TOKEN not set"

**Solution:** Set the environment variable:
```powershell
$env:HF_TOKEN = "hf_your_actual_token_here"
```

### ❌ "401 Unauthorized" during model download

**Solution:** 
1. Check token is valid at https://huggingface.co/settings/tokens
2. Accept model terms at https://huggingface.co/pyannote/speaker-diarization-community-1
3. Rebuild with correct token

### ❌ Still running out of memory

**Solutions:**
1. **Close other applications** to free RAM
2. **Restart Docker Desktop** to clear cache
3. **Use low-memory build:**
   ```powershell
   docker build `
     -f Dockerfile.low-memory `
     --build-arg HF_TOKEN=$env:HF_TOKEN `
     -t sinopsis-worker-diarizer:latest .
   ```
   Note: Model downloads on first container run instead

### ❌ Build is very slow

**Normal!** Building ML images takes time:
- Downloading dependencies: ~5-8 minutes
- Downloading model: ~2-5 minutes (depends on connection)
- Installing packages: ~5-10 minutes
- Total: 15-20 minutes is expected

**Tips to speed up:**
- Use wired internet (faster than WiFi)
- Don't download other files during build
- Enable BuildKit (automatically enabled in scripts)

## Memory Allocation Summary

| Build Type | Docker Memory Needed | Image Size | Build Time |
|------------|---------------------|------------|------------|
| **GPU** | 10-12GB | ~10-12GB | 15-20 min |
| **CPU** | 8-10GB | ~8-10GB | 12-15 min |
| **Low-Memory** | 4-6GB | ~8-10GB | 10-12 min |

## Success Indicators

✅ **Build Completed:**
```
✓ Model cache verified successfully
✓ GPU build completed successfully!
```

✅ **Model Cached:**
```
models--pyannote--speaker-diarization-community-1/
```

✅ **Container Starts Fast:**
- With cached model: ~5-10 seconds
- Without cached model: ~5-10 minutes (first run)

## Next Steps

1. ✅ Build successful? → Run the container
2. ✅ Test with audio file
3. ✅ Monitor logs: `docker logs -f sinopsis-diarization-worker`
4. ✅ Check GPU usage (if GPU build): `nvidia-smi`

## Need Help?

- Check `BUILD_GUIDE.md` for detailed instructions
- See `DOCKER_MEMORY_FIX.md` for troubleshooting
- Review `UPGRADE_SUMMARY.md` for upgrade details

---

**Last Updated:** October 19, 2025  
**Build Script:** `build-docker.sh`
