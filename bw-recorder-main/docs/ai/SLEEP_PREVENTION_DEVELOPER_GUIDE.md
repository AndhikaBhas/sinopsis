# Sleep Prevention - Developer Integration Guide

## For Developers: How to Use in Your Components

### Basic Usage

If you have a component with recording functionality, adding sleep prevention is a **one-line import** and **one hook call**.

### Step-by-Step Integration

#### 1. Import the Hook

```typescript
import { useSleepPrevention } from "../hooks/use-sleep-prevention";
```

#### 2. Call the Hook

```typescript
export function MyRecordingComponent() {
  const [isRecording, setIsRecording] = useState(false);

  // That's it! Just pass the boolean state
  useSleepPrevention(isRecording);

  return (
    <button onClick={() => setIsRecording(!isRecording)}>
      {isRecording ? "Recording..." : "Start Recording"}
    </button>
  );
}
```

### Real-World Example: AudioRecorderButton

From our actual implementation:

```typescript
import { useSleepPrevention } from "../hooks/use-sleep-prevention";

export function AudioRecorderButton({
  onRecordingComplete,
  submitLabel = "Record Audio",
  // ... other props
}) {
  const {
    recordingState,
    startRecording,
    stopRecording,
    // ... other state
  } = useAudioRecorder();

  // Determine if recording is active
  const isRecording =
    recordingState === "recording" ||
    recordingState === "chunked-recording";

  // Activate sleep prevention - done!
  useSleepPrevention(isRecording);

  return (
    // Your component JSX
  );
}
```

## Hook API Reference

```typescript
function useSleepPrevention(isRecording: boolean): {
  isSupported: boolean;
  isActive: boolean;
};
```

### Parameters

| Parameter     | Type      | Description                                        |
| ------------- | --------- | -------------------------------------------------- |
| `isRecording` | `boolean` | Set to `true` when recording, `false` when stopped |

### Return Value

```typescript
{
  isSupported: boolean,  // True if browser supports Wake Lock API
  isActive: boolean      // True if wake lock is currently active
}
```

### Example with Return Value

```typescript
const { isSupported, isActive } = useSleepPrevention(isRecording);

// Show debug info
console.log(`Wake Lock Support: ${isSupported ? "Yes" : "No"}`);
console.log(`Wake Lock Active: ${isActive ? "Yes" : "No"}`);
```

## Common Patterns

### Pattern 1: Simple Recording Toggle

```typescript
const [isRecording, setIsRecording] = useState(false);
useSleepPrevention(isRecording);

const handleToggle = () => setIsRecording(!isRecording);
```

### Pattern 2: Recording State from Hook

```typescript
const { recordingState } = useAudioRecorder();
const isRecording = recordingState === "recording";

useSleepPrevention(isRecording);
```

### Pattern 3: Multiple Recording States

```typescript
const { recordingState } = useAudioRecorder();
const isRecording =
  recordingState === "recording" || recordingState === "chunked-recording";

useSleepPrevention(isRecording);
```

### Pattern 4: With Status Display

```typescript
export function RecorderWithStatus() {
  const [isRecording, setIsRecording] = useState(false);
  const { isSupported, isActive } = useSleepPrevention(isRecording);

  return (
    <div>
      <button onClick={() => setIsRecording(!isRecording)}>
        {isRecording ? "Stop" : "Start"}
      </button>

      {isRecording && (
        <p className="status">
          ✓ Screen locked awake
          {!isSupported && " (fallback mode)"}
        </p>
      )}
    </div>
  );
}
```

## Best Practices

### ✅ DO

1. **Call hook early in component**

   ```typescript
   export function MyComponent() {
     useSleepPrevention(isRecording); // Early in component
     // ... rest of code
   }
   ```

2. **Use with actual recording state**

   ```typescript
   const isRecording = recordingState === "recording";
   useSleepPrevention(isRecording); // Pass real state
   ```

3. **Let it handle everything**
   ```typescript
   useSleepPrevention(isRecording);
   // No manual cleanup needed - hook handles it
   ```

### ❌ DON'T

1. **Don't pass constant true/false**

   ```typescript
   // Bad - creates unnecessary wake lock
   useSleepPrevention(true);

   // Good - pass actual state
   useSleepPrevention(isRecording);
   ```

2. **Don't try to manually manage wake lock**

   ```typescript
   // Bad - hook already handles this
   const [wakeLock, setWakeLock] = useState(null);

   // Good - just use the hook
   useSleepPrevention(isRecording);
   ```

3. **Don't worry about cleanup**
   ```typescript
   // Good - hook handles cleanup automatically
   useSleepPrevention(isRecording);
   // No useEffect cleanup needed
   ```

## Debugging

### Enable Logging

Add this to your browser console to see wake lock messages:

```javascript
// Already logs automatically, check console while recording
// Look for these messages:
// ✓ Wake Lock acquired - screen will stay on during recording
// ✓ Fallback method: Screen will be kept awake during recording
```

### Check Support

```typescript
const { isSupported } = useSleepPrevention(isRecording);

if (isSupported) {
  console.log("✓ Wake Lock API supported");
} else {
  console.log("⚠ Using fallback method");
}
```

