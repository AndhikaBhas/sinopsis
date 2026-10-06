# Version Compatibility Notes

## Current Setup (October 2025)

### Hardware

- **GPU**: NVIDIA RTX 2000 Ada Generation
- **OS**: Debian 12
- **CUDA**: 12.8

### Software Versions

- **PyTorch**: 2.8.0+cu128
- **PyTorch Lightning**: 2.5.5
- **Pyannote.audio**: 3.4.0
- **WhisperX**: Latest

## Known Version Mismatches

WhisperX models were trained with older versions:

- **PyTorch Lightning**: Model v1.5.4 → Running v2.5.5
- **Pyannote.audio**: Model v0.0.1 → Running v3.4.0
- **PyTorch**: Model v1.10.0+cu102 → Running v2.8.0+cu128

### Status: ✅ WARNINGS SUPPRESSED - MONITORING

These are **precautionary warnings**, not errors. The system is working correctly.

## Decision Log

### Date: October 1, 2025

**Decision**: Keep current versions, suppress warnings, monitor for issues

**Rationale**:

1. Newer versions provide better CUDA 12.8 support for RTX 2000 Ada
2. Warnings are precautionary - backward compatibility is maintained
3. Downgrading risks introducing new problems
4. Performance and security improvements in newer versions

**Action Taken**:

- Added warning filters to `worker.py` to suppress version mismatch messages
- No functional issues observed during testing

## Monitoring Plan

Watch for these indicators of actual problems:

- [ ] Transcription accuracy degradation
- [ ] Model loading failures
- [ ] Runtime crashes
- [ ] Memory issues
- [ ] CUDA errors

## Rollback Plan (If Issues Arise)

If transcription quality or stability degrades:

### Option A: Pin Compatible Versions

```bash
pip install torch==1.13.1+cu117 torchvision==0.14.1+cu117 torchaudio==0.13.1 --extra-index-url https://download.pytorch.org/whl/cu117
pip install pytorch-lightning==1.9.5
pip install pyannote.audio==2.1.1
```

### Option B: Use WhisperX with Known Good Versions

```bash
pip install whisperx==3.1.1
```

### Option C: Full Environment Recreation

See `INSTALL.md` for fresh installation steps.

## Testing Checklist

Before considering version changes:

- [ ] Run transcription on sample audio
- [ ] Verify word-level timestamps are accurate
- [ ] Check memory usage stays within bounds
- [ ] Confirm alignment quality for Indonesian language
- [ ] Test with various audio qualities

## References

- WhisperX: https://github.com/m-bain/whisperX
- PyTorch Compatibility: https://pytorch.org/get-started/previous-versions/
- CUDA Toolkit: https://developer.nvidia.com/cuda-toolkit
- Pyannote.audio: https://github.com/pyannote/pyannote-audio

## Notes

- The RTX 2000 Ada supports CUDA 12.x natively - using older CUDA versions would waste hardware capability
- PyTorch Lightning's upgrade mechanism handles v1.5.4 → v2.5.5 automatically
- WhisperX primarily uses transcription and alignment, not speaker diarization (which is more sensitive to pyannote versions)
