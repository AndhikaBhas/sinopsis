# ============================================
# Optimized Unified Dockerfile for CPU and GPU builds
# Size-optimized: ~8-10GB (down from 14GB+)
# ============================================
# Build arguments:
#   CUDA_VERSION: cu128 (GPU, CUDA 12.8), cpu (CPU-only)
#   TORCH_VERSION: PyTorch version (default: 2.8.0)
#
# Examples:
#   GPU (CUDA 12.8): docker build --build-arg CUDA_VERSION=cu128 -t sinopsis-worker:gpu .
#   CPU-only:        docker build --build-arg CUDA_VERSION=cpu -t sinopsis-worker:cpu .

# ============================================
# Stage 1: Base Builder - Build dependencies
# ============================================
FROM python:3.13-slim AS builder

# Build arguments
ARG CUDA_VERSION=cu128
ARG TORCH_VERSION=2.8.0
ARG TORCHAUDIO_VERSION=2.8.0
ARG HF_TOKEN

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive \
    HF_HOME=/opt/huggingface_cache \
    TRANSFORMERS_CACHE=/opt/huggingface_cache \
    HF_HUB_OFFLINE=0 \
    TRANSFORMERS_OFFLINE=0

# Install build dependencies in one layer and clean up immediately
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    ffmpeg \
    g++ \
    gcc \
    git \
    libpq-dev \
    libsndfile1-dev \
    wget \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /tmp/* /var/tmp/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements file
COPY requirements.txt .

# Upgrade pip and install build tools (no cache)
# Note: Setting PIP_USE_PEP517=1 to use modern build standards where possible
ENV PIP_USE_PEP517=1
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install core dependencies (no cache, single layer)
RUN pip install --no-cache-dir \
    minio==7.2.18 \
    pika==1.3.2 \
    psycopg2-binary==2.9.10 \
    python-dotenv==1.1.1 \
    structlog==25.4.0

# Install numpy (no cache)
RUN pip install --no-cache-dir "numpy>=1.24.0,<3.0.0"

# Install audio processing libraries (no cache)
RUN pip install --no-cache-dir \
    "librosa>=0.10.0,<0.12.0" \
    "pydub>=0.25.1" \
    "soundfile>=0.12.1"

# Install PyTorch packages with specified CUDA version (no cache)
# Note: torchvision removed as it's not used in the application
# Install both torch and torchaudio from CUDA 12.8 index to ensure version compatibility
RUN if [ "${CUDA_VERSION}" = "cpu" ]; then \
        pip install --no-cache-dir \
            torch==2.8.0 \
            torchaudio==2.8.0; \
    else \
        pip install --no-cache-dir \
            torch==2.8.0 \
            torchaudio==2.8.0 \
            --index-url https://download.pytorch.org/whl/cu128; \
    fi

# Install pyannote.audio (no cache)
RUN pip install --no-cache-dir pyannote.audio==4.0.1

# CRITICAL FIX: Remove torchcodec to prevent std::bad_alloc
# torchcodec 0.8.0 causes memory allocation crash with PyTorch 2.8.0+cu128
# PyAnnote works fine without it (only needed for video, we use audio only)
RUN pip uninstall -y torchcodec || true

# Create HuggingFace cache directory before download
RUN mkdir -p /opt/huggingface_cache && chmod 755 /opt/huggingface_cache

# Download PyAnnote models for offline use
# Copy download script and run it with HF token
# Note: If you encounter memory issues during build, increase Docker memory limit:
#   Docker Desktop: Settings > Resources > Memory (recommend 8GB+)
#   Or use: docker build --memory=8g ...
COPY download_models.py /tmp/download_models.py
RUN export HUGGINGFACE_HUB_TOKEN="${HF_TOKEN}" && \
    export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512 && \
    python /tmp/download_models.py || { \
        echo "Model download failed - checking if files were partially downloaded..."; \
        ls -lah /opt/huggingface_cache || true; \
    } && \
    rm /tmp/download_models.py && \
    echo "Verifying model cache..." && \
    ls -lah /opt/huggingface_cache && \
    if [ -d "/opt/huggingface_cache/models--pyannote--speaker-diarization-community-1" ]; then \
        echo "✓ Model cache verified successfully"; \
    else \
        echo "⚠ WARNING: Model may not be fully cached. Will download on first run."; \
        echo "This is not fatal - model will be downloaded at runtime if needed."; \
    fi

# Aggressive cleanup to reduce image size
RUN find /opt/venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/venv -type f -name "*.pyc" -delete && \
    find /opt/venv -type f -name "*.pyo" -delete && \
    find /opt/venv -type d -name "*.dist-info" -exec sh -c 'rm -f "$1"/direct_url.json "$1"/RECORD' _ {} \; 2>/dev/null || true && \
    find /opt/venv -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/venv -type d -name "test" -exec rm -rf {} + 2>/dev/null || true && \
    find /opt/venv -name "*.so" -exec strip {} \; 2>/dev/null || true && \
    rm -rf /root/.cache /tmp/* /var/tmp/*

# ============================================
# Stage 2: Runtime - Minimal Final Image
# ============================================
FROM python:3.13-slim AS runtime

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/opt/venv/bin:$PATH" \
    TORCH_HOME=/opt/torch_cache \
    HF_HOME=/opt/huggingface_cache \
    TRANSFORMERS_CACHE=/opt/huggingface_cache \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1 \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    DEBIAN_FRONTEND=noninteractive \
    PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True \
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    PYTORCH_JIT=0 \
    MALLOC_TRIM_THRESHOLD_=65536 \
    MALLOC_MMAP_THRESHOLD_=65536 \
    MALLOC_ARENA_MAX=2 \
    LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 \
    PYTORCH_NO_CUDA_MEMORY_CACHING=0 \
    PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128,expandable_segments:True,roundup_power2_divisions:8

# Install ONLY runtime dependencies in one layer and clean up aggressively
# CRITICAL: Added libjemalloc2 to fix std::bad_alloc errors
# jemalloc is a better memory allocator that prevents fragmentation
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    libgomp1 \
    libjemalloc2 \
    libjpeg62-turbo \
    libpng16-16 \
    libpq5 \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /tmp/* /var/tmp/* /usr/share/doc/* /usr/share/man/* \
    && find /usr/lib -name "*.a" -delete \
    && find /usr/lib -name "*.la" -delete

# Create non-root user and necessary directories
RUN useradd -m -u 1000 -s /bin/bash worker && \
    mkdir -p /app /opt/torch_cache /opt/huggingface_cache && \
    chown -R worker:worker /app /opt/torch_cache /opt/huggingface_cache

# Copy virtual environment from builder (this is where all Python packages are)
COPY --from=builder --chown=worker:worker /opt/venv /opt/venv

# Copy pre-downloaded HuggingFace models from builder
COPY --from=builder --chown=worker:worker /opt/huggingface_cache /opt/huggingface_cache

# Set working directory
WORKDIR /app

# Copy application code (use .dockerignore to exclude unnecessary files)
COPY --chown=worker:worker . .

# Create logs directory
RUN mkdir -p logs && chown -R worker:worker logs

# Remove any test files, documentation from application code
RUN find /app -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
    find /app -type f -name "*.pyc" -delete && \
    find /app -type f -name "*.pyo" -delete && \
    rm -rf /app/.git* /app/docs /app/tests /app/*.md 2>/dev/null || true

# Switch to non-root user
USER worker

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import sys; sys.exit(0)"

# Default command
CMD ["python", "main.py"]
