#!/bin/bash

# CUDA/cuDNN Dependency Checker
# Validates CUDA installation, cuDNN libraries, and PyTorch compatibility
# Usage: ./check-cuda.sh

set -e

echo "🔍 Checking CUDA/cuDNN Dependencies..."
echo "========================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if NVIDIA GPU is available
echo -e "${BLUE}1. Checking NVIDIA GPU...${NC}"
if command -v nvidia-smi &> /dev/null; then
    nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader
    echo -e "${GREEN}✅ NVIDIA GPU detected${NC}"
    GPU_AVAILABLE=1
else
    echo -e "${YELLOW}⚠️  nvidia-smi not found. GPU not available or drivers not installed.${NC}"
    echo -e "${YELLOW}   Worker will fall back to CPU mode.${NC}"
    GPU_AVAILABLE=0
fi
echo ""

# Check CUDA installation
echo -e "${BLUE}2. Checking CUDA Toolkit...${NC}"
if command -v nvcc &> /dev/null; then
    CUDA_VERSION=$(nvcc --version | grep "release" | awk '{print $5}' | cut -c2-)
    echo "CUDA Toolkit Version: $CUDA_VERSION"
    echo -e "${GREEN}✅ CUDA Toolkit installed${NC}"
    CUDA_INSTALLED=1
else
    echo -e "${YELLOW}⚠️  nvcc not found. CUDA Toolkit not installed.${NC}"
    CUDA_INSTALLED=0
fi

if [ $GPU_AVAILABLE -eq 1 ]; then
    CUDA_DRIVER_VERSION=$(nvidia-smi | grep "CUDA Version" | awk '{print $9}')
    if [ -n "$CUDA_DRIVER_VERSION" ]; then
        echo "CUDA Driver Version: $CUDA_DRIVER_VERSION"
    fi
fi
echo ""

# Check cuDNN installation
echo -e "${BLUE}3. Checking cuDNN Libraries...${NC}"
CUDNN_FOUND=0

# Check for cuDNN 8
if ldconfig -p | grep -q "libcudnn_ops_infer.so.8"; then
    CUDNN_VERSION=$(ldconfig -p | grep "libcudnn.so.8" | head -n1)
    echo "cuDNN 8: $CUDNN_VERSION"
    echo -e "${GREEN}✅ cuDNN 8 installed${NC}"
    CUDNN_FOUND=1
else
    echo -e "${RED}❌ cuDNN 8 not found${NC}"
fi

# Check for cuDNN 9 (newer)
if ldconfig -p | grep -q "libcudnn_ops_infer.so.9"; then
    CUDNN9_VERSION=$(ldconfig -p | grep "libcudnn.so.9" | head -n1)
    echo "cuDNN 9: $CUDNN9_VERSION"
    echo -e "${YELLOW}⚠️  cuDNN 9 found but pyannote needs cuDNN 8${NC}"
fi

# List all cuDNN libraries found
echo ""
echo "All cuDNN libraries found:"
ldconfig -p | grep libcudnn || echo "  None"
echo ""

# Check PyTorch installation
echo -e "${BLUE}4. Checking PyTorch...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PATH="$(dirname "$SCRIPT_DIR")/venv"

if [ -d "$VENV_PATH" ]; then
    source "$VENV_PATH/bin/activate"
    echo "Virtual environment: $VENV_PATH"
    echo ""
    
    if python -c "import torch" 2>/dev/null; then
        PYTORCH_VERSION=$(python -c "import torch; print(torch.__version__)")
        CUDA_AVAILABLE=$(python -c "import torch; print(torch.cuda.is_available())")
        
        echo "PyTorch Version: $PYTORCH_VERSION"
        echo "CUDA Available in PyTorch: $CUDA_AVAILABLE"
        
        if [ "$CUDA_AVAILABLE" = "True" ]; then
            TORCH_CUDA_VERSION=$(python -c "import torch; print(torch.version.cuda)")
            CUDNN_VERSION=$(python -c "import torch; print(torch.backends.cudnn.version() if torch.cuda.is_available() else 'N/A')")
            GPU_COUNT=$(python -c "import torch; print(torch.cuda.device_count())")
            
            echo "PyTorch CUDA Version: $TORCH_CUDA_VERSION"
            echo "PyTorch cuDNN Version: $CUDNN_VERSION"
            echo "GPU Count: $GPU_COUNT"
            
            if [ "$GPU_COUNT" -gt 0 ]; then
                GPU_NAME=$(python -c "import torch; print(torch.cuda.get_device_name(0))")
                echo "GPU 0: $GPU_NAME"
            fi
            
            echo -e "${GREEN}✅ PyTorch with CUDA support${NC}"
        else
            echo -e "${YELLOW}⚠️  PyTorch installed but CUDA not available${NC}"
        fi
    else
        echo -e "${RED}❌ PyTorch not installed${NC}"
    fi
    
    deactivate
