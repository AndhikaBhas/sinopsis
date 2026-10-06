#!/bin/bash

# Comprehensive deployment script for Sinopsis Worker Splicer
# Usage: ./deploy.sh [service|docker|run|install|stop-service|stop-docker|stop-direct]

set -e

DEPLOYMENT_TYPE=${1:-service}
PROJECT_NAME="sinopsis-worker-splicer"

echo "🚀 Sinopsis Worker Splicer Deployment"
echo "====================================="
echo "Action: $DEPLOYMENT_TYPE"
echo ""

case $DEPLOYMENT_TYPE in
    "service")
        echo "📋 Linux Service Deployment"
        echo ""
        
        # Check if running as root
        if [ "$EUID" -ne 0 ]; then
            echo "❌ Service deployment must be run as root"
            echo "   Run: sudo ./deploy.sh service"
            exit 1
        fi
        
        # Check for required commands
        echo "🔍 Checking system dependencies..."
        
        # Check systemctl and useradd (should be available as root)
        for cmd in systemctl useradd; do
            if ! command -v "$cmd" &> /dev/null; then
                echo "❌ Required command not found: $cmd"
                echo "   Please install the required system dependencies"
                exit 1
            fi
        done
        
        echo "✅ System dependencies found"
        
        # Service configuration
        SERVICE_NAME="sinopsis-worker-splicer"
        SERVICE_USER="sinopsis"
        SERVICE_GROUP="sinopsis"
        INSTALL_DIR="/opt/sinopsis-worker-splicer"
        CONFIG_DIR="/etc/sinopsis-worker-splicer"
        LOG_DIR="/var/log/sinopsis-worker-splicer"
        
        # Check if binary exists
        if [ ! -f "./target/release/sinopsis-worker-splicer" ]; then
            echo "❌ Binary not found: ./target/release/sinopsis-worker-splicer"
            echo "🔨 Please build the project first:"
            echo "   cargo build --release"
            exit 1
        fi
        
        echo "✅ Binary found: ./target/release/sinopsis-worker-splicer"
        
        # Stop existing service if running
        if systemctl is-active --quiet $SERVICE_NAME 2>/dev/null; then
            echo "🛑 Stopping existing service..."
            systemctl stop $SERVICE_NAME
        fi
        
        echo "🚀 Installing Sinopsis Worker Splicer..."
        
        # Create service user and group
        if ! id "$SERVICE_USER" &>/dev/null; then
            echo "👤 Creating service user: $SERVICE_USER"
            if ! useradd --system --home-dir "$INSTALL_DIR" --shell /bin/false "$SERVICE_USER"; then
                echo "❌ Failed to create service user: $SERVICE_USER"
                exit 1
            fi
        else
            echo "👤 Service user $SERVICE_USER already exists"
        fi
        
        # Create directories
        echo "📁 Creating directories..."
        if ! mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$LOG_DIR"; then
            echo "❌ Failed to create directories"
            exit 1
        fi
        
        # Copy binary
        echo "📦 Installing binary..."
        if ! cp "./target/release/sinopsis-worker-splicer" "$INSTALL_DIR/"; then
            echo "❌ Failed to copy binary to $INSTALL_DIR/"
            exit 1
        fi
        
        if ! chmod +x "$INSTALL_DIR/sinopsis-worker-splicer"; then
            echo "❌ Failed to make binary executable"
            exit 1
        fi
        
        # Copy configuration template
        echo "⚙️  Installing configuration template..."
        if [ -f ".env" ]; then
            cp ".env" "$CONFIG_DIR/config.env"
        elif [ -f ".env.example" ]; then
            cp ".env.example" "$CONFIG_DIR/config.env"
            echo "ℹ️  Using .env.example as template. Please customize $CONFIG_DIR/config.env"
        else
            echo "⚠️  No .env file found, creating basic template..."
            cat > "$CONFIG_DIR/config.env" << 'EOF'
# RabbitMQ configuration
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBIT_MQ_EXCHANGE=sinopsis.pipeline
RABBIT_MQ_INPUT_QUEUE=queue.meeting_transcribed
RABBIT_MQ_OUTPUT_QUEUE=queue.audio_spliced

