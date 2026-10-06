# Optimized Dockerfile using Official CTranslate2 Image
# Uses pre-compiled ctranslate2 to avoid Docker compatibility issues
FROM ghcr.io/opennmt/ctranslate2:4.6.0-ubuntu22.04-cuda12.2 AS builder

# Build arguments for model configuration
ARG ASR_MODEL=tiny
ARG ASR_LANGUAGE=id
ARG FORCE_ALIGN=false
ARG ALIGN_MODEL=Wikidepia/wav2vec2-xls-r-300m-indonesian

# Set working directory
WORKDIR /build

# Set timezone non-interactively to avoid interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/"$TZ" /etc/localtime && echo "$TZ" > /etc/timezone

# Install Python 3.11 and build dependencies
RUN apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    build-essential \
    curl \
    ffmpeg \
    git \
    libffi-dev \
    libsndfile1-dev \
    libssl-dev \
    pkg-config \
    python3-pip \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Create virtual environment with Python 3.11
RUN python3.11 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install PyTorch with CUDA 12.2 support
RUN pip install --upgrade pip setuptools wheel && \
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install Python dependencies (ctranslate2 already available from base image)
RUN pip install --no-cache-dir -r requirements.txt

# Runtime stage - Use same base image for compatibility
FROM ghcr.io/opennmt/ctranslate2:4.6.0-ubuntu22.04-cuda12.2 AS runtime

# Build arguments for model configuration (must be redeclared in each stage)
ARG ASR_MODEL=tiny
ARG ASR_LANGUAGE=id
ARG FORCE_ALIGN=false
ARG ALIGN_MODEL=Wikidepia/wav2vec2-xls-r-300m-indonesian

# Set working directory
WORKDIR /app

# Set timezone non-interactively for runtime stage and install dependencies
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/"$TZ" /etc/localtime && echo "$TZ" > /etc/timezone \
    && apt-get update && apt-get install -y \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    python3.11 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy virtual environment from builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application files
COPY worker.py .
COPY transcript_merger.py .
COPY validate_env.py .
COPY download_models.py .

# Pre-download WhisperX models to include in image
# Set cache directories for model downloads
ENV HF_HOME=/app/.cache/huggingface
ENV WHISPERX_CACHE_DIR=/app/.cache/whisperx
ENV MPLBACKEND=Agg

# Create cache directories, download WhisperX models, and set permissions
RUN mkdir -p /app/.cache/huggingface \
    /app/.cache/whisperx \
    /app/.cache/matplotlib \
    /home/worker \
    /home/worker/.config \
    /app/logs && \
    echo "Building with model: ${ASR_MODEL}, language: ${ASR_LANGUAGE}, force_align: ${FORCE_ALIGN}" && \
    ASR_MODEL=${ASR_MODEL} \
    ASR_LANGUAGE=${ASR_LANGUAGE} \
    FORCE_ALIGN=${FORCE_ALIGN} \
    ALIGN_MODEL=${ALIGN_MODEL} \
    python3.11 /app/download_models.py && \
    groupadd -r worker && useradd -r -g worker -u 1001 worker && \
    chown -R worker:worker /home/worker && \
    chown -R worker:worker /app && \
    chown -R worker:worker /app/.cache && \
    chown -R worker:worker /app/logs

# Switch to non-root user
USER worker

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HF_HOME=/app/.cache/huggingface
ENV WHISPERX_CACHE_DIR=/app/.cache/whisperx
ENV MPLBACKEND=Agg
ENV MPLCONFIGDIR=/app/.cache/matplotlib
ENV HOME=/home/worker

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3.11 -c "import torch; print('Health check passed')" || exit 1

# Override the base image's entrypoint and set our command
ENTRYPOINT []
CMD ["python3.11", "worker.py"]

# Labels for metadata
LABEL maintainer="Syauqi"
LABEL description="WhisperX ASR Worker with Indonesian force alignment - Official CTranslate2 Base"
LABEL version="3.0.4"
LABEL python.version="3.11"
LABEL cuda.version="12.2"
LABEL ctranslate2.version="4.6.0"
LABEL whisperx.model="${ASR_MODEL}"
LABEL whisperx.language="${ASR_LANGUAGE}"