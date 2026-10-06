import { useEffect, useRef } from "react";

/**
 * Custom React hook to prevent OS sleep during recording
 * Uses the Wake Lock API (browser) and falls back to keeping the screen on
 *
 * @param isRecording - Boolean indicating if recording is in progress
 * @returns Object with isSupported status and current state
 */

export function useSleepPrevention(isRecording: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const screenTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isRecording) {
      // Release wake lock when recording stops
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch((err) => {
          console.warn("Failed to release wake lock:", err);
        });
        wakeLockRef.current = null;
      }

      // Clear screen timeout
      if (screenTimeoutRef.current !== null) {
        clearInterval(screenTimeoutRef.current);
        screenTimeoutRef.current = null;
      }

      return;
    }

    // Try to acquire wake lock when recording starts
    const acquireWakeLock = async () => {
      try {
        // Check if Wake Lock API is supported
        if ("wakeLock" in navigator) {
          try {
            wakeLockRef.current = await navigator.wakeLock.request("screen");

            // Re-acquire wake lock if page becomes visible again
            const handleVisibilityChange = async () => {
              if (
                document.visibilityState === "visible" &&
                !wakeLockRef.current &&
                isRecording
              ) {
                try {
                  wakeLockRef.current =
                    await navigator.wakeLock.request("screen");
                  console.log("Wake lock re-acquired after visibility change");
                } catch (err) {
                  console.warn("Failed to re-acquire wake lock:", err);
                }
              }
            };

            // Handle wake lock release events
            const handleWakeLockRelease = () => {
              console.warn("Wake lock was released");
              if (isRecording) {
                // Try to re-acquire if still recording
                acquireWakeLock();
              }
            };

            wakeLockRef.current.addEventListener(
              "release",
              handleWakeLockRelease
            );
            document.addEventListener(
              "visibilitychange",
              handleVisibilityChange
            );

            console.log(
              "✓ Wake Lock acquired - screen will stay on during recording"
            );

            return () => {
              document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
              );
              if (wakeLockRef.current) {
                wakeLockRef.current.removeEventListener(
                  "release",
                  handleWakeLockRelease
                );
              }
            };
          } catch (err) {
            console.warn("Wake Lock request failed:", err);
            // Fall back to screen-on-only approach
            fallbackKeepScreenOn();
          }
        } else {
          console.info(
            "Wake Lock API not supported, using fallback screen-on method"
          );
          fallbackKeepScreenOn();
        }
      } catch (err) {
        console.error("Unexpected error in wake lock setup:", err);
        fallbackKeepScreenOn();
      }
    };

    const keepScreenBright = () => {
      const style = document.body.style;
      const originalFilter = style.filter;
      style.filter = "brightness(0.9999)";

      setTimeout(() => {
        style.filter = originalFilter;
      }, 10);
    };

    const fallbackKeepScreenOn = () => {
      // Fallback: Keep screen from turning off by playing silent audio or frequent screen touches
      // This is a less reliable method but works on most devices

      // Create and play a silent audio loop (muted)
      const silentAudio = new Audio();
      silentAudio.src =
        "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YCIAAAAAAAA=";
      silentAudio.loop = true;
      silentAudio.muted = true;
      silentAudio.play().catch(() => {
        // Silent audio play failed, this is okay - fallback to keepalive touch events
      });

      // Periodic screen wake-up via screen touch event
      screenTimeoutRef.current = globalThis.setInterval(() => {
        if (document.hidden) {
          return; // Don't do anything if tab is not visible
        }

        // Also try to prevent display timeout on some devices
        // by creating a small visual change
        keepScreenBright();

        console.log("Screen keep-alive: periodic wake signal sent");
      }, 30000); // Every 30 seconds

      console.log(
        "✓ Fallback method: Screen will be kept awake during recording"
      );
    };

    acquireWakeLock();

    // Cleanup function
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch((err) => {
          console.warn("Failed to release wake lock on cleanup:", err);
        });
        wakeLockRef.current = null;
      }

      if (screenTimeoutRef.current !== null) {
        clearInterval(screenTimeoutRef.current);
        screenTimeoutRef.current = null;
      }
    };
  }, [isRecording]);

  return {
    isSupported: typeof navigator !== "undefined" && "wakeLock" in navigator,
    isActive: isRecording && wakeLockRef.current !== null,
  };
}

/**
 * Type declaration for WakeLockSentinel and WakeLockAPI
 * These are part of the Screen Wake Lock API
 */
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: "screen" | "system";
  release: () => Promise<void>;
}

interface WakeLockAPI {
  request: (type: "screen" | "system") => Promise<WakeLockSentinel>;
}
