# Deployment Guide

**Version:** 3.0.0  
**Last Updated:** October 1, 2025

## Overview

The improved `deploy.sh` script handles both **new installations** and **updates** intelligently, preserving your configuration and installed dependencies.

---

## 🎯 Key Features

### Smart Installation Detection

- ✅ Detects existing installations automatically
- ✅ Preserves `.env` configuration (with backup)
- ✅ Reuses existing virtual environment and PyTorch
- ✅ Updates only application code
- ✅ No downtime during updates (graceful service stop)

### Backup & Safety

- ✅ Backs up `.env` before updates: `.env.backup-YYYYMMDD-HHMMSS`
- ✅ Warns about deprecated configuration (USE_MEMORY_MODE)
- ✅ Validates installation at each step
- ✅ Detailed error messages with debugging info

### Idempotent Operations

- ✅ Can be run multiple times safely
- ✅ Skips already completed steps
- ✅ Updates only what's changed
- ✅ Preserves user data

---

## 📋 Prerequisites

### System Requirements

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3 python3-venv python3-pip rsync

# RHEL/CentOS
sudo yum install -y python3 python3-pip rsync

# Verify Python 3.9+
python3 --version  # Should be 3.9 or higher
```

### CUDA Support (Optional but Recommended)

```bash
# Check if NVIDIA GPU is available
nvidia-smi

# Install CUDA 12.1+ if needed
# See: https://developer.nvidia.com/cuda-downloads
```

### Permissions

```bash
# Must run as root
sudo ./deploy.sh
```

---

## 🚀 Usage Scenarios

### Scenario 1: Fresh Installation (First Time)

```bash
# 1. Clone repository
git clone <your-repo-url>
cd sinopsis-worker-asr-whisperx

# 2. Run deployment
sudo ./deploy.sh

# Output will show:
# 📦 Installation type: NEW INSTALLATION
# ✅ Created .env from .env.example
# 🐍 Creating Python virtual environment...
# 🔥 Installing PyTorch with CUDA 12.1 support...
# 📦 Installing/updating dependencies...

# 3. Configure environment
sudo nano /opt/sinopsis-worker-asr/.env

# 4. Enable and start service
sudo systemctl enable sinopsis-worker-asr
sudo systemctl start sinopsis-worker-asr
sudo systemctl status sinopsis-worker-asr
```

**What happens:**

- ✅ Creates service user `syauqi`
- ✅ Creates `/opt/sinopsis-worker-asr` directory
- ✅ Copies all application files
- ✅ Creates new virtual environment
- ✅ Installs PyTorch with CUDA support (~2GB download)
- ✅ Installs all dependencies (~3GB total)
- ✅ Creates `.env` from `.env.example`
- ✅ Installs systemd service

**Time:** ~15-30 minutes (depends on download speed)

---

### Scenario 2: Update Existing Installation

```bash
# 1. Navigate to project directory
cd sinopsis-worker-asr-whisperx

# 2. Pull latest changes
git pull origin main

# 3. Run deployment
sudo ./deploy.sh

# Output will show:
# 📦 Existing installation detected at: /opt/sinopsis-worker-asr
# ⚙️  Service sinopsis-worker-asr is already installed
# 🛑 Stopping existing service...
# 💾 Backing up existing .env file...
# ✅ Backed up to: .env.backup-20251001-143022
# 📋 Updating application files...
#    Preserving: .env, venv/
# 🐍 Virtual environment already exists: /opt/sinopsis-worker-asr/venv
# 🔥 PyTorch already installed: v2.1.0
# 📦 Installing/updating dependencies...

# 4. Restart service
sudo systemctl start sinopsis-worker-asr
sudo systemctl status sinopsis-worker-asr
```

**What happens:**

- ✅ Detects existing installation
- ✅ Stops service gracefully
- ✅ Backs up current `.env` file
- ✅ Updates only application code (preserves venv, .env, temp)
- ✅ Reuses existing PyTorch installation
- ✅ Updates dependencies if requirements.txt changed
- ✅ Updates systemd service file
- ✅ Service ready to restart

**Time:** ~2-5 minutes (no re-downloading)

---

### Scenario 3: Force Fresh Installation

If you want to start completely fresh:

```bash
# 1. Stop and disable service
sudo systemctl stop sinopsis-worker-asr
sudo systemctl disable sinopsis-worker-asr

