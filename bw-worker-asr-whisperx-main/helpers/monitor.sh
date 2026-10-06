#!/bin/bash

# Sinopsis ASR Worker Monitoring Script

SERVICE_NAME="sinopsis-worker-asr"
LOG_LINES=50

echo "🔍 Sinopsis ASR Worker Service Monitor"
echo "======================================"

# Check if service exists
if ! systemctl list-unit-files | grep -q "$SERVICE_NAME.service"; then
    echo "❌ Service $SERVICE_NAME not found"
    echo "💡 Run: sudo ./deploy.sh to deploy the service"
    exit 1
fi

# Service status
echo ""
echo "📊 Service Status:"
echo "------------------"
systemctl status "$SERVICE_NAME" --no-pager -l

# Recent logs
echo ""
echo "📋 Recent Logs (last $LOG_LINES lines):"
echo "----------------------------------------"
journalctl -u "$SERVICE_NAME" -n "$LOG_LINES" --no-pager

# System resources
echo ""
echo "💻 System Resources:"
echo "--------------------"

# GPU status (if available)
if command -v nvidia-smi &> /dev/null; then
    echo "🎮 GPU Status:"
    nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits
    echo ""
fi

# Memory usage
echo "🧠 Memory Usage:"
free -h | grep -E "^(Mem|Swap)"

# Disk usage
echo ""
echo "💾 Disk Usage:"
df -h / | tail -n +2

# Network connectivity
echo ""
echo "🌐 Network Connectivity:"
echo "------------------------"

# Check RabbitMQ connection
if [ ! -z "$RABBITMQ_URL" ]; then
    RABBIT_HOST=$(echo "$RABBITMQ_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')
    if [ ! -z "$RABBIT_HOST" ]; then
        if ping -c 1 "$RABBIT_HOST" &> /dev/null; then
            echo "✅ RabbitMQ host ($RABBIT_HOST) reachable"
        else
            echo "❌ RabbitMQ host ($RABBIT_HOST) unreachable"
        fi
    fi
fi

echo ""
echo "🔧 Quick Commands:"
echo "------------------"
echo "View live logs:    sudo journalctl -u $SERVICE_NAME -f"
echo "Restart service:   sudo systemctl restart $SERVICE_NAME"
echo "Check config:      sudo cat /opt/sinopsis-worker-asr/.env"
echo "Edit config:       sudo nano /opt/sinopsis-worker-asr/.env"