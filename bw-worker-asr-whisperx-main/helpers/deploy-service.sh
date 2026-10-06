#!/bin/bash
# Quick service deployment/update script
# Usage: sudo ./helpers/deploy-service.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SERVICE_NAME="sinopsis-worker-asr.service"
INSTALL_DIR="/opt/sinopsis-worker-asr"

echo "======================================"
echo "Sinopsis Worker Service Deployment"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

echo "Step 1: Copying service file..."
cp -v sinopsis-worker-asr.service /etc/systemd/system/
chmod 644 /etc/systemd/system/$SERVICE_NAME
echo -e "${GREEN}✓${NC} Service file copied"
echo ""

echo "Step 2: Reloading systemd daemon..."
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"
echo ""

echo "Step 3: Checking if service is already running..."
if systemctl is-active --quiet "$SERVICE_NAME"; then
    echo -e "${YELLOW}⚠${NC} Service is currently running"
    read -p "Do you want to restart it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Restarting service..."
        systemctl restart "$SERVICE_NAME"
        echo -e "${GREEN}✓${NC} Service restarted"
    else
        echo "Skipping restart"
    fi
else
    echo "Service is not running"
fi
echo ""

echo "Step 4: Enabling service for auto-start..."
systemctl enable "$SERVICE_NAME"
echo -e "${GREEN}✓${NC} Service enabled"
echo ""

echo "Step 5: Checking service status..."
systemctl status "$SERVICE_NAME" --no-pager || true
echo ""

echo "======================================"
echo "Deployment Complete"
echo "======================================"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start $SERVICE_NAME"
echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
echo "  Restart: sudo systemctl restart $SERVICE_NAME"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "To view recent logs:"
echo "  sudo journalctl -u $SERVICE_NAME -n 50"
echo ""
