# Documentation

This directory contains all project documentation.

## 📚 Available Documentation

### Setup & Installation

- **[INSTALL.md](INSTALL.md)** - Complete installation guide with prerequisites
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Deployment scenarios and best practices

### Architecture & Features

- **[MEMORY_MODE.md](MEMORY_MODE.md)** - In-memory model architecture and performance
- **[ZERO_TEMP_FILES.md](ZERO_TEMP_FILES.md)** - Zero temporary files implementation

### Migration & Upgrades

- **[UPGRADE_TO_MEMORY_MODE.md](UPGRADE_TO_MEMORY_MODE.md)** - Migrating to memory mode
- **[MIGRATION.md](MIGRATION.md)** - General migration procedures
- **[CLEANUP_SUMMARY.md](CLEANUP_SUMMARY.md)** - v3.0.0 cleanup changes

### Operations

- **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** - Testing procedures and validation
- **[RABBITMQ_TROUBLESHOOTING.md](RABBITMQ_TROUBLESHOOTING.md)** - RabbitMQ debugging guide

### Version History

- **[CHANGELOG.md](CHANGELOG.md)** - Version history and release notes

## 📖 Reading Order

### For New Users

1. Start with [../README.md](../README.md) in root directory
2. Follow [INSTALL.md](INSTALL.md) for installation
3. Use [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for deployment
4. Reference [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) for validation

### For Existing Users Upgrading

1. Read [CHANGELOG.md](CHANGELOG.md) for changes
2. Review [CLEANUP_SUMMARY.md](CLEANUP_SUMMARY.md) for v3.0 changes
3. Follow [UPGRADE_TO_MEMORY_MODE.md](UPGRADE_TO_MEMORY_MODE.md) if needed
4. Check [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for update procedures

### For Developers

1. [MEMORY_MODE.md](MEMORY_MODE.md) - Architecture details
2. [ZERO_TEMP_FILES.md](ZERO_TEMP_FILES.md) - Implementation details
3. [TESTING_CHECKLIST.md](TESTING_CHECKLIST.md) - Test procedures

### For Troubleshooting

1. [RABBITMQ_TROUBLESHOOTING.md](RABBITMQ_TROUBLESHOOTING.md) - RabbitMQ issues
2. [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Deployment problems
3. [../helpers/troubleshoot.sh](../helpers/troubleshoot.sh) - Automated diagnostics

## 🔗 Quick Links

- **Main README:** [../README.md](../README.md)
- **Helper Scripts:** [../helpers/](../helpers/)
- **Test Files:** [../test_memory_mode.py](../test_memory_mode.py), [../test_text_cleaning.py](../test_text_cleaning.py)

## 📝 Documentation Standards

All documentation follows:

- ✅ Markdown format
- ✅ Clear section headers
- ✅ Code examples with syntax highlighting
- ✅ Step-by-step instructions
- ✅ Troubleshooting sections
- ✅ Cross-references to related docs

## 🆕 What's New in v3.0.0

- Documentation reorganized into `docs/` folder
- Helper scripts moved to `helpers/` folder
- Cleaner project root directory
- Updated all internal references
- See [CLEANUP_SUMMARY.md](CLEANUP_SUMMARY.md) for details
