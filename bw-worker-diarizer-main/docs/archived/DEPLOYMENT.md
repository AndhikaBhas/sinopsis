# Sinopsis Speaker Diarization Worker - Deployment Guide

This guide will help you deploy the Speaker Diarization Worker as a Linux service.

## 🚀 Quick Installation

### Prerequisites

- **Linux Server** (Ubuntu 20.04+ recommended)
- **Python 3.8+** installed
- **Root access** for installation
- **Internet connection** for downloading dependencies

### Required Services

The worker requires these services to be accessible:

- **PostgreSQL** database
- **RabbitMQ** message broker
- **MinIO** object storage

### Installation Steps

1. **Clone or copy the project files to your server**

   ```bash
   # Option 1: Clone repository
   git clone <your-repo-url>
   cd sinopsis-worker-diarizer

   # Option 2: Upload files via SCP/SFTP
   # (upload the entire project directory)
   ```

2. **Run the deployment script**
   ```bash
   sudo ./deploy.sh
   ```

The deployment script will automatically:

- Install system dependencies (Python, FFmpeg, audio libraries)
- Create a service user (`sinopsis`)
- Set up Python virtual environment
- Install PyTorch (with CUDA if GPU available)
- Install all Python dependencies
- Configure systemd service
- Set up proper permissions and directories

3. **Configure the service**

   ```bash
   sudo nano /opt/sinopsis-worker-diarizer/.env
   ```

   Required configuration:

   ```env
   # Database
   DATABASE_URL=postgresql://username:password@host:port/database

   # RabbitMQ
   RABBITMQ_HOST=your-rabbitmq-host
   RABBITMQ_PORT=5672
   RABBITMQ_USER=your-username
   RABBITMQ_PASSWORD=your-password
   RABBITMQ_VHOST=your-vhost

   # MinIO
   MINIO_ENDPOINT=your-minio-host
   MINIO_PORT=9000
   MINIO_ACCESS_KEY=your-access-key
   MINIO_SECRET_KEY=your-secret-key
   MINIO_BUCKET=your-bucket
   MINIO_SECURE=false

   # HuggingFace (for PyAnnote models)
   HUGGINGFACE_AUTH_TOKEN=your-huggingface-token
   ```

4. **Test the configuration**

   ```bash
   /opt/sinopsis-worker-diarizer/manage.sh test
   ```

5. **Enable and start the service**

   ```bash
   /opt/sinopsis-worker-diarizer/manage.sh enable
   /opt/sinopsis-worker-diarizer/manage.sh start
   ```

6. **Check service status**
   ```bash
   /opt/sinopsis-worker-diarizer/manage.sh status
   /opt/sinopsis-worker-diarizer/manage.sh logs
   ```

## 🔧 Service Management

The deployment creates convenient management scripts:

### Using manage.sh

```bash
# Service control
/opt/sinopsis-worker-diarizer/manage.sh start     # Start service
/opt/sinopsis-worker-diarizer/manage.sh stop      # Stop service
/opt/sinopsis-worker-diarizer/manage.sh restart   # Restart service
/opt/sinopsis-worker-diarizer/manage.sh status    # Show status
/opt/sinopsis-worker-diarizer/manage.sh logs      # Show live logs

# Boot configuration
/opt/sinopsis-worker-diarizer/manage.sh enable    # Enable auto-start
/opt/sinopsis-worker-diarizer/manage.sh disable   # Disable auto-start

# Testing
/opt/sinopsis-worker-diarizer/manage.sh test      # Test configuration
```

### Direct systemctl commands

```bash
sudo systemctl start sinopsis-worker-diarizer
sudo systemctl stop sinopsis-worker-diarizer
sudo systemctl restart sinopsis-worker-diarizer
sudo systemctl status sinopsis-worker-diarizer
sudo systemctl enable sinopsis-worker-diarizer
sudo systemctl disable sinopsis-worker-diarizer

# View logs
sudo journalctl -u sinopsis-worker-diarizer -f
```

## 📁 Directory Structure

After installation:

```
/opt/sinopsis-worker-diarizer/
├── main.py                 # Main worker application
├── config.py              # Configuration handler
├── processors/            # Audio processing modules
├── utils/                 # Utility modules
├── venv/                  # Python virtual environment
├── logs/                  # Application logs
├── cache/                 # Model cache (HuggingFace)
├── .env                   # Environment configuration
├── manage.sh              # Service management script
├── update.sh              # Update script
└── sinopsis-worker-diarizer.service  # Systemd service file
```

## 🔄 Updates

To update the worker:

```bash
# Automated update (if using git)
/opt/sinopsis-worker-diarizer/update.sh

# Manual update
sudo systemctl stop sinopsis-worker-diarizer
# Copy new files to /opt/sinopsis-worker-diarizer/
# Update dependencies if needed:
sudo -u sinopsis /opt/sinopsis-worker-diarizer/venv/bin/pip install -r requirements.txt
sudo systemctl start sinopsis-worker-diarizer
```

## 🐛 Troubleshooting

### Automated troubleshooting

```bash
sudo ./troubleshoot.sh
```

This script will check:

- Service status and configuration
- System dependencies
- Network connectivity
- Log files
- Disk space and memory usage
- Configuration validation

### Configuration validation

```bash
sudo ./check-config.sh
```

This script specifically checks:

- Environment file exists and is properly configured
- All required environment variables are set
- Database connectivity
- RabbitMQ connectivity
- MinIO connectivity
- Python environment and dependencies

