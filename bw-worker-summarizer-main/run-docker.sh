#!/bin/bash

set -euo pipefail

IMAGE_NAME="sinopsis-worker-summarizer"
CONTAINER_NAME="sinopsis-worker-summarizer"
VERSION="${1:-v1.1}"
ENV_FILE="${2:-.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
	echo "Environment file '${ENV_FILE}' not found" >&2
	exit 1
fi

echo "Starting ${CONTAINER_NAME} from image ${IMAGE_NAME}:${VERSION}"
sudo docker run \
	--detach \
	--name "${CONTAINER_NAME}" \
	--restart unless-stopped \
	--env-file "${ENV_FILE}" \
	"${IMAGE_NAME}:${VERSION}"
