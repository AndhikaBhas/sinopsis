# Sinopsis Worker Splicer

A Rust background worker that joins multiple audio files (.webm) into a single file using RabbitMQ for job queuing, MinIO for storage, and PostgreSQL for metadata.

## Prerequisites

- Rust (latest stable version)
- FFmpeg installed on the system
- Access to RabbitMQ, MinIO, and PostgreSQL servers

## Installation

### Windows

1. Install Rust from https://rustup.rs/
2. Install FFmpeg:
   - Download from https://ffmpeg.org/download.html#build-windows
   - Add to PATH
3. Clone the repository and build:
   ```
   git clone <repo-url>
   cd sinopsis-worker-splicer
   cargo build --release
   ```

### macOS

1. Install Rust:
   ```
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
2. Install FFmpeg:
   ```
   brew install ffmpeg
   ```
3. Clone and build:
   ```
   git clone <repo-url>
   cd sinopsis-worker-splicer
   cargo build --release
   ```

### Debian Linux

1. Install Rust:
   ```
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```
2. Install FFmpeg:
   ```
   sudo apt update
   sudo apt install ffmpeg
   ```
3. Clone and build:
   ```
   git clone <repo-url>
   cd sinopsis-worker-splicer
   cargo build --release
   ```

## Configuration

Copy `.env` and adjust the values according to your setup:

- `RABBITMQ_URL`: Full RabbitMQ connection URL (e.g., amqp://user:pass@host:port/vhost)
- `RABBIT_MQ_EXCHANGE`: Exchange name for messaging
- `RABBIT_MQ_INPUT_QUEUE`: Queue for incoming job messages (expects JSON with `rapat_id`)
- `RABBIT_MQ_OUTPUT_QUEUE`: Queue for completion messages (publishes JSON with `rapat_id`, `file_name`, `bucket_name`)
- `DATABASE_URL`: PostgreSQL connection string (e.g., postgres://user:pass@host:port/db)
- `MINIO_ENDPOINT`: MinIO/S3 server URL (e.g., http://host:port)
- `MINIO_ACCESS_KEY`: MinIO access key
- `MINIO_SECRET_KEY`: MinIO secret key
- `MINIO_INPUT_BUCKET`: Bucket containing input audio chunks
- `MINIO_OUTPUT_BUCKET`: Bucket for output joined audio files
- `SAMPLE_FILENAME`: Example filename (not used in code)
- `OUTPUT_PREFIX`: Prefix for output filenames (default: "rapat_")

## Running

```
cargo run --release
```

Or using Docker:

```
docker build -t sinopsis-worker-splicer .
docker run --env-file .env sinopsis-worker-splicer
```

## How it works

1. Listens for job messages on the input RabbitMQ queue containing `rapat_id`
2. Queries PostgreSQL `rapat_chunk` table for audio file names and order
3. Downloads audio files from MinIO input bucket
4. Joins them using FFmpeg into a single .webm file
5. Uploads the result to MinIO output bucket
6. Publishes completion message with `rapat_id`, `file_name`, and `bucket_name`