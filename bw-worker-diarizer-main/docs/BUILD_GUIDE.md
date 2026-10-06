# Docker Build Guide - Handling Memory Issues

## The Problem

The `std::bad_alloc` error occurs when Docker runs out of memory while downloading and loading the pyannote model during the build process.

## Quick Solution

### ✅ Recommended: Increase Docker Memory

1. **Open Docker Desktop**
2. Go to **Settings** → **Resources** → **Memory**
3. Set to **8GB minimum** (12GB recommended)
4. Click **Apply & Restart**
5. Build again:

```powershell
docker build --memory=8g --build-arg HF_TOKEN=your_token_here -t sinopsis-worker:gpu .
```

### ✅ Alternative: Use Low-Memory Dockerfile

If you cannot increase Docker memory, use the low-memory build:

```powershell
# Build without pre-downloading model
docker build -f Dockerfile.low-memory --build-arg HF_TOKEN=your_token_here -t sinopsis-worker:gpu .
```

**Note:** With this option, the model will download on first container startup (requires internet).

## Detailed Solutions

### Solution 1: Increase Docker Memory Allocation (Best)

#### Windows (Docker Desktop):
```powershell
# 1. Increase memory in Docker Desktop Settings to 8GB+
# 2. Build with memory flag:
docker build `
  --memory=8g `
  --build-arg CUDA_VERSION=cu128 `
  --build-arg HF_TOKEN=your_hf_token_here `
  -t sinopsis-worker:gpu .
```

#### CPU Version (Uses less memory):
```powershell
docker build `
  --memory=6g `
  --build-arg CUDA_VERSION=cpu `
  --build-arg HF_TOKEN=your_hf_token_here `
  -t sinopsis-worker:cpu .
```

### Solution 2: Use Low-Memory Dockerfile

This skips model pre-download during build:

```powershell
# Build with low-memory Dockerfile
docker build `
  -f Dockerfile.low-memory `
  --build-arg CUDA_VERSION=cu128 `
  --build-arg HF_TOKEN=your_hf_token_here `
  -t sinopsis-worker:gpu .
```

**First Run Will:**
- Download model (~35MB + dependencies)
- Take 5-10 minutes on first startup
- Subsequent starts will be fast

**To persist the cache across container restarts:**
```powershell
# Create volume for model cache
docker volume create hf_cache

# Run with volume mount
docker run -v hf_cache:/opt/huggingface_cache sinopsis-worker:gpu
```

### Solution 3: Pre-download Model Locally

1. **Download model on your local machine:**

```powershell
# Set environment variable
$env:HUGGINGFACE_HUB_TOKEN="your_token_here"
$env:HF_HOME="$PWD\.cache\huggingface"

# Run download script
python download_models.py
```

2. **The model will be cached in:** `.cache\huggingface\`

3. **Modify Dockerfile** to copy the cache (add after line 95):

```dockerfile
# Copy pre-downloaded model cache
COPY --chown=worker:worker .cache/huggingface /opt/huggingface_cache
```

4. **Build the image:**

```powershell
docker build --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
```

## Build Commands Reference

### GPU Build (CUDA 12.8)
```powershell
# With model pre-download (needs 8GB+ Docker memory)
docker build `
  --memory=10g `
  --build-arg CUDA_VERSION=cu128 `
  --build-arg HF_TOKEN=hf_your_token_here `
  -t sinopsis-worker:gpu .

# Without model pre-download (low memory)
docker build `
  -f Dockerfile.low-memory `
  --build-arg CUDA_VERSION=cu128 `
  --build-arg HF_TOKEN=hf_your_token_here `
  -t sinopsis-worker:gpu .
```

### CPU Build
```powershell
# With model pre-download (needs 6GB+ Docker memory)
docker build `
  --memory=8g `
  --build-arg CUDA_VERSION=cpu `
  --build-arg HF_TOKEN=hf_your_token_here `
  -t sinopsis-worker:cpu .

# Without model pre-download (low memory)
docker build `
  -f Dockerfile.low-memory `
  --build-arg CUDA_VERSION=cpu `
  --build-arg HF_TOKEN=hf_your_token_here `
  -t sinopsis-worker:cpu .
```

## Running the Container

### With Pre-downloaded Model
```powershell
docker run --rm sinopsis-worker:gpu
```

### Without Pre-downloaded Model (needs internet + volume)
```powershell
# Create persistent volume
docker volume create hf_cache

# Run with volume mount
docker run `
  -v hf_cache:/opt/huggingface_cache `
  --env-file .env `
  sinopsis-worker:gpu
```

## Verification

### Check if model is cached in image:
```powershell
docker run --rm sinopsis-worker:gpu ls -lah /opt/huggingface_cache
```

Should show:
```
models--pyannote--speaker-diarization-community-1/
```

### Check image size:
```powershell
docker images sinopsis-worker
```

Expected sizes:
- **With model cached:** ~10-12GB
- **Without model:** ~8-10GB

## Troubleshooting

### Build fails with memory error
- ✅ Increase Docker memory to 8GB+
- ✅ Use `Dockerfile.low-memory`
- ✅ Close other applications to free RAM
- ✅ Try CPU build (uses less memory)

### Model not found at runtime
- ✅ Check HF_TOKEN is valid
- ✅ Accept model license: https://huggingface.co/pyannote/speaker-diarization-community-1
- ✅ Use volume mount to persist cache
- ✅ Ensure internet connection on first run

### Container starts slowly
- Normal for first run without pre-downloaded model
- Use volume mount to persist cache
- Rebuild with model pre-download for faster starts

### Out of disk space
- Clean up Docker: `docker system prune -a`
- Use CPU version (smaller)
- Remove unused images

## Getting Your HuggingFace Token

1. Go to: https://huggingface.co/settings/tokens
2. Create a new token (read permission is sufficient)
3. Accept model terms at: https://huggingface.co/pyannote/speaker-diarization-community-1
4. Use token in build command

## Recommended Configuration

| Scenario | Dockerfile | Docker Memory | Notes |
|----------|-----------|---------------|-------|
| **Production GPU** | `Dockerfile` | 10-12GB | Best performance |
| **Development** | `Dockerfile.low-memory` | 4-6GB | Slower first start |
| **Limited RAM** | `Dockerfile.low-memory` | 4GB | Model downloads at runtime |
| **No Internet Runtime** | `Dockerfile` | 10-12GB | Must pre-download |

---

**Need Help?**
- Check `DOCKER_MEMORY_FIX.md` for detailed solutions
- See `UPGRADE_SUMMARY.md` for upgrade details
- Review logs during build for specific errors
