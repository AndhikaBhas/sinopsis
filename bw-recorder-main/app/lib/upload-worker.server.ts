import fs from "node:fs/promises";
import { publishToQueue } from "~/lib/rabbitmq.server";
import { createStorageProvider, getStorageType } from "~/lib/storage";
import { generateAudioFilename } from "~/lib/utils";
import { upsertRapat } from "~/models/rapat.server";
import { createRapatChunk } from "~/models/rapat_chunk.server";
import {
  getPendingJobs,
  getUploadJobById,
  updateUploadJobStatus,
} from "~/models/upload_job.server";

// Audio validation function
function validateAudioFile(buffer: Buffer, fileType: string, fileSize: number): { isValid: boolean; error?: string } {
  // Check file size
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: "Audio file is empty" };
  }

  // Check minimum size (at least 1KB for valid audio)
  if (fileSize < 1024) {
    return { isValid: false, error: "Audio file too small, may be corrupted" };
  }

  // Check maximum size (100MB limit)
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (fileSize > maxSize) {
    return { isValid: false, error: "Audio file too large (max 100MB)" };
  }

  // Validate MIME type
  if (!fileType || (!fileType.includes("audio/") && !fileType.includes("video/"))) {
    return { isValid: false, error: "Invalid file type, must be audio or video" };
  }

  console.log("Audio file validation passed:", {
    size: fileSize,
    type: fileType,
    sizeInKB: (fileSize / 1024).toFixed(2),
    bufferLength: buffer.length,
  });

  return { isValid: true };
}