# Postgres connection string compatible with tokio-postgres
DATABASE_URL=postgres://user:password@localhost:5432/sinopsis

# MinIO / S3 compatible storage
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_INPUT_BUCKET=sinopsis-audio-standardized
MINIO_OUTPUT_BUCKET=sinopsis-audio-spliced

# Optional overrides
# OUTPUT_PREFIX=rapat_

# Logging Configuration
RUST_LOG=info
EOF
        fi
        
        # Set ownership
        echo "🔒 Setting permissions..."
        if ! chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"; then
            echo "❌ Failed to set ownership for $INSTALL_DIR"
            exit 1
        fi
        
        if ! chown -R "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"; then
            echo "❌ Failed to set ownership for $LOG_DIR"
            exit 1
        fi
        
        if ! chown -R root:root "$CONFIG_DIR"; then
            echo "❌ Failed to set ownership for $CONFIG_DIR"
            exit 1
        fi
        
        if ! chmod 640 "$CONFIG_DIR/config.env"; then
            echo "❌ Failed to set permissions for config file"
            exit 1
        fi
        
        # Install systemd service
        echo "🔧 Installing systemd service..."
        cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Sinopsis Worker Splicer
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=/opt/sinopsis-worker-splicer
ExecStart=/opt/sinopsis-worker-splicer/sinopsis-worker-splicer
EnvironmentFile=$CONFIG_DIR/config.env
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