# 2. Backup your .env
sudo cp /opt/sinopsis-worker-asr/.env ~/sinopsis-backup.env

# 3. Remove installation
sudo rm -rf /opt/sinopsis-worker-asr

# 4. Run fresh deployment
cd sinopsis-worker-asr-whisperx
sudo ./deploy.sh

# 5. Restore your .env
sudo cp ~/sinopsis-backup.env /opt/sinopsis-worker-asr/.env

# 6. Start service
sudo systemctl enable sinopsis-worker-asr
sudo systemctl start sinopsis-worker-asr
```

---

### Scenario 4: Reinstall Dependencies Only

If dependencies are broken:

```bash
# Remove virtual environment but keep .env
sudo rm -rf /opt/sinopsis-worker-asr/venv

# Re-run deployment (will recreate venv)
cd sinopsis-worker-asr-whisperx
sudo ./deploy.sh

# Restart service
sudo systemctl restart sinopsis-worker-asr
```

---

### Scenario 5: Update PyTorch Version

```bash
# 1. Uninstall current PyTorch
sudo /opt/sinopsis-worker-asr/venv/bin/pip uninstall torch torchvision torchaudio -y

# 2. Re-run deployment (will reinstall PyTorch)
cd sinopsis-worker-asr-whisperx
sudo ./deploy.sh

