# 📚 Documentation Index

Complete documentation for Sinopsis Worker Diarizer - All docs organized in one place!

---

## 🚀 Quick Start Guides

**Start here if you're new!**

| Document | Description | Status |
|----------|-------------|--------|
| **[QUICKSTART.md](QUICKSTART.md)** | Complete quick start guide for building | ✅ Updated |
| **[TOKEN_SETUP.md](TOKEN_SETUP.md)** | HuggingFace token setup | ✅ No setup needed! |
| **[BUILD_STATUS.md](BUILD_STATUS.md)** | Current build implementation status | ✅ Complete |
| **[GPU_QUICKSTART.md](GPU_QUICKSTART.md)** | GPU setup quick guide | ✅ Ready |

---

## 📦 Build & Docker

**Everything about building the Docker image:**

### Build Guides
- **[BUILD_GUIDE.md](BUILD_GUIDE.md)** - Comprehensive Docker build guide with all options
- **[BUILD_SCRIPT_UPDATE.md](BUILD_SCRIPT_UPDATE.md)** - Build script improvements and updates
- **[DOCKER_MEMORY_FIX.md](DOCKER_MEMORY_FIX.md)** - Memory allocation fixes (std::bad_alloc solution)

### Docker Configuration
- **[DOCKER.md](DOCKER.md)** - Complete Docker deployment guide
- **[DOCKER_QUICK_REF.md](DOCKER_QUICK_REF.md)** - Quick reference for Docker commands
- **[DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md)** - Common Docker issues and solutions
- **[DOCKERFILE_UNIFIED.md](DOCKERFILE_UNIFIED.md)** - Unified Dockerfile documentation

### Optimization
- **[IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md)** - Docker image optimization techniques
- **[IMAGE_SIZE_UPDATE.md](IMAGE_SIZE_UPDATE.md)** - Image size optimization results
- **[WHY_13GB_IS_NORMAL.md](WHY_13GB_IS_NORMAL.md)** - Understanding Docker image sizes (10-13GB is normal!)

---

## 🎯 GPU & CUDA

**GPU configuration and troubleshooting:**

- **[GPU_SETUP.md](GPU_SETUP.md)** - Detailed GPU setup and configuration
- **[GPU_QUICKSTART.md](GPU_QUICKSTART.md)** - Quick GPU setup guide
- **[CUDA_12.2.md](CUDA_12.2.md)** - CUDA 12.2 specific documentation
- **[TORCHVISION_ABI_FIX.md](TORCHVISION_ABI_FIX.md)** - PyTorch ABI compatibility fixes
- **[TORCHVISION_WARNING_FIX.md](TORCHVISION_WARNING_FIX.md)** - Warning suppression guide

---

## 📡 Offline & Air-Gapped

**Running without internet access:**

- **[OFFLINE_BUILD.md](OFFLINE_BUILD.md)** - Building for offline environments
- **[OFFLINE_IMPLEMENTATION.md](OFFLINE_IMPLEMENTATION.md)** - Offline implementation details
- **[../OFFLINE_QUICK_REF.md](../OFFLINE_QUICK_REF.md)** - Quick reference (in root folder)

---

## 🔄 Upgrades & Migration

**Recent updates and changes:**

- **[UPGRADE_SUMMARY.md](UPGRADE_SUMMARY.md)** ⭐ - PyAnnote 3.1 → 4.0.1 & community-1 model upgrade
- **[MIGRATION_NOTICE.md](MIGRATION_NOTICE.md)** - Migration notices and breaking changes
- **[SERVICE_SCRIPTS_CLEANUP.md](SERVICE_SCRIPTS_CLEANUP.md)** - Service script cleanup documentation

---

## � Troubleshooting & Fixes

**Solutions to common problems:**

### RabbitMQ Connection Issues ⭐ NEW!
- **[COMPLETE_FIX_SUMMARY.md](COMPLETE_FIX_SUMMARY.md)** - Complete RabbitMQ ConnectionWrongStateError fix
- **[HEARTBEAT_FIX.md](HEARTBEAT_FIX.md)** - Detailed heartbeat timeout analysis
- **[RABBITMQ_FIX.md](RABBITMQ_FIX.md)** - RabbitMQ connection troubleshooting
- **[QUICK_FIX_SUMMARY.md](QUICK_FIX_SUMMARY.md)** - Quick reference for RabbitMQ fixes

### Docker & Build Issues
- **[DOCKER_MEMORY_FIX.md](DOCKER_MEMORY_FIX.md)** - Memory allocation fixes (std::bad_alloc solution)
- **[DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md)** - Common Docker issues and solutions

### GPU & CUDA Issues
- **[TORCHVISION_ABI_FIX.md](TORCHVISION_ABI_FIX.md)** - PyTorch ABI compatibility fixes
- **[TORCHVISION_WARNING_FIX.md](TORCHVISION_WARNING_FIX.md)** - Warning suppression guide

---

## �📊 Technical Reference

**Deep dive documentation:**

- **[DOCS_ORGANIZATION.md](DOCS_ORGANIZATION.md)** - How documentation is organized
- **[WHY_13GB_IS_NORMAL.md](WHY_13GB_IS_NORMAL.md)** - Technical explanation of image size

---

## 📚 Archived Documentation

**Historical documentation (kept for reference):**