[Install]
WantedBy=multi-user.target
EOF
        
        # Reload systemd
        echo "🔄 Reloading systemd..."
        if ! systemctl daemon-reload; then
            echo "❌ Failed to reload systemd"
            exit 1
        fi
        
        # Check if FFmpeg is installed
        if ! command -v ffmpeg &> /dev/null; then
            echo "⚠️  WARNING: FFmpeg is not installed!"
            echo "   Please install FFmpeg before starting the service:"
            echo "   - Ubuntu/Debian: sudo apt install ffmpeg"
            echo "   - CentOS/RHEL: sudo dnf install ffmpeg"
            echo "   - Or build from source"
        fi
        
        echo ""
        echo "✅ Service installation completed successfully!"
        echo ""
        echo "📋 Next steps:"
        echo "1. Edit configuration: nano $CONFIG_DIR/config.env"
        echo "2. Enable service: systemctl enable $SERVICE_NAME"
        echo "3. Start service: systemctl start $SERVICE_NAME"
        echo "4. Check status: systemctl status $SERVICE_NAME"
        echo "5. View logs: journalctl -u $SERVICE_NAME -f"
        echo ""
        echo "🔧 Service commands:"
        echo "   systemctl start $SERVICE_NAME     # Start the service"
        echo "   systemctl stop $SERVICE_NAME      # Stop the service"
        echo "   systemctl restart $SERVICE_NAME   # Restart the service"
        echo "   systemctl enable $SERVICE_NAME    # Enable auto-start on boot"
        echo "   systemctl disable $SERVICE_NAME   # Disable auto-start on boot"
        echo ""
        echo "🐛 Debug commands:"
        echo "   journalctl -u $SERVICE_NAME -n 50 # Show last 50 log lines"
        echo "   systemctl status $SERVICE_NAME     # Show service status"
        echo "   ls -la $INSTALL_DIR                # Check binary permissions"
        ;;
        
    "docker")
        echo "🐳 Docker Deployment"
        echo ""
        
        echo "🔨 Building Docker image..."
        docker build -t $PROJECT_NAME:latest .
        
        echo ""
        echo "ℹ️  To run the Docker container:"
        echo "docker run -d \\"
        echo "  --name $PROJECT_NAME \\"
        echo "  --restart unless-stopped \\"
        echo "  -e RABBITMQ_URL=amqp://guest:guest@localhost:5672/ \\"
        echo "  -e RABBIT_MQ_EXCHANGE=sinopsis.pipeline \\"
        echo "  -e RABBIT_MQ_INPUT_QUEUE=queue.meeting_transcribed \\"
        echo "  -e RABBIT_MQ_OUTPUT_QUEUE=queue.audio_spliced \\"
        echo "  -e DATABASE_URL=postgres://user:password@localhost:5432/sinopsis \\"
        echo "  -e MINIO_ENDPOINT=http://localhost:9000 \\"
        echo "  -e MINIO_ACCESS_KEY=minioadmin \\"
        echo "  -e MINIO_SECRET_KEY=minioadmin \\"
        echo "  -e MINIO_INPUT_BUCKET=sinopsis-audio-standardized \\"
        echo "  -e MINIO_OUTPUT_BUCKET=sinopsis-audio-spliced \\"
        echo "  -e RUST_LOG=info \\"
        echo "  $PROJECT_NAME:latest"
        echo ""
        echo "🔍 View logs with: docker logs -f $PROJECT_NAME"
        ;;
        
    "run")
        echo "🏃 Direct Run (Development)"
        echo ""
        
        # Check if binary exists, build if not
        if [ ! -f "./target/release/sinopsis-worker-splicer" ]; then
            echo "🔨 Building release binary..."
            cargo build --release
        fi
        
        echo "ℹ️  Starting worker directly..."
        echo "📝 Make sure you have configured the environment variables in .env file"
        echo "🛑 Press Ctrl+C to stop gracefully"
        echo ""
        
        # Load .env file if it exists
        if [ -f ".env" ]; then
            echo "📄 Loading environment from .env file..."
            # Safer way to load environment variables
            set -a
            source .env
            set +a
            
            # Validate required environment variables
            echo "🔍 Validating environment variables..."
            REQUIRED_VARS=(
                "RABBITMQ_URL"
                "RABBIT_MQ_EXCHANGE" 
                "RABBIT_MQ_INPUT_QUEUE"
                "RABBIT_MQ_OUTPUT_QUEUE"
                "DATABASE_URL"
                "MINIO_ENDPOINT"
                "MINIO_ACCESS_KEY"
                "MINIO_SECRET_KEY"
                "MINIO_INPUT_BUCKET"
                "MINIO_OUTPUT_BUCKET"
            )
            
            MISSING_VARS=()
            for var in "${REQUIRED_VARS[@]}"; do
                if [ -z "${!var}" ]; then
                    MISSING_VARS+=("$var")
                fi
            done
            
            if [ ${#MISSING_VARS[@]} -ne 0 ]; then
                echo "❌ Missing required environment variables:"
                for var in "${MISSING_VARS[@]}"; do
                    echo "   - $var"
                done
                echo "📝 Please check your .env file and ensure all variables are set"
                exit 1
            fi
            
            echo "✅ All required environment variables are present"
        elif [ -f ".env.example" ]; then
            echo "⚠️  No .env file found, copying from .env.example..."
            cp ".env.example" ".env"
            echo "📝 Please edit .env file with your configuration and run again"
            echo "💡 Default .env created from .env.example template"
            exit 1
        else
            echo "❌ No .env file found! Creating template..."
            cat > .env << 'EOF'
# RabbitMQ configuration
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
RABBIT_MQ_EXCHANGE=sinopsis.pipeline
RABBIT_MQ_INPUT_QUEUE=queue.meeting_transcribed
RABBIT_MQ_OUTPUT_QUEUE=queue.audio_spliced

# Postgres connection string compatible with tokio-postgres
DATABASE_URL=postgres://user:password@localhost:5432/sinopsis

# MinIO / S3 compatible storage
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_INPUT_BUCKET=sinopsis-audio-standardized
MINIO_OUTPUT_BUCKET=sinopsis-audio-spliced

# Optional overrides
# OUTPUT_PREFIX=rapat_

# Logging Configuration
RUST_LOG=info
EOF
            echo "📝 Please edit .env file with your configuration and run again"
            exit 1
        fi
        
        echo "🚀 Starting worker..."
        echo ""
        
        # Run the binary directly
        ./target/release/sinopsis-worker-splicer
        ;;
        
    "stop-direct")
        echo "🛑 Stopping Direct Run"
        echo ""
        
        # Find running processes
        PIDS=$(pgrep -f "sinopsis-worker-splicer" || true)
        
        if [ -z "$PIDS" ]; then
            echo "ℹ️  No running worker processes found"
        else
            echo "📋 Found running worker processes:"
            ps aux | head -1  # Header
            ps aux | grep -E "(sinopsis-worker-splicer)" | grep -v grep || true
            echo ""
            
            echo "🛑 Sending SIGTERM (graceful shutdown) to processes..."
            echo "$PIDS" | while read -r pid; do
                if kill -TERM "$pid" 2>/dev/null; then
                    echo "  ✅ Sent SIGTERM to PID $pid"
                else
                    echo "  ❌ Failed to send SIGTERM to PID $pid"
                fi
            done
            
            echo ""
            echo "⏳ Waiting 10 seconds for graceful shutdown..."
            sleep 10
            
            # Check if processes are still running
            REMAINING_PIDS=$(pgrep -f "sinopsis-worker-splicer" || true)
            
            if [ -z "$REMAINING_PIDS" ]; then
                echo "✅ All worker processes stopped gracefully"
            else
                echo "⚠️  Some processes still running, sending SIGKILL..."
                echo "$REMAINING_PIDS" | while read -r pid; do
                    if kill -KILL "$pid" 2>/dev/null; then
                        echo "  🔥 Force killed PID $pid"
                    else
                        echo "  ❌ Failed to kill PID $pid"
                    fi
                done
                
                sleep 2
                
                FINAL_CHECK=$(pgrep -f "sinopsis-worker-splicer" || true)
                if [ -z "$FINAL_CHECK" ]; then
                    echo "✅ All worker processes stopped"
                else
                    echo "❌ Some processes may still be running. Check manually with:"
                    echo "   ps aux | grep sinopsis-worker-splicer"
                fi
            fi
        fi
        ;;
        
    "stop-service")
        echo "🛑 Stopping Linux Service"
        echo ""
        
        echo "Checking service status..."
        if systemctl is-active --quiet sinopsis-worker-splicer 2>/dev/null; then
            echo "✅ Service is running, stopping..."
            sudo systemctl stop sinopsis-worker-splicer
            echo "✅ Service stopped successfully"
        else
            echo "ℹ️  Service is not running or not installed"
        fi
        
        echo ""
        echo "Service status:"
        sudo systemctl status sinopsis-worker-splicer --no-pager -l 2>/dev/null || echo "Service not found"
        ;;
        
    "stop-docker")
        echo "🛑 Stopping Docker Container"
        echo ""
        
        if docker ps -q -f name=$PROJECT_NAME | grep -q . 2>/dev/null; then
            echo "✅ Container is running, stopping..."
            docker stop $PROJECT_NAME
            echo "✅ Container stopped successfully"
            
            echo ""
            read -p "Remove container? (y/N): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                docker rm $PROJECT_NAME
                echo "✅ Container removed"
            fi
        else
            echo "ℹ️  Container is not running"
        fi
        
        echo ""
        echo "Docker status:"
        docker ps -a -f name=$PROJECT_NAME 2>/dev/null || echo "Docker not available"
        ;;
        
    "install")
        echo "ℹ️  The 'install' command has been merged into 'service'"
        echo "📋 Running service installation..."
        echo ""
        exec "$0" service
        ;;
        
    *)
        echo "❌ Unknown deployment type: $DEPLOYMENT_TYPE"
        echo ""
        echo "Usage: $0 [service|docker|run|install|stop-service|stop-docker|stop-direct]"
        echo ""
        echo "Available options:"
        echo "  service        - Deploy and install as Linux systemd service (requires sudo)"
        echo "  install        - Alias for 'service' (backward compatibility)"
        echo "  docker         - Build and show Docker run command"
        echo "  run            - Run directly (development mode)"
        echo "  stop-service   - Stop the Linux service"
        echo "  stop-docker    - Stop the Docker container"
        echo "  stop-direct    - Stop direct run processes"
        exit 1
        ;;
esac

echo ""
echo "📚 For additional help:"
echo "  - README.md - Project documentation"
echo "  - Check logs with: journalctl -u sinopsis-worker-splicer -f"
echo ""
echo "🔧 Debug tools:"
echo "  cargo run --bin sinopsis-worker-splicer  # Test run locally"
echo "  docker logs -f sinopsis-worker-splicer   # View Docker logs"
echo ""
echo "✅ Deployment operation complete!";