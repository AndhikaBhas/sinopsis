#!/bin/bash
# Quick Fix Script for ffmpeg Error
# Run this on your Debian 12 server if you get "ffmpeg not found" error

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================"
echo "FFmpeg Installation & Service Fix"
echo "========================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root${NC}"
    echo "Run: sudo ./helpers/fix-ffmpeg.sh"
    exit 1
fi

# Step 1: Check if ffmpeg is already installed
echo -e "${BLUE}Step 1:${NC} Checking for ffmpeg..."
if command -v ffmpeg &> /dev/null; then
    FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n1)
    echo -e "${GREEN}✓${NC} ffmpeg is already installed"
    echo "  Version: $FFMPEG_VERSION"
    echo "  Location: $(which ffmpeg)"
else
    echo -e "${YELLOW}⚠${NC} ffmpeg not found"
    
    # Step 2: Install ffmpeg
    echo ""
    echo -e "${BLUE}Step 2:${NC} Installing ffmpeg..."
    
    # Detect OS
    if [ -f /etc/debian_version ]; then
        echo "Detected Debian/Ubuntu system"
        apt-get update -qq
        apt-get install -y ffmpeg
    elif [ -f /etc/redhat-release ]; then
        echo "Detected RedHat/CentOS system"
        yum install -y ffmpeg
    else
        echo -e "${RED}✗${NC} Unknown OS. Please install ffmpeg manually."
        exit 1
    fi
    
    # Verify installation
    if command -v ffmpeg &> /dev/null; then
        echo -e "${GREEN}✓${NC} ffmpeg installed successfully"
        FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -n1)
        echo "  Version: $FFMPEG_VERSION"
    else
        echo -e "${RED}✗${NC} ffmpeg installation failed"
        exit 1
    fi
fi

# Step 3: Update systemd service
echo ""
echo -e "${BLUE}Step 3:${NC} Updating systemd service configuration..."

SERVICE_FILE="/etc/systemd/system/sinopsis-worker-asr.service"
INSTALL_DIR="/opt/sinopsis-worker-asr"

if [ -f "$SERVICE_FILE" ]; then
    echo "Found service file at: $SERVICE_FILE"
    
    # Check if PATH is already updated
    if grep -q "PATH=.*:/usr/bin:/bin" "$SERVICE_FILE"; then
        echo -e "${GREEN}✓${NC} Service PATH already includes system binaries"
    else
        echo -e "${YELLOW}⚠${NC} Service PATH needs update"
        
        # Backup existing service file
        cp "$SERVICE_FILE" "${SERVICE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        echo "  Backup created: ${SERVICE_FILE}.backup.*"
        
        # Copy new service file
        if [ -f "$INSTALL_DIR/sinopsis-worker-asr.service" ]; then
            cp "$INSTALL_DIR/sinopsis-worker-asr.service" "$SERVICE_FILE"
            echo -e "${GREEN}✓${NC} Service file updated"
        else
            echo -e "${RED}✗${NC} Source service file not found at: $INSTALL_DIR/sinopsis-worker-asr.service"
            exit 1
        fi
    fi
    
    # Reload systemd
    echo "  Reloading systemd daemon..."
    systemctl daemon-reload
    echo -e "${GREEN}✓${NC} Systemd daemon reloaded"
else
    echo -e "${YELLOW}⚠${NC} Service file not found. Installing..."
    
    if [ -f "$INSTALL_DIR/sinopsis-worker-asr.service" ]; then
        cp "$INSTALL_DIR/sinopsis-worker-asr.service" "$SERVICE_FILE"
        chmod 644 "$SERVICE_FILE"
        systemctl daemon-reload
        echo -e "${GREEN}✓${NC} Service file installed"
    else
        echo -e "${RED}✗${NC} Cannot find service file at: $INSTALL_DIR/sinopsis-worker-asr.service"
        exit 1
    fi
fi

# Step 4: Test ffmpeg accessibility
echo ""
echo -e "${BLUE}Step 4:${NC} Testing ffmpeg accessibility..."

# Test as service user
SERVICE_USER=$(grep "^User=" "$SERVICE_FILE" | cut -d'=' -f2)
if [ -n "$SERVICE_USER" ]; then
    echo "Testing as user: $SERVICE_USER"
    
    if su - "$SERVICE_USER" -c "which ffmpeg" &> /dev/null; then
        FFMPEG_PATH=$(su - "$SERVICE_USER" -c "which ffmpeg")
        echo -e "${GREEN}✓${NC} ffmpeg accessible to service user"
        echo "  Path: $FFMPEG_PATH"
    else
        echo -e "${RED}✗${NC} ffmpeg not accessible to service user"
        echo "  This may indicate a PATH issue"
    fi
fi

# Step 5: Restart service if running
echo ""
echo -e "${BLUE}Step 5:${NC} Service restart..."

if systemctl is-active --quiet sinopsis-worker-asr.service; then
    echo "Service is running. Restarting..."
    systemctl restart sinopsis-worker-asr.service
    sleep 2
    
    if systemctl is-active --quiet sinopsis-worker-asr.service; then
        echo -e "${GREEN}✓${NC} Service restarted successfully"
    else
        echo -e "${RED}✗${NC} Service failed to start"
        echo ""
        echo "Recent logs:"
        journalctl -u sinopsis-worker-asr.service -n 20 --no-pager
        exit 1
    fi
else
    echo "Service is not running. Start it with:"
    echo "  sudo systemctl start sinopsis-worker-asr.service"
fi

# Summary
echo ""
echo "========================================"
echo -e "${GREEN}Fix Complete!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Start service: sudo systemctl start sinopsis-worker-asr.service"
echo "2. Check status: sudo systemctl status sinopsis-worker-asr.service"
echo "3. View logs: sudo journalctl -u sinopsis-worker-asr.service -f"
echo ""
echo "The service should now be able to find and use ffmpeg."
echo ""
