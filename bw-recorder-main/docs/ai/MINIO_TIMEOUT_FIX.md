# MinIO Upload Timeout Fix

## Problem
When uploading audio files larger than 7.5MB to MinIO, the upload would fail with a timeout error:
```
Failed to upload file to MinIO: Error: MinIO file upload connection timed out after 10000ms
```

## Root Cause
The MinIO client had a hardcoded connection timeout of 10 seconds (10000ms), which was insufficient for uploading larger files. Files taking longer than 10 seconds to upload would timeout and fail.

## Solution
Implemented a dynamic timeout system that adjusts based on file size:

### Changes Made

1. **Dynamic Timeout Calculation** (`app/lib/minio-client.ts`):
   - Base timeout: 30 seconds minimum
   - Additional time: 10 seconds per MB of file size
   - Formula: `max(30000ms, fileSizeMB * 10000 + 20000)`
   
   Examples:
   - 1 MB file: 30 seconds timeout
   - 5 MB file: 70 seconds timeout (5 * 10 + 20 = 70 seconds)
   - 10 MB file: 120 seconds timeout (10 * 10 + 20 = 120 seconds)
   - 50 MB file: 520 seconds timeout (50 * 10 + 20 = 520 seconds)

2. **New Method**: `withDynamicTimeout()`
   - Accepts custom timeout values
   - Used specifically for file uploads
   - Provides detailed error messages with actual timeout used

3. **Increased Default Timeout**:
   - Changed from 10 seconds to 60 seconds
   - Applies to all MinIO operations (bucket checks, URL generation, etc.)
   - Can be overridden via `STORAGE_CONNECTION_TIMEOUT_MS` environment variable

4. **Enhanced Logging**:
   - Logs file size and calculated timeout before upload
   - Helps diagnose upload issues and timing

### Configuration

Add to your `.env` file (optional):
```env
# Override the default MinIO connection timeout (in milliseconds)
# Default is 60000ms (60 seconds)
STORAGE_CONNECTION_TIMEOUT_MS=60000
```

### Testing

To test the fix:

1. **Small files (< 7.5MB)**: Should upload quickly (< 30 seconds)
2. **Medium files (7.5-20MB)**: Should complete within calculated timeout
3. **Large files (20-100MB)**: May take several minutes depending on network speed

Monitor the console output for timeout calculations:
```
Uploading audio_2025-10-19_143020.webm (8.45 MB) with timeout: 104500ms
```

### Network Considerations

If uploads still timeout, consider:

1. **Network Speed**: Slow upload speeds may require longer timeouts
2. **MinIO Server Load**: Heavy server load can slow uploads
3. **Network Stability**: Unstable connections may cause intermittent failures

To adjust for slower networks, increase the timeout multiplier in the code or set a custom `STORAGE_CONNECTION_TIMEOUT_MS` value.

### Related Files
- `app/lib/minio-client.ts` - Main MinIO client with timeout logic
- `app/lib/storage.ts` - Storage provider interface
- `app/routes/rapat/rapat-upload.tsx` - Upload route handler

## Verification

After applying this fix:
1. Files > 7.5MB should upload successfully
2. Console logs will show dynamic timeout calculations
3. No more "connection timed out after 10000ms" errors for legitimate uploads

## Additional Improvements

Future enhancements could include:
- Progress tracking for large uploads
- Retry logic for failed uploads
- Chunked uploads for very large files (>100MB)
- Upload speed estimation and adaptive timeouts
