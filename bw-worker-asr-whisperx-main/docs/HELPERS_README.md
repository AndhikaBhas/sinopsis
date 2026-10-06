# Helper Scripts

This directory contains utility scripts for operations and troubleshooting.

## 🛠️ Available Scripts

### [check-service.sh](check-service.sh) ⭐ NEW

**Purpose:** Comprehensive health check for systemd service

**Usage:**

```bash
# Run service health check
./helpers/check-service.sh

# Or from installation directory
cd /opt/sinopsis-worker-asr
./helpers/check-service.sh
```

**What it checks:**

- ✅ Service file installation
- ✅ Installation directory structure
- ✅ Virtual environment setup
- ✅ .env configuration file
- ✅ System dependencies (ffmpeg, NVIDIA drivers)
- ✅ Python dependencies (whisperx, torch, pika)
- ✅ PostgreSQL service status
- ✅ RabbitMQ service status
- ✅ Current service status and logs
- 📋 Step-by-step fixes for any issues found

**Example output:**

```
======================================
Sinopsis Worker Service Health Check
======================================

1. Checking service file...
✓ Service file exists

2. Checking installation directory...
✓ Installation directory exists: /opt/sinopsis-worker-asr

...

✓ All checks passed!
```

---

### [deploy-service.sh](deploy-service.sh) ⭐ NEW

**Purpose:** Deploy or update the systemd service

**Usage:**

```bash
# Deploy/update service (requires root)
sudo ./helpers/deploy-service.sh
```

**What it does:**

1. Copies service file to `/etc/systemd/system/`
2. Sets correct permissions
3. Reloads systemd daemon
4. Optionally restarts running service
5. Enables service for auto-start
6. Shows current status

---

### [check-cuda.sh](check-cuda.sh)

**Purpose:** Validate CUDA/cuDNN dependencies for GPU acceleration

**Usage:**

```bash
# Run CUDA dependency check
./helpers/check-cuda.sh

# Or from installation directory
cd /opt/sinopsis-worker-asr
./helpers/check-cuda.sh
```

**What it checks:**

- ✅ NVIDIA GPU availability and driver version
- ✅ CUDA Toolkit installation and version
- ✅ cuDNN library installation (version 8.x required)
- ✅ PyTorch CUDA support and configuration
- ✅ Required cuDNN shared libraries
- ✅ Library search paths (LD_LIBRARY_PATH)
- 📋 Recommendations for fixing missing dependencies

**Example output:**

```
🔍 Checking CUDA/cuDNN Dependencies...
========================================

1. Checking NVIDIA GPU...
NVIDIA GeForce RTX 3080, 535.129.03, 10240 MiB
✅ NVIDIA GPU detected

2. Checking CUDA Toolkit...
CUDA Toolkit Version: 12.1
CUDA Driver Version: 12.2
✅ CUDA Toolkit installed

3. Checking cuDNN Libraries...
cuDNN 8: /usr/lib/x86_64-linux-gnu/libcudnn.so.8
✅ cuDNN 8 installed

4. Checking PyTorch...
PyTorch Version: 2.1.0+cu121
CUDA Available in PyTorch: True
✅ PyTorch with CUDA support
```

---

### [troubleshoot.sh](troubleshoot.sh)

**Purpose:** Automated diagnostics for common issues

**Usage:**

```bash
# Run full diagnostics
sudo ./helpers/troubleshoot.sh

# Or from installation directory
cd /opt/sinopsis-worker-asr
sudo ./helpers/troubleshoot.sh
```

**What it checks:**

- ✅ Python and dependencies
- ✅ Environment configuration
- ✅ RabbitMQ connectivity
- ✅ MinIO connectivity
- ✅ PostgreSQL connectivity
- ✅ File permissions
- ✅ Disk space
- ✅ CUDA/GPU availability

---

### [fix-permissions.sh](fix-permissions.sh)

**Purpose:** Fix file and directory permissions

**Usage:**

```bash
# Fix all permissions
sudo ./helpers/fix-permissions.sh

# Or from installation directory
cd /opt/sinopsis-worker-asr
sudo ./helpers/fix-permissions.sh
```

**What it fixes:**

- ✅ Installation directory ownership
- ✅ Virtual environment permissions
- ✅ Script execution permissions
- ✅ .env file security (600)
- ✅ Log file access

---