- **[archived/DEPLOYMENT.md](archived/DEPLOYMENT.md)** - Legacy deployment guide
- **[archived/SYSTEMD_TROUBLESHOOTING.md](archived/SYSTEMD_TROUBLESHOOTING.md)** - SystemD troubleshooting

---

## 🎯 Recommended Reading Order

### 👶 First-Time Users:
1. ✅ **[QUICKSTART.md](QUICKSTART.md)** - Start here!
2. ✅ **[TOKEN_SETUP.md](TOKEN_SETUP.md)** - Token setup (no manual setup needed!)
3. ✅ **[BUILD_GUIDE.md](BUILD_GUIDE.md)** - Complete build instructions
4. ✅ **[DOCKER_QUICK_REF.md](DOCKER_QUICK_REF.md)** - Useful Docker commands

### 🔧 Troubleshooting:
1. 🔥 **[COMPLETE_FIX_SUMMARY.md](COMPLETE_FIX_SUMMARY.md)** - RabbitMQ connection errors ⭐ NEW!
2. 🔥 **[DOCKER_MEMORY_FIX.md](DOCKER_MEMORY_FIX.md)** - Fix memory errors
3. 🔥 **[DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md)** - General Docker problems
4. 🎮 **[GPU_SETUP.md](GPU_SETUP.md)** - GPU-specific issues
5. 📖 **[BUILD_GUIDE.md](BUILD_GUIDE.md)** - Build troubleshooting

### 🚀 Advanced Users:
1. 📦 **[IMAGE_OPTIMIZATION.md](IMAGE_OPTIMIZATION.md)** - Optimize image size
2. 📡 **[OFFLINE_BUILD.md](OFFLINE_BUILD.md)** - Air-gapped deployment
3. 🔄 **[UPGRADE_SUMMARY.md](UPGRADE_SUMMARY.md)** - Recent upgrades
4. 🎯 **[GPU_SETUP.md](GPU_SETUP.md)** - Advanced GPU configuration

---

## 🎓 Quick Reference Table

| **I Need Help With...** | **Check This Document** | **Priority** |
|-------------------------|-------------------------|--------------|
| 🚀 Getting started | [QUICKSTART.md](QUICKSTART.md) | ⭐⭐⭐ |
| � RabbitMQ connection errors | [COMPLETE_FIX_SUMMARY.md](COMPLETE_FIX_SUMMARY.md) | ⭐⭐⭐ |
| �💾 Memory errors | [DOCKER_MEMORY_FIX.md](DOCKER_MEMORY_FIX.md) | ⭐⭐⭐ |
| 🔑 Token setup | [TOKEN_SETUP.md](TOKEN_SETUP.md) | ⭐⭐⭐ |
| 🎮 GPU not working | [GPU_SETUP.md](GPU_SETUP.md) | ⭐⭐ |
| 📦 Image too large | [WHY_13GB_IS_NORMAL.md](WHY_13GB_IS_NORMAL.md) | ⭐⭐ |
| 📡 Offline deployment | [OFFLINE_BUILD.md](OFFLINE_BUILD.md) | ⭐⭐ |
| 🔄 PyAnnote upgrade info | [UPGRADE_SUMMARY.md](UPGRADE_SUMMARY.md) | ⭐⭐ |
| 🔧 Build configuration | [BUILD_GUIDE.md](BUILD_GUIDE.md) | ⭐⭐ |
| 🐳 Docker commands | [DOCKER_QUICK_REF.md](DOCKER_QUICK_REF.md) | ⭐ |
| 🔍 Troubleshooting | [DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md) | ⭐ |

---

## 📋 Documentation Status

| Category | Status | Last Updated |
|----------|--------|--------------|
| Quick Start | ✅ Complete | Oct 18, 2025 |
| Build Guides | ✅ Complete | Oct 18, 2025 |
| Docker Setup | ✅ Complete | Oct 18, 2025 |
| GPU/CUDA | ✅ Complete | Oct 18, 2025 |
| Troubleshooting | ✅ Complete | Oct 18, 2025 |
| Upgrades | ✅ Complete | Oct 18, 2025 |
| Offline Deployment | ✅ Complete | Oct 18, 2025 |

---

## 🎯 Quick Actions

### Building the Image
```bash
# Just run this!
./build-docker.sh gpu

# For CPU-only
./build-docker.sh cpu
```

### Getting Help
1. Check the [Quick Reference Table](#-quick-reference-table) above
2. Start with [QUICKSTART.md](QUICKSTART.md)
3. For errors, see [DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md)

### Recent Updates ⭐
- **Oct 19, 2025:** RabbitMQ connection fixes - heartbeat timeout solution
- **Oct 18, 2025:** PyAnnote upgraded to 4.0.1 with community-1 model
- **Oct 18, 2025:** Memory allocation fixes implemented
- **Oct 18, 2025:** Token setup simplified (no manual setup needed)
- **Oct 18, 2025:** Build scripts updated with automatic token handling

---

## 💡 Tips

- 💾 **Memory:** Ensure Docker has 10GB+ allocated
- 🔑 **Token:** Build scripts use default token automatically
- 🎮 **GPU:** CUDA 12.8 supported for GPU builds
- 📦 **Size:** 10-13GB is normal for ML images
- 📡 **Offline:** Model cached during build for offline use

---

**Documentation Version:** 2.1  
**Last Updated:** October 19, 2025  
**Status:** ✅ Complete and Organized
