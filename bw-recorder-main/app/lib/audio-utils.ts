/**
 * Audio utility functions for recording, validation, and processing
 */

export interface AudioValidationResult {
  isValid: boolean;
  error?: string;
  details?: {
    size: number;
    type: string;
    hasValidHeader?: boolean;
    estimatedDuration?: number;
  };
}

/**
 * Validates WebM header for proper EBML structure
 */
export async function validateWebMHeader(blob: Blob): Promise<boolean> {
  if (!blob.type.includes("webm")) {
    return true; // Not WebM, no validation needed
  }

  try {
    const arrayBuffer = await blob.slice(0, 32).arrayBuffer();
    const header = new Uint8Array(arrayBuffer);

    // Check for EBML signature (0x1A45DFA3)
    if (header.length >= 4) {
      const hasEBMLHeader =
        header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;

      if (!hasEBMLHeader) {
        console.warn("WebM file missing proper EBML header, this may cause issues on Debian 12");
        console.warn(
          "Header bytes:",
          Array.from(header.slice(0, 8))
            .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
            .join(" ")
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("Error validating WebM header:", error);
    return false;
  }
}

/**
 * Validates an audio blob before upload with enhanced WebM header checking
 */
export async function validateAudioBlob(blob: Blob): Promise<AudioValidationResult> {
  if (!blob || blob.size === 0) {
    return { isValid: false, error: "Audio data is empty" };
  }

  // Check minimum size (at least 1KB for valid audio)
  if (blob.size < 1024) {
    return {
      isValid: false,
      error: "Audio data is too small, may be corrupted",
      details: { size: blob.size, type: blob.type },
    };
  }

  // Check maximum size (100MB limit)
  const maxSize = 100 * 1024 * 1024;
  if (blob.size > maxSize) {
    return {
      isValid: false,
      error: "Audio data too large (max 100MB)",
      details: { size: blob.size, type: blob.type },
    };
  }

  // Check MIME type
  if (!blob.type || (!blob.type.includes("audio/") && !blob.type.includes("video/"))) {
    console.warn("Unexpected blob MIME type:", blob.type);
  }

  // Enhanced WebM validation for Debian 12 compatibility
  let hasValidHeader = true;
  if (blob.type.includes("webm")) {
    hasValidHeader = await validateWebMHeader(blob);
    if (!hasValidHeader) {
      console.warn("WebM header validation failed - may cause playback issues on some systems");
      // Don't fail validation, but log the issue
    }
  }

  return {
    isValid: true,
    details: {
      size: blob.size,
      type: blob.type,
      hasValidHeader,
    },
  };
}

/**
 * Creates a properly finalized audio blob with validated data
 */
export async function finalizeAudioBlob(
  chunks: Blob[],
  mimeType: string,
  options?: {
    validateHeader?: boolean;
    minSize?: number;
  }
): Promise<{ blob: Blob; validation: AudioValidationResult }> {
  if (!chunks || chunks.length === 0) {
    const validation: AudioValidationResult = {
      isValid: false,
      error: "No audio chunks available",
    };
    return { blob: new Blob([]), validation };
  }

  // Filter out empty chunks
  const validChunks = chunks.filter((chunk) => chunk && chunk.size > 0);

  if (validChunks.length === 0) {
    const validation: AudioValidationResult = {
      isValid: false,
      error: "All audio chunks are empty",
    };
    return { blob: new Blob([]), validation };
  }

  // Create blob with proper MIME type
  const finalMimeType = mimeType || "audio/webm";
  const blob = new Blob(validChunks, { type: finalMimeType });

  // Validate the final blob
  const validation = await validateAudioBlob(blob);

  // Additional validation for minimum size if specified
  const minSize = options?.minSize || 1024;
  if (blob.size < minSize) {
    return {
      blob,
      validation: {
        isValid: false,
        error: `Audio too short (${blob.size} bytes, minimum ${minSize} bytes)`,
        details: { size: blob.size, type: blob.type },
      },
    };
  }

  console.log("Audio blob finalized successfully:", {
    chunks: validChunks.length,
    totalSize: blob.size,
    type: blob.type,
    sizeInKB: (blob.size / 1024).toFixed(2),
  });

  return { blob, validation };
}

/**
 * Gets the best supported MIME type for MediaRecorder with environment-based preferences
 */
export function getSupportedAudioMimeType(): string {
  // Get preferred format from environment (useful for Debian 12 compatibility)
  const preferredFormat = import.meta.env.VITE_PREFERRED_AUDIO_FORMAT || "auto";

  // Define format lists based on preference
  let possibleTypes: string[] = [];

  if (preferredFormat === "mp4") {
    // Prioritize MP4 formats (better for Debian 12)
    possibleTypes = [
      "audio/mp4;codecs=mp4a.40.2", // AAC in MP4 container
      "audio/mp4", // Generic MP4
      "audio/webm;codecs=opus", // Fallback to WebM if MP4 not supported
      "audio/webm", // Generic WebM fallback
    ];
  } else if (preferredFormat === "webm") {
    // Prioritize WebM formats (better for Chrome)
    possibleTypes = [
      "audio/webm;codecs=opus", // Opus in WebM
      "audio/webm;codecs=vorbis", // Vorbis in WebM
      "audio/webm", // Generic WebM
      "audio/mp4;codecs=mp4a.40.2", // Fallback to MP4
      "audio/mp4", // Generic MP4 fallback
    ];
  } else {
    // Smart auto-detection based on system capabilities
    const isLinux = navigator.userAgent.includes("Linux");
    const isFirefox = navigator.userAgent.includes("Firefox");

    if (isLinux && !isFirefox) {
      // Linux Chrome-based browsers often have MP4 header issues, prioritize WebM
      console.log(
        "Detected Linux Chrome-based browser, prioritizing WebM for header compatibility"
      );
      possibleTypes = [
        "audio/webm;codecs=opus", // Opus in WebM - better headers on Linux
        "audio/webm;codecs=vorbis", // Vorbis in WebM
        "audio/webm", // Generic WebM
        "audio/mp4;codecs=mp4a.40.2", // MP4 fallback (may have header issues)
        "audio/mp4", // Generic MP4 fallback
      ];
    } else {
      // Other systems: MP4 first for broader compatibility
      possibleTypes = [
        "audio/mp4;codecs=mp4a.40.2", // AAC in MP4 - good for non-Linux
        "audio/webm;codecs=opus", // Opus in WebM - good quality
        "audio/mp4", // Generic MP4
        "audio/webm;codecs=vorbis", // Vorbis in WebM
        "audio/webm", // Generic WebM
        "audio/mpeg", // MP3 fallback
      ];
    }
  }

  for (const type of possibleTypes) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) {
      console.log(`Using supported MIME type: ${type} (preference: ${preferredFormat})`);
      // Log system info for debugging
      console.log(`User Agent: ${navigator.userAgent.substring(0, 100)}...`);

      // Log specific advice for WebM on Linux systems
      if (type.includes("webm") && navigator.userAgent.includes("Linux")) {
        console.log(
          "Note: WebM format detected on Linux system. If you experience header issues on Debian 12, consider setting VITE_PREFERRED_AUDIO_FORMAT=mp4"
        );
      }

      return type;
    }
  }

  console.warn("No specific MIME type supported, using audio/webm fallback");
  console.warn("This may cause header issues on some Linux distributions like Debian 12");
  console.warn("Consider setting VITE_PREFERRED_AUDIO_FORMAT=mp4 in your environment variables");
  return "audio/webm";
}

/**
 * Creates optimized MediaRecorder options with environment-configurable quality
 */
export function getOptimizedMediaRecorderOptions(): MediaRecorderOptions {
  const supportedMimeType = getSupportedAudioMimeType();

  // Get quality setting from environment
  const audioQuality = import.meta.env.VITE_AUDIO_QUALITY || "medium";

  // Determine bitrate based on quality setting
  let audioBitsPerSecond: number;
  switch (audioQuality.toLowerCase()) {
    case "low":
      audioBitsPerSecond = 64000; // 64 kbps - lowest file size, prevents clipping on weak systems
      break;
    case "high":
      audioBitsPerSecond = 128000; // 128 kbps - higher quality
      break;
    case "medium":
    default:
      audioBitsPerSecond = 96000; // 96 kbps - balanced quality and compatibility
      break;
  }

  const options: MediaRecorderOptions = {
    audioBitsPerSecond,
    mimeType: supportedMimeType, // Always set MIME type for proper container format
  };

  console.log("MediaRecorder options:", {
    ...options,
    quality: audioQuality,
    formatPreference: import.meta.env.VITE_PREFERRED_AUDIO_FORMAT || "auto",
  });

  return options;
}

/**
 * Waits for MediaRecorder to properly finalize data
 */
export function waitForMediaRecorderFinalization(
  mediaRecorder: MediaRecorder,
  timeoutMs: number = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mediaRecorder.state !== "recording") {
      resolve();
      return;
    }

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`MediaRecorder finalization timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const onStop = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        mediaRecorder.removeEventListener("stop", onStop);
        mediaRecorder.removeEventListener("error", onError);
        resolve();
      }
    };

    const onError = (event: Event) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        mediaRecorder.removeEventListener("stop", onStop);
        mediaRecorder.removeEventListener("error", onError);
        reject(
          new Error(
            `MediaRecorder error during finalization: ${(event as any)?.error?.message || "Unknown error"}`
          )
        );
      }
    };

    mediaRecorder.addEventListener("stop", onStop);
    mediaRecorder.addEventListener("error", onError);

    try {
      // Request final data and stop
      mediaRecorder.requestData();
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 50);
    } catch (error) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(
          error instanceof Error
            ? error
            : new Error(`MediaRecorder finalization error: ${String(error)}`)
        );
      }
    }
  });
}
