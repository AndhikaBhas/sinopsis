import { AlertCircle, Check, Loader2, Mic } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioRecorder } from "../hooks/use-audio-recorder-recordrtc";

import { useSleepPrevention } from "../hooks/use-sleep-prevention";
import { validateAudioBlob } from "../lib/audio-utils";
import { generateAudioFilename } from "../lib/utils";

interface AudioRecorderButtonProps {
  readonly onRecordingComplete?: (success: boolean, fileName?: string) => void;
  readonly submitLabel?: string;
  readonly disabled?: boolean;
  readonly onFormSubmit?: () => boolean; // Returns true if form is valid
  readonly mode?: "recording-only" | "form-submit";
  readonly rapatId?: string; // Rapat ID for filename generation
  readonly autoStart?: boolean; // Auto-start recording when component mounts
}

// Real-time audio visualization - shows actual sound activity moving right to left
function MovingSoundWaveVisualization({
  waveHistory,
  currentLevels,
}: {
  readonly waveHistory: number[][];
  readonly currentLevels: number[];
}) {
  const [displayHistory, setDisplayHistory] = useState<number[]>([]);
  const currentLevelsRef = useRef(currentLevels);

  // Keep ref updated with latest currentLevels
  useEffect(() => {
    currentLevelsRef.current = currentLevels;
  }, [currentLevels]);

  // Sample audio at a slower rate for better visualization
  useEffect(() => {
    const interval = setInterval(() => {
      // Calculate current average audio level from ref (always gets latest)
      let currentLevel = 0;
      const levels = currentLevelsRef.current;
      if (levels && levels.length > 0) {
        const sum = levels.reduce((acc, level) => acc + level, 0);
        currentLevel = sum / levels.length;
      }

      // Add new level to the end (right side) and shift everything left
      setDisplayHistory((prev) => {
        const newHistory = [...prev, currentLevel];
        // Keep only the last 30 samples
        return newHistory.slice(-30);
      });
    }, 150); // Sample every 150ms for slower movement

    return () => clearInterval(interval);
  }, []); // Empty dependency array - runs once and uses ref for latest values

  // Create bars from display history
  const bars = useMemo(() => {
    const numBars = 30;
    const barData: { height: number; key: string; opacity: number }[] = [];

    // Pad with zeros if we don't have enough history yet
    const paddedHistory = [
      ...new Array(Math.max(0, numBars - displayHistory.length)).fill(0),
      ...displayHistory,
    ];

    for (let i = 0; i < numBars; i++) {
      const level = paddedHistory[i] || 0;
      const baseHeight = 4; // Minimum height in pixels
      const maxHeight = 32; // Maximum height in pixels

      // Scale audio level to height (amplified for visibility)
      const scaledLevel = Math.pow(level * 2.5, 1.2); // Amplify for better visibility
      const height =
        baseHeight + (maxHeight - baseHeight) * Math.min(1, scaledLevel);

      // Calculate opacity - newer bars (right) are more opaque
      const age = (numBars - 1 - i) / numBars; // 0 = newest (right), 1 = oldest (left)
      const opacity = Math.max(0.3, 1 - age * 0.5); // Fade out older bars

      barData.push({
        height: Math.max(4, height),
        key: `wave-bar-${i}`,
        opacity,
      });
    }

    return barData;
  }, [displayHistory]);

  return (
    <div className="flex items-center justify-center gap-1 w-64 h-8">
      {bars.map((bar) => (
        <div
          key={bar.key}
          className="w-0.5 bg-white rounded-full transition-all duration-150 ease-out"
          style={{
            height: `${bar.height}px`,
            opacity: bar.opacity,
          }}
        />
      ))}
    </div>
  );
}

