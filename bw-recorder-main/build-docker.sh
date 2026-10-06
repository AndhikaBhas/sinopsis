#!/bin/bash

# Build Docker image for sinopsis-recorder
echo "Building Docker image..."

sudo docker build -t sinopsis-recorder:v1.1 .

if [ $? -eq 0 ]; then
    echo "✓ Docker image built successfully!"
    echo "Image: sinopsis-recorder:v1.1"
else
    echo "✗ Docker build failed!"
    exit 1
fi
