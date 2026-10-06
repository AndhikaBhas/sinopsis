# Installation Guide for Sinopsis ASR Worker (WhisperX)

This guide covers installation on Windows, macOS, and Linux (Debian/Ubuntu) with CUDA 12.2 support and WhisperX force alignment for Indonesian language.

- `RABBITMQ_URL`: RabbitMQ connection URL

- `RABBIT_MQ_EXCHANGE`: RabbitMQ exchange name
- `RABBIT_MQ_INPUT_QUEUE`: RabbitMQ input queue name
- `RABBIT_MQ_OUTPUT_QUEUE`: RabbitMQ output queue name

## Quick Start (Experienced Users)

```bash
# 1. Setup environment
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# venv\Scripts\activate   # Windows

# 2. Install PyTorch with CUDA 12.2 support
pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with your database, RabbitMQ, MinIO settings

# 5. Run worker
python worker.py
```

For detailed installation steps, continue reading below.

---

## Prerequisites

- Python 3.8+ (3.10+ recommended)
- NVIDIA GPU with CUDA 12.2+ support (optional, but recommended)
- Access to PostgreSQL database
- Access to RabbitMQ server
- Access to MinIO server
- 8GB+ RAM (16GB+ recommended for large models)

## 1. Install Python

### Windows

Download and install Python from [python.org](https://www.python.org/downloads/). Make sure to check "Add Python to PATH" during installation.

### macOS

Install Python using Homebrew:

```bash
brew install python
```

Or download from [python.org](https://www.python.org/downloads/).

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv build-essential
```

## 2. Install CUDA 12.2 (GPU Support)

### Windows

1. Download and install CUDA 12.2 from [NVIDIA's website](https://developer.nvidia.com/cuda-downloads)
2. Install cuDNN 8.x compatible with CUDA 12.2
3. Add CUDA to your PATH environment variable

### Linux (Ubuntu/Debian)

```bash
# Install NVIDIA drivers
sudo apt install nvidia-driver-535

# Add NVIDIA CUDA repository
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-keyring_1.0-1_all.deb
sudo dpkg -i cuda-keyring_1.0-1_all.deb
sudo apt-get update

# Install CUDA 12.2
sudo apt-get install cuda-12-2

# Install cuDNN
sudo apt-get install libcudnn8 libcudnn8-dev

# Add to PATH
echo 'export PATH=/usr/local/cuda-12.2/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.2/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

### macOS

GPU acceleration not supported. The worker will automatically use CPU.

## 3. Clone or Download the Project

Place the project files in a directory of your choice.

## 4. Set Up Virtual Environment (Recommended)

### Windows

```cmd
python -m venv venv
venv\Scripts\activate
```

### macOS/Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

## 5. Install PyTorch with CUDA Support

```bash
# For CUDA 12.2 (use cu121 index which is compatible)
pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

Verify CUDA installation:

```bash
python3 -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'CUDA version: {torch.version.cuda}')"
```

## 6. Install Dependencies

With the virtual environment activated:

```bash
pip install -r requirements.txt
```

## 7. Configure Environment Variables

Copy the `.env.example` file to `.env` and update the values according to your setup:

- `DATABASE_URL`: PostgreSQL connection string
- `RABBITMQ_URL`: RabbitMQ connection URL
- `RABBIT_MQ_EXCHANGE`: RabbitMQ exchange name
- `RABBIT_MQ_QUEUE`: RabbitMQ queue name
- `MINIO_ENDPOINT`: MinIO server endpoint
- `MINIO_USER`: MinIO access key
- `MINIO_PASSWORD`: MinIO secret key
- `MINIO_BUCKET`: MinIO bucket name
- `ASR_MODEL`: Whisper model size (`tiny`, `small`, `medium`, `large-v2`)
- `ASR_DEVICE`: Preferred device (`cuda` or `cpu`)
- `ASR_COMPUTE_TYPE`: Compute type (`float16` for GPU, `int8` for CPU)
- `ASR_LANGUAGE`: Language code (`id` for Bahasa Indonesia)
- `ASR_BATCH_SIZE`: Batch size for processing (default: `16`)
- `FORCE_ALIGN`: Enable phoneme-based force alignment (`true` or `false`)
- `ALIGN_MODEL`: Indonesian phoneme model for alignment (default: `auto` - uses WhisperX default)

## 8. Run the Worker

### Development Mode

With the virtual environment activated:

```bash
python worker.py
```

The worker will start as a service, continuously monitoring RabbitMQ for jobs.

### Production Service Deployment

For production deployment as a Linux service:

```bash
# 1. Deploy the service (run as root)
sudo ./deploy.sh

# 2. Configure environment
sudo nano /opt/sinopsis-worker-asr/.env

# 3. Enable and start the service
sudo systemctl enable sinopsis-worker-asr
sudo systemctl start sinopsis-worker-asr

# 4. Check service status
sudo systemctl status sinopsis-worker-asr

# 5. View logs
sudo journalctl -u sinopsis-worker-asr -f
```

### Service Management Commands

```bash
# Service control
sudo systemctl start sinopsis-worker-asr    # Start service
sudo systemctl stop sinopsis-worker-asr     # Stop service
sudo systemctl restart sinopsis-worker-asr  # Restart service
sudo systemctl status sinopsis-worker-asr   # Check status

# Log monitoring
sudo journalctl -u sinopsis-worker-asr -f                # Follow logs
sudo journalctl -u sinopsis-worker-asr --since "1h ago" # Last hour logs
```

### Service Features

- **Automatic Restart**: Service automatically restarts on failure
- **Signal Handling**: Graceful shutdown on SIGTERM/SIGINT
- **Connection Recovery**: Automatic RabbitMQ reconnection
- **Resource Limits**: Memory and file descriptor limits
- **Security**: Runs as dedicated service user

## Docker Installation (Alternative)

For easier deployment with GPU support:

```bash
# Build container
docker build -t sinopsis-worker-asr .

# Run with GPU support
docker run --gpus all --env-file .env sinopsis-worker-asr

# Run CPU-only
docker run --env-file .env -e ASR_DEVICE=cpu sinopsis-worker-asr
```

## Performance Optimization

### Model Selection

- `tiny`: Fastest, lowest accuracy (~1GB VRAM)
- `small`: Good balance (~2GB VRAM)
- `medium`: Better accuracy (~5GB VRAM)
- `large-v2`: Best accuracy (~10GB VRAM)

### Force Alignment Impact

- With force alignment enabled: More accurate word-level timestamps but ~20-30% slower
- Force alignment requires additional ~2GB VRAM for alignment model
- Disable force alignment for faster processing if word-level precision is not critical

### GPU Memory Management

```bash
# Check GPU memory
nvidia-smi

# If running out of memory, use smaller model or disable force alignment
ASR_MODEL=small
ASR_COMPUTE_TYPE=float16
FORCE_ALIGN=false
```

## Troubleshooting

### CUDA Issues

```bash
# Check CUDA installation
nvidia-smi
nvcc --version

# Test PyTorch CUDA
python3 -c "import torch; print(torch.cuda.is_available())"

# If CUDA not available, force CPU mode
export ASR_DEVICE=cpu
export ASR_COMPUTE_TYPE=int8
```

### Connection Issues

- **MinIO**: Verify endpoint, credentials, and bucket name in `.env`
- **Database**: Check DATABASE_URL and ensure PostgreSQL is accessible
- **RabbitMQ**: Verify connection URL and queue/exchange configuration

### Memory Issues

- Use smaller ASR model (`small` instead of `large-v2`)
- Increase system swap space
- Use `int8` compute type for lower memory usage

## Job Message Format

The worker expects RabbitMQ messages in JSON format:

```json
{
  "rapat_chunk_id": 123,
  "filename": "79_003_20250923_002851_standardized.webm",
  "rapat_id": 45
}
```

Where:

- `rapat_chunk_id`: ID of the rapat_chunk record to update
- `filename`: Path to the audio file in MinIO bucket
- `rapat_id`: (Optional) Meeting ID for transcript merging

## Output Messages

When a meeting is complete and all transcripts are merged, the worker publishes a completion message to the output queue:

```json
{
  "rapat_id": 45,
  "timestamp": "2025-09-24T10:30:00.123456"
}
```