async function processUploadJob(jobId: string) {
  console.log(`🔄 Processing upload job: ${jobId}`);

  try {
    // Get job details
    const job = await getUploadJobById(jobId);
    if (!job) {
      console.error(`❌ Job ${jobId} not found`);
      return;
    }

    // Update status to processing
    await updateUploadJobStatus(jobId, "processing", 10);

    // Force POSIX path format: replace any backslashes with forward slashes
    // and ensure it starts with /tmp (Linux path)
    let normalizedPath = job.temp_path.replace(/\\/g, '/');
    // If somehow a Windows drive letter got in, remove it and ensure Linux path
    normalizedPath = normalizedPath.replace(/^[A-Z]:/i, '');
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }
    console.log(`📁 Processing file: ${normalizedPath} (original: ${job.temp_path})`);

    // Read the temporary file with retry and stability check (Windows)
    let buffer: Buffer | undefined;
    let retries = 5;
    // Initial grace period to allow FS to settle
    await new Promise((r) => setTimeout(r, 200));
    while (retries > 0 && !buffer) {
      try {
        const stats1 = await fs.stat(normalizedPath);
        await new Promise((r) => setTimeout(r, 100));
        const stats2 = await fs.stat(normalizedPath);
        if (stats1.size !== stats2.size) {
          throw new Error("File still being written");
        }
        buffer = await fs.readFile(normalizedPath);
      } catch (e) {
        retries--;
        if (retries === 0) throw e instanceof Error ? e : new Error(String(e));
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    await updateUploadJobStatus(jobId, "processing", 20);

    // Ensure buffer is defined
    if (!buffer) {
      console.error("Failed to read audio file buffer");
      await updateUploadJobStatus(jobId, "failed", 0, "Failed to read audio file");
      await fs.unlink(normalizedPath).catch(() => {});
      return;
    }

    // Validate audio file
    const validation = validateAudioFile(buffer, job.file_type, job.file_size);
    if (!validation.isValid) {
      console.error("Audio file validation failed:", validation.error);
      await updateUploadJobStatus(jobId, "failed", 0, `Validasi file audio gagal: ${validation.error}`);
      // Clean up temp file
      await fs.unlink(normalizedPath).catch(() => {});
      return;
    }

    await updateUploadJobStatus(jobId, "processing", 30);

    // Determine file extension
    let fileExtension: string;
    if (job.file_type.includes("webm")) {
      fileExtension = "webm";
    } else if (job.file_type.includes("mp4") || job.file_type.includes("mp4a")) {
      fileExtension = "mp4";
    } else {
      const parts = job.file_name.split(".");
      fileExtension = parts.length > 1 ? (parts.at(-1) ?? "mp4") : "mp4";
    }

    const chunkNumber = 1; // Upload is always chunk 1
    const fileName = generateAudioFilename(
      fileExtension,
      chunkNumber,
      undefined,
      job.rapat_id.toString()
    );

    await updateUploadJobStatus(jobId, "processing", 40);

    // Upload to MinIO with timeout protection
    // Configurable timeout for slow networks or large files (default: 10 minutes)
    const minioTimeoutMs = Number(process.env.MINIO_UPLOAD_TIMEOUT_MS) || 600000; // 10 minutes default
    const storageProvider = createStorageProvider();
    
    const uploadPromise = storageProvider.uploadFile(fileName, buffer, job.file_type);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`MinIO upload timeout (${minioTimeoutMs / 1000} seconds). File size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)),
        minioTimeoutMs
      )
    );
    
    await Promise.race([uploadPromise, timeoutPromise]);
    console.log("✅ File uploaded to MinIO:", fileName);

    await updateUploadJobStatus(jobId, "processing", 60);

    // Insert into rapat_chunk table
    const storageType = getStorageType();
    if (storageType === "minio") {
      const bucketName = process.env.MINIO_BUCKET || "";

      // Step 1: Insert into database
      let rapatChunkId: number;
      try {
        const rapatChunk = await createRapatChunk(job.rapat_id, chunkNumber, bucketName, fileName);
        rapatChunkId = rapatChunk.id;
        console.log("✅ Rapat chunk record inserted with ID:", rapatChunkId);
      } catch (dbError) {
        console.error("❌ Failed to insert rapat chunk record:", dbError);
        throw new Error(`Database insertion failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
      }

      await updateUploadJobStatus(jobId, "processing", 80);

      // Step 2: Publish to RabbitMQ ONLY if database insertion succeeded
      try {
        const rabbitmqMessage = {
          rapat_id: job.rapat_id.toString(),
          rapat_chunk_id: rapatChunkId, // Always has a valid value now
          chunk_order: chunkNumber,
          bucket_name: bucketName,
          filename: fileName,
          upload_timestamp: new Date().toISOString(),
          storage_type: storageType,
          file_size: buffer.length,
          content_type: job.file_type,
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

    await updateUploadJobStatus(jobId, "processing", 90);

    // Clean up temporary file
    await fs.unlink(normalizedPath).catch((err) => {
      console.warn("⚠️ Failed to delete temp file:", err);
    });

    await updateUploadJobStatus(jobId, "processing", 90);

    // Update rapat status to 2 (finished/uploaded)
    await upsertRapat(job.rapat_id, "", "", 2);

    // Mark as completed
    await updateUploadJobStatus(jobId, "completed", 100);
    console.log(`✅ Upload job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`❌ Error processing upload job ${jobId}:`, error);
    await updateUploadJobStatus(
      jobId,
      "failed",
      0,
      error instanceof Error ? error.message : "Unknown error"
    );

    // Try to clean up temp file on error
    try {
      const jobForCleanup = await getUploadJobById(jobId);
      if (jobForCleanup) {
        let cleanupPath = jobForCleanup.temp_path.replace(/\\/g, '/').replace(/^[A-Z]:/i, '');
        if (!cleanupPath.startsWith('/')) cleanupPath = '/' + cleanupPath;
        await fs.unlink(cleanupPath).catch(() => {});
      }
    } catch {}
  }
}

export class UploadWorker {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  start(intervalMs: number = 2000) {
    if (this.isRunning) {
      console.warn("⚠️ Upload worker is already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Upload worker started");

    this.intervalId = setInterval(async () => {
      try {
        const pendingJobs = await getPendingJobs(5);

        if (pendingJobs.length > 0) {
          console.log(`📦 Found ${pendingJobs.length} pending jobs`);

          // Process jobs sequentially to avoid overwhelming the system
          for (const job of pendingJobs) {
            // Defer very recent jobs (<1s old) to avoid FS race
            const ageMs = Date.now() - new Date(job.created_at).getTime();
            if (ageMs < 1000) {
              console.log(`⏳ Deferring very recent job ${job.id} (age ${ageMs}ms)`);
              continue;
            }
            await processUploadJob(job.id);
          }
        }
      } catch (error) {
        console.error("❌ Worker error:", error);
      }
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log("🛑 Upload worker stopped");
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
    };
  }
}

// Singleton instance
let workerInstance: UploadWorker | null = null;

export function getWorkerInstance() {
  if (!workerInstance) {
    workerInstance = new UploadWorker();
  }
  return workerInstance;
}