# 3. Restart service
sudo systemctl restart sinopsis-worker-asr
```

---

## 🔍 What Gets Preserved vs Updated

### ✅ PRESERVED (Never Overwritten)

| Item                 | Location                         | Notes                     |
| -------------------- | -------------------------------- | ------------------------- |
| `.env` file          | `/opt/sinopsis-worker-asr/.env`  | Backed up before update   |
| Virtual environment  | `/opt/sinopsis-worker-asr/venv/` | Reused if exists          |
| PyTorch installation | `venv/lib/.../torch/`            | Only installed if missing |
| Temp files           | `/opt/sinopsis-worker-asr/temp/` | Not copied over           |
| Git history          | `.git/`                          | Excluded from copy        |

### 🔄 UPDATED (Overwritten)

| Item             | Location                        | Notes                               |
| ---------------- | ------------------------------- | ----------------------------------- |
| Application code | `worker.py`, etc.               | Always updated                      |
| Scripts          | `*.sh` files                    | Always updated                      |
| Documentation    | `*.md` files                    | Always updated                      |
| Requirements     | `requirements.txt`              | Always updated                      |
| Service file     | `/etc/systemd/system/*.service` | Always updated                      |
| Dependencies     | Python packages                 | Updated if requirements.txt changed |

---

## 📊 Installation Directory Structure

```
/opt/sinopsis-worker-asr/
├── .env                     # ✅ PRESERVED - Your configuration
├── .env.backup-*           # Backup files
├── venv/                   # ✅ PRESERVED - Virtual environment
│   ├── bin/
│   │   ├── python3
│   │   ├── pip
│   │   └── ...
│   └── lib/
│       └── python3.x/
│           └── site-packages/
│               ├── torch/  # ✅ PRESERVED - PyTorch (~2GB)
│               └── ...
├── temp/                   # ✅ PRESERVED - Temporary files (not used in v3.0)
├── worker.py              # 🔄 UPDATED - Main application
├── transcript_merger.py   # 🔄 UPDATED
├── requirements.txt       # 🔄 UPDATED
├── deploy.sh             # 🔄 UPDATED
├── *.md                  # 🔄 UPDATED - Documentation
└── test_*.py             # 🔄 UPDATED - Test files
```

---

## 🛠️ Configuration Management

### View Current Configuration

```bash
sudo cat /opt/sinopsis-worker-asr/.env
```

### Edit Configuration

```bash
sudo nano /opt/sinopsis-worker-asr/.env
```

### Compare with Backup

```bash
# List available backups
ls -la /opt/sinopsis-worker-asr/.env.backup-*

# Compare with latest backup
sudo diff /opt/sinopsis-worker-asr/.env /opt/sinopsis-worker-asr/.env.backup-20251001-143022
```

### Restore from Backup

```bash
# Copy backup to .env
sudo cp /opt/sinopsis-worker-asr/.env.backup-20251001-143022 /opt/sinopsis-worker-asr/.env

# Restart service
sudo systemctl restart sinopsis-worker-asr
```

### Remove Deprecated Settings (v3.0+)

```bash
# Check for USE_MEMORY_MODE (deprecated in v3.0)
sudo grep "USE_MEMORY_MODE" /opt/sinopsis-worker-asr/.env

# Remove it (memory mode is always enabled now)
sudo sed -i '/USE_MEMORY_MODE/d' /opt/sinopsis-worker-asr/.env
```

---

## 🔧 Service Management

### Start Service

```bash
sudo systemctl start sinopsis-worker-asr
```

### Stop Service

```bash
sudo systemctl stop sinopsis-worker-asr
```

### Restart Service (after config changes)

```bash
sudo systemctl restart sinopsis-worker-asr
```

### Check Status

```bash
sudo systemctl status sinopsis-worker-asr
```

### Enable Auto-start on Boot

```bash
sudo systemctl enable sinopsis-worker-asr
```

### Disable Auto-start

```bash
sudo systemctl disable sinopsis-worker-asr
```

### View Logs (Live)

```bash
sudo journalctl -u sinopsis-worker-asr -f
```

### View Logs (Last 100 lines)

```bash
sudo journalctl -u sinopsis-worker-asr -n 100
```

### View Logs (Since Today)

```bash
sudo journalctl -u sinopsis-worker-asr --since today
```

---

## 🚨 Troubleshooting

### Problem: Service Won't Start

```bash
# 1. Check service status
sudo systemctl status sinopsis-worker-asr

# 2. Check logs
sudo journalctl -u sinopsis-worker-asr -n 50

# 3. Validate configuration
cd /opt/sinopsis-worker-asr
sudo -u syauqi ./venv/bin/python validate_env.py

# 4. Run troubleshoot script
sudo ./troubleshoot.sh
```

### Problem: Dependencies Installation Failed

```bash
# 1. Check disk space
df -h /opt

# 2. Check pip
sudo -u syauqi /opt/sinopsis-worker-asr/venv/bin/pip --version

# 3. Reinstall dependencies
sudo -u syauqi /opt/sinopsis-worker-asr/venv/bin/pip install -r /opt/sinopsis-worker-asr/requirements.txt --force-reinstall

# 4. Check specific package
sudo -u syauqi /opt/sinopsis-worker-asr/venv/bin/pip show whisperx
```

### Problem: PyTorch CUDA Not Working

```bash
# 1. Check CUDA availability
nvidia-smi

# 2. Test PyTorch CUDA
cd /opt/sinopsis-worker-asr
sudo -u syauqi ./venv/bin/python -c "import torch; print('CUDA:', torch.cuda.is_available())"

# 3. Reinstall PyTorch
sudo /opt/sinopsis-worker-asr/venv/bin/pip uninstall torch torchvision torchaudio -y
sudo /opt/sinopsis-worker-asr/venv/bin/pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### Problem: Permission Denied

```bash
# Fix all permissions
cd /opt/sinopsis-worker-asr
sudo ./fix-permissions.sh

# Or manually:
sudo chown -R syauqi:syauqi /opt/sinopsis-worker-asr
sudo chmod -R u+rwx /opt/sinopsis-worker-asr/venv
```

### Problem: .env File Not Created

```bash
# Manually create from example
sudo cp /opt/sinopsis-worker-asr/.env.example /opt/sinopsis-worker-asr/.env
sudo chown syauqi:syauqi /opt/sinopsis-worker-asr/.env
sudo chmod 600 /opt/sinopsis-worker-asr/.env

# Edit configuration
sudo nano /opt/sinopsis-worker-asr/.env
```

---

## 📈 Monitoring

### Check Memory Usage

```bash
cd /opt/sinopsis-worker-asr
sudo ./monitor.sh
```

### Check GPU Usage

```bash
watch -n 1 nvidia-smi
```

### Check Disk Usage

```bash
du -sh /opt/sinopsis-worker-asr/*
```

### Check Process

```bash
ps aux | grep worker.py
```

---

## 🧪 Testing After Deployment

```bash
# 1. Validate environment
cd /opt/sinopsis-worker-asr
sudo -u syauqi ./venv/bin/python validate_env.py

# 2. Test memory mode
sudo -u syauqi ./venv/bin/python test_memory_mode.py

# 3. Test text cleaning
sudo -u syauqi ./venv/bin/python test_text_cleaning.py

# 4. Check service status
sudo systemctl status sinopsis-worker-asr

# 5. Monitor logs for errors
sudo journalctl -u sinopsis-worker-asr -f
```

---

## 🔄 Rollback Procedure

If deployment causes issues:

```bash
# 1. Stop service
sudo systemctl stop sinopsis-worker-asr

# 2. Restore .env from backup
sudo cp /opt/sinopsis-worker-asr/.env.backup-TIMESTAMP /opt/sinopsis-worker-asr/.env

# 3. Check out previous version
cd sinopsis-worker-asr-whisperx
git log --oneline  # Find previous commit
git checkout <previous-commit-hash>

# 4. Re-deploy
sudo ./deploy.sh

# 5. Start service
sudo systemctl start sinopsis-worker-asr
```

---

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Backup current `.env` manually (if critical)
- [ ] Check disk space: `df -h /opt` (need ~5GB free)
- [ ] Stop any manual worker processes
- [ ] Note current service status: `systemctl status sinopsis-worker-asr`
- [ ] Review changelog: `cat CHANGELOG.md`

### During Deployment

- [ ] Run `sudo ./deploy.sh`
- [ ] Watch for errors in output
- [ ] Verify backup was created
- [ ] Check PyTorch installation status

### Post-Deployment

- [ ] Review `.env` changes if needed
- [ ] Start/restart service: `systemctl restart sinopsis-worker-asr`
- [ ] Check service status: `systemctl status sinopsis-worker-asr`
- [ ] Monitor logs for 5 minutes: `journalctl -u sinopsis-worker-asr -f`
- [ ] Verify memory usage: `./monitor.sh`
- [ ] Test with sample job
- [ ] Remove old backups if desired: `rm /opt/sinopsis-worker-asr/.env.backup-*`

---

## 🎯 Best Practices

### Development → Staging → Production

```bash
# 1. Test in development first
cd ~/dev/sinopsis-worker-asr-whisperx
sudo ./deploy.sh
# Test thoroughly

# 2. Deploy to staging
ssh staging-server
cd /opt/deployment/sinopsis-worker-asr-whisperx
git pull
sudo ./deploy.sh
# Test with real data

# 3. Deploy to production
ssh production-server
cd /opt/deployment/sinopsis-worker-asr-whisperx
git pull
sudo ./deploy.sh
# Monitor closely
```

### Version Pinning

For production, pin to specific versions:

```bash
# Deploy specific version
git checkout v3.0.0
sudo ./deploy.sh
```

### Monitoring After Deploy

```bash
# Monitor for first hour
watch -n 60 'systemctl status sinopsis-worker-asr && journalctl -u sinopsis-worker-asr -n 5'
```

---

## 📞 Support

**Issues?**

- Check `CLEANUP_SUMMARY.md` for v3.0 changes
- Check `RABBITMQ_TROUBLESHOOTING.md` for RabbitMQ issues
- Run `./troubleshoot.sh` for diagnostics
- Check logs: `journalctl -u sinopsis-worker-asr -n 100`

**Questions?**

- Review `README.md` for features
- Review `MEMORY_MODE.md` for architecture
- Check `CHANGELOG.md` for version history

---

## 🎉 Summary

The improved `deploy.sh` handles:

✅ **First-time installations** - Complete setup from scratch  
✅ **Updates** - Smart updates preserving configuration  
✅ **Safety** - Automatic backups and validation  
✅ **Efficiency** - Reuses existing installations  
✅ **Troubleshooting** - Detailed error messages

**You can now deploy with confidence!** 🚀
