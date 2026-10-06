#!/bin/bash

# Run sinopsis-recorder Docker container
echo "Starting sinopsis-recorder container..."

# Stop and remove existing container if it exists
sudo docker stop sinopsis-recorder 2>/dev/null
sudo docker rm sinopsis-recorder 2>/dev/null

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
else
    echo "⚠️  Warning: .env file not found. Using .env.example as reference."
    echo "Please create a .env file with your configuration."
    exit 1
fi

# Run the container
sudo docker run -d \
  --name sinopsis-recorder \
  -p 3000:3000 \
  --restart unless-stopped \
  -e DATABASE_URL="$DATABASE_URL" \
  -e RABBITMQ_URL="$RABBITMQ_URL" \
  -e RABBIT_MQ_EXCHANGE="$RABBIT_MQ_EXCHANGE" \
  -e RABBIT_MQ_QUEUE="$RABBIT_MQ_QUEUE" \
  -e STORAGE_TYPE="$STORAGE_TYPE" \
  -e STORAGE_CONNECTION_TIMEOUT_MS="$STORAGE_CONNECTION_TIMEOUT_MS" \
  -e MINIO_ENDPOINT="$MINIO_ENDPOINT" \
  -e MINIO_USER="$MINIO_USER" \
  -e MINIO_PASSWORD="$MINIO_PASSWORD" \
  -e MINIO_BUCKET="$MINIO_BUCKET" \
  -e VITE_CHUNKED_RECORDING_ENABLED="$VITE_CHUNKED_RECORDING_ENABLED" \
  -e VITE_MIN_CHUNK_LENGTH_SECONDS="$VITE_MIN_CHUNK_LENGTH_SECONDS" \
  -e VITE_CHUNK_SILENCE_THRESHOLD_DBFS="$VITE_CHUNK_SILENCE_THRESHOLD_DBFS" \
  -e VITE_CHUNK_SILENCE_DURATION_SECONDS="$VITE_CHUNK_SILENCE_DURATION_SECONDS" \
  -e VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS="$VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS" \
  -e VITE_PREFERRED_AUDIO_FORMAT="$VITE_PREFERRED_AUDIO_FORMAT" \
  -e VITE_ENHANCED_AUDIO_PROCESSING="$VITE_ENHANCED_AUDIO_PROCESSING" \
  -e VITE_AUDIO_QUALITY="$VITE_AUDIO_QUALITY" \
  -e VITE_TEST_AUDIO_HEADERS="$VITE_TEST_AUDIO_HEADERS" \
  sinopsis-recorder:v1.1

if [ $? -eq 0 ]; then
    echo "✓ Container started successfully!"
    echo "Container name: sinopsis-recorder"
    echo "Access the application at: http://localhost:3000"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    docker logs -f sinopsis-recorder"
    echo "  Stop:         docker stop sinopsis-recorder"
    echo "  Restart:      docker restart sinopsis-recorder"
else
    echo "✗ Failed to start container!"
    exit 1
fi
