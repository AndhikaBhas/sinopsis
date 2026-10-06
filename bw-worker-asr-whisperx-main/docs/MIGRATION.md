# Migration Guide: faster-whisper to WhisperX

This guide helps you migrate from the previous faster-whisper implementation to the new WhisperX version with phoneme-based force alignment.

## What Changed

### Core Changes

- **ASR Engine**: Migrated from `faster-whisper` to `WhisperX`
- **Force Alignment**: Added phoneme-based force alignment for Indonesian language
- **Output Format**: Now supports word-level timestamps in addition to segment-level
- **Model Integration**: Uses specialized Indonesian wav2vec2 model for alignment

### Removed Configuration Parameters

The following parameters are no longer used and can be removed from your `.env`:

- `ASR_VAD_FILTER` (VAD filtering is handled automatically by WhisperX)
- `ASR_BEAM_SIZE` (handled internally by WhisperX)
- `ASR_REPETITION_PENALTY` (not applicable to WhisperX)
- `ASR_NO_REPEAT_NGRAM_SIZE` (not applicable to WhisperX)
- `ASR_CONDITION_ON_PREVIOUS_TEXT` (not applicable to WhisperX)

### New Configuration Parameters

Add these new parameters to your `.env`:

```env
# Force Alignment Configuration
FORCE_ALIGN=true
ALIGN_MODEL=jonatasgrosman/wav2vec2-large-xlsr-53-indonesian

# Batch size is now actively used
ASR_BATCH_SIZE=16
```

## Migration Steps

### 1. Update Dependencies

```bash
# Activate your virtual environment
source venv/bin/activate  # Linux/macOS
# or
venv\Scripts\activate     # Windows

# Install new requirements
pip install -r requirements.txt
```

### 2. Update Configuration

```bash
# Backup your current .env
cp .env .env.backup

# Copy the new example configuration
cp .env.example .env

# Manually transfer your database, RabbitMQ, and MinIO settings from .env.backup
# Remove the old faster-whisper specific parameters
```

### 3. Test the Installation

```bash
# Run the integration test
python test_whisperx_integration.py

# Run text cleaning test (should still work)
python test_text_cleaning.py
```

### 4. Update Docker (if using)

```bash
# Rebuild the Docker image
docker build -t sinopsis-worker-asr .

# Test run
docker run --gpus all --env-file .env sinopsis-worker-asr
```

## Expected Changes in Behavior

### Transcription Output

- **Before**: Segment-level timestamps only
- **After**: Word-level timestamps when force alignment succeeds, segment-level as fallback

### Processing Time

- **Transcription**: Similar to faster-whisper
- **Force Alignment**: Adds ~20-30% processing time but provides much better timestamp accuracy
- **Memory Usage**: Slightly higher due to alignment model loading

### Accuracy Improvements

- **Indonesian Language**: Significant improvement in word-level timestamp accuracy
- **Text Quality**: Similar transcription quality with better alignment
- **Edge Cases**: Better handling of pause detection and word boundaries

## Troubleshooting

### Force Alignment Issues

If force alignment fails or uses too much memory:

```env
# Disable force alignment temporarily
FORCE_ALIGN=false
```

### Memory Issues

```env
# Use smaller model
ASR_MODEL=small

# Reduce batch size
ASR_BATCH_SIZE=8

# Disable force alignment
FORCE_ALIGN=false
```

### Network Issues

The Indonesian alignment model is downloaded on first use. If you have network issues:

1. Ensure internet connectivity during first run
2. Models are cached locally after first download
3. Consider pre-downloading in Docker builds if needed

## Verification

After migration, verify that:

1. ✅ WhisperX integration test passes
2. ✅ Text cleaning test passes
3. ✅ Worker starts without errors
4. ✅ Sample transcription job completes successfully
5. ✅ Word-level timestamps are present in output (if force alignment enabled)

## Performance Comparison

| Aspect              | faster-whisper | WhisperX                    |
| ------------------- | -------------- | --------------------------- |
| Transcription Speed | Baseline       | Similar                     |
| Timestamp Accuracy  | Segment-level  | Word-level (with alignment) |
| Memory Usage        | Baseline       | +10-20%                     |
| Indonesian Support  | Good           | Excellent                   |
| Processing Time     | Baseline       | +20-30% (with alignment)    |

## Rollback Plan

If you need to rollback to faster-whisper:

1. Restore `.env.backup`
2. Install old requirements: `pip install faster-whisper==1.0.0`
3. Revert `worker.py` to previous version
4. Remove WhisperX-specific configuration

## Support

If you encounter issues during migration:

1. Check the error logs for specific error messages
2. Run the integration test to isolate the problem
3. Verify all dependencies are properly installed
4. Ensure GPU drivers and CUDA are compatible
