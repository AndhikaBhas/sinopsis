#!/bin/bash

# Quick fix for virtual environment permission issues
# Run this script as root if you encounter pip permission errors

set -e

SERVICE_USER="sinopsis"
INSTALL_DIR="/opt/sinopsis-worker-asr"

echo "🔧 Fixing Virtual Environment Permissions"
echo "========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root (use sudo)"
    exit 1
fi

# Check if install directory exists
if [ ! -d "$INSTALL_DIR" ]; then
    echo "❌ Install directory not found: $INSTALL_DIR"
    exit 1
fi

# Check if service user exists
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "❌ Service user '$SERVICE_USER' does not exist"
    exit 1
fi

echo "📁 Install directory: $INSTALL_DIR"
echo "👤 Service user: $SERVICE_USER"

# Fix ownership and permissions
echo ""
echo "🔧 Fixing ownership and permissions..."

# Fix directory ownership
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
echo "✅ Fixed directory ownership"

# Create and fix temp directory
if [ ! -d "$INSTALL_DIR/temp" ]; then
    echo "📂 Creating temporary directory..."
    mkdir -p "$INSTALL_DIR/temp"
fi
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/temp"
chmod 755 "$INSTALL_DIR/temp"
echo "✅ Fixed temporary directory permissions"

# If virtual environment exists, fix its permissions
if [ -d "$INSTALL_DIR/venv" ]; then
    echo "🐍 Fixing virtual environment permissions..."
    
    # Set proper permissions on venv directory
    chmod -R u+rwx "$INSTALL_DIR/venv"
    
    # Make all executables in bin directory executable
    if [ -d "$INSTALL_DIR/venv/bin" ]; then
        chmod +x "$INSTALL_DIR/venv/bin/"*
        echo "✅ Fixed virtual environment permissions"
    else
        echo "⚠️  Virtual environment bin directory not found"
    fi
    
    # Test pip executable
    if [ -x "$INSTALL_DIR/venv/bin/pip" ]; then
        echo "✅ Pip executable is now working"
        echo "   Testing pip: $INSTALL_DIR/venv/bin/pip --version"
        sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" --version
    else
        echo "❌ Pip still not executable. Virtual environment may be corrupted."
        echo "💡 Consider recreating the virtual environment:"
        echo "   sudo rm -rf $INSTALL_DIR/venv"
        echo "   sudo -u $SERVICE_USER python3 -m venv $INSTALL_DIR/venv"
        echo "   sudo ./helpers/fix-permissions.sh"
    fi
else
    echo "⚠️  Virtual environment not found at $INSTALL_DIR/venv"
    echo "💡 Run the deployment script to create it: sudo ./deploy.sh"
fi

# Fix other important files
if [ -f "$INSTALL_DIR/.env" ]; then
    chmod 600 "$INSTALL_DIR/.env"
    echo "✅ Fixed .env permissions"
fi

if [ -f "$INSTALL_DIR/worker.py" ]; then
    chmod +x "$INSTALL_DIR/worker.py"
    echo "✅ Fixed worker.py permissions"
fi

echo ""
echo "🎉 Permission fixes completed!"
echo ""
echo "💡 Next steps:"
echo "1. Try running the deployment again: sudo ./deploy.sh"
echo "2. Or continue with manual installation using the fixed permissions"
echo "3. Check troubleshooting script for more details: sudo ./helpers/troubleshoot.sh"