### Common Issues

1. **Service won't start - Configuration Error**

   **Error**: `Configuration Error: Required environment variable X is not set`

   **Solution**: Check and configure the environment file:

   ```bash
   # Run configuration check
   sudo ./check-config.sh

   # Edit environment file if needed
   sudo nano /opt/sinopsis-worker-diarizer/.env

   # Restart service after fixing configuration
   sudo systemctl restart sinopsis-worker-diarizer
   ```

2. **Service won't start - General**

   ```bash
   sudo journalctl -u sinopsis-worker-diarizer -n 50
   /opt/sinopsis-worker-diarizer/manage.sh test
   ```

3. **Permission issues**

   ```bash
   sudo chown -R sinopsis:sinopsis /opt/sinopsis-worker-diarizer
   sudo chmod +x /opt/sinopsis-worker-diarizer/venv/bin/*
   ```

4. **Missing dependencies**

   ```bash
   sudo apt update
   sudo apt install python3-dev build-essential ffmpeg libsndfile1-dev sox
   ```

5. **GPU issues**

   ```bash
   # Check NVIDIA driver
   nvidia-smi

   # Reinstall PyTorch with correct CUDA version
   sudo -u sinopsis /opt/sinopsis-worker-diarizer/venv/bin/pip uninstall torch
   sudo -u sinopsis /opt/sinopsis-worker-diarizer/venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cu121
   ```

6. **Network connectivity**

   ```bash
   # Test connections
   nc -z rabbitmq-host 5672
   nc -z postgres-host 5432
   nc -z minio-host 9000
   ```

7. **NumPy 2.0 compatibility error**

   **Error**: `AttributeError: np.NaN was removed in the NumPy 2.0 release. Use np.nan instead.`

   **Solution**: Run the NumPy fix script to downgrade to a compatible version:

   ```bash
   sudo ./fix-numpy.sh
   ```

   **Manual fix** (if script is not available):

   ```bash
   sudo systemctl stop sinopsis-worker-diarizer
   sudo -u sinopsis /opt/sinopsis-worker-diarizer/venv/bin/pip uninstall -y numpy
   sudo -u sinopsis /opt/sinopsis-worker-diarizer/venv/bin/pip install "numpy>=1.24.0,<2.0.0"
   sudo systemctl start sinopsis-worker-diarizer
   ```

### Log Locations

- **Application logs**: `/opt/sinopsis-worker-diarizer/logs/`
- **System logs**: `journalctl -u sinopsis-worker-diarizer`
- **Service status**: `systemctl status sinopsis-worker-diarizer`

## 🔒 Security

The deployment script implements security best practices:

- **Dedicated service user** with minimal privileges
- **Restricted file permissions** (600 for .env, 755 for directories)
- **Systemd security features** (NoNewPrivileges, ProtectSystem, etc.)
- **No root execution** of the worker process

## 📊 Performance Tuning

### GPU Acceleration

If you have NVIDIA GPU:

1. Install NVIDIA drivers
2. Install CUDA toolkit
3. The deployment script will automatically install PyTorch with CUDA support

### Memory Management

For high-volume processing:

- Increase system memory
- Monitor memory usage with `htop` or `free -h`
- Consider using swap if needed

### Process Limits

The service is configured with:

- Maximum file descriptors: 65536
- Maximum processes: 4096

Adjust in `/etc/systemd/system/sinopsis-worker-diarizer.service` if needed.

## 📞 Support

If you encounter issues:

1. Run the troubleshoot script: `sudo ./troubleshoot.sh`
2. Check the logs: `journalctl -u sinopsis-worker-diarizer -f`
3. Test configuration: `/opt/sinopsis-worker-diarizer/manage.sh test`
4. Review this guide and verify all prerequisites are met

---

## 📝 Configuration Reference

### Required Environment Variables

| Variable                 | Description                  | Example                               |
| ------------------------ | ---------------------------- | ------------------------------------- |
| `DATABASE_URL`           | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `RABBITMQ_HOST`          | RabbitMQ hostname            | `localhost`                           |
| `RABBITMQ_PORT`          | RabbitMQ port                | `5672`                                |
| `RABBITMQ_USER`          | RabbitMQ username            | `guest`                               |
| `RABBITMQ_PASSWORD`      | RabbitMQ password            | `guest`                               |
| `RABBITMQ_VHOST`         | RabbitMQ virtual host        | `/`                                   |
| `MINIO_ENDPOINT`         | MinIO hostname               | `localhost`                           |
| `MINIO_PORT`             | MinIO port                   | `9000`                                |
| `MINIO_ACCESS_KEY`       | MinIO access key             | `minioadmin`                          |
| `MINIO_SECRET_KEY`       | MinIO secret key             | `minioadmin`                          |
| `MINIO_BUCKET`           | MinIO bucket name            | `audio-files`                         |
| `MINIO_SECURE`           | Use HTTPS for MinIO          | `false`                               |
| `HUGGINGFACE_AUTH_TOKEN` | HuggingFace API token        | `hf_xxxxx`                            |

### Optional Variables

| Variable           | Description            | Default                  |
| ------------------ | ---------------------- | ------------------------ |
| `LOG_LEVEL`        | Logging level          | `INFO`                   |
| `WORKER_QUEUE`     | RabbitMQ queue name    | `queue.audio_spliced`    |
| `COMPLETION_QUEUE` | Completion queue name  | `queue.meeting_diarized` |
| `MAX_RETRIES`      | Max processing retries | `3`                      |
