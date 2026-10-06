# Audio Corruption Fix Documentation

## Problem

The application was experiencing audio file corruption during upload to MinIO storage with the error:

```
EBML header parsing failed
webm: Invalid data found when processing input
```

## Root Causes

1. **Improper MediaRecorder finalization**: MediaRecorder was not properly flushed and stopped before creating blobs
2. **Missing audio validation**: No validation of audio data before upload
3. **Insufficient error handling**: No validation of blob integrity
4. **Race conditions**: In chunked recording mode, MediaRecorder state transitions could cause data loss

## Solutions Implemented

### 1. Audio Utilities Library (`app/lib/audio-utils.ts`)

Created a comprehensive audio utilities library with:

- **Audio blob validation**: Validates size, MIME type, and content integrity
- **Proper MediaRecorder finalization**: Ensures complete data flush before stopping
- **Optimized recording configuration**: Automatic selection of best supported MIME types
- **Blob finalization**: Proper blob creation with validation

### 2. Enhanced MediaRecorder Configuration

```typescript
// Before (problematic)
const mediaRecorder = new MediaRecorder(stream);

// After (improved)
const mediaRecorderOptions = getOptimizedMediaRecorderOptions();
const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
```

The new configuration:

- Automatically detects best supported MIME type (`audio/webm;codecs=opus`, `audio/webm`, etc.)
- Sets optimal bit rate (128kbps)
- Provides fallback options for different browsers

### 3. Proper MediaRecorder Finalization

```typescript
// Before (problematic)
mediaRecorder.stop();

// After (improved)
await waitForMediaRecorderFinalization(mediaRecorder, 5000);
```

The new approach:

- Requests final data before stopping
- Waits for proper stop event
- Handles timeouts and errors gracefully
- Ensures complete data flush

### 4. Audio Blob Validation

```typescript
const validation = validateAudioBlob(blob);
if (!validation.isValid) {
  console.error("Audio validation failed:", validation.error);
  // Handle error appropriately
  return;
}
```

Validation checks:

- Blob existence and non-zero size
- Minimum size (1KB) for valid audio data
- Maximum size (100MB) limit
- MIME type validation
- WebM EBML header validation

### 5. Enhanced Upload Process

```typescript
// Validate before upload
const validation = validateAudioBlob(blob);
if (!validation.isValid) {
  onRecordingComplete?.(false);
  return;
}

// Upload with timeout protection
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

const response = await fetch("/upload-audio", {
  method: "POST",
  body: formData,
  signal: controller.signal,
});
```

### 6. Server-Side Validation

Added server-side validation in `upload-audio.tsx`:

```typescript
function validateAudioFile(file: File, buffer: Buffer): { isValid: boolean; error?: string } {
  // Size checks
  // MIME type validation
  // WebM EBML header validation
  // MP4 ftyp header validation
}
```

## Key Improvements

### Client-Side

1. **Proper MediaRecorder lifecycle management**
   - Request final data before stopping
   - Wait for stop event completion
   - Handle errors during finalization

2. **Audio blob validation**
   - Size validation (min 1KB, max 100MB)
   - MIME type validation
   - Header validation for WebM/MP4

3. **Upload reliability**
   - Timeout protection (30 seconds)
   - Retry logic for failed uploads
   - Proper error handling and user feedback

4. **Chunked recording improvements**
   - Consistent MediaRecorder configuration across chunks
   - Better error handling between chunk transitions
   - Proper cleanup when stopping chunked recording

### Server-Side

1. **Audio file validation**
   - File size and type validation
   - Binary header validation for WebM/MP4
   - Comprehensive error reporting

2. **Upload status tracking**
   - Proper status updates during processing
   - Error tracking and reporting
   - Timeout handling for long uploads

## Browser Compatibility

The fix handles different browser MediaRecorder capabilities:

- **Chrome**: Prefers `audio/webm;codecs=opus`
- **Firefox**: Falls back to `audio/webm`
- **Safari**: Uses `audio/mp4` when available
- **Edge**: Similar to Chrome behavior

## Testing

To verify the fixes work:

1. **Record short audio clips** (< 5 seconds) - should not be rejected as too small
2. **Record long audio clips** (> 1 minute) - should properly finalize
3. **Test chunked recording** - chunks should transition smoothly
4. **Test network interruptions** - should handle timeout gracefully
5. **Test different browsers** - should work across Chrome, Firefox, Safari

## Configuration

Environment variables for fine-tuning:

```env
# Chunked recording settings
VITE_CHUNKED_RECORDING_ENABLED=true
VITE_MIN_CHUNK_LENGTH_SECONDS=10
VITE_CHUNK_SILENCE_THRESHOLD_DBFS=-40
VITE_CHUNK_SILENCE_DURATION_SECONDS=2

# Storage settings
STORAGE_CONNECTION_TIMEOUT_MS=10000
```

## Monitoring

The fix includes comprehensive logging:

- MediaRecorder state transitions
- Audio validation results
- Upload status and errors
- Blob creation details

Monitor these logs to identify any remaining issues:

```javascript
console.log("Audio blob created successfully:", {
  size: blob.size,
  type: blob.type,
  chunks: chunksRef.current.length,
});
```

## Future Improvements

1. **Audio quality validation**: Analyze audio content to detect silent or corrupted recordings
2. **Progressive upload**: Upload chunks as they're created for better reliability
3. **Client-side compression**: Reduce upload size without quality loss
4. **Audio format conversion**: Convert unsupported formats client-side
