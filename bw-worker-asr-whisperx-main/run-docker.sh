#!/bin/bash

# Accept version parameter, default to "latest"
VERSION=${1:-latest}

echo "Running Docker container with version: $VERSION"
echo "Note: Using CPU-only mode and security options to fix ctranslate2 compatibility"

# Stop and remove existing container if it exists
sudo docker stop sinopsis-worker-asr-container 2>/dev/null || true
sudo docker rm sinopsis-worker-asr-container 2>/dev/null || true

# Run with CPU-only mode to avoid GPU executable stack issues
sudo docker run -d \
    --name sinopsis-worker-asr-container \
    --restart always \
    --env-file .env \
    --security-opt seccomp=unconfined \
    --security-opt apparmor=unconfined \
    --cap-add SYS_PTRACE \
    --ulimit stack=-1:-1 \
    --ulimit memlock=-1:-1 \
    --shm-size=2g \
    -e CT2_FORCE_CPU_ISA=GENERIC \
    -e CT2_USE_EXPERIMENTAL_PACKED_GEMM=OFF \
    -e CT2_COMPUTE_TYPE=int8 \
    -e CUDA_VISIBLE_DEVICES="" \
    -e FORCE_CPU=1 \
    -e OMP_NUM_THREADS=1 \
    sinopsis-worker-asr:$VERSION

echo "Container started in CPU-only mode for maximum compatibility."
echo "Use 'sudo docker logs -f sinopsis-worker-asr-container' to view logs"