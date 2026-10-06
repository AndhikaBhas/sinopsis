#!/bin/bash

# Sinopsis Worker ASR Troubleshooting Script
# Helps diagnose common deployment and permission issues

echo "🔍 Sinopsis Worker ASR Troubleshooting"
echo "======================================"

SERVICE_USER="sinopsis"
INSTALL_DIR="/opt/sinopsis-worker-asr"
SERVICE_NAME="sinopsis-worker-asr"

echo ""
echo "📋 System Information:"
echo "---------------------"
echo "OS: $(lsb_release -d 2>/dev/null | cut -f2 || uname -s)"
echo "Python version: $(python3 --version 2>/dev/null || echo "Python3 not found")"
echo "User running script: $(whoami)"
echo "Current directory: $(pwd)"

echo ""
echo "👤 User Information:"
echo "-------------------"
if id "$SERVICE_USER" &>/dev/null; then
    echo "✅ Service user '$SERVICE_USER' exists"
    echo "   UID/GID: $(id "$SERVICE_USER")"
    echo "   Home: $(getent passwd "$SERVICE_USER" | cut -d: -f6)"
    echo "   Shell: $(getent passwd "$SERVICE_USER" | cut -d: -f7)"
else
    echo "❌ Service user '$SERVICE_USER' does not exist"
fi

echo ""
echo "📁 Directory Information:"
echo "------------------------"
if [ -d "$INSTALL_DIR" ]; then
    echo "✅ Install directory exists: $INSTALL_DIR"
    echo "   Permissions: $(ls -ld "$INSTALL_DIR" | awk '{print $1, $3, $4}')"
    echo "   Contents:"
    ls -la "$INSTALL_DIR" | head -10
    
    # Check temp directory
    if [ -d "$INSTALL_DIR/temp" ]; then
        echo "✅ Temporary directory exists: $INSTALL_DIR/temp"
        echo "   Temp dir permissions: $(ls -ld "$INSTALL_DIR/temp" | awk '{print $1, $3, $4}')"
        echo "   Temp dir contents: $(ls -A "$INSTALL_DIR/temp" | wc -l) files"
    else
        echo "❌ Temporary directory missing: $INSTALL_DIR/temp"
    fi
else
    echo "❌ Install directory does not exist: $INSTALL_DIR"
fi

echo ""
echo "🐍 Python Virtual Environment:"
echo "------------------------------"
if [ -d "$INSTALL_DIR/venv" ]; then
    echo "✅ Virtual environment exists"
    echo "   Permissions: $(ls -ld "$INSTALL_DIR/venv" | awk '{print $1, $3, $4}')"
    
    if [ -f "$INSTALL_DIR/venv/bin/pip" ]; then
        echo "✅ Pip executable exists"
        echo "   Pip permissions: $(ls -la "$INSTALL_DIR/venv/bin/pip" | awk '{print $1, $3, $4}')"
        echo "   Executable: $([ -x "$INSTALL_DIR/venv/bin/pip" ] && echo "Yes" || echo "No")"
    else
        echo "❌ Pip executable missing"
    fi
    
    if [ -f "$INSTALL_DIR/venv/bin/python" ]; then
        echo "✅ Python executable exists"
        echo "   Python permissions: $(ls -la "$INSTALL_DIR/venv/bin/python" | awk '{print $1, $3, $4}')"
        echo "   Executable: $([ -x "$INSTALL_DIR/venv/bin/python" ] && echo "Yes" || echo "No")"
    else
        echo "❌ Python executable missing"
    fi
    
    echo "   Bin directory contents:"
    ls -la "$INSTALL_DIR/venv/bin/" | head -10
else
    echo "❌ Virtual environment does not exist"
fi

echo ""
echo "📋 Configuration Files:"
echo "----------------------"
if [ -f "$INSTALL_DIR/.env" ]; then
    echo "✅ Environment file exists: $INSTALL_DIR/.env"
    echo "   Permissions: $(ls -la "$INSTALL_DIR/.env" | awk '{print $1, $3, $4}')"
else
    echo "❌ Environment file missing: $INSTALL_DIR/.env"
fi

if [ -f "$INSTALL_DIR/requirements.txt" ]; then
    echo "✅ Requirements file exists"
    echo "   Permissions: $(ls -la "$INSTALL_DIR/requirements.txt" | awk '{print $1, $3, $4}')"
else
    echo "❌ Requirements file missing"
fi

echo ""
echo "⚡ Systemd Service:"
echo "------------------"
if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
    echo "✅ Service file exists: /etc/systemd/system/$SERVICE_NAME.service"
    echo "   Status: $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")"
    echo "   Enabled: $(systemctl is-enabled "$SERVICE_NAME" 2>/dev/null || echo "disabled")"
else
    echo "❌ Service file missing: /etc/systemd/system/$SERVICE_NAME.service"
fi

echo ""
echo "🔧 Quick Fixes:"
echo "--------------"
echo "If you see permission issues, try running:"
echo "sudo chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR"
echo "sudo chmod -R u+rwx $INSTALL_DIR/venv"
echo "sudo chmod +x $INSTALL_DIR/venv/bin/*"
echo ""
echo "If temporary directory is missing:"
echo "sudo mkdir -p $INSTALL_DIR/temp"
echo "sudo chown $SERVICE_USER:$SERVICE_USER $INSTALL_DIR/temp"
echo "sudo chmod 755 $INSTALL_DIR/temp"
echo ""
echo "To recreate virtual environment:"
echo "sudo rm -rf $INSTALL_DIR/venv"
echo "sudo -u $SERVICE_USER python3 -m venv $INSTALL_DIR/venv"
echo "sudo chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR/venv"
echo "sudo chmod +x $INSTALL_DIR/venv/bin/*"

echo ""
echo "🔍 Troubleshooting complete!"