### Monitor Status

```typescript
const { isActive } = useSleepPrevention(isRecording);

useEffect(() => {
  console.log(`Wake Lock is ${isActive ? "active" : "inactive"}`);
}, [isActive]);
```

## Troubleshooting Integration

### Issue: Import not found

**Solution**: Ensure file path is correct

```typescript
// Check file exists at:
// app/hooks/use-sleep-prevention.ts

// And import from relative path
import { useSleepPrevention } from "../hooks/use-sleep-prevention";
```

### Issue: TypeScript errors

**Solution**: Ensure types are correct

```typescript
// Should be boolean
const isRecording: boolean = recordingState === "recording";
useSleepPrevention(isRecording); // ✓ Correct
```

### Issue: Hook not activating

**Ensure**:

1. `isRecording` state is actually `true` when recording
2. Browser supports Wake Lock API (check console message)
3. Component isn't unmounting immediately
4. Hook is called before return statement

### Issue: Wake lock not working on device

**Try**:

1. Open DevTools and check console messages
2. Verify Wake Lock API support in browser
3. Check device sleep timeout settings
4. Try another browser for testing

## Testing Your Integration

### Manual Test

```typescript
// In your component
export function TestComponent() {
  const [isRecording, setIsRecording] = useState(false);
  useSleepPrevention(isRecording);

  return (
    <div>
      <button onClick={() => setIsRecording(!isRecording)}>
        {isRecording ? "Stop" : "Start"}
      </button>
      <p>Open DevTools console to see wake lock messages</p>
    </div>
  );
}
```

**Steps**:

1. Mount component
2. Open browser DevTools (F12)
3. Click "Start" button
4. Check console for "Wake Lock acquired" message
5. Set device to sleep (or wait for timeout)
6. Verify screen stays on
7. Click "Stop" button
8. Check console for release message

### Automated Test (Example)

```typescript
describe("useSleepPrevention", () => {
  it("should acquire wake lock when recording starts", () => {
    const { result } = renderHook(() => useSleepPrevention(true));

    expect(result.current.isActive).toBe(true);
  });

  it("should release wake lock when recording stops", () => {
    const { result, rerender } = renderHook(
      ({ isRecording }) => useSleepPrevention(isRecording),
      { initialProps: { isRecording: true } }
    );

    rerender({ isRecording: false });

    expect(result.current.isActive).toBe(false);
  });
});
```

## Advanced Usage

### Custom Wrapper Component

```typescript
export function RecordingProvider({ children }) {
  const [isRecording, setIsRecording] = useState(false);
  useSleepPrevention(isRecording);

  return (
    <RecordingContext.Provider value={{ isRecording, setIsRecording }}>
      {children}
    </RecordingContext.Provider>
  );
}

// Usage
function App() {
  return (
    <RecordingProvider>
      <MyRecordingComponent />
    </RecordingProvider>
  );
}
```

### With Error Boundary

```typescript
export function RecordingWithErrorBoundary() {
  const [isRecording, setIsRecording] = useState(false);
  const { isSupported } = useSleepPrevention(isRecording);

  if (!isSupported) {
    console.warn("Wake Lock not supported, using fallback");
  }

  return <RecordingComponent />;
}
```

### With Analytics

```typescript
export function RecordingWithTracking() {
  const [isRecording, setIsRecording] = useState(false);
  const { isActive, isSupported } = useSleepPrevention(isRecording);

  useEffect(() => {
    if (isActive) {
      // Track that sleep prevention activated
      analytics.track("sleep_prevention_active", {
        supported: isSupported
      });
    }
  }, [isActive, isSupported]);

  return <RecordingComponent />;
}
```

## Performance Considerations

| Aspect       | Impact     | Note                               |
| ------------ | ---------- | ---------------------------------- |
| Initial load | Negligible | No initialization overhead         |
| Memory       | <1MB       | Single ref storage                 |
| CPU          | Negligible | Event-driven, not polling          |
| Battery      | None\*     | Screen already on during recording |

\*Battery impact only from screen being on, which happens anyway during recording.

## FAQs for Developers

**Q: Can I use this outside recording?**  
A: Yes, but it's designed for recording. Just pass appropriate boolean state.

**Q: What happens if browser doesn't support it?**  
A: Hook automatically falls back to screen keep-alive method. You don't need to handle this.

**Q: Do I need to manually release the lock?**  
A: No, hook handles it automatically. Just pass `false` to `isRecording`.

**Q: Can multiple components use this hook?**  
A: Yes, but ensure only one is active at a time (use state management).

**Q: Is there a performance hit?**  
A: No, it's minimal overhead. Wake Lock API is event-driven.

**Q: Can I disable this feature?**  
A: Currently no, but you could add environment variable check in the hook.

---

**Ready to integrate?** Just import and use! 🚀

For more details, see:

- [`SLEEP_PREVENTION_IMPLEMENTATION.md`](./SLEEP_PREVENTION_IMPLEMENTATION.md) - Full technical docs
- [`SLEEP_PREVENTION_QUICK_START.md`](./SLEEP_PREVENTION_QUICK_START.md) - Quick reference
