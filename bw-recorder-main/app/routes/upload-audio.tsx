import { publishToQueue } from "../lib/rabbitmq.server";
import { createStorageProvider, getStorageType } from "../lib/storage";
import { generateAudioFilename } from "../lib/utils";
import { createRapatChunk } from "../models/rapat_chunk.server";

// Audio validation function
function validateAudioFile(file: File, buffer: Buffer): { isValid: boolean; error?: string } {
  // Check file size
  if (!file || file.size === 0 || buffer.length === 0) {
    return { isValid: false, error: "Audio file is empty" };
  }

  // Check minimum size (at least 1KB for valid audio)
  if (file.size < 1024) {
    return { isValid: false, error: "Audio file too small, may be corrupted" };
  }

  // Check maximum size (100MB limit)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    return { isValid: false, error: "Audio file too large (max 100MB)" };
  }

  // Validate MIME type
  if (!file.type || (!file.type.includes("audio/") && !file.type.includes("video/"))) {
    return { isValid: false, error: "Invalid file type, must be audio or video" };
  }

  // Enhanced WebM validation for Debian 12 compatibility
  if (file.type.includes("webm")) {
    // Check for EBML signature in WebM files
    if (buffer.length >= 4) {
      const header = buffer.subarray(0, 4);
      // WebM files should start with EBML signature (0x1A45DFA3)
      if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
        console.log("✅ Valid EBML header detected for WebM file");
      } else {
        console.warn(
          "⚠️ WebM file may not have proper EBML header - this can cause issues on Debian 12"
        );
        console.warn(
          "Expected: 0x1a 0x45 0xdf 0xa3, Got:",
          Array.from(header.subarray(0, Math.min(8, buffer.length)))
            .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
            .join(" ")
        );
        console.warn(
          "This may be caused by MediaRecorder implementation differences on Linux systems"
        );

        // Don't fail validation, but suggest alternative format
        console.warn("Consider using MP4 format for better compatibility on Debian systems");
      }
    } else {
      console.warn("⚠️ WebM file is too small to contain proper EBML header");
    }
  }

  // Enhanced MP4 validation with better header checking
  if (file.type.includes("mp4")) {
    // Check for MP4 signature - MP4 files should have ftyp box at offset 4
    if (buffer.length >= 12) {
      const ftypSignature = buffer.subarray(4, 8).toString("ascii");

      if (ftypSignature === "ftyp") {
        // Check for compatible brand (should be mp41, mp42, isom, etc.)
        const majorBrand = buffer.subarray(8, 12).toString("ascii");
        console.log(`✅ Valid MP4 ftyp header detected, major brand: ${majorBrand}`);

        // Validate that it's an audio-compatible MP4
        const audioCompatibleBrands = ["mp41", "mp42", "isom", "M4A ", "dash"];
        const isAudioCompatible = audioCompatibleBrands.some((brand) =>
          majorBrand.includes(brand.trim())
        );

        if (!isAudioCompatible) {
          console.warn(`⚠️ MP4 major brand '${majorBrand}' may not be optimal for audio playback`);
        }
      } else {
        console.warn("⚠️ MP4 file may not have proper ftyp header");
        console.warn(`Expected 'ftyp' at offset 4, got: '${ftypSignature}'`);
        console.warn(
          "Header bytes:",
          Array.from(buffer.subarray(0, 16))
            .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
            .join(" ")
        );
        console.warn("This MP4 file may not play correctly in media players");
        console.warn("Consider switching to WebM format if MP4 issues persist");

        // Log additional diagnostic info
        console.warn("File info:", {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: new Date(file.lastModified).toISOString(),
        });
      }
    } else {
      console.warn("⚠️ MP4 file is too small to contain proper ftyp header");
    }
  }

  console.log("Audio file validation passed:", {
    name: file.name,
    size: file.size,
    type: file.type,
    sizeInKB: (file.size / 1024).toFixed(2),
    bufferLength: buffer.length,
  });

  return { isValid: true };
}

// Simple upload status tracking
interface UploadStatus {
  id: string;
  fileName: string;
  status: "processing" | "completed" | "failed";
  result?: any;
  error?: string;
  timestamp: string;
}

// In-memory store for upload statuses
const uploadStatuses = new Map<string, UploadStatus>();

// Make it globally accessible for the status endpoint
declare global {
  var uploadStatuses: Map<string, UploadStatus>;
}
globalThis.uploadStatuses = uploadStatuses;

// Cleanup old upload statuses every 5 minutes
setInterval(
  () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [id, status] of uploadStatuses.entries()) {
      if (new Date(status.timestamp).getTime() < fiveMinutesAgo) {
        uploadStatuses.delete(id);
      }
    }
  },
  5 * 60 * 1000
);

