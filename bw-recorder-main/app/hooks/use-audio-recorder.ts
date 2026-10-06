import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOptimizedMediaRecorderOptions,
  waitForMediaRecorderFinalization,
} from "../lib/audio-utils";

type AudioRecordingState =
  | "idle"
  | "recording"
  | "stopped"
  | "chunked-recording";

interface UseAudioRecorderReturn {
  recordingState: AudioRecordingState;
  isRecording: boolean;
  isPaused: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>; // Updated to return Promise
  resetRecording: () => void;
  audioBlob: Blob | null;
  error: string | null;
  duration: number;
  startTime: Date | null;
  audioLevels: number[];
  waveHistory: number[][];
  enableVoiceActivation: boolean;
  setEnableVoiceActivation: (enabled: boolean) => void;
  chunkCount: number;
  totalRecordingDuration: number;
  currentChunkStartTime: Date | null;
  setOnChunkReady: (
    callback:
      | ((blob: Blob, chunkStartTime: Date, chunkNumber: number) => void)
      | null
  ) => void;
  currentSilenceDuration: number;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [recordingState, setRecordingState] =
    useState<AudioRecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [waveHistory, setWaveHistory] = useState<number[][]>([]);
  const [enableVoiceActivation, setEnableVoiceActivation] = useState(true);
  const [chunkCount, setChunkCount] = useState(0);
  const [totalRecordingDuration, setTotalRecordingDuration] = useState(0);
  const [currentChunkStartTime, setCurrentChunkStartTime] =
    useState<Date | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-stop functionality refs
  const lastAudioActivityRef = useRef<number>(Date.now());
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Chunked recording refs
  const chunkStartTimeRef = useRef<number>(0);
  const isChunkedModeRef = useRef<boolean>(false);
  const recordingStateRef = useRef<AudioRecordingState>("idle");
  const onChunkReadyRef = useRef<
    ((blob: Blob, chunkStartTime: Date, chunkNumber: number) => void) | null
  >(null);
  const chunkRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Silence duration decrement refs
  const currentChunkSilenceDurationRef = useRef<number>(0);
  const lastDecrementTimeRef = useRef<number>(0);

  // Chunked recording configuration
  const chunkedRecordingEnabled =
    import.meta.env.VITE_CHUNKED_RECORDING_ENABLED === "true";
  const minChunkLengthSeconds =
    Number(import.meta.env.VITE_MIN_CHUNK_LENGTH_SECONDS) || 10;
  const chunkSilenceThresholdDbfs =
    Number(import.meta.env.VITE_CHUNK_SILENCE_THRESHOLD_DBFS) || -40;
  const chunkSilenceDurationSeconds =
    Number(import.meta.env.VITE_CHUNK_SILENCE_DURATION_SECONDS) || 2;
  const chunkSilenceDecrementIntervalSeconds =
    Number(import.meta.env.VITE_CHUNK_SILENCE_DECREMENT_INTERVAL_SECONDS) || 1;

  // Current silence duration state (dynamic value)
  const [currentSilenceDuration, setCurrentSilenceDuration] = useState<number>(
    chunkSilenceDurationSeconds
  );

  // Helper function to convert amplitude to dBFS
  const amplitudeToDbfs = useCallback((amplitude: number): number => {
    if (amplitude === 0) return -Infinity;
    return 20 * Math.log10(amplitude);
  }, []);

