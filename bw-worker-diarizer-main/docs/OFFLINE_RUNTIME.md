# Offline Runtime Configuration

This document explains how the Docker image is configured to work without internet connection at runtime.

## Overview

The Docker image is built in two phases:

1. **Build Phase** (requires internet): Downloads all models and dependencies
2. **Runtime Phase** (offline): Uses cached models from the build phase

## How It Works

### 1. Build Phase Configuration

During `docker build`, the following happens:

```dockerfile
# Set cache directories
ENV HF_HOME=/opt/huggingface_cache
ENV TRANSFORMERS_CACHE=/opt/huggingface_cache
ENV HF_HUB_OFFLINE=0  # Allow downloads during build

# Download models
COPY download_models.py /tmp/download_models.py
RUN python /tmp/download_models.py
```

The `download_models.py` script:

- Uses your HuggingFace token to authenticate
- Downloads `pyannote/speaker-diarization-community-1` model
- Caches all files to `/opt/huggingface_cache`
- Downloads all dependent models (segmentation, embedding, etc.)

### 2. Runtime Phase Configuration

At runtime, the container is configured for offline operation:

```dockerfile
# Force offline mode at runtime
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1
ENV HF_DATASETS_OFFLINE=1
```

The application code (`processors/diarizer.py`):

```python
# Check if running in offline mode
offline_mode = os.environ.get('HF_HUB_OFFLINE', '0') == '1'

# Load pipeline with local_files_only flag
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-community-1",
    token=token,
    local_files_only=offline_mode  # Forces use of cached files only
)
```

## Building the Image

### Prerequisites

1. Accept the model license:

   - Visit https://huggingface.co/pyannote/speaker-diarization-community-1
   - Accept the user conditions

2. Get your HuggingFace token:
   - Visit https://huggingface.co/settings/tokens
   - Create a token with read access

### Build Command

```bash
# GPU version (CUDA 12.8)
docker build \
  --build-arg CUDA_VERSION=cu128 \
  --build-arg HF_TOKEN=hf_your_token_here \
  -t sinopsis-worker:gpu .

# CPU version
docker build \
  --build-arg CUDA_VERSION=cpu \
  --build-arg HF_TOKEN=hf_your_token_here \
  -t sinopsis-worker:cpu .
```

**Important**: The HF_TOKEN is only needed during build time. It's not stored in the final image.

## Running the Container (Offline)

Once built, the container can run without internet:

```bash
# Run without network access
docker run --network=none sinopsis-worker:gpu

# Or with limited network (only to specific services)
docker run sinopsis-worker:gpu
```

The container will:

1. Read `HF_HUB_OFFLINE=1` environment variable
2. Load models from `/opt/huggingface_cache`
3. Never attempt to connect to huggingface.co

## Verification

To verify the offline setup works:

### During Build

Check the build output for:

```
✓ Model downloaded successfully!
✓ Cached to: /opt/huggingface_cache
✓ Model cache verified: models--pyannote--speaker-diarization-community-1 found
```

### At Runtime

Check the container logs for:

```
INFO - Running in OFFLINE mode - using cached models only
INFO - Loading PyAnnote model...
INFO - Model loaded successfully
```

If you see connection errors, the models weren't properly cached during build.

## Troubleshooting

### Issue: Connection errors at runtime

**Cause**: Models weren't downloaded during build phase

**Solution**:

1. Ensure you provided a valid HF_TOKEN during build
2. Check you have internet connection during build
3. Verify you accepted the model license
4. Rebuild with `--no-cache` flag:
   ```bash
   docker build --no-cache --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
   ```

### Issue: Build fails with memory error

**Cause**: Not enough memory allocated to Docker

**Solution**:

1. Increase Docker memory limit to 8GB+
2. Or use the memory limit flag:
   ```bash
   docker build --memory=8g --build-arg HF_TOKEN=your_token -t sinopsis-worker:gpu .
   ```

### Issue: Model files missing after build

**Cause**: Download script failed silently

**Solution**:

1. Check build logs carefully for errors
2. Manually verify cache directory in built image:
   ```bash
   docker run --rm sinopsis-worker:gpu ls -la /opt/huggingface_cache
   ```
3. Should see `models--pyannote--speaker-diarization-community-1` directory

## Cache Structure

The cache directory structure looks like:

```
/opt/huggingface_cache/
├── models--pyannote--speaker-diarization-community-1/
│   ├── blobs/
│   ├── refs/
│   └── snapshots/
├── models--pyannote--segmentation/
│   └── ...
└── models--pyannote--embedding/
    └── ...
```

All these directories are copied from the builder stage to the runtime stage.

## Environment Variables Reference

| Variable                | Build Phase              | Runtime Phase            | Purpose                      |
| ----------------------- | ------------------------ | ------------------------ | ---------------------------- |
| `HF_HOME`               | `/opt/huggingface_cache` | `/opt/huggingface_cache` | Main cache directory         |
| `TRANSFORMERS_CACHE`    | `/opt/huggingface_cache` | `/opt/huggingface_cache` | Transformers cache location  |
| `HF_HUB_OFFLINE`        | `0` (allow downloads)    | `1` (force offline)      | HuggingFace Hub offline mode |
| `TRANSFORMERS_OFFLINE`  | `0`                      | `1`                      | Transformers offline mode    |
| `HF_DATASETS_OFFLINE`   | `0`                      | `1`                      | Datasets offline mode        |
| `HUGGINGFACE_HUB_TOKEN` | From `--build-arg`       | From config/env          | Authentication token         |

## Best Practices

1. **Always test offline mode** after building:

   ```bash
   docker run --network=none sinopsis-worker:gpu python -c "from processors.diarizer import SpeakerDiarizer; print('OK')"
   ```

2. **Don't commit tokens** to version control

   - Use `--build-arg` to pass token during build
   - Or use Docker secrets

3. **Version your images** with model versions:

   ```bash
   docker tag sinopsis-worker:gpu sinopsis-worker:gpu-pyannote4.0.1
   ```

4. **Document your build** process in CI/CD pipelines

## Security Notes

- The HF_TOKEN is only used during build and is not stored in the final image
- At runtime, the token in config/environment is used for logging purposes only
- The cached models are stored in the image (increases image size by ~2-3GB)
- No credentials are needed at runtime for model loading

## Performance Impact

- **Build time**: Increased by ~5-10 minutes (model download)
- **Image size**: Increased by ~2-3GB (cached models)
- **Runtime**: No performance impact, may be slightly faster (no network latency)
- **Startup**: Faster (no model download wait)

## Related Documentation

- [OFFLINE_BUILD.md](OFFLINE_BUILD.md) - Complete offline build guide
- [OFFLINE_QUICK_REF.md](OFFLINE_QUICK_REF.md) - Quick reference commands
- [GPU_QUICKSTART.md](GPU_QUICKSTART.md) - GPU setup guide
- [DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md) - Common issues
