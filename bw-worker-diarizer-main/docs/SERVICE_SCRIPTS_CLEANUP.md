# Service Scripts Cleanup - October 5, 2025

## Summary

Since the project is now deployed using **Docker**, all Linux systemd service-related scripts and documentation have been removed or archived.

---

## 🗑️ Files Removed

### Scripts Deleted

1. **`sinopsis-worker-diarizer.service`** - Systemd service unit file
2. **`start_worker.sh`** - Linux service startup script
3. **`deploy.sh`** - Automated systemd deployment script
4. **`check-config.sh`** - Systemd configuration checker
5. **`fix-torchvision.sh`** - Linux-specific torchvision fix script

### Documentation Archived

Moved to `docs/archived/`:

1. **`DEPLOYMENT.md`** - Systemd deployment guide
2. **`SYSTEMD_TROUBLESHOOTING.md`** - Systemd troubleshooting guide

These files are preserved for reference but are no longer maintained.

---

## ✅ Files Kept

### Active Scripts

1. **`buildDocker.sh`** ✅ - Build Docker images (GPU/CPU)
2. **`runDocker.sh`** ✅ - Run Docker container helper
3. **`test-pytorch-abi.sh`** ✅ - Test PyTorch ABI compatibility
4. **`docker-compose.yml`** ✅ - Docker Compose configuration

### Core Application

- `main.py` - Application entry point
- `config.py` - Configuration management
- `requirements.txt` - Python dependencies
- `Dockerfile` - Docker image definition
- `.dockerignore` - Docker build exclusions
- All Python modules in `processors/` and `utils/`

---

## 📚 Documentation Updates

### Files Updated

1. **`README.md`**

   - ❌ Removed systemd service installation section
   - ❌ Removed `deploy.sh` references
   - ✅ Added Docker as primary deployment method
   - ✅ Updated deployment section with Docker commands

2. **`docs/README.md`**

   - ❌ Removed DEPLOYMENT.md and SYSTEMD_TROUBLESHOOTING.md links
   - ✅ Added note about Docker being the recommended method
   - ✅ Updated quick links to focus on Docker

3. **`DOCKER_SETUP_COMPLETE.md`**
   - ❌ Removed SYSTEMD_TROUBLESHOOTING.md reference
   - ✅ Confirmed Docker as production-ready deployment

---

## 🎯 Current Deployment Method

### Recommended: Docker Deployment

Docker is now the **sole recommended deployment method** for this project.

#### Build and Run

```bash
# Build Docker image
./buildDocker.sh gpu

# Run container
./runDocker.sh

# Or use docker-compose
docker-compose up -d
```

#### Management

```bash
# Check status
docker ps
docker logs sinopsis-diarization-worker -f

# Restart
docker restart sinopsis-diarization-worker

# Stop
docker stop sinopsis-diarization-worker

# Remove
docker rm -f sinopsis-diarization-worker
```

#### Complete Documentation

- **[DOCKER_SETUP_COMPLETE.md](../DOCKER_SETUP_COMPLETE.md)** - Full Docker guide
- **[docs/DOCKER_QUICK_REF.md](DOCKER_QUICK_REF.md)** - Quick command reference
- **[docs/GPU_QUICKSTART.md](GPU_QUICKSTART.md)** - GPU setup

---

## 🔄 Migration Path

### If You're Using Systemd Services

**Stop and disable the service:**

```bash
# Stop the service
sudo systemctl stop sinopsis-worker-diarizer
sudo systemctl disable sinopsis-worker-diarizer

# Remove service file
sudo rm /etc/systemd/system/sinopsis-worker-diarizer.service
sudo systemctl daemon-reload
```

**Switch to Docker:**

```bash
# Clone/update repository
cd /path/to/sinopsis-worker-diarizer

# Copy your .env file (if not already present)
cp /opt/sinopsis-worker-diarizer/.env .env

# Build Docker image
./buildDocker.sh gpu

# Run with Docker
./runDocker.sh
# OR
docker-compose up -d
```

---

## ❓ Why Docker Only?

### Advantages of Docker Deployment

1. **✅ Consistency** - Same environment on all servers
2. **✅ Isolation** - No conflicts with system packages
3. **✅ Easy Updates** - Just rebuild and restart
4. **✅ Portability** - Move between servers easily
5. **✅ Resource Management** - Docker handles process management
6. **✅ GPU Support** - Properly configured CUDA environment
7. **✅ Simplified Setup** - No manual dependency installation

### Systemd Issues

- ❌ Complex dependency management
- ❌ System-specific configurations
- ❌ GPU/CUDA setup can be tricky
- ❌ Requires manual Python environment setup
- ❌ Harder to replicate across servers

---

## 📖 Available Documentation

### Current (Active)

| Document                                                | Purpose                    |
| ------------------------------------------------------- | -------------------------- |
| [README.md](../README.md)                               | Main project documentation |
| [DOCKER_SETUP_COMPLETE.md](../DOCKER_SETUP_COMPLETE.md) | Complete Docker guide      |
| [docs/DOCKER_QUICK_REF.md](DOCKER_QUICK_REF.md)         | Docker command reference   |
| [docs/DOCKER.md](DOCKER.md)                             | Detailed Docker guide      |
| [docs/GPU_QUICKSTART.md](GPU_QUICKSTART.md)             | GPU setup guide            |
| [docs/GPU_SETUP.md](GPU_SETUP.md)                       | Complete GPU configuration |
| [docs/IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md)     | Docker image optimization  |
| [docs/WHY_13GB_IS_NORMAL.md](WHY_13GB_IS_NORMAL.md)     | Image size explanation     |

### Archived (Reference Only)

| Document                   | Location       | Status                        |
| -------------------------- | -------------- | ----------------------------- |
| DEPLOYMENT.md              | docs/archived/ | Archived - Use Docker instead |
| SYSTEMD_TROUBLESHOOTING.md | docs/archived/ | Archived - Use Docker instead |

---

## 🎉 Benefits of This Cleanup

1. **Simpler Project Structure** - Less files to maintain
2. **Clear Deployment Path** - Docker is the way
3. **Reduced Confusion** - No conflicting deployment methods
4. **Easier Onboarding** - New developers see one clear path
5. **Better Documentation** - Focused on what actually works

---

## 💡 Need Help?

### Documentation

- Start: [README.md](../README.md)
- Docker: [DOCKER_SETUP_COMPLETE.md](../DOCKER_SETUP_COMPLETE.md)
- Quick Ref: [docs/DOCKER_QUICK_REF.md](DOCKER_QUICK_REF.md)

### Common Tasks

**Build image:**

```bash
./buildDocker.sh gpu
```

**Run container:**

```bash
./runDocker.sh
```

**Check logs:**

```bash
docker logs sinopsis-diarization-worker -f
```

**Restart:**

```bash
docker restart sinopsis-diarization-worker
```

---

## ✅ Verification

After cleanup, your project should have:

- ✅ No `*.service` files
- ✅ No `deploy.sh`, `start_worker.sh`, `check-config.sh`, `fix-torchvision.sh`
- ✅ Only Docker-related scripts: `buildDocker.sh`, `runDocker.sh`, `test-pytorch-abi.sh`
- ✅ `docs/archived/` folder with old systemd docs
- ✅ Updated README.md focusing on Docker
- ✅ Updated docs/README.md with Docker-first approach

---

_Cleanup completed: October 5, 2025_  
_Docker is now the only supported deployment method_ 🐳
