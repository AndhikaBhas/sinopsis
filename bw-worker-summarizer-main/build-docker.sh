#!/bin/bash

set -euo pipefail

IMAGE_NAME="sinopsis-worker-summarizer"
VERSION="${1:-v1.1}"

echo "Building Docker image ${IMAGE_NAME}:${VERSION}"
sudo docker build --pull --tag "${IMAGE_NAME}:${VERSION}" .
