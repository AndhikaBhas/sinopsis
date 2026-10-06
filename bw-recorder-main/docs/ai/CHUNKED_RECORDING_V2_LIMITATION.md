# Chunked Recording V2 Limitation

## Problem

The `use-audio-recorder-v2.ts` approach creates **file fragments** for subsequent chunks, not complete standalone files.

### What Happens

1. **Chunk 001**: ✅ Complete file with headers (EBML for WebM, ftyp for MP4) - **PLAYABLE**
2. **Chunk 002+**: ❌ Fragments without headers (Cluster for WebM, moof for MP4) - **NOT PLAYABLE**

### Why This Happens

When MediaRecorder is stopped and restarted:

- **Windows Chrome/Edge**: Does NOT regenerate initialization segments
- **First `start()`**: Generates complete file headers
- **Subsequent `start()`**: Only generates media fragments

This is a **fundamental limitation** of the MediaRecorder API on Windows.

## Solutions

### Solution 1: Use Original Recorder (RECOMMENDED)

Use `use-audio-recorder.ts` which creates new MediaRecorder instances from the stream:

```typescript
// In audio-recorder-button.tsx
import { useAudioRecorder } from "~/hooks/use-audio-recorder";

const {
  recordingState,
  startRecording,
  stopRecording,
  setOnChunkReady,
  // ... other properties
} = useAudioRecorder();
```

**Pros:**

- ✅ Each chunk is a complete, playable file
- ✅ Works with both MP4 and WebM
- ✅ No server-side assembly needed

**Cons:**

- ⚠️ Small risk of codec state corruption (mitigated with 200ms delay)
- ⚠️ Slight audio gap between chunks (~200ms)

### Solution 2: Server-Side Assembly

Keep using V2 but assemble fragments on the server:

1. Store first chunk (contains headers)
2. For subsequent chunks, extract media data and append to first chunk
3. Requires FFmpeg or similar tool on server

**Pros:**

- ✅ No audio gaps
- ✅ Single MediaRecorder instance (lower resource usage)

**Cons:**

- ❌ Complex server-side processing
- ❌ Can't play individual chunks
- ❌ Requires additional dependencies (FFmpeg)

### Solution 3: Accept Fragments

Document that chunks are fragments and handle accordingly:

```typescript
// Only first chunk is playable
// Chunks 002+ are fragments that must be assembled
if (chunkNumber === 1) {
  // This is playable
  audioElement.src = URL.createObjectURL(blob);
} else {
  // This is a fragment, needs assembly
  console.warn("Fragment chunk, requires assembly");
}
```

## Current Implementation

The V2 recorder currently:

- Uses **stop/restart approach** for chunks
- Creates **complete first chunk**, **fragments for subsequent**
- Logs warning about this limitation
- **Recommended**: Switch to original `use-audio-recorder.ts`

## Testing

To verify chunks are playable:

```bash
# Download chunks from MinIO
# Try playing each one
ffplay 373_001_20251030_192926.webm  # ✅ Works
ffplay 373_002_20251030_192937.webm  # ❌ Fails (no headers)
ffplay 373_003_20251030_192957.webm  # ❌ Fails (no headers)
```

## Recommendation

**Use `use-audio-recorder.ts` (original) for chunked recording** unless you implement server-side fragment assembly.

The original recorder creates proper, playable chunks at the cost of:

- 200ms delay between chunks (silence detection + recorder restart)
- Slightly higher resource usage (new MediaRecorder per chunk)

These tradeoffs are acceptable for most use cases and result in **fully functional, playable chunks**.
