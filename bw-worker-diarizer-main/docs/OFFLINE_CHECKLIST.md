# Offline Runtime Setup - Checklist

Use this checklist to ensure your Docker image is properly configured for offline operation.

## Pre-Build Checklist

- [ ] Accept PyAnnote model license

  - Visit: https://huggingface.co/pyannote/speaker-diarization-community-1
  - Click "Agree and access repository"

- [ ] Get HuggingFace token

  - Visit: https://huggingface.co/settings/tokens
  - Create new token with read access
  - Copy token (starts with `hf_`)

- [ ] Set token as environment variable

  ```bash
  export HF_TOKEN=hf_your_token_here
  ```

- [ ] Ensure internet connection available

  - Models will be downloaded during build (~2-3GB)
  - Build time: 15-20 minutes

- [ ] Check Docker memory allocation
  - Recommended: 8GB+ for Docker
  - Check: Docker Desktop > Settings > Resources > Memory

## Build Phase

- [ ] Run build script

  ```bash
  ./build-docker.sh gpu
  # or for CPU: ./build-docker.sh cpu
  ```

- [ ] Monitor build output for:

  - [ ] "Downloading pyannote/speaker-diarization-community-1..."
  - [ ] "✓ Model downloaded successfully!"
  - [ ] "✓ Model cache verified"
  - [ ] "✓ Image ready for OFFLINE operation"

- [ ] Check for errors in build log
  ```bash
  # If build failed, check logs
  docker build --progress=plain --build-arg HF_TOKEN=$HF_TOKEN . 2>&1 | tee build.log
  grep -i "error\|failed\|warning" build.log
  ```

## Verification Phase

- [ ] Run automated verification

  ```bash
  ./verify-offline.sh
  ```

- [ ] All 5 tests should pass:

  - [ ] Test 1: Cache directory exists
  - [ ] Test 2: Model files found
  - [ ] Test 3: Offline environment variables set
  - [ ] Test 4: Python imports work without network
  - [ ] Test 5: Model loads in offline mode

- [ ] Manual verification (optional)

  ```bash
  # Check cache directory
  docker run --rm sinopsis-worker-diarizer:latest ls -la /opt/huggingface_cache

  # Should see: models--pyannote--speaker-diarization-community-1/
  ```

- [ ] Test without network
  ```bash
  docker run --rm --network=none sinopsis-worker-diarizer:latest \
    python -c "print('Offline test: OK')"
  ```

## Runtime Checklist

- [ ] Create `.env` file with required variables

  ```bash
  # Copy from template
  cp .env.example .env

  # Edit with your settings
  nano .env
  ```

- [ ] Run container

  ```bash
  ./run-docker.sh
  # or manually:
  # docker run -d --env-file .env sinopsis-worker-diarizer:latest
  ```

- [ ] Check startup logs

  ```bash
  docker logs -f sinopsis-worker-diarizer
  ```

- [ ] Look for these messages:

  - [ ] "Running in OFFLINE mode - using cached models only"
  - [ ] "Loading PyAnnote model..."
  - [ ] "Model loaded successfully"
  - [ ] "PyAnnote pipeline initialized successfully"

- [ ] Verify no connection errors
  - [ ] No "Failed to resolve 'huggingface.co'" errors
  - [ ] No "ConnectionError" messages
  - [ ] No retry attempts

## Troubleshooting Checklist

### If build fails:

- [ ] Check internet connection

  ```bash
  ping huggingface.co
  ```

- [ ] Verify HF token is valid

  ```bash
  echo $HF_TOKEN
  # Should start with hf_
  ```

- [ ] Check Docker has enough memory

  - Increase to 8GB+ in Docker settings

- [ ] Try clean build
  ```bash
  docker build --no-cache --build-arg HF_TOKEN=$HF_TOKEN -t sinopsis-worker-diarizer:latest .
  ```

### If verification fails:

- [ ] Check if models were downloaded

  ```bash
  docker run --rm sinopsis-worker-diarizer:latest \
    find /opt/huggingface_cache -name "*.bin" -o -name "*.pt"
  # Should list multiple model files
  ```

- [ ] Check environment variables

  ```bash
  docker run --rm sinopsis-worker-diarizer:latest env | grep -i offline
  # Should show HF_HUB_OFFLINE=1
  ```

- [ ] Review build logs
  ```bash
  # Search for model download confirmation
  grep -i "model downloaded" build.log
  ```

### If runtime fails:

- [ ] Check container logs

  ```bash
  docker logs sinopsis-worker-diarizer
  ```

- [ ] Verify environment file exists

  ```bash
  ls -la .env
  ```

- [ ] Test container without network

  ```bash
  docker run --rm --network=none sinopsis-worker-diarizer:latest \
    python -c "from processors.diarizer import SpeakerDiarizer; print('OK')"
  ```

- [ ] Check file permissions
  ```bash
  docker run --rm sinopsis-worker-diarizer:latest \
    ls -la /opt/huggingface_cache
  # Owner should be 'worker'
  ```

## Success Criteria

✅ **Build Success**:

- No errors in build log
- Build completes in ~15-20 minutes
- Image size ~12-13GB (GPU) or ~5-6GB (CPU)

✅ **Verification Success**:

- All 5 automated tests pass
- No connection errors with `--network=none`
- Model files present in cache directory

✅ **Runtime Success**:

- Container starts without errors
- Logs show "OFFLINE mode" message
- No retry attempts or connection errors
- Worker processes tasks successfully

## Quick Reference Commands

```bash
# Build
export HF_TOKEN=hf_xxx
./build-docker.sh gpu

# Verify
./verify-offline.sh

# Run
./run-docker.sh

# Check logs
docker logs -f sinopsis-worker-diarizer

# Test offline
docker run --rm --network=none sinopsis-worker-diarizer:latest python --version

# Stop
docker stop sinopsis-worker-diarizer

# Remove
docker rm sinopsis-worker-diarizer
```

## Documentation References

- [ ] Read [OFFLINE_RUNTIME.md](OFFLINE_RUNTIME.md) for detailed guide
- [ ] Check [OFFLINE_QUICKREF.md](OFFLINE_QUICKREF.md) for quick commands
- [ ] Review [OFFLINE_IMPLEMENTATION_SUMMARY.md](OFFLINE_IMPLEMENTATION_SUMMARY.md) for technical details
- [ ] See [DOCKER_TROUBLESHOOTING.md](DOCKER_TROUBLESHOOTING.md) for common issues

## Post-Deployment Checklist

- [ ] Document build command used
- [ ] Save build logs for reference
- [ ] Tag image with version

  ```bash
  docker tag sinopsis-worker-diarizer:latest sinopsis-worker-diarizer:v1.0-offline
  ```

- [ ] Test with actual workload
- [ ] Monitor resource usage
- [ ] Verify processing accuracy
- [ ] Update deployment documentation

## Notes

- Model cache adds ~2-3GB to image size
- Build requires internet, runtime does not
- HF token only needed during build
- Container can run with `--network=none`
- All models pre-downloaded and cached

---

**Date Completed**: ******\_\_\_******  
**Built By**: ******\_\_\_******  
**Image Tag**: ******\_\_\_******  
**Notes**: ******\_\_\_******
