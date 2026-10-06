# Alternative Docker Build - Handle ctranslate2 Compatibility Issues

This document provides alternative approaches if the main Dockerfile still has ctranslate2 issues.

## Quick Fix - Use Ubuntu Base

If you continue having issues with the Debian slim base, try this Ubuntu-based alternative:

```dockerfile
# Alternative Dockerfile using Ubuntu base for better compatibility
FROM ubuntu:22.04 AS builder

# Install Python 3.11 and system dependencies
RUN apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    build-essential \
    curl \
    ffmpeg \
    git \
    libffi-dev \
    libsndfile1-dev \
    libssl-dev \
    pkg-config \
    wget \
    execstack \
    prelink \
    && rm -rf /var/lib/apt/lists/*

# Rest of the build process...
```

## Environment Variable Solutions

Add these to your `.env` or Docker environment:

```bash
# Ctranslate2 configuration
CT2_VERBOSE=0
CT2_USE_EXPERIMENTAL_PACKED_GEMM=OFF
CT2_FORCE_CPU_ISA=GENERIC

# Security context
MPLBACKEND=Agg
OMP_NUM_THREADS=4

# Python optimization
PYTHONOPTIMIZE=1
PYTHONDONTWRITEBYTECODE=1
```

## CPU-Only Stable Build

For maximum compatibility, use CPU-only mode:

```dockerfile
# Add this to your Dockerfile after pip install
RUN pip install --force-reinstall --no-deps ctranslate2==4.3.1
```

```bash
# Build CPU-only version
docker build --build-arg DEVICE=cpu -t sinopsis-worker-asr:cpu .
```

## Runtime Fixes

If the build succeeds but runtime fails, add this to your startup script:

```bash
# Disable problematic ctranslate2 features
export CT2_FORCE_CPU_ISA=GENERIC
export CT2_USE_EXPERIMENTAL_PACKED_GEMM=OFF
export OMP_NUM_THREADS=1

# Test ctranslate2 loading with fallback
python3 -c "
try:
    import ctranslate2
    print('✅ ctranslate2 loaded successfully')
except Exception as e:
    print(f'⚠️ ctranslate2 issue: {e}')
    print('Continuing with CPU fallback...')
"
```

## Package Version Pinning

Pin specific versions in requirements.txt:

```txt
# Pin stable versions
ctranslate2==4.3.1
faster-whisper==1.0.1
torch==2.1.0
```

## Complete Alternative Dockerfile

Here's a more conservative approach:

```dockerfile
FROM python:3.11-slim AS builder

WORKDIR /build

# Minimal system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    ffmpeg \
    git \
    libsndfile1-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install with CPU-only PyTorch first (more stable)
RUN pip install --upgrade pip setuptools wheel && \
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install other dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Runtime stage
FROM python:3.11-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r worker && useradd -r -g worker -u 1001 worker

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application files
COPY worker.py transcript_merger.py validate_env.py ./
COPY docker-entrypoint.sh ./
COPY helpers/ ./helpers/

RUN chown -R worker:worker /app && \
    chmod +x docker-entrypoint.sh helpers/*.sh

USER worker

# Conservative environment settings
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HF_HOME=/app/.cache/huggingface
ENV WHISPERX_CACHE_DIR=/app/.cache/whisperx
ENV ASR_DEVICE=cpu
ENV ASR_COMPUTE_TYPE=int8
ENV PRELOAD_MODELS=false

CMD ["./docker-entrypoint.sh"]
```

This conservative approach:

- Uses CPU-only PyTorch (more stable)
- Disables model preloading
- Minimal dependencies
- Should build successfully on any system
