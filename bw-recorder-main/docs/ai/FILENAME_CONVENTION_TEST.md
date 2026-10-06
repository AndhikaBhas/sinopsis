# Filename Convention Test

## Current Naming Convention

The application now uses a consistent 4-part filename format:

```
{rapatId}_{chunkNumber}_{dateStr}_{timeStr}.extension
```

### Examples:

1. **With rapatId**: `123_001_20250926_143052.webm` (if rapatId = "123")
2. **Without rapatId**: `mid_001_20250926_143052.webm`
3. **Chunked recording**:
   - Chunk 1: `123_001_20250926_143052.webm` (recording started at 14:30:52)
   - Chunk 2: `123_002_20250926_143127.webm` (chunk 2 started at 14:31:27)
   - Chunk 3: `123_003_20250926_143204.webm` (chunk 3 started at 14:32:04)

### Components:

- **rapatId**: Meeting/rapat identifier - uses the actual ID value (e.g., "123", "456") without any prefix (defaults to "mid" if not provided)
- **chunkNumber**: 3-digit zero-padded chunk number (001, 002, 003, etc.)
- **dateStr**: Date in YYYYMMDD format
- **timeStr**: Time in HHMMSS format
- **extension**: File extension (webm or mp4 based on MIME type)

### Implementation:

Both client-side (AudioRecorderButton) and server-side (upload-audio route) now use the same `generateAudioFilename()` function from `app/lib/utils.ts` to ensure consistency.

**Client-side blob naming:**

```typescript
const fileExtension = blob.type.includes("webm") ? "webm" : "mp4";
const blobName = generateAudioFilename(fileExtension, chunkNumber, chunkStartTime, rapatId);
```

**Note**: For chunked recordings, each chunk uses its individual `chunkStartTime` (when that specific chunk began recording) rather than the overall recording session start time. This ensures each chunk has a unique and accurate timestamp in its filename.

**Server-side filename generation:**

```typescript
const fileExtension = audioFile.type.includes("webm") ? "webm" : "mp4";
fileName = generateAudioFilename(fileExtension, chunkNumber, undefined, rapatId);
```

This ensures that uploaded files maintain the same naming convention whether they're generated on the client or server side.
