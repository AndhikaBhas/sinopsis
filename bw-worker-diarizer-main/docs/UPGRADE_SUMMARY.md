# PyAnnote Audio Upgrade Summary

## Upgrade Details

### Version Changes
- **From:** pyannote.audio 3.4.0
- **To:** pyannote.audio 4.0.1

### Model Changes
- **From:** `pyannote/speaker-diarization-3.1`
- **To:** `pyannote/speaker-diarization-community-1`

## Files Modified

### 1. `requirements.txt`
- Updated `pyannote.audio==3.4.0` → `pyannote.audio==4.0.1`

### 2. `processors/diarizer.py`
**Changes:**
- Updated model path: `speaker-diarization-3.1` → `speaker-diarization-community-1`
- Updated API parameter: `use_auth_token=` → `token=` (for v4.x compatibility)
- Fixed output handling for new `DiarizeOutput` format:
  ```python
  # In pyannote.audio 4.x, the output has a speaker_diarization attribute
  annotation = diarization.speaker_diarization if hasattr(diarization, 'speaker_diarization') else diarization
  for segment, _, speaker in annotation.itertracks(yield_label=True):
      # process segments...
  ```
- Updated model info to return correct model name

### 3. `download_models.py`
**Changes:**
- Updated model URL references
- Changed API from `use_auth_token=` to `token=`
- Updated model directory verification pattern
- Updated help text and error messages

### 4. `Dockerfile`
**Changes:**
- Updated `pyannote.audio==3.4.0` → `pyannote.audio==4.0.1`
- Updated model verification check for `speaker-diarization-community-1`

## Benefits of the Upgrade

### ✅ Improved Performance
- **Better Accuracy:** Lower diarization error rates across benchmarks
- **Better Speaker Detection:** Improved speaker counting and assignment
- **Better Robustness:** Enhanced handling of edge cases

### ✅ Future-Proof
- Uses the latest stable version of pyannote.audio (4.0.1)
- Compatible with modern PyTorch versions
- Access to latest features and improvements

### ✅ Docker Optimization
- Model is pre-downloaded during Docker build
- No runtime download needed
- Faster container startup
- Works in offline/air-gapped environments

## Building the Docker Image

### Prerequisites
1. Accept the model license at: https://huggingface.co/pyannote/speaker-diarization-community-1
2. Get your HuggingFace token from: https://huggingface.co/settings/tokens

### Build Commands

**GPU Build (CUDA 12.8):**
```bash
docker build --build-arg CUDA_VERSION=cu128 --build-arg HF_TOKEN=your_token_here -t sinopsis-worker:gpu .
```

**CPU Build:**
```bash
docker build --build-arg CUDA_VERSION=cpu --build-arg HF_TOKEN=your_token_here -t sinopsis-worker:cpu .
```

## Testing

The upgrade has been tested and confirmed working:
- ✅ Model loads successfully
- ✅ Diarization processing completes without errors
- ✅ Correct output format (DiarizeOutput with speaker_diarization)
- ✅ Results properly merged with transcripts

## Breaking Changes

### API Changes in pyannote.audio 4.x

1. **Parameter Naming:**
   - Old: `use_auth_token=`
   - New: `token=`

2. **Output Format:**
   - Old: Returns `Annotation` object directly
   - New: Returns `DiarizeOutput` object with `speaker_diarization` attribute

3. **Backward Compatibility:**
   - Our code includes compatibility layer to work with both formats
   - Safe to upgrade without breaking existing functionality

## Rollback Procedure

If you need to rollback to the previous version:

1. Revert changes in `requirements.txt`:
   ```
   pyannote.audio==3.4.0
   ```

2. Revert changes in `processors/diarizer.py`:
   - Change model to `pyannote/speaker-diarization-3.1`
   - Change `token=` back to `use_auth_token=`
   - Remove the `speaker_diarization` compatibility layer

3. Revert changes in `Dockerfile` and `download_models.py`

4. Rebuild Docker image

## Additional Notes

- The HuggingFace cache location is: `/opt/huggingface_cache` (in Docker)
- Local cache location: `~/.cache/huggingface`
- Model size: ~35MB for community-1 pipeline (smaller than 3.1)
- The community-1 model provides better performance with similar or smaller size

## Support

For issues or questions:
1. Check the pyannote.audio documentation: https://github.com/pyannote/pyannote-audio
2. Review the benchmark comparisons in the README
3. Ensure you have accepted the model terms at HuggingFace

---
**Date:** October 18, 2025  
**Updated by:** AI Assistant  
**Status:** ✅ Tested and Working
