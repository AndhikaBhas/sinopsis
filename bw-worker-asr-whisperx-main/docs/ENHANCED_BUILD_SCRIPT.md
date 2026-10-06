# Enhanced Build Script with Model Support

## Overview

The `build-docker.sh` script has been enhanced to support configurable WhisperX model selection during Docker build time. This eliminates the need to download all models and allows for optimized image sizes based on your accuracy requirements.

## Usage

```bash
./build-docker.sh [cpu|gpu] [model] [tag]
```

### Parameters

1. **Build Type** (required, default: `gpu`)

   - `gpu` - GPU-enabled with CUDA 12.2 support
   - `cpu` - CPU-only build

2. **Model** (optional, default: `tiny`)

   - `tiny` - Fastest, smallest (~39MB)
   - `small` - Balanced speed/accuracy (~244MB)
   - `medium` - Good accuracy (~769MB)
   - `large-v2` - Best accuracy (~1550MB)

3. **Tag** (optional, default: `latest`)
   - Custom tag for the Docker image

## Examples

### Basic Usage

```bash
# GPU build with tiny model and latest tag
./build-docker.sh

# GPU build with medium model
./build-docker.sh gpu medium

# CPU build with small model
./build-docker.sh cpu small
```

### Advanced Usage

```bash
# GPU with medium model and custom tag
./build-docker.sh gpu medium v1.0

# CPU with large model for production
./build-docker.sh cpu large-v2 prod

# GPU with specific model for development
./build-docker.sh gpu small dev
```

## Model Selection Guide

| Model      | Size    | Speed    | Accuracy | Use Case                   |
| ---------- | ------- | -------- | -------- | -------------------------- |
| `tiny`     | ~39MB   | Fastest  | Basic    | Development, Testing       |
| `small`    | ~244MB  | Fast     | Good     | Balanced performance       |
| `medium`   | ~769MB  | Moderate | Better   | Production (standard)      |
| `large-v2` | ~1550MB | Slower   | Best     | High-accuracy requirements |

## Docker Image Tags

The script creates two tags for each build:

- Primary tag: `sinopsis-worker-asr:$TAG`
- Model tag: `sinopsis-worker-asr:$MODEL`

For CPU builds, `-cpu` suffix is added:

- Primary tag: `sinopsis-worker-asr:$TAG-cpu`
- Model tag: `sinopsis-worker-asr:$MODEL-cpu`

## Build Process

1. **Model Download**: Downloads only the specified model during build
2. **Layer Optimization**: Uses Docker BuildKit for better caching
3. **Size Optimization**: Eliminates unused models and dependencies
4. **Cleanup**: Automatically removes dangling images

## Expected Image Sizes

- **GPU builds**: 12-13GB (includes CUDA runtime)
- **CPU builds**: 5-6GB
- **Savings**: 1-2GB compared to downloading all models

## Error Handling

If an invalid build type is provided, the script shows comprehensive help with:

- Available build types
- Model options with sizes
- Usage examples
- Best practices

## Running the Built Images

### GPU Version

```bash
docker run -d --name sinopsis-worker-asr --gpus all --env-file .env sinopsis-worker-asr:latest
```

### CPU Version

```bash
docker run -d --name sinopsis-worker-asr --env-file .env sinopsis-worker-asr:latest-cpu
```

## Benefits

1. **Faster Builds**: Only downloads required model
2. **Smaller Images**: Eliminates unused models
3. **Flexible Deployment**: Choose accuracy vs speed tradeoff
4. **Development Friendly**: Quick builds with tiny model for testing
5. **Production Ready**: Large models for high-accuracy production use

## Integration

This enhanced script works seamlessly with:

- Existing Docker compose files
- CI/CD pipelines
- Development workflows
- Production deployments

The model selection is passed as a build argument (`ASR_MODEL`) to the Dockerfile, which handles the download during the build process.
