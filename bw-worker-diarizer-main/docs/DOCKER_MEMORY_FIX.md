# Docker Build Memory Issue Fix

## Problem
When building the Docker image, you may encounter a `std::bad_alloc` error during model download. This happens because Docker is running out of memory.

```
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
Aborted (core dumped)
```

## Solution Options

### Option 1: Increase Docker Memory (Recommended)

#### On Docker Desktop (Windows/Mac):
1. Open Docker Desktop
2. Go to **Settings** > **Resources** > **Memory**
3. Increase memory allocation to **8GB or more** (12GB recommended)
4. Click **Apply & Restart**
5. Rebuild the image

#### On Linux:
Docker uses system memory directly. Ensure your system has at least 8GB available RAM.

#### Via Command Line:
```bash
# Build with explicit memory limit
docker build --memory=8g --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
```

### Option 2: Build Without Model Pre-download

If you cannot increase Docker memory, you can build without pre-downloading the model. The model will be downloaded on first run instead.

#### Modify Dockerfile:
Comment out or skip the model download section in the Dockerfile:

```dockerfile
# Download PyAnnote models for offline use
# SKIP THIS STEP if you have memory constraints
# Model will be downloaded on first container run instead
# COPY download_models.py /tmp/download_models.py
# RUN export HUGGINGFACE_HUB_TOKEN="${HF_TOKEN}" && \
#     python /tmp/download_models.py ...
```

Then build normally:
```bash
docker build --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
```

**Important:** With this option, the container will download the model on first run, which requires:
- Internet connection at runtime
- ~5-10 minutes on first startup
- The model will be cached for subsequent runs if you use volumes

### Option 3: Download Model Manually and Copy

1. **Download the model locally first:**

```bash
python download_models.py
```

This creates the cache in `~/.cache/huggingface` (Windows: `C:\Users\YourName\.cache\huggingface`)

2. **Modify Dockerfile to copy pre-downloaded cache:**

Replace the download section with:

```dockerfile
# Copy pre-downloaded model cache instead of downloading during build
COPY --chown=worker:worker .cache/huggingface /opt/huggingface_cache
```

3. **Build the image:**

```bash
docker build --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
```

### Option 4: Use Docker BuildKit with Better Memory Management

Enable BuildKit for improved resource handling:

```bash
# Linux/Mac
DOCKER_BUILDKIT=1 docker build --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
```

## Recommended Build Configuration

### For Development/Testing:
```bash
# CPU version with 8GB memory
docker build --memory=8g --build-arg CUDA_VERSION=cpu --build-arg HF_TOKEN=your_token -t sinopsis-worker:cpu .
```

### For Production (GPU):
```bash
# GPU version with 12GB memory
docker build --memory=12g --build-arg CUDA_VERSION=cu128 --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
```

## Verification

After building, verify the model was cached:

```bash
# Check if model is in the image
docker run --rm sinopsis-worker:gpu ls -lah /opt/huggingface_cache

# Should show:
# models--pyannote--speaker-diarization-community-1/
```

## Runtime Configuration

If you skipped model pre-download, ensure the container has:

1. **Internet access** on first run
2. **Volume mount** to persist the cache:

```bash
docker run -v huggingface_cache:/opt/huggingface_cache sinopsis-worker:gpu
```

## Troubleshooting

### Build still fails with memory error
- Close other applications to free up RAM
- Restart Docker Desktop
- Try Option 2 or 3 (skip pre-download)
- Consider building on a machine with more RAM

### Model not found at runtime
- Ensure HF_TOKEN was provided during build
- Check that you accepted the model license at: https://huggingface.co/pyannote/speaker-diarization-community-1
- Use volume mount to persist downloads

### Slow first startup
- This is normal if model wasn't pre-downloaded
- Subsequent starts will be fast as model is cached
- Use volume mount to preserve cache across container recreations

## Quick Reference

| Issue | Solution |
|-------|----------|
| Memory error during build | Increase Docker memory to 8GB+ |
| Can't increase memory | Skip model pre-download (Option 2) |
| No internet at runtime | Must use Option 1 or 3 |
| Slow builds | Use Option 3 (manual download) |
| Limited disk space | Use CPU version (smaller) |

---

**Last Updated:** October 18, 2025
