# Offline Mode - Quick Reference

## TL;DR

```bash
# 1. Build with internet (downloads models)
export HF_TOKEN=your_hf_token_here
./build-docker.sh gpu

# 2. Verify offline works
./verify-offline.sh

# 3. Run without internet
docker run --network=none sinopsis-worker-diarizer:latest
```

## Key Points

✅ **Models downloaded during build** - Not at runtime  
✅ **No internet needed at runtime** - All files cached  
✅ **Works with `--network=none`** - Complete isolation  
✅ **Automatic offline mode** - Enabled via environment variables

## Environment Variables

### Build Phase (Dockerfile)

```dockerfile
ENV HF_HOME=/opt/huggingface_cache
ENV HF_HUB_OFFLINE=0  # Allow downloads
```

### Runtime Phase (Dockerfile)

```dockerfile
ENV HF_HOME=/opt/huggingface_cache
ENV HF_HUB_OFFLINE=1  # Force offline
ENV TRANSFORMERS_OFFLINE=1
ENV HF_DATASETS_OFFLINE=1
```

## Build Arguments

| Argument       | Required | Default | Purpose                             |
| -------------- | -------- | ------- | ----------------------------------- |
| `HF_TOKEN`     | ✅ Yes   | None    | Download models during build        |
| `CUDA_VERSION` | No       | `cu128` | `cu128` for GPU, `cpu` for CPU-only |

## Build Examples

```bash
# GPU with your token
docker build --build-arg HF_TOKEN=hf_xxx -t worker:gpu .

# CPU with your token
docker build --build-arg CUDA_VERSION=cpu --build-arg HF_TOKEN=hf_xxx -t worker:cpu .

# Using build script
export HF_TOKEN=hf_xxx
./build-docker.sh gpu
```

## Run Examples

```bash
# With network (still uses cache)
docker run sinopsis-worker-diarizer:latest

# Without network (fully isolated)
docker run --network=none sinopsis-worker-diarizer:latest

# Test offline capability
docker run --rm --network=none sinopsis-worker-diarizer:latest python -c "from processors.diarizer import SpeakerDiarizer; print('OK')"
```

## Verification Commands

```bash
# Check cache exists
docker run --rm sinopsis-worker-diarizer:latest ls /opt/huggingface_cache

# Check offline env vars
docker run --rm sinopsis-worker-diarizer:latest env | grep OFFLINE

# Full verification
./verify-offline.sh sinopsis-worker-diarizer:latest
```

## Troubleshooting

### ❌ Connection errors at runtime

**Problem**: Container tries to download models at runtime  
**Solution**: Rebuild with valid `HF_TOKEN`:

```bash
export HF_TOKEN=hf_your_valid_token
docker build --no-cache --build-arg HF_TOKEN=$HF_TOKEN -t worker:gpu .
```

### ❌ Models not found

**Problem**: Cache directory empty  
**Check**: Build logs for download errors

```bash
docker build --progress=plain --build-arg HF_TOKEN=hf_xxx . 2>&1 | tee build.log
grep -i "error\|failed" build.log
```

### ❌ Permission errors

**Problem**: Can't access cache directory  
**Solution**: Check ownership in Dockerfile

```dockerfile
COPY --from=builder --chown=worker:worker /opt/huggingface_cache /opt/huggingface_cache
```

## File Locations

| Path                                                                       | Purpose               | Size   |
| -------------------------------------------------------------------------- | --------------------- | ------ |
| `/opt/huggingface_cache`                                                   | Model cache directory | ~2-3GB |
| `/opt/huggingface_cache/models--pyannote--speaker-diarization-community-1` | Main model            | ~500MB |
| `/opt/huggingface_cache/models--pyannote--segmentation`                    | Segmentation model    | ~100MB |
| `/opt/huggingface_cache/models--pyannote--embedding`                       | Embedding model       | ~100MB |

## Code Changes

### In `processors/diarizer.py`

```python
# Before (online only)
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-community-1",
    token=token
)

# After (offline capable)
offline_mode = os.environ.get('HF_HUB_OFFLINE', '0') == '1'
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-community-1",
    token=token,
    local_files_only=offline_mode  # Uses cache when True
)
```

### In `download_models.py`

```python
# Download during build
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-community-1",
    token=hf_token,
    cache_dir=hf_home,
    local_files_only=False  # Allow downloads
)
```

## Best Practices

1. **Always test offline** after building:

   ```bash
   ./verify-offline.sh
   ```

2. **Don't commit tokens** to git:

   ```bash
   export HF_TOKEN=xxx  # Use environment variable
   # Not: --build-arg HF_TOKEN=xxx in Dockerfile
   ```

3. **Version your images**:

   ```bash
   docker tag worker:latest worker:gpu-offline-v1.0
   ```

4. **Document your build** process:
   ```bash
   echo "Built with PyAnnote 4.0.1" > VERSION.txt
   ```

## Performance Impact

| Metric          | Build Time | Image Size | Runtime | Startup         |
| --------------- | ---------- | ---------- | ------- | --------------- |
| Before (online) | 10 min     | 10GB       | -       | +30s (download) |
| After (offline) | 15 min     | 13GB       | Same    | Faster (-30s)   |

## Security Notes

- ✅ Token only used during build
- ✅ Token not stored in final image
- ✅ No credentials needed at runtime
- ✅ No network access required
- ✅ Airgapped deployment ready

## Related Documentation

- [OFFLINE_RUNTIME.md](OFFLINE_RUNTIME.md) - Complete guide
- [OFFLINE_BUILD.md](OFFLINE_BUILD.md) - Build process details
- [DOCKER.md](DOCKER.md) - Docker configuration
- [DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md) - Common issues
