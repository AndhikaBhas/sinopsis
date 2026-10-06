# Documentation Index

Welcome to the comprehensive documentation for the ASR WhisperX Worker project. All documentation has been organized in this `DOCS/` folder for better structure and maintainability.

## 📖 Getting Started

- **[INSTALL.md](INSTALL.md)** - Complete installation guide with dependencies
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Deployment scenarios and update procedures
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** ⭐ - Quick diagnostic commands & common errors
- **[DOCKER.md](DOCKER.md)** ⭐ - Docker setup and multi-stage build guide

## 🏗️ Architecture & Design

- **[MEMORY_MODE.md](MEMORY_MODE.md)** - In-memory model architecture for 30-40% performance boost
- **[ZERO_TEMP_FILES.md](ZERO_TEMP_FILES.md)** - Zero temporary files design using ffmpeg pipes
- **[TRUE_IN_MEMORY.md](TRUE_IN_MEMORY.md)** - True in-memory processing implementation

## 🔄 Version History & Upgrades

- **[CHANGELOG.md](CHANGELOG.md)** - Complete version history
- **[CLEANUP_SUMMARY.md](CLEANUP_SUMMARY.md)** - v3.0.0 cleanup details (-24% code reduction)
- **[UPGRADE_TO_MEMORY_MODE.md](UPGRADE_TO_MEMORY_MODE.md)** - Migration guide from legacy mode
- **[VERSION_COMPATIBILITY.md](VERSION_COMPATIBILITY.md)** - PyTorch/PyAnnote version tracking
- **[MIGRATION.md](MIGRATION.md)** - General migration procedures

## 🛠️ Operations & Troubleshooting

- **[SYSTEMD_SERVICE.md](SYSTEMD_SERVICE.md)** ⭐ - Complete systemd service management
- **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** - Comprehensive testing procedures
- **[RABBITMQ_TROUBLESHOOTING.md](RABBITMQ_TROUBLESHOOTING.md)** - RabbitMQ debugging guide
- **[HELPERS_README.md](HELPERS_README.md)** - Utility scripts documentation

## 🐛 Bug Fixes & Patches

- **[BUGFIX_BYTESIO.md](BUGFIX_BYTESIO.md)** - WhisperX BytesIO compatibility fix (v3.0.1)
- **[FFMPEG_FIX.md](FFMPEG_FIX.md)** ⭐ - Fix "ffmpeg not found" errors
- **[SERVICE_FIXES.md](SERVICE_FIXES.md)** - Recent service fixes explained
- **[CUDA_CUDNN_FIX.md](CUDA_CUDNN_FIX.md)** - CUDA and cuDNN library fixes
- **[CUDA_FIX_SUMMARY.md](CUDA_FIX_SUMMARY.md)** - CUDA troubleshooting summary
- **[ENV_COMMENT_FIX.md](ENV_COMMENT_FIX.md)** - Environment variable comment handling

## 📁 Organization & Structure

All documentation follows a consistent structure:

- **Getting Started** - Installation and initial setup
- **Architecture** - Technical design and implementation details
- **Operations** - Day-to-day management and troubleshooting
- **History** - Version changes and migration guides
- **Fixes** - Specific bug fixes and patches

## 🔍 Quick Navigation

### For New Users

1. Start with [INSTALL.md](INSTALL.md) for complete setup
2. Follow [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for deployment
3. Keep [QUICK_REFERENCE.md](QUICK_REFERENCE.md) handy for common commands

### For Administrators

1. Reference [SYSTEMD_SERVICE.md](SYSTEMD_SERVICE.md) for service management
2. Use [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) for validation
3. Check [RABBITMQ_TROUBLESHOOTING.md](RABBITMQ_TROUBLESHOOTING.md) for connectivity issues

### For Developers

1. Review [MEMORY_MODE.md](MEMORY_MODE.md) for architecture understanding
2. Study [ZERO_TEMP_FILES.md](ZERO_TEMP_FILES.md) for in-memory processing
3. Reference [CHANGELOG.md](CHANGELOG.md) for version history

### For Docker Users

1. Follow [DOCKER.md](DOCKER.md) for optimized Docker setup
2. Use the multi-stage build strategy for minimal images
3. Reference GPU/CPU build configurations

## 📋 Documentation Standards

Each document includes:

- **Clear headings** and table of contents
- **Code examples** with proper formatting
- **Troubleshooting sections** where applicable
- **Cross-references** to related documents
- **Update dates** and version information

## 🆘 Need Help?

1. **Quick Issues**: Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) first
2. **Installation Problems**: Refer to [INSTALL.md](INSTALL.md)
3. **Service Issues**: Use [SYSTEMD_SERVICE.md](SYSTEMD_SERVICE.md)
4. **RabbitMQ Problems**: See [RABBITMQ_TROUBLESHOOTING.md](RABBITMQ_TROUBLESHOOTING.md)
5. **Docker Issues**: Check [DOCKER.md](DOCKER.md)

For automated diagnostics, run the helper scripts in the `helpers/` directory as documented in [HELPERS_README.md](HELPERS_README.md).

---

_Last updated: October 7, 2025_  
_Documentation structure: v1.0 (DOCS folder organization)_
