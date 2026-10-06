#!/bin/bash
# Service Health Check Script
# Usage: ./helpers/check-service.sh

set -e

echo "======================================"
echo "Sinopsis Worker Service Health Check"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVICE_NAME="sinopsis-worker-asr.service"
INSTALL_DIR="/opt/sinopsis-worker-asr"

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    print_warning "Running as root. This script should be run as the service user."
fi

echo "1. Checking service file..."
if [ -f "/etc/systemd/system/$SERVICE_NAME" ]; then
    print_status 0 "Service file exists"
else
    print_status 1 "Service file NOT found at /etc/systemd/system/$SERVICE_NAME"
    echo "  Run: sudo cp sinopsis-worker-asr.service /etc/systemd/system/"
fi

echo ""
echo "2. Checking installation directory..."
if [ -d "$INSTALL_DIR" ]; then
    print_status 0 "Installation directory exists: $INSTALL_DIR"
else
    print_status 1 "Installation directory NOT found: $INSTALL_DIR"
fi

echo ""
echo "3. Checking virtual environment..."
if [ -f "$INSTALL_DIR/venv/bin/python" ]; then
    print_status 0 "Virtual environment exists"
    PYTHON_VERSION=$($INSTALL_DIR/venv/bin/python --version 2>&1)
    print_info "Python version: $PYTHON_VERSION"
else
    print_status 1 "Virtual environment NOT found"
    echo "  Run: python -m venv $INSTALL_DIR/venv"
fi

echo ""
echo "4. Checking .env file..."
if [ -f "$INSTALL_DIR/.env" ]; then
    print_status 0 ".env file exists"
    
    # Check required variables
    if grep -q "DATABASE_URL=" "$INSTALL_DIR/.env" 2>/dev/null; then
        print_status 0 "DATABASE_URL configured"
    else
        print_status 1 "DATABASE_URL not found in .env"
    fi
    
    if grep -q "RABBITMQ_URL=" "$INSTALL_DIR/.env" 2>/dev/null; then
        print_status 0 "RABBITMQ_URL configured"
    else
        print_status 1 "RABBITMQ_URL not found in .env"
    fi
else
    print_status 1 ".env file NOT found"
    echo "  Run: cp .env.example $INSTALL_DIR/.env && nano $INSTALL_DIR/.env"
fi

echo ""
echo "5. Checking worker.py..."
if [ -f "$INSTALL_DIR/worker.py" ]; then
    print_status 0 "worker.py exists"
else
    print_status 1 "worker.py NOT found"
fi

echo ""
echo "6. Checking system dependencies..."

# Check ffmpeg
if command -v ffmpeg &> /dev/null; then
    print_status 0 "ffmpeg is installed"
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n1)
    print_info "ffmpeg: $FFMPEG_VERSION"
else
    print_status 1 "ffmpeg NOT installed"
    echo "  Run: sudo apt-get install -y ffmpeg"
fi

# Check CUDA/GPU
if command -v nvidia-smi &> /dev/null; then
    print_status 0 "NVIDIA driver is installed"
    GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>&1 | head -n1)
    print_info "GPU: $GPU_INFO"
else
    print_warning "NVIDIA driver not found (will use CPU mode)"
fi

echo ""
echo "7. Checking Python dependencies..."
if [ -f "$INSTALL_DIR/venv/bin/python" ]; then
    # Test critical imports
    if $INSTALL_DIR/venv/bin/python -c "import whisperx" 2>/dev/null; then
        print_status 0 "whisperx module installed"
    else
        print_status 1 "whisperx module NOT installed"
        echo "  Run: $INSTALL_DIR/venv/bin/pip install -r requirements.txt"
    fi
    
    if $INSTALL_DIR/venv/bin/python -c "import torch" 2>/dev/null; then
        print_status 0 "torch module installed"
        TORCH_CUDA=$($INSTALL_DIR/venv/bin/python -c "import torch; print(torch.cuda.is_available())" 2>/dev/null)
        if [ "$TORCH_CUDA" = "True" ]; then
            print_info "PyTorch CUDA: Available"
        else
            print_warning "PyTorch CUDA: Not available (will use CPU)"
        fi
    else
        print_status 1 "torch module NOT installed"
    fi
    
    if $INSTALL_DIR/venv/bin/python -c "import pika" 2>/dev/null; then
        print_status 0 "pika (RabbitMQ) module installed"
    else
        print_status 1 "pika module NOT installed"
    fi
fi

echo ""
echo "8. Checking service dependencies..."

# Check PostgreSQL
if systemctl is-active --quiet postgresql; then
    print_status 0 "PostgreSQL service is running"
else
    print_status 1 "PostgreSQL service is NOT running"
    echo "  Run: sudo systemctl start postgresql"
fi

# Check RabbitMQ
if systemctl is-active --quiet rabbitmq-server; then
    print_status 0 "RabbitMQ service is running"
else
    print_status 1 "RabbitMQ service is NOT running"
    echo "  Run: sudo systemctl start rabbitmq-server"
fi

echo ""
echo "9. Checking service status..."
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    print_status 0 "Service is RUNNING"
    print_info "Uptime: $(systemctl show -p ActiveEnterTimestamp $SERVICE_NAME --value)"
else
    print_status 1 "Service is NOT running"
    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        print_info "Service is enabled (will start on boot)"
    else
        print_warning "Service is not enabled for auto-start"
        echo "  Run: sudo systemctl enable $SERVICE_NAME"
    fi
fi

echo ""
echo "10. Recent service logs (last 10 lines)..."
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null || systemctl is-failed --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "----------------------------------------"
    sudo journalctl -u "$SERVICE_NAME" -n 10 --no-pager 2>/dev/null || echo "Cannot access logs (need sudo)"
    echo "----------------------------------------"
else
    print_info "Service not started yet, no logs available"
fi

echo ""
echo "======================================"
echo "Summary"
echo "======================================"

# Overall health check
ISSUES=0

[ ! -f "/etc/systemd/system/$SERVICE_NAME" ] && ISSUES=$((ISSUES+1))
[ ! -d "$INSTALL_DIR" ] && ISSUES=$((ISSUES+1))
[ ! -f "$INSTALL_DIR/venv/bin/python" ] && ISSUES=$((ISSUES+1))
[ ! -f "$INSTALL_DIR/.env" ] && ISSUES=$((ISSUES+1))
[ ! -f "$INSTALL_DIR/worker.py" ] && ISSUES=$((ISSUES+1))
! command -v ffmpeg &> /dev/null && ISSUES=$((ISSUES+1))

if [ $ISSUES -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Service commands:"
    echo "  Start:   sudo systemctl start $SERVICE_NAME"
    echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
    echo "  Restart: sudo systemctl restart $SERVICE_NAME"
    echo "  Status:  sudo systemctl status $SERVICE_NAME"
    echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
else
    echo -e "${RED}✗ Found $ISSUES issue(s)${NC}"
    echo "Please fix the issues above before starting the service."
fi

echo ""
