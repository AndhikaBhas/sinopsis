# Docker Build Troubleshooting Guide

## Common Error: "[Errno 5] Input/output error"

This error occurs during pip package installation and is typically caused by:

1. **Insufficient Docker resources** (RAM/CPU)
2. **Disk I/O issues**
3. **Docker storage driver problems**
4. **Insufficient disk space**
5. **Large package downloads timing out**

---

## ✅ Solutions (Try in Order)

### Solution 1: Use the Optimized Dockerfile

I've created `Dockerfile.optimized` which:

- Installs packages in smaller batches
- Uses PyTorch CPU-only builds (much smaller)
- Adds retry logic and better timeout handling
- Copies site-packages instead of using venv

**Build with optimized Dockerfile:**

```bash
./buildDocker.sh latest Dockerfile.optimized
```

Or directly:

```bash
docker build -f Dockerfile.optimized -t sinopsis-worker-diarizer:latest .
```

---

### Solution 2: Increase Docker Resources

#### On Docker Desktop (Mac/Windows):

1. Open **Docker Desktop**
2. Go to **Settings** → **Resources**
3. Increase:
   - **Memory**: 8 GB minimum (12 GB recommended)
   - **CPUs**: 4 minimum (6 recommended)
   - **Disk**: 60 GB minimum
4. Click **Apply & Restart**
5. Try building again

---

### Solution 3: Clean Docker System

Free up space and clear corrupted caches:

```bash
# Stop all containers
docker stop $(docker ps -aq) 2>/dev/null || true

# Remove old containers, images, and build cache
docker system prune -a --volumes -f

# Check disk space
df -h

# Restart Docker Desktop (Mac/Windows)
# Menu Bar → Docker Icon → Quit Docker Desktop
# Then reopen Docker Desktop
```

---

### Solution 4: Restart Docker

Sometimes Docker's storage driver gets corrupted:

**macOS:**

```bash
# Quit Docker Desktop completely
pkill -9 Docker

# Wait 10 seconds
sleep 10

# Restart Docker Desktop
open -a Docker
```

**Linux:**

```bash
sudo systemctl restart docker
```

---

### Solution 5: Change Docker Storage Driver (Linux only)

Edit `/etc/docker/daemon.json`:

```json
{
  "storage-driver": "overlay2"
}
```

Then restart Docker:

```bash
sudo systemctl restart docker
```

---

### Solution 6: Build Without BuildKit

Try disabling BuildKit:

```bash
DOCKER_BUILDKIT=0 docker build -t sinopsis-worker-diarizer:latest .
```

---

### Solution 7: Build with --no-cache

Force a fresh build without cache:

```bash
docker build --no-cache -t sinopsis-worker-diarizer:latest .
```

---

### Solution 8: Manual Step-by-Step Build

Build each layer manually to identify the problem:

```bash
# Start with base image
docker run -it --rm python:3.10-slim bash

# Inside container, run commands manually:
apt-get update
apt-get install -y build-essential gcc g++ libpq-dev libsndfile1-dev ffmpeg git

pip install --upgrade pip setuptools wheel
pip install python-dotenv pika psycopg2-binary minio structlog
pip install numpy
pip install soundfile librosa pydub

# Install PyTorch CPU-only
pip install torch torchaudio torchvision --index-url https://download.pytorch.org/whl/cpu

# Install pyannote
pip install pyannote.audio
```

---

## 🔍 Diagnostic Commands

### Check Docker Status

```bash
docker info
docker version
docker system df  # Check disk usage
```

### Check Available Resources

```bash
# Disk space
df -h

# Docker resources (while building)
docker stats
```

### Monitor Build Progress

```bash
# Build with detailed output
docker build --progress=plain -t sinopsis-worker-diarizer:latest . 2>&1 | tee build.log
```

---

## 📊 File Comparisons

### Original Dockerfile

- Uses single `pip install -r requirements.txt`
- May cause I/O errors with large packages
- Includes GPU support (larger downloads)

### Dockerfile.optimized

- ✅ Installs packages in groups
- ✅ Uses PyTorch CPU-only (saves ~4GB)
- ✅ Better error handling
- ✅ More efficient layer caching
- ✅ Copies site-packages instead of venv

**Recommendation: Use `Dockerfile.optimized` for stable builds**

---

## 🚀 Quick Fix Commands

### One-liner to clean and rebuild:

```bash
docker system prune -a --volumes -f && ./buildDocker.sh latest Dockerfile.optimized
```

### If buildDocker.sh fails:

```bash
chmod +x buildDocker.sh
DOCKER_BUILDKIT=1 docker build -f Dockerfile.optimized -t sinopsis-worker-diarizer:latest .
```

---

## 💡 Prevention Tips

1. **Always use optimized Dockerfile** for production
2. **Keep Docker Desktop updated**
3. **Allocate sufficient resources** (8GB+ RAM)
4. **Regular cleanup**: `docker system prune -f`
5. **Monitor disk space**: Keep 20GB+ free
6. **Use BuildKit**: `export DOCKER_BUILDKIT=1`

---

## 🆘 Still Failing?

### Try GPU-Free Build

If you don't need GPU support, use CPU-only PyTorch (already in Dockerfile.optimized).

### Build in Cloud

Consider building on a cloud instance with more resources:

```bash
# On AWS EC2, GCP Compute, etc.
# t2.large or equivalent (8GB RAM minimum)
```

### Split Requirements

Create separate requirements files:

```bash
# requirements-base.txt (core packages)
# requirements-ml.txt (ML packages)
# requirements-audio.txt (audio packages)
```

Install separately in Dockerfile.

---

## 📞 Need More Help?

Check the build logs:

```bash
docker build --progress=plain -t sinopsis-worker-diarizer:latest . 2>&1 | tee build.log
```

Then review `build.log` for specific error messages.

---

## ✅ Success Checklist

- [ ] Docker Desktop has 8GB+ RAM allocated
- [ ] At least 20GB free disk space
- [ ] Docker Desktop is restarted
- [ ] Using `Dockerfile.optimized`
- [ ] BuildKit is enabled: `export DOCKER_BUILDKIT=1`
- [ ] Build cache is cleared: `docker system prune -f`
- [ ] Build script is executable: `chmod +x buildDocker.sh`

If all checked, run:

```bash
./buildDocker.sh latest Dockerfile.optimized
```
