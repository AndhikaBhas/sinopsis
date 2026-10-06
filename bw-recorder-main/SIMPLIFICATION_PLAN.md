# Audio Recording Simplification Plan

## Current Complexity Issues

1. **Duplicate Upload Tracking**: Multiple refs (`uploadedBlobsRef`, `uploadTrackingRef`) tracking uploaded chunks
2. **Status Polling System**: Complex polling mechanism to check upload status from server
3. **Connection Timeout Handling**: Additional logic for timeout scenarios
4. **Multiple State Machines**: Upload state, recording state, preparing state, finalizing state all interacting

## Core Functionality to Preserve

1. ✅ Start/Stop recording
2. ✅ Chunked recording with silence detection
3. ✅ Upload chunks to server
4. ✅ Form integration (Mulai Rapat / Selesai Rapat)
5. ✅ Auto-start recording after form submission
6. ✅ Visualization during recording

## Simplifications to Apply

### Phase 1: Remove Complex Tracking

- Remove `uploadedBlobsRef` and `uploadTrackingRef` refs
- Rely on chunk number from hook to prevent duplicates
- Server-side should handle duplicate detection if needed

### Phase 2: Simplify Upload Status

- Remove polling mechanism
- Make upload fire-and-forget
- Server handles async processing via RabbitMQ
- Remove connection timeout tracking (server handles timeouts)

### Phase 3: Streamline State Management

- Keep only essential states: `isPreparing`, `isFinalizing`
- Remove background upload tracking UI (uploads happen silently)
- Simplify button click handler

### Phase 4: Clean Up Effects

- Consolidate useEffect hooks
- Remove complex dependency arrays
- Simplify chunk upload callback

## Benefits

1. **Fewer bugs**: Less state to manage means fewer race conditions
2. **Easier debugging**: Clearer code flow
3. **Better performance**: No polling overhead
4. **Maintainability**: ~50% less code

## Implementation

Update `audio-recorder-button.tsx` to remove:

- Status polling functions (`pollUploadStatus`, `startStatusPolling`)
- Upload tracking refs
- Connection timeout logic
- Background upload status UI

Keep simple:

- Upload blob → server
- Server returns success/error immediately
- Actual processing happens async via RabbitMQ (already implemented)
