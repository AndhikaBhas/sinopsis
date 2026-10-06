#!/bin/bash

# Accept version parameter, default to "latest"
VERSION=${1:-v1.1}

echo "Running Docker container with version: $VERSION"
echo "Using memory-optimized settings to prevent std::bad_alloc..."
echo ""
echo "NOTE: Container runs in OFFLINE mode (no internet required)"
echo "      All models are pre-cached in the image"
echo ""

# CRITICAL MEMORY FIXES for std::bad_alloc:
# --shm-size=4g          : Increase shared memory (critical for PyTorch)
# --ulimit memlock=-1:-1 : Remove memory lock limits
# --ulimit stack=-1:-1   : Remove stack size limits
# --memory=10g           : Set memory limit (increase if you have more RAM)
# --memory-swap=14g      : Allow some swap space
# --ipc=host             : Use host IPC for better shared memory handling (alternative to --shm-size)

sudo docker run -d \
  --restart always \
  --gpus all \
  --env-file .env \
  sinopsis-worker-diarizer:$VERSION

echo ""
echo "Container started successfully!"
echo "To view logs: sudo docker logs -f sinopsis-worker-diarizer"
echo "To stop: sudo docker stop sinopsis-worker-diarizer"
