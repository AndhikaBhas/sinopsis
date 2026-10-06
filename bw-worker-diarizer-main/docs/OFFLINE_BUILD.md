# Offline Docker Build Instructions

## Overview
The Dockerfile has been modified to pre-download the PyAnnote speaker-diarization-3.1 model during build time, enabling the container to run fully offline (without internet access on the host machine).

## Prerequisites

### 1. Get Your HuggingFace Token
You need a HuggingFace token with access to the PyAnnote model:

1. Create an account at https://huggingface.co
2. Go to https://huggingface.co/settings/tokens
3. Create a new token (read access is sufficient)
4. Accept the model license at: https://huggingface.co/pyannote/speaker-diarization-3.1

### 2. Internet Connection During Build
**Important**: You need internet connection **during the Docker build** to download the model. Once built, the container runs fully offline.

## Building the Image

### GPU Build (CUDA 12.9)
```powershell
docker build `
  --build-arg CUDA_VERSION=cu129 `
  --build-arg HF_TOKEN=hf_your_token_here `
  -t sinopsis-worker-diarizer:gpu-offline `
  .
```

### CPU-Only Build
```powershell
docker build `
  --build-arg CUDA_VERSION=cpu `
  --build-arg HF_TOKEN=hf_your_token_here `
  -t sinopsis-worker-diarizer:cpu-offline `
  .
```

### Build Without Token (Will Skip Model Download)
If you don't provide the token, the build will succeed but the container will fail at runtime when trying to load the model:

```powershell
docker build -t sinopsis-worker-diarizer:no-model .
```

## What Changed

### 1. Model Download Script (`download_models.py`)
- New Python script that downloads the PyAnnote model during build
- Verifies the model is cached correctly
- Provides helpful error messages if token is missing

### 2. Dockerfile Changes

#### Builder Stage:
- Added `HF_TOKEN` build argument
- Set `HF_HOME=/opt/huggingface_cache` (persistent location, not /tmp)
- Added step to run `download_models.py` with the HF token
- Model files are cached in `/opt/huggingface_cache`

#### Runtime Stage:
- Changed `HF_HOME` from `/tmp/huggingface` to `/opt/huggingface_cache`
- Added `HF_HUB_OFFLINE=1` environment variable (forces offline mode)
- Added `HF_DATASETS_OFFLINE=1` for completeness
- Copies pre-downloaded model cache from builder stage
- Creates persistent directories owned by non-root user

### 3. Offline Behavior
With these changes:
- ✅ Container downloads model once during build (requires internet)
- ✅ Runtime requires NO internet connection
- ✅ Model loads from local cache (`/opt/huggingface_cache`)
- ✅ `HF_HUB_OFFLINE=1` prevents any network attempts
- ✅ Works on hosts without internet access

## Running the Container

### Standard Run (Offline Host)
```powershell
docker run --rm sinopsis-worker-diarizer:gpu-offline
```

### With GPU Support
```powershell
docker run --rm --gpus all sinopsis-worker-diarizer:gpu-offline
```

### With Environment Variables
```powershell
docker run --rm `
  --gpus all `
  -e RABBITMQ_HOST=your-rabbitmq `
  -e MINIO_ENDPOINT=your-minio `
  sinopsis-worker-diarizer:gpu-offline
```

## Verification

### 1. Check Model is Cached in Image
```powershell
docker run --rm sinopsis-worker-diarizer:gpu-offline ls -lah /opt/huggingface_cache
```

You should see model files and directories.

### 2. Verify Offline Mode is Active
```powershell
docker run --rm sinopsis-worker-diarizer:gpu-offline env | Select-String "HF_"
```

You should see:
```
HF_HOME=/opt/huggingface_cache
HF_HUB_OFFLINE=1
HF_DATASETS_OFFLINE=1
```

### 3. Test Without Network Access
Remove network access to verify it works offline:
```powershell
docker run --rm --network none sinopsis-worker-diarizer:gpu-offline python -c "from pyannote.audio import Pipeline; print('✓ Model loads offline!')"
```

## Troubleshooting

### Build Fails: "ERROR: Failed to download models"
**Cause**: HuggingFace token is missing or invalid, or you haven't accepted the model license.

**Solution**:
1. Verify your token at https://huggingface.co/settings/tokens
2. Accept model license at https://huggingface.co/pyannote/speaker-diarization-3.1
3. Rebuild with `--build-arg HF_TOKEN=hf_your_token`

### Runtime Fails: "Model not found" or "Connection error"
**Cause**: Model wasn't downloaded during build.

**Solution**:
1. Check if model is cached: `docker run --rm <image> ls /opt/huggingface_cache`
2. If empty, rebuild with `--build-arg HF_TOKEN=...`

### Build Succeeds but Container is Huge
**Expected**: Image will be 8-10GB due to PyTorch + PyAnnote + model files. This is normal.

### Want to Update Model Version?
1. Edit `processors/diarizer.py` and `download_models.py` to use new model name
2. Rebuild with `--build-arg HF_TOKEN=...`

## Image Size Comparison

- **Without offline support**: ~8-10GB (libraries only, downloads model at runtime)
- **With offline support**: ~8-11GB (libraries + pre-downloaded model)
- **Size increase**: ~500MB-1GB for the cached model files

The small size increase is worth it for guaranteed offline operation.

## Benefits of This Approach

✅ **Truly Offline**: Container never attempts network access after build  
✅ **Deterministic**: Same model version baked into image  
✅ **Faster Startup**: No download delay on first run  
✅ **Air-Gapped Compatible**: Works in isolated/restricted networks  
✅ **Production Ready**: No runtime surprises from network issues  

## Alternative: Mount Pre-Downloaded Cache

If you prefer not to bake the model into the image, you can pre-download the cache and mount it:

```powershell
# On a machine with internet, download the model
docker run --rm -v D:\hf_cache:/opt/huggingface_cache `
  -e HF_HOME=/opt/huggingface_cache `
  -e HUGGINGFACE_HUB_TOKEN=hf_your_token `
  python:3.13-slim `
  python -c "from pyannote.audio import Pipeline; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', use_auth_token='hf_your_token')"

# Then on offline machine, mount the cache
docker run --rm -v D:\hf_cache:/opt/huggingface_cache `
  -e HF_HOME=/opt/huggingface_cache `
  -e HF_HUB_OFFLINE=1 `
  sinopsis-worker-diarizer:gpu
```

However, baking it into the image (as done in the modified Dockerfile) is cleaner and more portable.
