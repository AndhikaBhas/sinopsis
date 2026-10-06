# Systemd Service Setup and Troubleshooting

## Installation

### 1. Copy service file to systemd directory

```bash
sudo cp sinopsis-worker-asr.service /etc/systemd/system/
sudo chmod 644 /etc/systemd/system/sinopsis-worker-asr.service
```

### 2. Reload systemd daemon

```bash
sudo systemctl daemon-reload
```

### 3. Enable service to start on boot

```bash
sudo systemctl enable sinopsis-worker-asr.service
```

### 4. Start the service

```bash
sudo systemctl start sinopsis-worker-asr.service
```

## Common Issues and Fixes

### Issue 1: Service fails to start - "Failed to load environment"

**Symptom**: Service fails immediately after starting

**Fix**: Ensure `.env` file exists in the correct location

```bash
cd /opt/sinopsis-worker-asr
# Check if .env exists
ls -la .env

# If missing, copy from example
cp .env.example .env
nano .env  # Edit with your configuration
```

### Issue 2: "ffmpeg not found"

**Symptom**: Logs show `ffmpeg: command not found` or similar

**Fix**: Install ffmpeg system-wide

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y ffmpeg

# Verify installation
which ffmpeg
ffmpeg -version
```

### Issue 3: "Permission denied"

**Symptom**: Cannot write to directories or access files

**Fix**: Set proper permissions

```bash
# Fix ownership
sudo chown -R syauqi:syauqi /opt/sinopsis-worker-asr

# Fix permissions
sudo chmod 755 /opt/sinopsis-worker-asr
sudo chmod 644 /opt/sinopsis-worker-asr/.env
sudo chmod 755 /opt/sinopsis-worker-asr/worker.py
```

### Issue 4: "ModuleNotFoundError" or Python import errors

**Symptom**: Python cannot find installed packages

**Fix**: Verify virtual environment

```bash
# Check venv exists
ls -la /opt/sinopsis-worker-asr/venv/bin/python

# Test imports manually
/opt/sinopsis-worker-asr/venv/bin/python -c "import whisperx; import torch; print('OK')"

# Reinstall if needed
cd /opt/sinopsis-worker-asr
source venv/bin/activate
pip install -r requirements.txt
```

### Issue 5: "CUDA error" or GPU not detected

**Symptom**: Falls back to CPU or CUDA initialization fails

**Fix**: Verify CUDA and GPU access

```bash
# Check NVIDIA driver
nvidia-smi

# Check CUDA in Python
/opt/sinopsis-worker-asr/venv/bin/python -c "import torch; print(torch.cuda.is_available())"

# Add user to video group if needed
sudo usermod -a -G video syauqi
```

### Issue 6: "Database connection failed"

**Symptom**: Cannot connect to PostgreSQL

**Fix**: Check database configuration

```bash
# Test connection
psql "${DATABASE_URL}"

# Verify .env has correct DATABASE_URL
cat /opt/sinopsis-worker-asr/.env | grep DATABASE_URL

# Check PostgreSQL is running
sudo systemctl status postgresql
```

### Issue 7: "RabbitMQ connection refused"

**Symptom**: Cannot connect to RabbitMQ server

**Fix**: Verify RabbitMQ is running

```bash
# Check RabbitMQ status
sudo systemctl status rabbitmq-server

# Start RabbitMQ if stopped
sudo systemctl start rabbitmq-server

# Test connection
telnet localhost 5672  # Should connect
```

## Monitoring Commands

### View service status

```bash
sudo systemctl status sinopsis-worker-asr.service
```

### View real-time logs

```bash
# All logs
sudo journalctl -u sinopsis-worker-asr.service -f

# Recent logs
sudo journalctl -u sinopsis-worker-asr.service -n 100

# Logs from specific time
sudo journalctl -u sinopsis-worker-asr.service --since "10 minutes ago"