// Background upload processing
async function processUpload(
  uploadId: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
  rapatId?: string,
  chunkNumber?: number
) {
  uploadStatuses.set(uploadId, {
    id: uploadId,
    fileName,
    status: "processing",
    timestamp: new Date().toISOString(),
  });

  try {
    const storageProvider = createStorageProvider();
    const uploadResult = await storageProvider.uploadFile(fileName, buffer, contentType);

    // After successful upload, insert into database first, then publish to RabbitMQ
    const storageType = getStorageType();

    if (storageType === "minio") {
      const bucketName = process.env.MINIO_BUCKET;

      // CRITICAL: Only proceed with database and RabbitMQ if rapatId is valid
      if (!rapatId) {
        console.warn("⚠️ No rapatId provided - skipping database insertion and RabbitMQ publishing");
        console.warn("⚠️ File uploaded to MinIO but will not be processed by workers");
      } else {
        const rapatIdInt = parseInt(rapatId, 10);
        if (isNaN(rapatIdInt)) {
          console.error("❌ Invalid rapatId format:", rapatId);
          throw new Error(`Invalid rapatId format: ${rapatId}`);
        }

        // Step 1: Insert record into rapat_chunk table
        let rapatChunkId: number;
        try {
          const rapatChunk = await createRapatChunk(
            rapatIdInt,
            chunkNumber || 1,
            bucketName || "",
            fileName
          );
          rapatChunkId = rapatChunk.id;
          console.log("✅ Rapat chunk record inserted successfully with ID:", rapatChunkId);
        } catch (dbError) {
          console.error("❌ Failed to insert rapat chunk record:", dbError);
          throw new Error(`Database insertion failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
        }

        // Step 2: Publish message to RabbitMQ ONLY if database insertion succeeded
        try {
          const rabbitmqMessage = {
            rapat_id: rapatId,
            rapat_chunk_id: rapatChunkId, // Always has a valid value now
            chunk_order: chunkNumber || 1,
            bucket_name: bucketName,
            filename: fileName,
            upload_timestamp: new Date().toISOString(),
            storage_type: storageType,
            file_size: buffer.length,
            content_type: contentType,
          };

          const exchange = process.env.RABBIT_MQ_EXCHANGE || "sinopsis.pipeline";
          const queue = process.env.RABBIT_MQ_QUEUE || "queue.audio_recorded";

          const result = await publishToQueue(exchange, queue, rabbitmqMessage);

          if (result.success) {
            console.log("✅ RabbitMQ message published successfully");
            console.log(`📊 Match confirmed: MinIO file "${fileName}" ↔ DB record ID ${rapatChunkId} ↔ RabbitMQ message`);
          } else {
            console.error("❌ RabbitMQ publish failed:", result.error);
            throw new Error(`RabbitMQ publish failed: ${result.error}`);
          }
        } catch (rabbitmqError) {
          console.error("❌ Failed to publish RabbitMQ message:", rabbitmqError);
          // CRITICAL: Database record exists but no RabbitMQ message
          // This creates a mismatch - the worker won't process this chunk
          throw new Error(`RabbitMQ publishing failed after DB insertion: ${rabbitmqError instanceof Error ? rabbitmqError.message : 'Unknown error'}`);
        }
      }
    }
    uploadStatuses.set(uploadId, {
      id: uploadId,
      fileName,
      status: "completed",
      result: uploadResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    uploadStatuses.set(uploadId, {
      id: uploadId,
      fileName,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}

export async function action({ request }: { request: Request }) {
  try {
    // Validate request method
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Extract form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const chunkNumberParam = formData.get("chunkNumber") as string;
    const rapatIdParam = formData.get("rapatId") as string;

    // Handle rapatId properly - ensure we get a valid string or undefined
    let rapatId: string | undefined = undefined;
    if (
      rapatIdParam &&
      rapatIdParam !== "null" &&
      rapatIdParam !== "undefined" &&
      rapatIdParam.trim() !== ""
    ) {
      rapatId = rapatIdParam.trim();
    }

    if (!audioFile) {
      return new Response("No audio file provided", { status: 400 });
    }

    // Convert to buffer early for validation
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate audio file
    const validation = validateAudioFile(audioFile, buffer);
    if (!validation.isValid) {
      console.error("Audio file validation failed:", validation.error);
      return Response.json(
        {
          success: false,
          message: "Audio file validation failed",
          error: validation.error,
          storageType: getStorageType(),
        },
        { status: 400 }
      );
    }

    // Generate filename
    const chunkNumber = chunkNumberParam ? parseInt(chunkNumberParam, 10) : 1;
    let fileName = audioFile.name;

    if (!fileName || fileName === "blob") {
      const fileExtension = audioFile.type.includes("webm") ? "webm" : "mp4";
      fileName = generateAudioFilename(fileExtension, chunkNumber, undefined, rapatId);
    }

    // Generate upload ID and start background processing
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const storageType = getStorageType();

    // Start background upload
    processUpload(uploadId, fileName, buffer, audioFile.type, rapatId, chunkNumber);

    return Response.json({
      success: true,
      message: `Audio file upload initiated`,
      fileName,
      uploadId,
      size: buffer.length,
      type: audioFile.type,
      timestamp: new Date().toISOString(),
      storageType,
      status: "processing",
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "Failed to upload audio file",
        error: error instanceof Error ? error.message : "Unknown error",
        storageType: getStorageType(),
      },
      { status: 500 }
    );
  }
}
