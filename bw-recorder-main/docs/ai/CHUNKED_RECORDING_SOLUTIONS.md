# Chunked Recording Corruption - Analysis & Solutions

**Created**: October 30, 2025
**Issue**: Subsequent audio chunks are corrupted while first chunk records correctly

## Root Cause Analysis

### Primary Issues Identified:

1. **MediaRecorder Instance Corruption**
   - Creating new MediaRecorder instances from the same stream causes codec state corruption
   - The codec (Opus/VP8) doesn't properly reset between instances
   - Browser's internal encoder maintains state that gets corrupted

2. **Insufficient Cleanup Delay**
   - 200ms delay may not be enough for browser to fully release codec resources
   - Browser needs time to flush buffers and reset encoder state
   - Race condition between stop() and new instance creation

3. **No Proper Data Finalization**
   - Not using `requestData()` before stop causes buffer loss
   - Immediate blob creation without waiting for final data
   - Missing data chunks due to timing issues

4. **Stream State Issues**
   - AudioContext and AnalyzerNode persist across chunks
   - Potential synchronization issues between analysis and recording
   - Stream tracks may be in inconsistent state

## Evaluation of Recording Methods

### Current Method (MediaRecorder with Stop/Restart)

```
✗ Codec state corruption
✗ Complex state management
✗ Race conditions
✗ Browser-dependent behavior
✓ Small file sizes (compressed)
✓ Native browser support
```

### Solution 1: Continuous MediaRecorder with requestData()

```typescript
// Never stop MediaRecorder, just request data periodically
mediaRecorder.start(100); // Start once
// ... when chunk is needed:
mediaRecorder.requestData(); // Get data without stopping
```

**Pros:**

- ✓ No codec reset issues
- ✓ No race conditions
- ✓ Consistent encoder state
- ✓ Compressed format (small files)
- ✓ Simple implementation

**Cons:**

- ✗ Still depends on MediaRecorder API
- ✗ May accumulate memory if not managed properly
- ✗ Browser-specific behavior

**Recommendation**: ⭐⭐⭐⭐⭐ **BEST FOR PRODUCTION**

### Solution 2: WAV Format (Web Audio API)

```typescript
// Direct PCM capture using ScriptProcessorNode
processor.onaudioprocess = (e) => {
  const data = e.inputBuffer.getChannelData(0);
  buffers.push(new Float32Array(data));
};
```

**Pros:**

- ✓ No codec issues (uncompressed PCM)
- ✓ Perfect for chunking
- ✓ Guaranteed cross-platform compatibility
- ✓ No MediaRecorder bugs
- ✓ Full control over data

**Cons:**

- ✗ Large file sizes (10-20x larger)
- ✗ More CPU usage
- ✗ Requires manual WAV header creation
- ✗ ScriptProcessorNode deprecated (use AudioWorklet instead)
- ✗ More complex processing pipeline

**Recommendation**: ⭐⭐⭐ **GOOD FOR COMPATIBILITY, BAD FOR BANDWIDTH**

### Solution 3: Opus/WebM with Extended Delays

```typescript
// Current approach with much longer delays
setTimeout(() => startNewChunk(), 500 - 1000);
```

**Pros:**

- ✓ Minimal code changes
- ✓ Compressed format

**Cons:**

- ✗ Still has corruption risk
- ✗ Long delays between chunks
- ✗ Not reliable
- ✗ Gaps in recording

**Recommendation**: ⭐ **NOT RECOMMENDED**

### Solution 4: AudioWorklet (Modern Approach)

```typescript
// Use AudioWorklet instead of ScriptProcessor
await audioContext.audioWorklet.addModule("processor.js");
const workletNode = new AudioWorkletNode(context, "recorder-processor");
```

**Pros:**

- ✓ Best performance
- ✓ No main thread blocking
- ✓ Future-proof
- ✓ Can do WAV or Opus encoding in worklet

**Cons:**

- ✗ Complex setup
- ✗ Requires separate worklet file
- ✗ Not supported in all browsers
- ✗ Steeper learning curve

**Recommendation**: ⭐⭐⭐⭐ **BEST FOR FUTURE, COMPLEX NOW**

## Recommended Solution Hierarchy

### 1. **Immediate Fix** (Quick Deploy)

Use **continuous MediaRecorder with requestData()** approach:

```typescript
// Implemented in: use-audio-recorder-v2.ts
// This approach NEVER stops MediaRecorder between chunks
mediaRecorder.start(100);
// When chunk is ready:
mediaRecorder.requestData(); // Triggers ondataavailable
// Collect data and create blob WITHOUT stopping
```