else
    echo -e "${YELLOW}⚠️  Virtual environment not found at $VENV_PATH${NC}"
fi
echo ""

# Check for required cuDNN files specifically
echo -e "${BLUE}5. Checking Required cuDNN Files...${NC}"
REQUIRED_FILES=(
    "libcudnn.so.8"
    "libcudnn_ops_infer.so.8"
    "libcudnn_ops_train.so.8"
    "libcudnn_cnn_infer.so.8"
)

MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
    if ldconfig -p | grep -q "$file"; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file${NC}"
        MISSING_FILES+=("$file")
    fi
done
echo ""

# Summary and recommendations
echo "========================================"
echo -e "${BLUE}📊 SUMMARY${NC}"
echo "========================================"
echo ""

if [ $GPU_AVAILABLE -eq 1 ] && [ $CUDA_INSTALLED -eq 1 ] && [ $CUDNN_FOUND -eq 1 ]; then
    echo -e "${GREEN}✅ All dependencies are satisfied!${NC}"
    echo -e "${GREEN}   Your system is ready for GPU-accelerated inference.${NC}"
    echo ""
    echo "Recommended .env settings:"
    echo "  ASR_DEVICE=cuda"
    echo "  ASR_COMPUTE_TYPE=float16"
elif [ $GPU_AVAILABLE -eq 1 ] && [ $CUDNN_FOUND -eq 0 ]; then
    echo -e "${RED}❌ GPU available but cuDNN 8 is missing!${NC}"
    echo ""
    echo "🔧 FIX: Install cuDNN 8"
    echo ""
    echo "Option 1: Install via apt (Debian/Ubuntu)"
    echo "  sudo apt update"
    echo "  sudo apt install libcudnn8 libcudnn8-dev"
    echo ""
    echo "Option 2: Download from NVIDIA"
    echo "  Visit: https://developer.nvidia.com/cudnn"
    echo "  Download cuDNN 8.x for your CUDA version"
    echo ""
    echo "Option 3: Reinstall PyTorch (includes cuDNN)"
    echo "  source venv/bin/activate"
    echo "  pip uninstall torch torchvision torchaudio -y"
    echo "  pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121"
    echo ""
    echo "Option 4: Use CPU mode (temporary)"
    echo "  Edit .env:"
    echo "  ASR_DEVICE=cpu"
    echo "  ASR_COMPUTE_TYPE=int8"
else
    echo -e "${YELLOW}⚠️  GPU not available. CPU mode will be used.${NC}"
    echo ""
    echo "Recommended .env settings:"
    echo "  ASR_DEVICE=cpu"
    echo "  ASR_COMPUTE_TYPE=int8"
    echo ""
    echo "Note: CPU mode is ~10x slower than GPU mode."
fi
echo ""

# Additional diagnostics
if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Missing cuDNN files:${NC}"
    for file in "${MISSING_FILES[@]}"; do
        echo "   - $file"
    done
    echo ""
fi

# Check LD_LIBRARY_PATH
echo -e "${BLUE}6. Library Search Path...${NC}"
if [ -n "$LD_LIBRARY_PATH" ]; then
    echo "LD_LIBRARY_PATH is set:"
    echo "$LD_LIBRARY_PATH" | tr ':' '\n' | sed 's/^/  /'
else
    echo "LD_LIBRARY_PATH is not set (using system defaults)"
fi
echo ""

# Provide documentation link
echo "========================================"
echo -e "${BLUE}📚 Documentation${NC}"
echo "========================================"
echo ""
echo "For detailed troubleshooting, see:"
echo "  docs/CUDA_CUDNN_FIX.md"
echo ""
echo "Quick links:"
echo "  - NVIDIA cuDNN: https://developer.nvidia.com/cudnn"
echo "  - PyTorch CUDA: https://pytorch.org/get-started/locally/"
echo "  - CUDA Installation: https://docs.nvidia.com/cuda/cuda-installation-guide-linux/"
echo ""

exit 0
