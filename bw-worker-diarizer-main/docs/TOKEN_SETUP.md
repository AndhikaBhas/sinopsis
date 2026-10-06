# HuggingFace Token Setup

## Overview

The build requires a HuggingFace access token (`HF_TOKEN`) to download the PyAnnote speaker-diarization models during the Docker build. There is no built-in default token — you must provide your own.

## Setup

```bash
# 1. Get token from: https://huggingface.co/settings/tokens
# 2. Accept terms: https://huggingface.co/pyannote/speaker-diarization-community-1
# 3. Set token
export HF_TOKEN="hf_your_token_here"

# 4. Build
./build-docker.sh gpu
```

### For CPU build:
```bash
export HF_TOKEN="hf_your_token_here"
./build-docker.sh cpu
```

If `HF_TOKEN` is not set, the build script exits with an error before starting the Docker build.

## Why it's needed

The Dockerfile declares the token as a build argument:
```dockerfile
ARG HF_TOKEN
```

It's passed through at build time to download and cache the PyAnnote models so the resulting image can run fully offline.

## Still Need Help?

Check these guides:
- 📖 **`QUICKSTART.md`** - Complete getting started guide
- 🔧 **`BUILD_GUIDE.md`** - Detailed build instructions
- 🚨 **`DOCKER_MEMORY_FIX.md`** - Memory troubleshooting
