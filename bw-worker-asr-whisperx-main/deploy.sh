#!/bin/bash

# Sinopsis ASR Worker Service Deployment Script
# Version 3.0.0 - Improved with existing installation handling
set -e

echo "🚀 Deploying Sinopsis ASR Worker Service v3.0.3..."

# Default configuration
SERVICE_USER="syauqi"
INSTALL_DIR="/opt/sinopsis-worker-asr"
SERVICE_NAME="sinopsis-worker-asr"
BACKUP_SUFFIX="backup-$(date +%Y%m%d-%H%M%S)"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root"
    echo "   Run: sudo ./deploy.sh"
    exit 1
fi

# Detect existing installation
EXISTING_INSTALL=false
if [ -d "$INSTALL_DIR" ]; then
    EXISTING_INSTALL=true
    echo "📦 Existing installation detected at: $INSTALL_DIR"
fi

# Check if service is already installed
SERVICE_EXISTS=false
if systemctl list-unit-files | grep -q "^$SERVICE_NAME.service"; then
    SERVICE_EXISTS=true
    echo "⚙️  Service $SERVICE_NAME is already installed"
fi

# Stop service if running (before backup/update)
if [ "$SERVICE_EXISTS" = true ] && systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "🛑 Stopping existing service..."
    systemctl stop "$SERVICE_NAME"
    echo "✅ Service stopped"
fi

# Backup existing .env if present
if [ "$EXISTING_INSTALL" = true ] && [ -f "$INSTALL_DIR/.env" ]; then
    echo "💾 Backing up existing .env file..."
    cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.$BACKUP_SUFFIX"
    echo "✅ Backed up to: .env.$BACKUP_SUFFIX"
fi

# Create service user if it doesn't exist
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "👤 Creating service user: $SERVICE_USER"
    useradd --system --home-dir "$INSTALL_DIR" --shell /bin/bash "$SERVICE_USER"
    echo "✅ User created"
else
    echo "👤 Service user already exists: $SERVICE_USER"
fi

# Create installation directory
if [ "$EXISTING_INSTALL" = false ]; then
    echo "📁 Creating installation directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
else
    echo "📁 Installation directory exists: $INSTALL_DIR"
fi
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# Create temporary directory for audio files (v3.0 note: not used but kept for compatibility)
echo "📂 Ensuring temp directory exists: $INSTALL_DIR/temp"
mkdir -p "$INSTALL_DIR/temp"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/temp"
chmod 755 "$INSTALL_DIR/temp"

# Copy application files
if [ "$EXISTING_INSTALL" = true ]; then
    echo "📋 Updating application files..."
    echo "   Preserving: .env, venv/"
    # Copy files excluding sensitive/large directories
    rsync -av --exclude='.env' --exclude='venv/' --exclude='.git/' --exclude='temp/' --exclude='*.pyc' --exclude='__pycache__/' . "$INSTALL_DIR/"
else
    echo "📋 Copying application files..."
    cp -r . "$INSTALL_DIR/"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# Setup Python virtual environment
if [ ! -d "$INSTALL_DIR/venv" ]; then
    echo "🐍 Creating Python virtual environment..."
    sudo -u "$SERVICE_USER" python3 -m venv "$INSTALL_DIR/venv"
    
    # Fix permissions on virtual environment
    echo "🔧 Setting virtual environment permissions..."
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/venv"
    chmod -R u+rwx "$INSTALL_DIR/venv"
    chmod +x "$INSTALL_DIR/venv/bin/"*
    echo "✅ Virtual environment created"
else
    echo "🐍 Virtual environment already exists: $INSTALL_DIR/venv"
    echo "   To recreate, run: sudo rm -rf $INSTALL_DIR/venv && sudo ./deploy.sh"
fi

# Upgrade pip
echo "⬆️  Upgrading pip..."
sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" install --upgrade pip

# Verify virtual environment setup
if [ ! -x "$INSTALL_DIR/venv/bin/pip" ]; then
    echo "❌ Virtual environment setup failed - pip not executable"
    echo "🔧 Fixing permissions..."
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/venv"
    chmod -R u+rwx "$INSTALL_DIR/venv"
    chmod +x "$INSTALL_DIR/venv/bin/"*
fi