# Logs with timestamps
sudo journalctl -u sinopsis-worker-asr.service -o short-precise -f
```

### Stop service

```bash
sudo systemctl stop sinopsis-worker-asr.service
```

### Restart service

```bash
sudo systemctl restart sinopsis-worker-asr.service
```

### Disable service (prevent auto-start)

```bash
sudo systemctl disable sinopsis-worker-asr.service
```

## Manual Testing (Before Running as Service)

Test the worker manually first to catch configuration issues:

```bash
cd /opt/sinopsis-worker-asr
source venv/bin/activate
python worker.py
```

If it works manually but fails as a service, the issue is likely:

- Environment variables not loaded (`.env` file)
- PATH missing system binaries (ffmpeg, etc.)
- Permission issues
- User context differences

## Service File Explanation

```ini
[Unit]
Description=Sinopsis ASR Worker Service
After=network.target rabbitmq-server.service postgresql.service
# ^ Wait for network and dependencies before starting

[Service]
Type=simple
# ^ Service runs in foreground
User=syauqi
Group=syauqi
# ^ Run as specific user (not root for security)
WorkingDirectory=/opt/sinopsis-worker-asr
# ^ Set working directory for relative paths
Environment=PATH=/opt/sinopsis-worker-asr/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# ^ Full PATH including venv and system binaries (ffmpeg, etc.)
EnvironmentFile=-/opt/sinopsis-worker-asr/.env
# ^ Load environment variables from .env file (- means optional)
ExecStart=/opt/sinopsis-worker-asr/venv/bin/python /opt/sinopsis-worker-asr/worker.py
# ^ Use absolute paths for reliability
Restart=always
RestartSec=10
# ^ Auto-restart on failure after 10 seconds

[Install]
WantedBy=multi-user.target
# ^ Start when system reaches multi-user mode
```

## Deployment Checklist

- [ ] Worker runs successfully in manual mode
- [ ] `.env` file exists with all required variables
- [ ] Virtual environment has all dependencies installed
- [ ] ffmpeg is installed system-wide
- [ ] PostgreSQL is running and accessible
- [ ] RabbitMQ is running and accessible
- [ ] User has GPU access (if using CUDA)
- [ ] Service file is installed in `/etc/systemd/system/`
- [ ] Systemd daemon reloaded
- [ ] Service enabled for auto-start
- [ ] Service starts without errors
- [ ] Logs show successful initialization

## Performance Tuning

### Adjust resource limits

Edit the service file to add:

```ini
# Increase file descriptor limit
LimitNOFILE=65536

# Set memory limit (optional)
MemoryMax=8G

# Set CPU priority (optional, -20 to 19)
Nice=-5
```

Then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart sinopsis-worker-asr.service
```

## Useful Debugging Commands

```bash
# Check if service file has syntax errors
systemd-analyze verify /etc/systemd/system/sinopsis-worker-asr.service

# View environment variables the service sees
sudo systemctl show sinopsis-worker-asr.service --property=Environment

# Test service start in debug mode
sudo systemd-run --unit=test-worker --working-directory=/opt/sinopsis-worker-asr \
  --setenv=PATH=/opt/sinopsis-worker-asr/venv/bin:/usr/bin:/bin \
  /opt/sinopsis-worker-asr/venv/bin/python /opt/sinopsis-worker-asr/worker.py
```

## Getting Help

If you're still experiencing issues:

1. Collect logs:

   ```bash
   sudo journalctl -u sinopsis-worker-asr.service -n 500 > service-logs.txt
   ```

2. Check system info:

   ```bash
   echo "=== System Info ===" > debug-info.txt
   uname -a >> debug-info.txt
   echo "=== GPU Info ===" >> debug-info.txt
   nvidia-smi >> debug-info.txt 2>&1
   echo "=== Python Info ===" >> debug-info.txt
   /opt/sinopsis-worker-asr/venv/bin/python --version >> debug-info.txt
   echo "=== Service Status ===" >> debug-info.txt
   sudo systemctl status sinopsis-worker-asr.service >> debug-info.txt
   ```

3. Share both files when requesting support