export function AudioRecorderButton({
  onRecordingComplete,
  submitLabel = "Record Audio",
  disabled = false,
  onFormSubmit,
  mode = "recording-only",
  rapatId,
  autoStart = false,
}: AudioRecorderButtonProps) {
  // Add state to track when we're preparing to start recording
  const [isPreparing, setIsPreparing] = useState(false);
  // Add state to track when we're finalizing the recording
  const [isFinalizing, setIsFinalizing] = useState(false);

  const {
    recordingState,
    startRecording,
    stopRecording,
    resetRecording,
    audioBlob,
    error,
    duration,
    startTime,
    audioLevels,
    waveHistory,
    chunkCount,
    totalRecordingDuration,
    setOnChunkReady,
    currentSilenceDuration,
  } = useAudioRecorder();

  // Prevent OS sleep while recording
  const isRecording =
    recordingState === "recording" || recordingState === "chunked-recording";
  useSleepPrevention(isRecording);

  // Debouncing to prevent rapid clicks
  const lastClickTime = useRef<number>(0);
  const CLICK_DEBOUNCE_MS = 300;

  // Track uploaded chunks to prevent duplicates
  const uploadedBlobsRef = useRef<Set<Blob>>(new Set());
  const uploadTrackingRef = useRef<Set<string>>(new Set());

  // Simplified upload state
  const [backgroundUploads, setBackgroundUploads] = useState<
    Array<{
      id: string;
      status: "uploading" | "success" | "error";
      fileName?: string;
    }>
  >([]);

  // Get chunked recording configuration
  const chunkedRecordingEnabled =
    import.meta.env.VITE_CHUNKED_RECORDING_ENABLED === "true";
  const minChunkLengthSeconds =
    Number(import.meta.env.VITE_MIN_CHUNK_LENGTH_SECONDS) || 10;
  const chunkSilenceThresholdDbfs =
    Number(import.meta.env.VITE_CHUNK_SILENCE_THRESHOLD_DBFS) || -40;
  const chunkSilenceDurationSeconds =
    Number(import.meta.env.VITE_CHUNK_SILENCE_DURATION_SECONDS) || 2;

  // Auto-save when recording stops and audioBlob is available (for non-chunked mode only)
  // In chunked mode, the final chunk is already uploaded by stopRecording() via onChunkReady callback
  useEffect(() => {
    if (recordingState === "stopped" && audioBlob && startTime) {
      if (!chunkedRecordingEnabled) {
        // For non-chunked recordings, use chunk number 1
        const chunkNumber = 1;
        const uploadKey = `${audioBlob.size}-${startTime.getTime()}-${chunkNumber}`;

        if (uploadTrackingRef.current.has(uploadKey)) {
          return;
        }

        uploadedBlobsRef.current.add(audioBlob);
        uploadTrackingRef.current.add(uploadKey);
        saveRecordingAsync(audioBlob, startTime, chunkNumber);
      }
      // Chunked mode: final chunk already uploaded by stopRecording() in hook
    }
  }, [
    recordingState,
    audioBlob,
    startTime,
    chunkedRecordingEnabled,
    chunkCount,
  ]);

  // Separate effect to handle resetting only when truly stopped (not voice-waiting)
  useEffect(() => {
    if (recordingState === "stopped" && audioBlob) {
      // Only reset if we stay in stopped state after upload
      const timeoutId = setTimeout(() => {
        if (recordingState === "stopped") {
          // Clean up the blob tracking when resetting
          uploadedBlobsRef.current.clear();
          uploadTrackingRef.current.clear();
          resetRecording();
        }
      }, 500); // Give enough time for voice-waiting transition

      return () => clearTimeout(timeoutId);
    }
  }, [recordingState, audioBlob, resetRecording]);

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleStopRecording = async () => {
    try {
      await stopRecording();
    } catch (error) {
      console.error("Error stopping recording:", error);
    }
  };

  // Auto-start recording when component mounts with autoStart=true and valid rapatId
  useEffect(() => {
    if (autoStart && rapatId && recordingState === "idle" && !disabled) {
      // Immediately show preparing state for instant feedback
      setIsPreparing(true);

      // Reduced delay to 100ms for better UX while maintaining component mounting safety
      const timeoutId = setTimeout(() => {
        if (recordingState === "idle") {
          setIsPreparing(false);
          handleStartRecording();
        }
      }, 100);

      return () => {
        setIsPreparing(false);
        clearTimeout(timeoutId);
      };
    }
  }, [autoStart, rapatId, recordingState, disabled, handleStartRecording]);

  const removeUploadFromList = useCallback(
    (uploadId: string, delay: number = 3000) => {
      setTimeout(() => {
        setBackgroundUploads((prev) =>
          prev.filter((upload) => upload.id !== uploadId)
        );
      }, delay);
    },
    []
  );

  // Simplified upload - no polling, server handles async processing
  const saveRecordingAsync = useCallback(
    async (blob: Blob, chunkStartTime: Date, chunkNumber: number = 1) => {
      // Validate audio blob before upload with enhanced header checking
      const validation = await validateAudioBlob(blob);
      if (!validation.isValid) {
        console.error("Audio validation failed:", validation.error);
        onRecordingComplete?.(false);
        return;
      }

      // Optional: validate headers for better error reporting
      if (import.meta.env.VITE_TEST_AUDIO_HEADERS === "true") {
        const { validateAudioBlobHeaders } = await import(
          "../lib/audio-header-validator"
        );
        const headerValidation = await validateAudioBlobHeaders(blob);

        if (!headerValidation.isValid) {
          console.warn(
            "⚠️ Audio file has header issues:",
            headerValidation.issues
          );
          console.warn("💡 Suggestions:", headerValidation.suggestions);
          console.warn("The file may not play correctly in some media players");
          // Continue with upload but warn user
        } else {
          console.log("✅ Audio headers validated successfully");
        }
      }

      const uploadId = `upload-${Date.now()}`;

      // Add to background uploads
      setBackgroundUploads((prev) => [
        ...prev,
        {
          id: uploadId,
          status: "uploading",
        },
      ]);

      try {
        // Create FormData with validated blob
        const formData = new FormData();

        // Generate a proper filename using the established naming convention
        // Determine file extension from blob type
        const fileExtension = blob.type.includes("webm") ? "webm" : "mp4";
        const blobName = generateAudioFilename(
          fileExtension,
          chunkNumber,
          chunkStartTime,
          rapatId
        );

        formData.append("audio", blob, blobName);
        formData.append("chunkNumber", chunkNumber.toString());

        // Get the current rapatId value (not from closure)
        const currentRapatId = rapatId;

        if (
          currentRapatId &&
          currentRapatId.trim() !== "" &&
          currentRapatId !== "null" &&
          currentRapatId !== "undefined"
        ) {
          formData.append("rapatId", currentRapatId);
        }

        // Upload with timeout protection
        // Configurable timeout to handle slow networks (default: 5 minutes to match NGINX)
        const uploadTimeoutMs = Number(import.meta.env.VITE_UPLOAD_TIMEOUT_MS) || 300000; // 5 minutes default
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), uploadTimeoutMs);

        try {
          const response = await fetch("/upload-audio", {
            method: "POST",
            body: formData,
            signal: controller.signal,
            headers: {
              // Let browser set Content-Type for multipart/form-data
            },
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const result = await response.json();

            // Mark as success - server handles async processing via RabbitMQ
            setBackgroundUploads((prev) =>
              prev.map((upload) =>
                upload.id === uploadId
                  ? {
                      ...upload,
                      status: "success",
                      fileName: result.fileName,
                    }
                  : upload
              )
            );

            // Notify completion and remove from list
            onRecordingComplete?.(true, result.fileName);
            removeUploadFromList(uploadId, 3000);
          } else {
            const errorText = await response.text();
            throw new Error(
              `Upload failed: ${response.status} ${response.statusText} - ${errorText}`
            );
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            const timeoutSeconds = Math.round(uploadTimeoutMs / 1000);
            throw new Error(`Upload timeout after ${timeoutSeconds} seconds. This may be due to slow network connection or large file size. Please try again or contact support if the issue persists.`);
          }
          throw fetchError;
        }
      } catch (err) {
        console.error("Upload error:", err);

        // Update upload status to error
        setBackgroundUploads((prev) =>
          prev.map((upload) =>
            upload.id === uploadId ? { ...upload, status: "error" } : upload
          )
        );

        onRecordingComplete?.(false);

        // Remove from list after 5 seconds
        removeUploadFromList(uploadId, 5000);

        // Re-throw the error to handle it upstream if needed
        throw err;
      }
    },
    [rapatId, onRecordingComplete, removeUploadFromList]
  );

  // Set up chunk ready callback for automatic upload - must be after saveRecordingAsync definition
  useEffect(() => {
    setOnChunkReady((blob: Blob, chunkStartTime: Date, chunkNumber: number) => {
      const uploadKey = `${blob.size}-${chunkStartTime.getTime()}-${chunkNumber}`;

      if (uploadTrackingRef.current.has(uploadKey)) {
        return;
      }

      // Mark this upload to prevent duplicates
      uploadedBlobsRef.current.add(blob);
      uploadTrackingRef.current.add(uploadKey);

      saveRecordingAsync(blob, chunkStartTime, chunkNumber);
    });

    // Cleanup on unmount
    return () => {
      setOnChunkReady(null);
    };
  }, [setOnChunkReady, rapatId, saveRecordingAsync]); // Dependencies include rapatId and saveRecordingAsync

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getButtonContent = () => {
    // When finalizing, never show recording visualization
    if (isFinalizing) {
      return (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Memfinalisasi Rekaman Audio...</span>
        </>
      );
    }

    // When preparing, show preparing message
    if (isPreparing) {
      return (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Mempersiapkan...</span>
        </>
      );
    }

    const isRecording =
      recordingState === "recording" || recordingState === "chunked-recording";

    if (mode === "form-submit" && !isRecording) {
      return (
        <>
          <Mic className="h-5 w-5 transition-transform hover:scale-110" />
          <span>{submitLabel}</span>
        </>
      );
    }

    if (isRecording) {
      const isChunked = recordingState === "chunked-recording";

      return (
        <>
          <div className="flex items-center justify-center relative">
            {/* Animated recording indicator */}
            <div className="relative flex items-center">
              {/* Recording dot - different colors for chunked vs regular */}
              <div
                className={`h-3 w-3 rounded-full animate-pulse mr-3 ${
                  isChunked ? "bg-orange-500" : "bg-red-500"
                }`}
              />
            </div>

            {/* Real-time moving sound wave visualization - Always show during recording */}
            <MovingSoundWaveVisualization
              waveHistory={waveHistory}
              currentLevels={audioLevels}
            />
          </div>
          <div className="text-center">
            <span className="text-sm font-mono">
              {formatDuration(duration)}
            </span>
          </div>
        </>
      );
    }

    return (
      <>
        <Mic className="h-5 w-5 transition-transform hover:scale-110" />
        <span>Record Audio</span>
      </>
    );
  };

  const getButtonClassName = () => {
    const baseClasses =
      "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform active:scale-95 cursor-pointer";

    // Show preparing state with a subtle animation
    if (isPreparing) {
      return `${baseClasses} bg-blue-500 text-white animate-pulse cursor-wait`;
    }

    // Show finalizing state
    if (isFinalizing) {
      return `${baseClasses} min-w-[420px] bg-blue-500 text-white animate-pulse cursor-wait`;
    }

    if (recordingState === "recording") {
      return `${baseClasses} min-w-[420px] bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 shadow-lg shadow-red-500/25 hover:scale-105`;
    }

    if (recordingState === "chunked-recording") {
      return `${baseClasses} min-w-[420px] bg-orange-600 text-white hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800 shadow-lg shadow-orange-500/25 hover:scale-105`;
    }

    return `${baseClasses} bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105`;
  };

  const getAriaLabel = () => {
    if (isPreparing) return "Preparing to record...";
    if (isFinalizing) return "Finalizing recording...";
    if (recordingState === "recording") return "Stop recording";
    if (recordingState === "chunked-recording") return "Stop chunked recording";
    return "Start recording";
  };

  const handleButtonClick = useCallback(() => {
    const now = Date.now();
    if (now - lastClickTime.current < CLICK_DEBOUNCE_MS) {
      return;
    }
    lastClickTime.current = now;

    // Handle different button states
    if (
      recordingState === "recording" ||
      recordingState === "chunked-recording"
    ) {
      // For form-submit mode (finish action), wait for recording to stop and final chunk to upload
      if (mode === "form-submit") {
        setIsFinalizing(true);
        handleStopRecording()
          .then(() => {
            // Wait a bit for final chunk upload to complete, then submit
            // Keep isFinalizing true until redirect happens
            setTimeout(() => {
              onFormSubmit?.();
              // Don't set isFinalizing to false - let the redirect handle cleanup
            }, 500);
          })
          .catch((error) => {
            console.error("Error stopping recording:", error);
            setIsFinalizing(false);
            // Still submit form even if there's an error
            onFormSubmit?.();
          });
      } else {
        // For recording-only mode, wait for recording to stop
        handleStopRecording().catch((error) => {
          console.error("Error stopping recording:", error);
        });
      }
    } else if (recordingState === "idle") {
      if (mode === "form-submit") {
        // Show preparing state immediately for instant feedback
        setIsPreparing(true);

        // For form-submit mode, check validation first
        const formValid = onFormSubmit?.() ?? true;

        // If form is valid, submit the form
        if (formValid) {
          // If rapatId exists, this is an existing rapat - start recording with reduced delay
          if (rapatId) {
            setTimeout(() => {
              handleStartRecording().catch((error) => {
                console.error("Error starting recording:", error);
                setIsPreparing(false);
              });
            }, 100);
          }
          // If no rapatId, this is a new rapat - let form submission create it
          // and auto-start will happen on redirect with the new ID
        } else {
          // If form is invalid, reset preparing state
          setIsPreparing(false);
        }
        // If form is invalid, don't start recording
      } else {
        // Regular recording mode
        handleStartRecording().catch((error) => {
          console.error("Error starting recording:", error);
        });
      }
    }
  }, [
    recordingState,
    mode,
    onFormSubmit,
    rapatId,
    handleStopRecording,
    handleStartRecording,
  ]);

  return (
    <div className="flex flex-col items-center space-y-2">
      <button
        onClick={handleButtonClick}
        className={getButtonClassName()}
        aria-label={getAriaLabel()}
        type={
          mode === "form-submit" && recordingState === "idle"
            ? "submit"
            : "button"
        }
        disabled={disabled || isPreparing || isFinalizing}
      >
        {getButtonContent()}
      </button>

      {/* Chunked mode information display */}
      {chunkedRecordingEnabled &&
        !isFinalizing &&
        (recordingState === "chunked-recording" ||
          recordingState === "recording") && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-xs border border-gray-200 dark:border-gray-700 max-w-md">
            <div className="text-center mb-2">
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                📦 Chunked Recording Mode
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-400">
              <div>
                <span className="font-medium">Min chunk:</span>{" "}
                {minChunkLengthSeconds}s
              </div>
              <div>
                <span className="font-medium">Silence threshold:</span>{" "}
                {chunkSilenceThresholdDbfs} dBFS
              </div>
              <div>
                <span className="font-medium">Silence duration:</span>{" "}
                {recordingState === "chunked-recording"
                  ? duration < minChunkLengthSeconds
                    ? `${chunkSilenceDurationSeconds}s (initial, min chunk not reached)`
                    : `${currentSilenceDuration.toFixed(2)}s (decreasing from ${chunkSilenceDurationSeconds}s → 0.5s)`
                  : `${chunkSilenceDurationSeconds}s (initial)`}
              </div>
              <div>
                <span className="font-medium">Auto-upload:</span> ✅ Enabled
              </div>
            </div>

            {recordingState === "chunked-recording" && (
              <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600 text-center space-y-1">
                <div className="text-orange-600 dark:text-orange-400">
                  <span className="font-medium">Current chunk:</span>{" "}
                  {duration < minChunkLengthSeconds
                    ? `${duration}s (min ${minChunkLengthSeconds}s to split)`
                    : `${duration}s (ready to split, silence needed: ${currentSilenceDuration.toFixed(2)}s)`}
                </div>
                <div className="text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Chunks completed:</span>{" "}
                  {chunkCount} |{" "}
                  <span className="font-medium">Total duration:</span>{" "}
                  {formatDuration(Math.floor(totalRecordingDuration))}
                </div>
              </div>
            )}
          </div>
        )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-xs animate-shake">
          {error}
        </p>
      )}

      {!isFinalizing && recordingState === "recording" && (
        <div className="text-center space-y-1">
          <p className="text-sm text-gray-600 dark:text-gray-400 animate-pulse">
            🎤 Recording in progress...
          </p>
          <div className="flex items-center justify-center space-x-1">
            <div
              className="w-2 h-2 bg-red-500 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2 h-2 bg-red-500 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-2 h-2 bg-red-500 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        </div>
      )}

      {!isFinalizing && recordingState === "chunked-recording" && (
        <div className="text-center space-y-1">
          <p className="text-sm text-gray-600 dark:text-gray-400 animate-pulse">
            🔄 Chunked recording active...
          </p>
          <div className="flex items-center justify-center space-x-1">
            <div
              className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Auto-uploads when silence detected
          </p>
        </div>
      )}

      {/* Background upload status */}
      {backgroundUploads.length > 0 && (
        <div className="text-xs space-y-1">
          {backgroundUploads.map((upload) => (
            <div key={upload.id} className="flex items-center gap-2">
              {upload.status === "uploading" && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  <span className="text-gray-600 dark:text-gray-400">
                    Saving to server...
                  </span>
                </>
              )}
              {upload.status === "success" && upload.fileName && (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">
                    Completed: {upload.fileName}
                  </span>
                </>
              )}
              {upload.status === "error" && (
                <>
                  <AlertCircle className="h-3 w-3 text-red-500" />
                  <span className="text-red-600 dark:text-red-400">
                    Upload failed
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