**Migration Steps:**

1. Replace `use-audio-recorder.ts` with `use-audio-recorder-v2.ts`
2. Test with chunked mode enabled
3. Verify all chunks are valid
4. Deploy to production

### 2. **Fallback for Compatibility** (If #1 Fails)

Use **WAV format** approach:

```typescript
// Implemented in: use-audio-recorder-wav.ts
// Direct PCM capture, no codec issues
```

**When to Use:**

- If continuous MediaRecorder still has issues
- Need guaranteed cross-platform compatibility
- File size is not a concern (local processing)
- Network bandwidth is sufficient

### 3. **Long-term Solution** (Future Implementation)

Migrate to **AudioWorklet** with Opus encoding:

**Benefits:**

- Best performance
- No main thread blocking
- Can encode to Opus in worker
- Future-proof

**Timeline**: 2-3 weeks development + testing

## Format Comparison

| Format         | Size (10min) | Quality   | Compatibility | Chunking  | Recommendation  |
| -------------- | ------------ | --------- | ------------- | --------- | --------------- |
| Opus/WebM      | ~6 MB        | Excellent | Good          | ⚠️ Issues | Current (buggy) |
| MP4/AAC        | ~7 MB        | Excellent | Excellent     | ⚠️ Issues | Same problem    |
| WAV/PCM        | ~95 MB       | Perfect   | Perfect       | ✓ Perfect | Fallback        |
| Opus (worklet) | ~6 MB        | Excellent | Good          | ✓ Perfect | Future          |

## Action Plan

### Phase 1: Immediate Fix (1-2 days)

1. ✅ Created `use-audio-recorder-v2.ts` with continuous recording
2. ⏳ Test in development environment
3. ⏳ Compare file sizes and quality
4. ⏳ Deploy to staging
5. ⏳ Production rollout

### Phase 2: Validation (3-5 days)

1. Monitor chunk quality in production
2. Collect user feedback
3. Verify no corruption issues
4. Check server-side processing compatibility

### Phase 3: Optimization (Optional, 1-2 weeks)

1. Implement AudioWorklet version
2. Add adaptive bitrate based on silence
3. Implement smart compression
4. Add client-side preprocessing

## Testing Checklist

- [ ] First chunk records correctly
- [ ] Second chunk records correctly
- [ ] Third and subsequent chunks record correctly
- [ ] No gaps between chunks
- [ ] File headers are valid (WebM/MP4)
- [ ] Server can process all chunks
- [ ] Transcription works on all chunks
- [ ] No memory leaks during long recordings
- [ ] Works on Chrome/Edge
- [ ] Works on Firefox
- [ ] Works on Safari (if applicable)
- [ ] Works on mobile browsers

## Code Examples

### Using V2 (Continuous Recording):

```typescript
import { useAudioRecorderV2Continuous } from '../hooks/use-audio-recorder-v2';

function RecordingComponent() {
  const {
    recordingState,
    startRecording,
    stopRecording,
    setOnChunkReady,
  } = useAudioRecorderV2Continuous();

  // Set chunk callback
  setOnChunkReady((blob, startTime, chunkNum) => {
    console.log(`Chunk ${chunkNum} ready:`, blob.size, 'bytes');
    // Upload chunk...
  });

  return (
    <button onClick={recordingState === 'idle' ? startRecording : stopRecording}>
      {recordingState === 'idle' ? 'Start' : 'Stop'}
    </button>
  );
}
```

### Using WAV (Fallback):

```typescript
import { useAudioRecorderWAV } from "../hooks/use-audio-recorder-wav";

function RecordingComponent() {
  const { recordingState, startRecording, stopRecording, setOnChunkReady } =
    useAudioRecorderWAV();

  // Rest is the same...
}
```

## Environment Configuration

Add to `.env`:

```bash
# Recording format preference
VITE_RECORDING_METHOD=continuous  # or "wav" or "legacy"

# For WAV format
VITE_WAV_SAMPLE_RATE=16000
VITE_WAV_CHANNELS=1
```

## Conclusion

**RECOMMENDED APPROACH**: Use **continuous MediaRecorder with requestData()** (Solution 1)

This provides:

- ✓ No codec corruption
- ✓ Small file sizes
- ✓ Simple implementation
- ✓ High reliability
- ✓ No gaps between chunks

**Fallback**: WAV format if continuous recording fails

## References

- MDN MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