### [monitor.sh](monitor.sh)

**Purpose:** Real-time system and service monitoring

**Usage:**

```bash
# Start monitoring
sudo ./helpers/monitor.sh

# Or from installation directory
cd /opt/sinopsis-worker-asr
sudo ./helpers/monitor.sh
```

**What it monitors:**

- ✅ Service status
- ✅ CPU usage
- ✅ Memory usage (RAM)
- ✅ GPU usage (if available)
- ✅ Disk space
- ✅ Process information
- ✅ Recent log entries

**Output:** Refreshes every 5 seconds with live stats

---

## 🚀 Common Usage Scenarios

### Scenario 0: Setting Up Service (First Time)

```bash
# 1. Run health check to see what's missing
./helpers/check-service.sh

# 2. Fix any issues reported

# 3. Deploy the service
sudo ./helpers/deploy-service.sh

# 4. Start the service
sudo systemctl start sinopsis-worker-asr

# 5. Monitor logs
sudo journalctl -u sinopsis-worker-asr -f
```

### Scenario 1: Service Won't Start

```bash
# 1. Run service health check
./helpers/check-service.sh

# 2. Run full diagnostics
sudo ./helpers/troubleshoot.sh

# 3. Fix permissions if needed
sudo ./helpers/fix-permissions.sh

# 4. Try starting service
sudo systemctl start sinopsis-worker-asr

# 5. Monitor for issues
sudo ./helpers/monitor.sh
```

### Scenario 2: Updating Service Configuration

```bash
# 1. Edit the service file
nano sinopsis-worker-asr.service

# 2. Redeploy
sudo ./helpers/deploy-service.sh

# Service will be restarted automatically
```

### Scenario 3: Permission Errors

```bash
# Fix all permissions
sudo ./helpers/fix-permissions.sh

# Restart service
sudo systemctl restart sinopsis-worker-asr
```

### Scenario 4: Performance Issues

```bash
# Monitor system resources
sudo ./helpers/monitor.sh

# Check for memory leaks or high GPU usage
# Press Ctrl+C to exit
```

### Scenario 5: After Deployment

```bash
# 1. Run diagnostics to validate
sudo ./helpers/troubleshoot.sh

# 2. Monitor during first few jobs
sudo ./helpers/monitor.sh

# 3. Check logs
sudo journalctl -u sinopsis-worker-asr -f
```

---

## 📋 Requirements

All scripts require:

- ✅ Root/sudo access
- ✅ Bash shell
- ✅ Standard Unix utilities (grep, awk, ps, etc.)

Optional (for full functionality):

- ✅ nvidia-smi (for GPU monitoring)
- ✅ systemctl (for service management)
- ✅ psql (for PostgreSQL checks)

---

## 🔧 Customization

### Change Installation Directory

Edit the scripts and update:

```bash
INSTALL_DIR="/opt/sinopsis-worker-asr"  # Change this
```

### Change Service Name

Edit the scripts and update:

```bash
SERVICE_NAME="sinopsis-worker-asr"  # Change this
```

---

## 📖 Related Documentation

- **Deployment:** [../docs/DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md)
- **Troubleshooting:** [../docs/RABBITMQ_TROUBLESHOOTING.md](../docs/RABBITMQ_TROUBLESHOOTING.md)
- **Installation:** [../docs/INSTALL.md](../docs/INSTALL.md)
- **Main README:** [../README.md](../README.md)

---

## 🆕 What's New in v3.0.0

- Helper scripts moved to dedicated `helpers/` folder
- Updated paths in all scripts
- Cleaner project root directory
- See [../docs/CLEANUP_SUMMARY.md](../docs/CLEANUP_SUMMARY.md) for details

---

## 💡 Tips

1. **Always run with sudo** - Scripts need elevated privileges
2. **Run from any directory** - Scripts detect installation path
3. **Check exit codes** - Scripts return 0 on success, 1 on failure
4. **Read the output** - Scripts provide detailed diagnostic information
5. **Use in automation** - Scripts are designed for CI/CD integration

---

## 🆘 Getting Help

If issues persist after running these scripts:

1. Check service logs: `sudo journalctl -u sinopsis-worker-asr -n 100`
2. Review documentation: [../docs/](../docs/)
3. Check configuration: `cat /opt/sinopsis-worker-asr/.env`
4. Validate environment: `python validate_env.py`
