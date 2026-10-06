#!/bin/bash

# Optimized Docker Build Script with Model Support
# Builds images with specific WhisperX models

set -e

BUILD_TYPE=${1:-gpu}
MODEL=${2:-tiny}
TAG=${3:-latest}
FORCE_ALIGN=${4:-false}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo "======================================"
echo "Optimized Docker Build with Model Support"
echo "======================================"
echo ""

# Show current disk usage
echo -e "${BLUE}Current Docker disk usage:${NC}"
sudo docker system df
echo ""

if [ "$BUILD_TYPE" = "gpu" ]; then
    echo -e "${GREEN}Building GPU-enabled image (CUDA 12.2)${NC}"
    echo "Model: $MODEL"
    echo "Tag: $TAG"
    echo "Force Align: $FORCE_ALIGN"
    echo ""
    
    # Enable BuildKit for better layer caching and compression
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
    
    echo -e "${YELLOW}Starting build with $MODEL model (this may take 15-30 minutes)...${NC}"
    echo ""
    
    sudo docker build \
        --compress \
        --target runtime \
        --build-arg ASR_MODEL=$MODEL \
        --build-arg ASR_LANGUAGE=id \
        --build-arg FORCE_ALIGN=$FORCE_ALIGN \
        --tag sinopsis-worker-asr:$TAG \
        --tag sinopsis-worker-asr:$MODEL \
        .
    
    echo ""
    echo -e "${GREEN}✓ GPU build completed with $MODEL model${NC}"
    echo ""
    
elif [ "$BUILD_TYPE" = "cpu" ]; then
    echo -e "${YELLOW}Building CPU-only image${NC}"
    echo "Model: $MODEL"
    echo "Tag: $TAG"
    echo "Force Align: $FORCE_ALIGN"
    echo ""
    
    export DOCKER_BUILDKIT=1
    export BUILDKIT_PROGRESS=plain
    
    echo -e "${YELLOW}Starting build with $MODEL model (this may take 10-20 minutes)...${NC}"
    echo ""
    
    sudo docker build \
        --compress \
        --target runtime \
        --build-arg ASR_MODEL=$MODEL \
        --build-arg ASR_LANGUAGE=id \
        --build-arg FORCE_ALIGN=$FORCE_ALIGN \
        --tag sinopsis-worker-asr:$TAG-cpu \
        --tag sinopsis-worker-asr:$MODEL-cpu \
        .
    
    echo ""
    echo -e "${GREEN}✓ CPU build completed with $MODEL model${NC}"
    echo ""
    
else
    echo -e "${RED}Invalid build type: $BUILD_TYPE${NC}"
    echo ""
    echo "Usage: ./build-docker.sh [cpu|gpu] [model] [tag] [force_align]"
    echo ""
    echo "Build Types:"
    echo "  gpu    - GPU-enabled with CUDA 12.2 support"
    echo "  cpu    - CPU-only build"
    echo ""
    echo "Available Models:"
    echo "  tiny      - Fastest, smallest (~39MB)"
    echo "  small     - Balanced speed/accuracy (~244MB)"
    echo "  medium    - Good accuracy (~769MB)"
    echo "  large-v2  - Best accuracy (~1550MB)"
    echo ""
    echo "Force Alignment:"
    echo "  false     - No alignment model (smaller image, segment-level timestamps)"
    echo "  true      - Include Indonesian alignment model (+1.26GB, word-level timestamps)"
    echo ""
    echo "Examples:"
    echo "  ./build-docker.sh gpu                      # GPU with tiny model, no alignment"
    echo "  ./build-docker.sh gpu medium latest false  # GPU with medium model, no alignment"
    echo "  ./build-docker.sh gpu medium latest true   # GPU with medium model + Indonesian alignment"
    echo "  ./build-docker.sh cpu small latest false   # CPU with small model, no alignment"
    echo "  ./build-docker.sh gpu large-v2 prod true   # GPU with large model + alignment"
    exit 1
fi

# Show image sizes
echo ""
echo -e "${BLUE}Image details:${NC}"
sudo docker images sinopsis-worker-asr --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"
echo ""

# Show size comparison
CURRENT_SIZE=$(sudo docker images sinopsis-worker-asr:$TAG --format "{{.Size}}")
echo -e "${GREEN}Final image size: ${CURRENT_SIZE}${NC}"
echo ""
echo -e "${YELLOW}Expected image sizes:${NC}"
if [ "$FORCE_ALIGN" = "true" ]; then
    echo "• GPU builds (CUDA) with alignment: 13-14GB (includes 1.26GB Indonesian model)"
    echo "• CPU builds with alignment: 6-7GB"
else
    echo "• GPU builds (CUDA) without alignment: 12-13GB (standard ML/AI image)"
    echo "• CPU builds without alignment: 5-6GB"
fi
echo "• Original unoptimized: ~14-15GB"
echo "• Alignment model adds: ~1.26GB when enabled"
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
    echo "  docker run -d --name sinopsis-worker-asr --gpus all --env-file .env sinopsis-worker-asr:$TAG"
else
    echo -e "${BLUE}To run (CPU only):${NC}"
    echo "  docker run -d --name sinopsis-worker-asr --env-file .env sinopsis-worker-asr:$TAG-cpu"
fi
echo ""