# Check if PyTorch is already installed
PYTORCH_INSTALLED=false
if sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" show torch &>/dev/null; then
    PYTORCH_INSTALLED=true
    TORCH_VERSION=$(sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" show torch | grep "^Version:" | cut -d' ' -f2)
    echo "🔥 PyTorch already installed: v$TORCH_VERSION"
    echo "   To reinstall, run: sudo $INSTALL_DIR/venv/bin/pip uninstall torch torchvision torchaudio -y"
else
    echo "🔥 Installing PyTorch with CUDA 12.1 support..."
    if ! sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121; then
        echo "❌ PyTorch installation failed"
        echo "🔍 Debugging information:"
        echo "  Virtual environment path: $INSTALL_DIR/venv"
        echo "  Pip executable: $INSTALL_DIR/venv/bin/pip"
        echo "  Pip permissions: $(ls -la "$INSTALL_DIR/venv/bin/pip")"
        echo "  Directory ownership: $(ls -la "$INSTALL_DIR/venv/bin/" | head -5)"
        exit 1
    fi
    echo "✅ PyTorch installed successfully"
fi

# Install/update dependencies
echo "📦 Installing/updating dependencies..."
if ! sudo -u "$SERVICE_USER" "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"; then
    echo "❌ Dependencies installation failed"
    echo "🔍 Debugging information:"
    echo "  Requirements file: $INSTALL_DIR/requirements.txt"
    echo "  Requirements file exists: $([ -f "$INSTALL_DIR/requirements.txt" ] && echo "Yes" || echo "No")"
    echo "  Pip executable: $INSTALL_DIR/venv/bin/pip"
    echo "  Pip permissions: $(ls -la "$INSTALL_DIR/venv/bin/pip")"
    exit 1
fi
echo "✅ Dependencies installed/updated"

# Setup environment file
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "⚙️  Setting up environment file..."
    if [ -f "$INSTALL_DIR/.env.example" ]; then
        cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
        chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
        chmod 600 "$INSTALL_DIR/.env"
        echo "✅ Created .env from .env.example"
        echo "📝 Please edit $INSTALL_DIR/.env with your configuration"
    else
        echo "⚠️  Warning: .env.example not found. Please create .env manually"
    fi
else
    echo "⚙️  Environment file already exists: $INSTALL_DIR/.env"
    echo "   Backup created: .env.$BACKUP_SUFFIX"
    
    # Check for deprecated USE_MEMORY_MODE config
    if grep -q "^USE_MEMORY_MODE=" "$INSTALL_DIR/.env" 2>/dev/null; then
        echo "⚠️  WARNING: Found deprecated USE_MEMORY_MODE in .env"
        echo "   This setting is no longer used (memory mode always enabled in v3.0+)"
        echo "   Consider removing it from .env file"
    fi
fi

# Install/update systemd service
if [ "$SERVICE_EXISTS" = true ]; then
    echo "⚡ Updating systemd service..."
    cp "$INSTALL_DIR/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
    systemctl daemon-reload
    echo "✅ Service updated"
else
    echo "⚡ Installing systemd service..."
    cp "$INSTALL_DIR/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
    systemctl daemon-reload
    echo "✅ Service installed"
fi

# Set permissions
chmod 755 "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/worker.py" 2>/dev/null || true
chmod +x "$INSTALL_DIR/helpers/troubleshoot.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/helpers/fix-permissions.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/helpers/monitor.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/helpers/check-cuda.sh" 2>/dev/null || true

echo ""
echo "✅ ============================================="
echo "✅  Deployment completed successfully!"
echo "✅ ============================================="
echo ""

# Run CUDA/cuDNN check if nvidia-smi is available
if command -v nvidia-smi &> /dev/null; then
    echo "🔍 Running CUDA/cuDNN dependency check..."
    echo ""
    "$INSTALL_DIR/helpers/check-cuda.sh" || true
    echo ""
fi

# Show deployment summary
if [ "$EXISTING_INSTALL" = true ]; then
    echo "📦 Installation type: UPDATE"
    echo "   Previous .env backed up to: .env.$BACKUP_SUFFIX"
    echo "   Virtual environment: PRESERVED"
    echo "   PyTorch: $([ "$PYTORCH_INSTALLED" = true ] && echo "PRESERVED" || echo "INSTALLED")"
else
    echo "📦 Installation type: NEW INSTALLATION"
fi
echo ""

# Next steps based on installation type
if [ "$EXISTING_INSTALL" = true ]; then
    echo "📋 Next steps (UPDATE):"
    echo "1. Review changes: diff $INSTALL_DIR/.env.$BACKUP_SUFFIX $INSTALL_DIR/.env"
    echo "2. Start service: sudo systemctl start $SERVICE_NAME"
    echo "3. Check status: sudo systemctl status $SERVICE_NAME"
    echo "4. View logs: sudo journalctl -u $SERVICE_NAME -f"
else
    echo "📋 Next steps (NEW INSTALLATION):"
    echo "1. Edit configuration: sudo nano $INSTALL_DIR/.env"
    echo "2. Enable service: sudo systemctl enable $SERVICE_NAME"
    echo "3. Start service: sudo systemctl start $SERVICE_NAME"
    echo "4. Check status: sudo systemctl status $SERVICE_NAME"
    echo "5. View logs: sudo journalctl -u $SERVICE_NAME -f"
fi
echo ""
echo "🔧 Service management commands:"
echo "   Start:   sudo systemctl start $SERVICE_NAME"
echo "   Stop:    sudo systemctl stop $SERVICE_NAME"
echo "   Restart: sudo systemctl restart $SERVICE_NAME"
echo "   Status:  sudo systemctl status $SERVICE_NAME"
echo "   Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "🚑 Troubleshooting:"
echo "   Diagnose issues: cd $INSTALL_DIR && sudo ./helpers/troubleshoot.sh"
echo "   Fix permissions: cd $INSTALL_DIR && sudo ./helpers/fix-permissions.sh"
echo "   Monitor system:  cd $INSTALL_DIR && sudo ./helpers/monitor.sh"
echo "   Check CUDA/cuDNN: cd $INSTALL_DIR && ./helpers/check-cuda.sh"
echo ""
echo "🧪 Testing:"
echo "   Memory mode test: cd $INSTALL_DIR && python test_memory_mode.py"
echo "   Text cleaning:    cd $INSTALL_DIR && python test_text_cleaning.py"
echo "   Validate config:  cd $INSTALL_DIR && python validate_env.py"
echo ""
echo "📚 Documentation:"
echo "   README:           cat $INSTALL_DIR/README.md"
echo "   CUDA/cuDNN Fix:   cat $INSTALL_DIR/docs/CUDA_CUDNN_FIX.md"
echo "   Cleanup summary:  cat $INSTALL_DIR/docs/CLEANUP_SUMMARY.md"
echo "   Memory mode:      cat $INSTALL_DIR/docs/MEMORY_MODE.md"
echo "   Changelog:        cat $INSTALL_DIR/docs/CHANGELOG.md"
echo ""
echo "🎉 Version 3.0.3 deployed - 100% in-memory via pipes, zero disk I/O!"