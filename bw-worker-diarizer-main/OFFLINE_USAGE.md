# Docker Image Offline Usage Guide

## Current Status

Your Docker images can run offline, but require an **initial run with internet** to download PyAnnote models from HuggingFace.

## How It Works

### 1. **First Run (Requires Internet)**
```bash
./run-docker.sh v1.1-offline
# Or explicitly:
./run-docker.sh v1.1-offline false
```

This will:
- Start the container with internet access enabled (`HF_HUB_OFFLINE=0`)
- Download required PyAnnote models from HuggingFace (~2-3GB)
- Cache models inside the **container** (not the image)
- Start processing jobs

**Check logs to confirm model download:**
```bash
sudo docker logs -f sinopsis-worker-diarizer | grep "Model loaded"
```

You should see: `Model loaded successfully`

### 2. **Create Offline-Ready Image (After First Run)**

Once models are downloaded, create a new image from the running container:

```bash
# Stop current container (optional)
sudo docker stop sinopsis-worker-diarizer

# Create new image with cached models
sudo docker commit sinopsis-worker-diarizer sinopsis-worker-diarizer:offline-ready

# Verify new image
sudo docker images | grep sinopsis-worker-diarizer
```

### 3. **Run in True Offline Mode**

Now you can run the new image without internet:

```bash
# Remove old container first
sudo docker rm sinopsis-worker-diarizer

# Run in offline mode
./run-docker.sh offline-ready true
```

This sets `HF_HUB_OFFLINE=1` and will work without internet!

## Alternative: Build with Pre-Cached Models

The Dockerfile is configured to download models during build, but this requires:
1. **Stable internet** (downloads ~2-3GB of models)
2. **Valid HuggingFace token** with accepted model license
3. **Time** (15-30 minutes depending on internet speed)

```bash
# Ensure you have the token
export HF_TOKEN="your_huggingface_token_here"

# Build (takes 15-30 minutes)
./build-docker.sh gpu v1.2-offline

# Run immediately in offline mode
./run-docker.sh v1.2-offline true
```

## Quick Reference

| Command | Purpose |
|---------|---------|
| `./run-docker.sh v1.1-offline` | Run with internet (first time) |
| `./run-docker.sh v1.1-offline false` | Explicitly enable internet |
| `./run-docker.sh offline-ready true` | Run in pure offline mode |
| `sudo docker commit <container> <new-image>` | Save container as image |
| `sudo docker logs -f sinopsis-worker-diarizer` | View logs |

## Troubleshooting

### Models Not Found Error
```
LocalEntryNotFoundError: Cannot find the requested files in the local cache
```

**Solution:** Run with internet first:
```bash
sudo docker rm sinopsis-worker-diarizer
./run-docker.sh v1.1-offline false
```

### Build Interrupted
If Docker build keeps getting interrupted:
1. Use the "commit container" approach instead
2. Run container with internet once
3. Commit to new image
4. Use that image for offline operation

### Check if Models are Cached

Run this inside the container:
```bash
sudo docker exec sinopsis-worker-diarizer ls -la /opt/huggingface_cache/
```

You should see: `models--pyannote--speaker-diarization-community-1`

## Summary

✅ **Recommended Approach:**
1. Run container with internet once → Models download
2. Commit container to image → Models baked in
3. Use committed image offline → No internet needed

✅ **Alternative (if you have stable internet):**
1. Build image with models pre-cached
2. Use directly offline

Both approaches result in a truly offline-capable image!
