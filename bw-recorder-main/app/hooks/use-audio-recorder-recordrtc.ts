/**
 * AUDIO RECORDER USING RECORDRTC
 *
 * This implementation uses RecordRTC library which provides:
 * - Built-in automatic chunking with complete, playable files
 * - Better codec handling across different browsers
 * - Reliable state management
 * - No fragment issues like MediaRecorder API
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
  stopRecording: () => Promise<void>;
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

  const recorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-stop functionality refs
  const lastAudioActivityRef = useRef<number>(Date.now());
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Chunked recording refs
  const chunkStartTimeRef = useRef<number>(0);
  const isChunkedModeRef = useRef<boolean>(false);
  const recordingStateRef = useRef<AudioRecordingState>("idle");
  const onChunkReadyRef = useRef<
    ((blob: Blob, chunkStartTime: Date, chunkNumber: number) => void) | null
  >(null);

  // Silence duration decrement refs
  const currentChunkSilenceDurationRef = useRef<number>(0);

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

      // Only clean up stream and context if we're completely stopping or not preserving analysis
      if (!preserveAnalysis && !isChunkedModeRef.current) {
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            track.stop();
          }
          streamRef.current = null;
        }

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        analyzerRef.current = null;
      }

      // Stop and destroy RecordRTC instance
      if (recorderRef.current && !preserveAnalysis) {
        try {
          recorderRef.current.destroy();
          recorderRef.current = null;
        } catch (e) {
          console.error("Error destroying RecordRTC:", e);
        }
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
            // Stop current recording to finalize chunk
            if (
              recorderRef.current &&
              recorderRef.current.getState() === "recording"
            ) {
              recorderRef.current.stopRecording(async () => {
                // Get the chunk blob
                const blob = recorderRef.current.getBlob();

                if (blob && blob.size > 0) {
                  // Update state with the chunk
                  const chunkStartTime = new Date(chunkStartTimeRef.current);
                  setAudioBlob(blob);

                  setChunkCount((prev) => {
                    const newCount = prev + 1;

                    if (onChunkReadyRef.current) {
                      onChunkReadyRef.current(blob, chunkStartTime, newCount);
                    }

                    return newCount;
                  });

                  setTotalRecordingDuration(
                    (prev) =>
                      prev + (Date.now() - chunkStartTimeRef.current) / 1000
                  );

                  // Only restart if still in chunked mode
                  if (isChunkedModeRef.current && streamRef.current) {
                    // Reset for next chunk
                    chunkStartTimeRef.current = Date.now();
                    const newChunkStartTime = new Date(
                      chunkStartTimeRef.current
                    );
                    setCurrentChunkStartTime(newChunkStartTime);
                    lastAudioActivityRef.current = Date.now();
                    currentChunkSilenceDurationRef.current =
                      chunkSilenceDurationSeconds;
                    setCurrentSilenceDuration(chunkSilenceDurationSeconds);

                    // Reset duration timer for new chunk
                    setDuration(0);
                    startTimeRef.current = Date.now();

                    // Create new RecordRTC instance for next chunk
                    const RecordRTCModule = await import("recordrtc");
                    const RecordRTC = RecordRTCModule.default;

                    const newRecorderConfig: any = {
                      type: "audio",
                      mimeType: "audio/webm",
                      recorderType: RecordRTC.StereoAudioRecorder,
                      numberOfAudioChannels: 1,
                      desiredSampRate: 16000,
                      audioBitsPerSecond: 128000,
                      disableLogs: true,
                    };

                    const newRecorder = new RecordRTC(
                      streamRef.current,
                      newRecorderConfig
                    );
                    recorderRef.current = newRecorder;
                    newRecorder.startRecording();

                    // Ensure audio analysis continues for the new chunk
                    recordingStateRef.current = "chunked-recording";
                  }
                }
              });
            }
            // Don't return here - let the audio analysis continue
            // The next iteration will check the new recorder state
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

      // Continue analyzing if still recording
      if (analyzerRef.current) {
        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
      }
    } catch (error) {
      console.error("Audio analysis error:", error);
      setError("Audio analysis error - please restart recording");
    }
  }, [
    amplitudeToDbfs,
    chunkedRecordingEnabled,
    minChunkLengthSeconds,
    chunkSilenceThresholdDbfs,
    chunkSilenceDurationSeconds,
    chunkSilenceDecrementIntervalSeconds,
  ]);

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

        // Reset silence duration tracking
        currentChunkSilenceDurationRef.current = chunkSilenceDurationSeconds;
        setCurrentSilenceDuration(chunkSilenceDurationSeconds);
      } else {
        isChunkedModeRef.current = false;
      }

      // Get microphone access with configurable audio processing settings
      const enhancedProcessing =
        import.meta.env.VITE_ENHANCED_AUDIO_PROCESSING !== "false";

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: enhancedProcessing ? { exact: true } : true,
          noiseSuppression: enhancedProcessing ? { exact: true } : true,
          autoGainControl: enhancedProcessing ? { exact: true } : true,
          sampleRate: { ideal: 16000, min: 8000, max: 48000 },
          channelCount: { exact: 1 },
          sampleSize: { ideal: 16 },
        },
      });

      streamRef.current = stream;

      // Set up audio analysis
      const AudioContextClass =
        globalThis.AudioContext || (globalThis as any).webkitAudioContext;
      const audioContext = new AudioContextClass({
        sampleRate: 16000,
        latencyHint: "interactive",
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();

      analyzer.fftSize = 1024;
      analyzer.smoothingTimeConstant = 0.2;
      analyzer.minDecibels = -100;
      analyzer.maxDecibels = -10;

      source.connect(analyzer);
      analyzerRef.current = analyzer;

      // Start audio analysis
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);

      // Dynamically import RecordRTC only on client side
      const RecordRTCModule = await import("recordrtc");
      const RecordRTC = RecordRTCModule.default;

      // Configure RecordRTC
      // Note: We DON'T use timeSlice for automatic chunking
      // Instead, we manually stop/restart based on silence detection
      const recorderConfig: any = {
        type: "audio",
        mimeType: "audio/webm",
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 16000,
        audioBitsPerSecond: 128000,
        disableLogs: true,
        // No timeSlice - we'll manually control chunking via silence detection
      };

      // Create RecordRTC instance
      const recorder = new RecordRTC(stream, recorderConfig);
      recorderRef.current = recorder;

      // Start recording
      recorder.startRecording();

      recordingStateRef.current = chunkedRecordingEnabled
        ? "chunked-recording"
        : "recording";
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
    minChunkLengthSeconds,
    chunkSilenceDurationSeconds,
    analyzeAudio,
    cleanupAudioResources,
  ]);

  const stopRecording = useCallback(async () => {
    // Mark chunked mode as stopped to prevent restarts
    const wasInChunkedMode =
      chunkedRecordingEnabled && isChunkedModeRef.current;
    if (wasInChunkedMode) {
      isChunkedModeRef.current = false;
    }

    // Stop RecordRTC recording
    if (recorderRef.current) {
      const recorder = recorderRef.current;

      return new Promise<void>((resolve) => {
        recorder.stopRecording(() => {
          // Get the final blob
          const blob = recorder.getBlob();

          if (blob && blob.size > 0) {
            setAudioBlob(blob);

            // If we were in chunked mode, trigger the final chunk upload
            if (wasInChunkedMode && onChunkReadyRef.current) {
              const chunkStartTime = new Date(chunkStartTimeRef.current);
              setChunkCount((prev) => {
                const newCount = prev + 1;
                onChunkReadyRef.current?.(blob, chunkStartTime, newCount);
                return newCount;
              });
              setTotalRecordingDuration(
                (prev) => prev + (Date.now() - chunkStartTimeRef.current) / 1000
              );
            }
          } else {
            setError("Recording failed: No audio data captured");
          }

          setRecordingState("stopped");
          cleanupAudioResources(false);
          resolve();
        });
      });
    } else {
      cleanupAudioResources(false);
    }
  }, [chunkedRecordingEnabled, cleanupAudioResources]);

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
    isPaused: false,
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
