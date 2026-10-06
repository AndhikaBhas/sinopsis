# Docker Offline Capability - Quick Reference

## Question: Can Docker run without internet?

### Answer: ✅ YES

**After building the image, the container can run without internet connection.**

---

## What Gets Downloaded During Build?

### 1. Python Packages (~3GB)
- ✅ PyTorch 2.8.0+cu128
- ✅ TorchAudio 2.8.0  
- ✅ PyAnnote.audio 4.0.1
- ✅ All dependencies

### 2. AI Models (~32MB)
- ✅ speaker-diarization-community-1
  - Segmentation model
  - Embedding model
  - PLDA clustering
  - Pipeline config

**Total Image Size**: ~3-4GB

---

## How It Works

### During Build (needs internet):
```bash
docker build --build-arg HF_TOKEN=hf_xxx -t sinopsis-worker:gpu .
```

1. Downloads all Python packages
2. Runs `download_models.py`
3. Caches models to `/opt/huggingface_cache`
4. Copies cache to runtime image

### During Runtime (NO internet needed):
```bash
docker run sinopsis-worker:gpu
```

1. App starts → imports PyAnnote
2. Calls `Pipeline.from_pretrained()`
3. Checks `/opt/huggingface_cache`
4. Finds cached model → loads from disk
5. ✅ Success! (no network access)

---

## Verification

### Test if models are cached:
```bash
# Check cache directory
docker run --rm sinopsis-worker:gpu ls -lh /opt/huggingface_cache/hub/

# Run test script
docker run --rm sinopsis-worker:gpu python test_offline_mode.py

# Test with NO network (simulates offline)
docker run --rm --network none sinopsis-worker:gpu python test_offline_mode.py
```

### Expected output:
```
✅ SUCCESS: All models are cached and loaded successfully!

Summary:
  • Cache location: /opt/huggingface_cache
  • Model: pyannote/speaker-diarization-community-1
  • Components: segmentation, embedding, plda
  • Cache status: ✓ All models cached
  • Loading: ✓ Successful
```

---

## Important Notes

### ⚠️ Internet Required:
- **During `docker build`** - to download packages and models

### ✅ Internet NOT Required:
- **During `docker run`** - all models cached in image
- **For AI model loading** - uses cache

### ℹ️ Network Still Needed For:
- RabbitMQ connection
- PostgreSQL database
- MinIO storage

But **NOT** for downloading AI models!

---

## Quick Check List

Before deploying to offline environment:

- [ ] Built image with HF_TOKEN
- [ ] Verified model cache exists in image
- [ ] Tested `test_offline_mode.py` passes
- [ ] Saved image: `docker save sinopsis-worker:gpu > worker.tar`
- [ ] Load on offline host: `docker load < worker.tar`
- [ ] Run on offline host (works without internet for models)

---

## Files Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Downloads models during build (line 97-118) |
| `download_models.py` | Model download script |
| `test_offline_mode.py` | Verify offline capability |
| `TORCHCODEC_FIX.md` | std::bad_alloc fix documentation |
| `docs/OFFLINE_IMPLEMENTATION.md` | Full documentation |

---

## TL;DR

✅ **All models downloaded during build**
✅ **Container runs offline after build**  
✅ **Tested and verified**

No internet needed for AI models at runtime! 🎉

---

**Last Updated**: October 21, 2025