  // Cleanup function to safely stop everything
  const cleanupAudioResources = useCallback(
    (preserveAnalysis: boolean = false) => {
      // Stop audio analysis only if doing complete cleanup
      if (!preserveAnalysis && animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Clear all timers
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (silenceCheckIntervalRef.current) {
        clearInterval(silenceCheckIntervalRef.current);
        silenceCheckIntervalRef.current = null;
      }

      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
        maxDurationTimeoutRef.current = null;
      }

      if (chunkRestartTimeoutRef.current) {
        clearTimeout(chunkRestartTimeoutRef.current);
        chunkRestartTimeoutRef.current = null;
      }

      // Only clean up stream and context if we're completely stopping or not preserving analysis
      if (!preserveAnalysis && !isChunkedModeRef.current) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        analyzerRef.current = null;
      }
    },
    []
  );

  // Function to analyze audio levels with robust error handling
  const analyzeAudio = useCallback(() => {
    if (!analyzerRef.current || !audioContextRef.current) {
      return;
    }

    try {
      const analyzer = analyzerRef.current;
      const bufferLength = analyzer.frequencyBinCount;

      // Get time domain data for silence detection
      const dataArray = new Uint8Array(bufferLength);
      analyzer.getByteTimeDomainData(dataArray);

      // Calculate RMS for silence detection - improved method
      let rms = 0;
      let peak = 0;
      for (const sample of dataArray) {
        const normalizedLevel = (sample - 128) / 128;
        const absLevel = Math.abs(normalizedLevel);
        rms += normalizedLevel * normalizedLevel;
        peak = Math.max(peak, absLevel);
      }
      rms = Math.sqrt(rms / bufferLength);

      // Also get frequency domain data for additional silence detection
      const freqArray = new Uint8Array(bufferLength);
      analyzer.getByteFrequencyData(freqArray);

      // Calculate frequency domain energy
      let freqEnergy = 0;
      for (let i = 0; i < bufferLength; i++) {
        freqEnergy += freqArray[i];
      }
      freqEnergy = freqEnergy / bufferLength / 255; // Normalize to 0-1

      // Use a combination of RMS, peak, and frequency energy for better silence detection
      const combinedLevel = Math.max(rms, peak * 0.7, freqEnergy * 0.5);

      // Convert to dBFS for chunked recording
      const dbfs = amplitudeToDbfs(combinedLevel);

      // Check for audio activity
      const currentTime = Date.now();
      const chunkDuration = (currentTime - chunkStartTimeRef.current) / 1000;

      // Chunked recording logic
      if (chunkedRecordingEnabled && isChunkedModeRef.current) {
        // Always update lastAudioActivityRef if there's audio, regardless of minimum chunk length
        const isSilent = dbfs <= chunkSilenceThresholdDbfs;
        if (!isSilent) {
          lastAudioActivityRef.current = currentTime;
        }

        // Calculate and update current required silence duration continuously
        let currentRequiredSilenceDuration;
        if (chunkDuration >= minChunkLengthSeconds) {
          // Calculate smooth decreasing silence duration based on time elapsed AFTER min chunk length
          const timeElapsedSinceMinLength =
            chunkDuration - minChunkLengthSeconds;

          // Use linear interpolation for smooth decrease instead of discrete steps
          const decrementRate = 0.25 / chunkSilenceDecrementIntervalSeconds; // 0.25s per interval
          const totalDecrement = timeElapsedSinceMinLength * decrementRate;

          currentRequiredSilenceDuration = Math.max(
            0.5,
            chunkSilenceDurationSeconds - totalDecrement
          );
        } else {
          // Before min chunk length is reached, use initial silence duration
          currentRequiredSilenceDuration = chunkSilenceDurationSeconds;
        }

        // Update the current silence duration for smooth UI updates (only when value changes significantly)
        const difference = Math.abs(
          currentChunkSilenceDurationRef.current -
            currentRequiredSilenceDuration
        );
        if (difference >= 0.01) {
          // Update only when difference is >= 0.01s for performance
          currentChunkSilenceDurationRef.current =
            currentRequiredSilenceDuration;
          setCurrentSilenceDuration(currentRequiredSilenceDuration);
        }

        // Check for silence detection only after minimum chunk length
        if (chunkDuration >= minChunkLengthSeconds && isSilent) {
          const silenceDuration =
            (currentTime - lastAudioActivityRef.current) / 1000;

          if (silenceDuration >= currentRequiredSilenceDuration) {
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === "recording"
            ) {
              mediaRecorderRef.current.stop();
            }
            return;
          }
        }
      }

      // Get frequency data for visualization
      const freqDataArray = new Uint8Array(bufferLength);
      analyzer.getByteFrequencyData(freqDataArray);

      // Convert frequency data to wave-like levels for visualization
      const levels: number[] = [];
      const bandsPerBar = Math.floor(bufferLength / 20);

      for (let i = 0; i < 20; i++) {
        let sum = 0;
        const start = i * bandsPerBar;
        const end = Math.min(start + bandsPerBar, bufferLength);

        for (let j = start; j < end; j++) {
          sum += freqDataArray[j];
        }

        const average = sum / (end - start);
        const normalizedLevel = Math.min(average / 255, 1);
        const amplifiedLevel = Math.min(normalizedLevel * 2, 1);
        levels.push(amplifiedLevel);
      }

      setAudioLevels(levels);

      // Update wave history for moving visualization
      setWaveHistory((prev) => {
        const newHistory = [...prev, levels];
        return newHistory.slice(-60);
      });

      // Continue analyzing if still recording - ensure continuation regardless of closure
      if (analyzerRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      }
    } catch (error) {
      setError("Audio analysis error - please restart recording");
    }
  }, [
    amplitudeToDbfs,
    chunkedRecordingEnabled,
    minChunkLengthSeconds,
    chunkSilenceThresholdDbfs,
    chunkSilenceDurationSeconds,
    recordingState,
  ]);

  // Robust chunk restart function
  const startNewChunk = useCallback(() => {
    if (!streamRef.current || !isChunkedModeRef.current) {
      return;
    }

    // CRITICAL FIX: Ensure previous MediaRecorder is fully stopped
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      console.warn(
        "Previous MediaRecorder still active, waiting for it to stop"
      );
      // Try again after a short delay
      setTimeout(() => startNewChunk(), 100);
      return;
    }

    // Validate stream is still active
    const activeTracks = streamRef.current
      .getTracks()
      .filter((track) => track.readyState === "live");
    if (activeTracks.length === 0) {
      setError("Audio stream lost - please restart recording");
      isChunkedModeRef.current = false;
      setRecordingState("idle");
      return;
    }

    try {
      // Reset for new chunk
      chunksRef.current = [];
      chunkStartTimeRef.current = Date.now();
      lastAudioActivityRef.current = Date.now();

      // Reset silence duration decrement tracking
      currentChunkSilenceDurationRef.current = chunkSilenceDurationSeconds;
      lastDecrementTimeRef.current = Date.now();
      setCurrentSilenceDuration(chunkSilenceDurationSeconds);

      const newChunkStartTime = new Date(chunkStartTimeRef.current);
      setCurrentChunkStartTime(newChunkStartTime);

      // Reset timer for new chunk
      setDuration(0);
      startTimeRef.current = Date.now();

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Create new MediaRecorder with consistent configuration
      const mediaRecorderOptions = getOptimizedMediaRecorderOptions();
      const mediaRecorder = new MediaRecorder(
        streamRef.current,
        mediaRecorderOptions
      );
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Ensure we have data before creating blob
        if (chunksRef.current.length === 0) {
          console.warn("No audio data chunks available for blob creation");
          setError("Recording failed: No audio data captured");
          return;
        }

        // Validate MediaRecorder mimeType before blob creation
        let mimeType = mediaRecorder.mimeType;
        if (!mimeType) {
          console.warn(
            "MediaRecorder mimeType not available, defaulting to audio/webm"
          );
          mimeType = "audio/webm";
        }

        // Create blob with proper MIME type and validate
        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Validate blob size and content
        if (blob.size === 0) {
          console.error("Created blob has zero size");
          setError("Recording failed: Audio data is empty");
          return;
        }

        // Additional validation for minimum blob size (at least 1KB for valid audio)
        if (blob.size < 1024) {
          console.warn(
            "Audio blob is very small, may be corrupted:",
            blob.size,
            "bytes"
          );
          // Don't fail here, but log for debugging
        }

        console.log("Audio blob created successfully:", {
          size: blob.size,
          type: blob.type,
          chunks: chunksRef.current.length,
        });

        setAudioBlob(blob);

        if (chunkedRecordingEnabled && isChunkedModeRef.current) {
          const chunkStartTime = new Date(chunkStartTimeRef.current);

          setChunkCount((prev) => {
            const newCount = prev + 1;

            if (onChunkReadyRef.current) {
              onChunkReadyRef.current(blob, chunkStartTime, newCount);
            }

            return newCount;
          });
          setTotalRecordingDuration(
            (prev) => prev + (Date.now() - chunkStartTimeRef.current) / 1000
          );

          // CRITICAL FIX: Clear the old MediaRecorder reference before starting new chunk
          // This ensures the previous instance is fully released
          mediaRecorderRef.current = null;

          // Schedule next chunk restart with increased delay to ensure clean state
          chunkRestartTimeoutRef.current = setTimeout(() => {
            if (isChunkedModeRef.current && streamRef.current) {
              startNewChunk();
            }
          }, 200); // Increased from 100ms to 200ms for better stability

          return;
        }

        setRecordingState("stopped");
      };

      mediaRecorder.onerror = (event) => {
        setError(`Recording error: ${event.error?.message || "Unknown error"}`);
        isChunkedModeRef.current = false;
        setRecordingState("idle");
      };

      // Start the new chunk with consistent timeslice
      mediaRecorder.start(100); // Match the main recording timeslice
      setRecordingState("chunked-recording");

      // CRITICAL: Ensure audio analysis continues running
      // Don't check if animationFrameRef.current exists - just restart it
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (analyzerRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      }
    } catch (error) {
      setError(
        `Failed to start new chunk: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      isChunkedModeRef.current = false;
      setRecordingState("idle");
    }
  }, [chunkedRecordingEnabled, analyzeAudio]);

  // Function to set the chunk ready callback
  const setOnChunkReady = useCallback(
    (
      callback:
        | ((blob: Blob, chunkStartTime: Date, chunkNumber: number) => void)
        | null
    ) => {
      onChunkReadyRef.current = callback;
    },
    []
  );

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setAudioBlob(null);
      setDuration(0);

      const recordingStartTime = new Date();
      setStartTime(recordingStartTime);

      // Setup chunked recording if enabled
      if (chunkedRecordingEnabled) {
        isChunkedModeRef.current = true;
        chunkStartTimeRef.current = recordingStartTime.getTime();
        setCurrentChunkStartTime(recordingStartTime);
        setChunkCount(0);
        setTotalRecordingDuration(0);

        // Reset silence duration decrement tracking
        currentChunkSilenceDurationRef.current = chunkSilenceDurationSeconds;
        lastDecrementTimeRef.current = recordingStartTime.getTime();
        setCurrentSilenceDuration(chunkSilenceDurationSeconds);
      } else {
        isChunkedModeRef.current = false;
      }

      // Get microphone access with configurable audio processing settings
      const enhancedProcessing =
        import.meta.env.VITE_ENHANCED_AUDIO_PROCESSING !== "false";

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Echo cancellation - use exact constraints only if enhanced processing is enabled
          echoCancellation: enhancedProcessing ? { exact: true } : true,

          // Noise suppression - stronger settings for enhanced processing
          noiseSuppression: enhancedProcessing ? { exact: true } : true,

          // Automatic gain control - prevents clipping and distortion
          autoGainControl: enhancedProcessing ? { exact: true } : true,

          // Sample rate - use 16kHz for speech (better for Debian compatibility)
          sampleRate: { ideal: 16000, min: 8000, max: 48000 },

          // Mono channel for speech recording (reduces file size and echo)
          channelCount: { exact: 1 },

          // Sample size for better audio quality
          sampleSize: { ideal: 16 },
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      // Set up audio analysis with better settings for speech
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)({
        // Use lower sample rate for better performance and compatibility
        sampleRate: 16000,
        latencyHint: "interactive",
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();

      // Optimized settings for speech analysis and echo detection
      analyzer.fftSize = 1024; // Increased for better frequency resolution
      analyzer.smoothingTimeConstant = 0.2; // Reduced for more responsive analysis
      analyzer.minDecibels = -100; // Extended range for better silence detection
      analyzer.maxDecibels = -10; // Keep max the same

      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // Start audio analysis
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);

      // Create MediaRecorder with optimized settings for better compatibility
      const mediaRecorderOptions = getOptimizedMediaRecorderOptions();
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Ensure we have data before creating blob
        if (chunksRef.current.length === 0) {
          console.warn("No audio data chunks available for blob creation");
          setError("Recording failed: No audio data captured");
          return;
        }

        // Validate MediaRecorder mimeType before blob creation
        let mimeType = mediaRecorder.mimeType;
        if (!mimeType) {
          console.warn(
            "MediaRecorder mimeType not available, defaulting to audio/webm"
          );
          mimeType = "audio/webm";
        }

        // Create blob with proper MIME type and validate
        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Validate blob size and content
        if (blob.size === 0) {
          console.error("Created blob has zero size");
          setError("Recording failed: Audio data is empty");
          return;
        }

        // Additional validation for minimum blob size (at least 1KB for valid audio)
        if (blob.size < 1024) {
          console.warn(
            "Audio blob is very small, may be corrupted:",
            blob.size,
            "bytes"
          );
          // Don't fail here, but log for debugging
        }

        console.log("Audio blob created successfully:", {
          size: blob.size,
          type: blob.type,
          chunks: chunksRef.current.length,
        });

        setAudioBlob(blob);

        if (chunkedRecordingEnabled && isChunkedModeRef.current) {
          const chunkStartTime = new Date(chunkStartTimeRef.current);

          setChunkCount((prev) => {
            const newCount = prev + 1;

            if (onChunkReadyRef.current) {
              onChunkReadyRef.current(blob, chunkStartTime, newCount);
            }

            return newCount;
          });
          setTotalRecordingDuration(
            (prev) => prev + (Date.now() - chunkStartTimeRef.current) / 1000
          );

          // CRITICAL FIX: Clear the old MediaRecorder reference before starting new chunk
          // This ensures the previous instance is fully released
          mediaRecorderRef.current = null;

          // Start next chunk with increased delay for stability
          chunkRestartTimeoutRef.current = setTimeout(() => {
            if (isChunkedModeRef.current && streamRef.current) {
              startNewChunk();
            }
          }, 200); // Increased from 100ms to 200ms

          return;
        }

        setRecordingState("stopped");
        cleanupAudioResources(false);
      };

      mediaRecorder.onerror = (event) => {
        setError(`Recording error: ${event.error?.message || "Unknown error"}`);
        setRecordingState("idle");
        isChunkedModeRef.current = false;
        cleanupAudioResources(false);
      };

      // Start recording with smaller timeslice for better responsiveness and less clipping
      mediaRecorder.start(100); // Reduced from 250ms to 100ms for better quality
      setRecordingState(
        chunkedRecordingEnabled ? "chunked-recording" : "recording"
      );
      startTimeRef.current = recordingStartTime.getTime();

      // Start duration timer
      intervalRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);

      let errorMessage = "Failed to start recording.";

      if (err instanceof Error) {
        // Handle specific getUserMedia errors
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          errorMessage =
            "Akses mikrofon ditolak. Silakan izinkan akses mikrofon di pengaturan browser Anda.";
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          errorMessage =
            "Mikrofon tidak ditemukan. Pastikan mikrofon terhubung dan coba lagi.";
        } else if (
          err.name === "NotReadableError" ||
          err.name === "TrackStartError"
        ) {
          errorMessage =
            "Mikrofon sedang digunakan oleh aplikasi lain. Tutup aplikasi tersebut dan coba lagi.";
        } else if (err.name === "OverconstrainedError") {
          errorMessage =
            "Mikrofon Anda tidak mendukung pengaturan yang diperlukan. Coba gunakan mikrofon lain.";
        } else if (err.name === "SecurityError") {
          errorMessage =
            "Tidak dapat mengakses mikrofon. Pastikan Anda menggunakan koneksi HTTPS yang aman.";
        } else if (err.name === "TypeError") {
          errorMessage =
            "Browser Anda tidak mendukung perekaman audio. Gunakan browser modern seperti Chrome atau Firefox.";
        } else {
          errorMessage = `Kesalahan perekaman: ${err.message}`;
        }
      }

      setError(errorMessage);
      setRecordingState("idle");
      isChunkedModeRef.current = false;
      cleanupAudioResources(false);
    }
  }, [
    chunkedRecordingEnabled,
    analyzeAudio,
    startNewChunk,
    cleanupAudioResources,
  ]);

  const stopRecording = useCallback(async () => {
    // Mark chunked mode as stopped to prevent restarts
    if (chunkedRecordingEnabled && isChunkedModeRef.current) {
      isChunkedModeRef.current = false;
      // Don't clear onChunkReadyRef.current here - it should persist across recording sessions
    }

    // Stop MediaRecorder with proper finalization
    if (
      mediaRecorderRef.current &&
      (mediaRecorderRef.current.state === "recording" ||
        recordingState === "recording" ||
        recordingState === "chunked-recording")
    ) {
      console.log(
        "Stopping MediaRecorder, current state:",
        mediaRecorderRef.current.state
      );

      try {
        // Use the proper finalization utility
        await waitForMediaRecorderFinalization(mediaRecorderRef.current, 5000);
        console.log("MediaRecorder finalized successfully");
      } catch (error) {
        console.error("Error during MediaRecorder finalization:", error);
        // Still try to stop manually if finalization fails
        try {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
          ) {
            mediaRecorderRef.current.stop();
          }
        } catch (stopError) {
          console.error("Error stopping MediaRecorder:", stopError);
        }
        setError("Recording stopped with potential data loss");
      }
    }

    // Clean up resources completely (don't preserve analysis when truly stopping)
    cleanupAudioResources(false);
  }, [recordingState, chunkedRecordingEnabled, cleanupAudioResources]);

  const resetRecording = useCallback(() => {
    setRecordingState("idle");
    setAudioBlob(null);
    setError(null);
    setDuration(0);
    setStartTime(null);
    setAudioLevels([]);
    setWaveHistory([]);
    setChunkCount(0);
    setTotalRecordingDuration(0);
    setCurrentChunkStartTime(null);
    setCurrentSilenceDuration(chunkSilenceDurationSeconds);
    isChunkedModeRef.current = false;
    cleanupAudioResources(false);
  }, [cleanupAudioResources, chunkSilenceDurationSeconds]);

  // Effect to manage audio analysis lifecycle
  useEffect(() => {
    if (
      recordingState === "recording" ||
      recordingState === "chunked-recording"
    ) {
      // Only start if not already running
      if (analyzerRef.current && !animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      }
    } else if (recordingState === "idle" || recordingState === "stopped") {
      // Stop analysis when not recording
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [analyzeAudio, recordingState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioResources(false);
    };
  }, [cleanupAudioResources]);

  return {
    recordingState,
    isRecording:
      recordingState === "recording" || recordingState === "chunked-recording",
    isPaused: false, // We don't currently support pause functionality
    startRecording,
    stopRecording,
    resetRecording,
    audioBlob,
    error,
    duration,
    startTime,
    audioLevels,
    waveHistory,
    enableVoiceActivation,
    setEnableVoiceActivation,
    chunkCount,
    totalRecordingDuration,
    currentChunkStartTime,
    setOnChunkReady,
    currentSilenceDuration,
  };
}
