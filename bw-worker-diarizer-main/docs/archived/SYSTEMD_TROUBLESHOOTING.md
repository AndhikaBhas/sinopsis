# Systemd Service Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: RuntimeError - operator torchvision::nms does not exist

**Error:**

```
RuntimeError: operator torchvision::nms does not exist
```

**Cause:**

- Missing `torchvision` package
- Incompatible versions of torch/torchvision/torchaudio

**Solution:**

```bash
# On the Debian server, activate venv and reinstall dependencies
sudo su - sinopsis
cd /opt/sinopsis-worker-diarizer
source venv/bin/activate

# Reinstall torch packages with compatible versions
pip install torch>=2.0.0,<2.5.0 torchaudio>=2.0.0,<2.5.0 torchvision>=0.15.0,<0.20.0

# Or reinstall all requirements
pip install -r requirements.txt --upgrade

deactivate
exit

# Then restart the service
sudo systemctl restart sinopsis-worker-diarizer.service
```

### Issue 2: Import Errors with PyTorch/PyAnnote

**Error:**

```
ImportError when importing pyannote.audio or pytorch_lightning
```

**Solutions Applied:**

1. **Added Library Path:**

   - Added `LD_LIBRARY_PATH` environment variable to allow access to system libraries
   - Added `PYTHONUNBUFFERED=1` for better logging

2. **Relaxed Security Settings:**
   - Commented out restrictive security options that may block library access
   - PyTorch/PyAnnote need access to system libraries and GPU drivers

### Issue 3: Invalid Environment Assignment

**Error:**

```
Ignoring invalid environment assignment 'export TRANSFORMERS_CACHE=...'
```

**Solution:**

- Remove `export` keyword from `.env` file
- Systemd only accepts `KEY=VALUE` format, not shell export syntax

### Deployment Steps

After updating the service file on your Debian server:

```bash
# 1. Copy updated service file
sudo cp sinopsis-worker-diarizer.service /etc/systemd/system/

# 2. Ensure .env file has no 'export' statements
sudo nano /opt/sinopsis-worker-diarizer/.env
# Make sure each line is: KEY=VALUE (no 'export')

# 3. Reload systemd
sudo systemctl daemon-reload

# 4. Restart the service
sudo systemctl restart sinopsis-worker-diarizer.service

# 5. Check status
sudo systemctl status sinopsis-worker-diarizer.service

# 6. View logs
sudo journalctl -u sinopsis-worker-diarizer.service -f
```

### Required System Packages

Ensure these packages are installed on Debian:

```bash
sudo apt-get update
sudo apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    libsndfile1 \
    ffmpeg \
    libasound2-dev \
    libportaudio2 \
    libportaudiocpp0 \
    portaudio19-dev
```

### Verify Python Environment

Test if the virtual environment works correctly:

```bash
# Switch to sinopsis user
sudo su - sinopsis

# Activate venv
cd /opt/sinopsis-worker-diarizer
source venv/bin/activate

# Test imports
python -c "from pyannote.audio import Pipeline; print('Success!')"

# Exit
deactivate
exit
```

### Check File Permissions

Ensure the sinopsis user has proper permissions:

```bash
sudo chown -R sinopsis:sinopsis /opt/sinopsis-worker-diarizer
sudo chmod -R 755 /opt/sinopsis-worker-diarizer
sudo chmod -R 775 /opt/sinopsis-worker-diarizer/logs
sudo chmod -R 775 /opt/sinopsis-worker-diarizer/cache
```

### Environment Variables in .env

Example `.env` file format (NO export statements):

```bash
# Database Configuration
DATABASE_URL=postgresql://user:pass@host:5432/db

# RabbitMQ Configuration
RABBITMQ_URL=amqp://user:pass@host:5672/vhost
RABBIT_MQ_EXCHANGE=sinopsis.pipeline
RABBIT_MQ_INPUT_QUEUE=queue.audio_spliced
RABBIT_MQ_OUTPUT_QUEUE=queue.meeting_diarized

# MinIO Configuration
MINIO_ENDPOINT=http://host:9000
MINIO_USER=user
MINIO_PASSWORD=password
MINIO_INPUT_BUCKET=bucket-name

# HuggingFace Configuration
HUGGINGFACE_AUTH_TOKEN=hf_YourTokenHere

# Cache Configuration
TRANSFORMERS_CACHE=/opt/sinopsis-worker-diarizer/cache/huggingface
HF_HOME=/opt/sinopsis-worker-diarizer/cache/huggingface
```

### Debugging Tips

1. **Check if service starts at all:**

   ```bash
   sudo systemctl start sinopsis-worker-diarizer.service
   sudo systemctl status sinopsis-worker-diarizer.service
   ```

2. **View detailed logs:**

   ```bash
   sudo journalctl -u sinopsis-worker-diarizer.service -n 100 --no-pager
   ```

3. **Test manually as the service user:**

   ```bash
   sudo -u sinopsis /opt/sinopsis-worker-diarizer/venv/bin/python /opt/sinopsis-worker-diarizer/main.py
   ```

4. **Check for missing libraries:**
   ```bash
   ldd /opt/sinopsis-worker-diarizer/venv/lib/python3.11/site-packages/torch/lib/*.so
   ```

### If Issues Persist

Try running with even fewer restrictions temporarily to identify the issue:

```bash
# Edit service file
sudo nano /etc/systemd/system/sinopsis-worker-diarizer.service

# Comment out ALL security settings temporarily
# Keep only the basic configuration

sudo systemctl daemon-reload
sudo systemctl restart sinopsis-worker-diarizer.service
```

Once working, gradually re-enable security features one by one to find which one causes the issue.

### GPU Access (if using CUDA)

If using GPU, you may need:

```bash
# Add user to video group
sudo usermod -a -G video sinopsis

# In service file, uncomment or add:
# SupplementaryGroups=video
```

### Monitoring

Check service health:

```bash
# Service status
sudo systemctl status sinopsis-worker-diarizer.service

# Recent logs
sudo journalctl -u sinopsis-worker-diarizer.service --since "10 minutes ago"

# Follow logs in real-time
sudo journalctl -u sinopsis-worker-diarizer.service -f

# Check resource usage
sudo systemctl show sinopsis-worker-diarizer.service --property=MemoryCurrent,CPUUsageNSec
```
