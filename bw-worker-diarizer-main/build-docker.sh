#!/bin/bash

# Optimized Docker Build Script
# Builds smaller images with aggressive cleanup

set -e

BUILD_TYPE=${1:-gpu}
TAG=${2:-v1.1}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "======================================"
echo "Optimized Docker Build"
echo "======================================"
echo ""

# Show current disk usage
echo -e "${BLUE}Current Docker disk usage:${NC}"
sudo docker system df
echo ""

if [ "$BUILD_TYPE" = "gpu" ]; then
    echo -e "${GREEN}Building GPU-enabled image (CUDA 12.8)${NC}"
    echo "Tag: $TAG"
    echo ""
    
    # Enable BuildKit for better layer caching and compression
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
    
    # HF_TOKEN is required for offline operation
    if [ -z "$HF_TOKEN" ]; then
        echo -e "${RED}ERROR: HF_TOKEN environment variable not set!${NC}"
        echo "Please set your HuggingFace token:"
        echo "  export HF_TOKEN=your_hf_token_here"
        echo ""
        echo -e "${YELLOW}⚠ IMPORTANT: HF_TOKEN is required for offline operation!${NC}"
        echo "  Models will be downloaded during build and cached for offline runtime."
        echo "  Without a valid token, the image won't work offline."
        exit 1
    fi

    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Building for OFFLINE runtime (models cached during build)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Starting build (this may take 15-20 minutes)...${NC}"
    echo "  • Phase 1: Installing dependencies"
    echo "  • Phase 2: Downloading PyAnnote models (requires internet)"
    echo "  • Phase 3: Creating final image for offline use"
    echo ""
    
    sudo docker build \
        --build-arg CUDA_VERSION=cu128 \
        --build-arg HF_TOKEN=$HF_TOKEN \
        --tag sinopsis-worker-diarizer:$TAG \
        .
    
    echo ""
    echo -e "${GREEN}✓ GPU build completed${NC}"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Image ready for OFFLINE operation${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo "  • All models cached in image"
    echo "  • No internet required at runtime"
    echo "  • Models loaded from: /opt/huggingface_cache"
    echo ""
    
elif [ "$BUILD_TYPE" = "cpu" ]; then
    echo -e "${YELLOW}Building CPU-only image (Optimized)${NC}"
    echo "Tag: $TAG"
    echo ""
    
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
    
    # HF_TOKEN is required for offline operation
    if [ -z "$HF_TOKEN" ]; then
        echo -e "${RED}ERROR: HF_TOKEN environment variable not set!${NC}"
        echo "Please set your HuggingFace token:"
        echo "  export HF_TOKEN=your_hf_token_here"
        echo ""
        echo -e "${YELLOW}⚠ IMPORTANT: HF_TOKEN is required for offline operation!${NC}"
        echo "  Models will be downloaded during build and cached for offline runtime."
        echo "  Without a valid token, the image won't work offline."
        exit 1
    fi

    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Building for OFFLINE runtime (models cached during build)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Starting build (this may take 12-15 minutes)...${NC}"
    echo "  • Phase 1: Installing dependencies"
    echo "  • Phase 2: Downloading PyAnnote models (requires internet)"
    echo "  • Phase 3: Creating final image for offline use"
    echo ""
    
    sudo docker build \
        --build-arg CUDA_VERSION=cpu \
        --build-arg HF_TOKEN=$HF_TOKEN \
        --tag sinopsis-worker-diarizer:$TAG-cpu \
        .
    
    echo ""
    echo -e "${GREEN}✓ CPU build completed${NC}"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✓ Image ready for OFFLINE operation${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo "  • All models cached in image"
    echo "  • No internet required at runtime"
    echo "  • Models loaded from: /opt/huggingface_cache"
    echo ""
    
else
    echo -e "${RED}Invalid build type: $BUILD_TYPE${NC}"
    echo ""
    echo "Usage: ./build-docker.sh [cpu|gpu] [tag]"
    echo ""
    echo "Examples:"
    echo "  ./build-docker.sh gpu              # Build GPU (CUDA 12.9) with 'latest' tag"
    echo "  ./build-docker.sh gpu v1.0         # Build GPU with custom tag"
    echo "  ./build-docker.sh cpu              # Build CPU-only with 'latest' tag"
    echo "  ./build-docker.sh cpu v1.0         # Build CPU with custom tag"
    exit 1
fi

# Show image sizes
echo ""
echo -e "${BLUE}Image details:${NC}"
sudo docker images sinopsis-worker-diarizer --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"
echo ""

# Show size comparison
CURRENT_SIZE=$(sudo docker images sinopsis-worker-diarizer:$TAG --format "{{.Size}}")
echo -e "${GREEN}Final image size: ${CURRENT_SIZE}${NC}"
echo ""
echo -e "${YELLOW}Expected image sizes:${NC}"
echo "• GPU builds (CUDA): 12-13GB (normal for ML/AI images)"
echo "• CPU builds: 5-6GB"
echo "• Original unoptimized: ~14-15GB"
echo "• Savings: ~1-2GB (GPU), ~8GB (CPU vs GPU)"
echo ""
echo -e "${BLUE}Note:${NC} 12-13GB is normal for GPU builds due to:"
echo "  - CUDA runtime libraries: ~4-5GB"
echo "  - PyTorch + ML dependencies: ~7-8GB"
echo ""

# Cleanup dangling images
echo -e "${BLUE}Cleaning up dangling images...${NC}"
sudo docker image prune -f > /dev/null 2>&1 || true
echo "Done!"
echo ""

# Show final disk usage
echo -e "${BLUE}Docker disk usage after build:${NC}"
sudo docker system df
echo ""

# Run instructions
if [ "$BUILD_TYPE" = "gpu" ]; then
    echo -e "${BLUE}To run with GPU:${NC}"
    echo "  docker run -d --name sinopsis-diarization-worker --gpus all --env-file .env -v \$(pwd)/logs:/app/logs sinopsis-worker-diarizer:$TAG"
else
    echo -e "${BLUE}To run (CPU only):${NC}"
    echo "  docker run -d --name sinopsis-diarization-worker --env-file .env -v \$(pwd)/logs:/app/logs sinopsis-worker-diarizer:$TAG-cpu"
fi
echo ""
