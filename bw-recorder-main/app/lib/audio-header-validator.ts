/**
 * Audio header validation utilities
 * Used to detect and fix audio file header issues
 */

export interface HeaderValidationResult {
  isValid: boolean;
  format: "mp4" | "webm" | "unknown";
  issues: string[];
  suggestions: string[];
}

/**
 * Validates MP4 file headers
 */
export async function validateMP4Header(blob: Blob): Promise<HeaderValidationResult> {
  const result: HeaderValidationResult = {
    isValid: true,
    format: "mp4",
    issues: [],
    suggestions: [],
  };

  try {
    const arrayBuffer = await blob.slice(0, 32).arrayBuffer();
    const header = new Uint8Array(arrayBuffer);

    if (header.length < 12) {
      result.isValid = false;
      result.issues.push("File too small to contain MP4 header");
      result.suggestions.push("Try recording for a longer duration");
      return result;
    }

    // Check for ftyp box at offset 4
    const ftypSignature = String.fromCharCode(...header.slice(4, 8));
    if (ftypSignature !== "ftyp") {
      result.isValid = false;
      result.issues.push(`Missing ftyp header, found '${ftypSignature}' instead`);
      result.suggestions.push("Switch to WebM format for better Linux compatibility");
      result.suggestions.push("Set VITE_PREFERRED_AUDIO_FORMAT=webm in your environment");
      return result;
    }

    // Check major brand
    const majorBrand = String.fromCharCode(...header.slice(8, 12));
    const audioCompatibleBrands = ["mp41", "mp42", "isom", "M4A ", "dash"];
    const isAudioCompatible = audioCompatibleBrands.some((brand) =>
      majorBrand.includes(brand.trim())
    );

    if (!isAudioCompatible) {
      result.issues.push(`MP4 brand '${majorBrand}' may not be optimal for audio`);
      result.suggestions.push("This MP4 may not play in all media players");
    }

    return result;
  } catch (error) {
    result.isValid = false;
    result.issues.push(
      `Header validation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    result.suggestions.push("Try a different audio format");
    return result;
  }
}

/**
 * Validates WebM file headers
 */
export async function validateWebMHeader(blob: Blob): Promise<HeaderValidationResult> {
  const result: HeaderValidationResult = {
    isValid: true,
    format: "webm",
    issues: [],
    suggestions: [],
  };

  try {
    const arrayBuffer = await blob.slice(0, 32).arrayBuffer();
    const header = new Uint8Array(arrayBuffer);

    if (header.length < 4) {
      result.isValid = false;
      result.issues.push("File too small to contain WebM header");
      result.suggestions.push("Try recording for a longer duration");
      return result;
    }

    // Check for EBML signature (0x1A45DFA3)
    const hasEBMLHeader =
      header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;

    if (!hasEBMLHeader) {
      result.isValid = false;
      result.issues.push("Missing EBML header signature");
      result.suggestions.push("Try MP4 format instead");
      result.suggestions.push("Set VITE_PREFERRED_AUDIO_FORMAT=mp4 in your environment");

      // Log actual header for debugging
      const headerHex = Array.from(header.slice(0, 8))
        .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
        .join(" ");
      result.issues.push(`Found header: ${headerHex}, expected: 0x1a 0x45 0xdf 0xa3`);
    }

    return result;
  } catch (error) {
    result.isValid = false;
    result.issues.push(
      `Header validation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    result.suggestions.push("Try a different audio format");
    return result;
  }
}

/**
 * Comprehensive audio blob validation
 */
export async function validateAudioBlobHeaders(blob: Blob): Promise<HeaderValidationResult> {
  const mimeType = blob.type.toLowerCase();

  if (mimeType.includes("mp4")) {
    return await validateMP4Header(blob);
  } else if (mimeType.includes("webm")) {
    return await validateWebMHeader(blob);
  } else {
    return {
      isValid: true,
      format: "unknown",
      issues: [`Unknown format: ${mimeType}`],
      suggestions: ["Consider using MP4 or WebM format for better compatibility"],
    };
  }
}

/**
 * Test format compatibility by creating a short recording
 */
export async function testFormatHeaderGeneration(
  mimeType: string
): Promise<HeaderValidationResult> {
  try {
    console.log(`Testing header generation for ${mimeType}...`);

    // Create a short test recording
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    return new Promise((resolve) => {
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        cleanup();

        if (chunks.length === 0) {
          resolve({
            isValid: false,
            format: mimeType.includes("mp4") ? "mp4" : "webm",
            issues: ["No audio data captured during test"],
            suggestions: ["Check microphone permissions and try again"],
          });
          return;
        }

        const testBlob = new Blob(chunks, { type: mimeType });
        const validation = await validateAudioBlobHeaders(testBlob);

        if (validation.isValid) {
          console.log(`✅ Format ${mimeType} generates valid headers`);
        } else {
          console.warn(`❌ Format ${mimeType} has header issues:`, validation.issues);
        }

        resolve(validation);
      };

      mediaRecorder.onerror = () => {
        cleanup();
        resolve({
          isValid: false,
          format: mimeType.includes("mp4") ? "mp4" : "webm",
          issues: ["MediaRecorder error during test"],
          suggestions: ["Try a different audio format"],
        });
      };

      // Record for 200ms then stop
      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      }, 200);

      // Timeout fallback
      setTimeout(() => {
        cleanup();
        if (!resolved) {
          resolved = true;
          resolve({
            isValid: false,
            format: mimeType.includes("mp4") ? "mp4" : "webm",
            issues: ["Test recording timeout"],
            suggestions: ["Check system audio setup"],
          });
        }
      }, 3000);
    });
  } catch (error) {
    return {
      isValid: false,
      format: mimeType.includes("mp4") ? "mp4" : "webm",
      issues: [`Test failed: ${error instanceof Error ? error.message : "Unknown error"}`],
      suggestions: ["Check microphone permissions and browser compatibility"],
    };
  }
}

/**
 * Get recommended format based on system and testing
 */
export async function getRecommendedAudioFormat(): Promise<string> {
  const isLinux = navigator.userAgent.includes("Linux");
  const isFirefox = navigator.userAgent.includes("Firefox");

  // Format candidates based on system
  const candidates =
    isLinux && !isFirefox
      ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2"]
      : ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm"];

  for (const format of candidates) {
    if (MediaRecorder.isTypeSupported(format)) {
      // Test header generation if enabled
      if (import.meta.env.VITE_TEST_AUDIO_HEADERS === "true") {
        const validation = await testFormatHeaderGeneration(format);
        if (validation.isValid) {
          console.log(`Recommended format after testing: ${format}`);
          return format;
        }
        console.warn(`Format ${format} failed header test, trying next...`);
        continue;
      }

      console.log(`Recommended format (no testing): ${format}`);
      return format;
    }
  }

  console.warn("No recommended format found, using fallback");
  return "audio/webm";
}
