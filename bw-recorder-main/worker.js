// Background worker entry point
import amqp from "amqplib";
import "dotenv/config";
import { Client } from "minio";
import fs from "node:fs/promises";
import prisma from "./prisma/client.server.ts";

const TEMP_DIR = "/tmp/sinopsis-uploads";

async function ensureTempDirectory() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    console.log("✅ Temp directory ensured:", TEMP_DIR);
  } catch (error) {
    console.error("❌ Failed to create temp directory:", error);
  }
}

// Initialize MinIO client
// Parse MINIO_ENDPOINT to extract host and port
const minioEndpoint = process.env.MINIO_ENDPOINT || "http://localhost:9000";
const endpointUrl = new URL(minioEndpoint);

const minioClient = new Client({
  endPoint: endpointUrl.hostname,
  port: Number.parseInt(endpointUrl.port) || (endpointUrl.protocol === "https:" ? 443 : 9000),
  useSSL: endpointUrl.protocol === "https:",
  accessKey: process.env.MINIO_USER || "",
  secretKey: process.env.MINIO_PASSWORD || "",
});

// Audio validation function
function validateAudioFile(buffer, fileType, fileSize) {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: "Audio file is empty" };
  }

  if (fileSize < 1024) {
    return { isValid: false, error: "Audio file too small, may be corrupted" };
  }

  const maxSize = 100 * 1024 * 1024; // 100MB
  if (fileSize > maxSize) {
    return { isValid: false, error: "Audio file too large (max 100MB)" };
  }

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

// Generate audio filename with proper format matching audio recorder
// Format: {rapatId}_{chunkNumber}_{dateStr}_{timeStr}.extension
function generateAudioFilename(extension, chunkNumber, date, rapatId) {
  const timestamp = date || new Date();
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");
  const hours = String(timestamp.getHours()).padStart(2, "0");
  const minutes = String(timestamp.getMinutes()).padStart(2, "0");
  const seconds = String(timestamp.getSeconds()).padStart(2, "0");

  const chunkStr = String(chunkNumber).padStart(3, "0"); // 001, 002, 003, etc.
  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hours}${minutes}${seconds}`;

  // Handle null, undefined, empty string, or "null" string
  const safeRapatId = rapatId && rapatId !== "null" && rapatId.trim() !== "" ? rapatId : "mid";

  return `${safeRapatId}_${chunkStr}_${dateStr}_${timeStr}.${extension}`;
}

// Process a single upload job
async function processUploadJob(jobId) {
  console.log(`🔄 Processing upload job: ${jobId}`);

  try {
    // Get job details
    const job = await prisma.upload_job.findUnique({ where: { id: jobId } });
    if (!job) {
      console.error(`❌ Job ${jobId} not found`);
      return;
    }

    // Update status to processing with initial progress
    await prisma.upload_job.update({
      where: { id: jobId },
      data: { status: "processing", progress: 10 },
    });

    // Read the temporary file with retry logic
    let buffer;
    let retries = 5;
    let lastError;

    console.log(`📁 Attempting to read file: ${job.temp_path}`);
    console.log(`📁 Path type: ${typeof job.temp_path}`);
    console.log(`📁 Path length: ${job.temp_path.length}`);
    console.log(`📁 Path first 50 chars:`, job.temp_path.substring(0, 50));
    console.log(`📁 Current working directory:`, process.cwd());
    console.log(`📁 Platform:`, process.platform);

    // Initial small delay to allow file system to settle
    await new Promise((resolve) => setTimeout(resolve, 200));

    while (retries > 0) {
      try {
        console.log(`📁 [Retry ${6 - retries}] Calling fs.stat with path:`, job.temp_path);
        // Check if file exists first
        const stats = await fs.stat(job.temp_path);
        console.log(`✅ File exists: ${stats.size} bytes`);

        // Verify file is not being written (size stable)
        await new Promise((resolve) => setTimeout(resolve, 100));
        const stats2 = await fs.stat(job.temp_path);
        if (stats.size !== stats2.size) {
          throw new Error("File still being written");
        }

        buffer = await fs.readFile(job.temp_path);
        console.log(`✅ File read successfully: ${job.temp_path} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
        break; // Success, exit retry loop
      } catch (readError) {
        lastError = readError;
        retries--;
        console.error(`❌ Failed to read temp file (${retries} retries left): ${job.temp_path}`, readError.message);

        if (retries > 0) {
          // Wait 300ms before retrying
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }

    if (!buffer) {
      console.error(`❌ All retries exhausted for temp file: ${job.temp_path}`);
      await prisma.upload_job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          progress: 0,
          error_message: `Gagal membaca file: ${lastError?.message || "File not found"}`,
        },
      });
      return;
    }

    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 15 },
    });

    // Validate audio file
    const validation = validateAudioFile(buffer, job.file_type, job.file_size);
    if (!validation.isValid) {
      console.error("Audio file validation failed:", validation.error);
      await prisma.upload_job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          progress: 0,
          error_message: `Validasi file audio gagal: ${validation.error}`,
        },
      });
      await fs.unlink(job.temp_path).catch(() => {});
      return;
    }

    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 25 },
    });

    // Determine file extension
    let fileExtension;
    if (job.file_type.includes("webm")) {
      fileExtension = "webm";
    } else if (job.file_type.includes("mp4") || job.file_type.includes("mp4a")) {
      fileExtension = "mp4";
    } else {
      const parts = job.file_name.split(".");
      fileExtension = parts.length > 1 ? (parts.at(-1) ?? "mp4") : "mp4";
    }

    const chunkNumber = 1;
    const fileName = generateAudioFilename(fileExtension, chunkNumber, undefined, job.rapat_id.toString());

    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 30 },
    });

    // Upload to MinIO
    const bucketName = process.env.MINIO_BUCKET || "";

    console.log(`Uploading ${(buffer.length / 1024 / 1024).toFixed(2)}MB to MinIO...`);

    // Update progress before upload
    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 35 },
    });

    // Add timeout to prevent indefinite hangs
    // Configurable timeout for slow networks or large files (default: 10 minutes)
    const minioTimeoutMs = Number(process.env.MINIO_UPLOAD_TIMEOUT_MS) || 600000; // 10 minutes default
    const uploadPromise = minioClient.putObject(bucketName, fileName, buffer, buffer.length, {
      "Content-Type": job.file_type,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`MinIO upload timeout (${minioTimeoutMs / 1000} seconds). File size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`)), minioTimeoutMs)
    );

    await Promise.race([uploadPromise, timeoutPromise]);

    console.log("✅ File uploaded to MinIO:", fileName);

    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 50 },
    });

    // Insert into rapat_chunk table
    const rapatChunk = await prisma.rapat_chunk.create({
      data: {
        rapat_id: job.rapat_id,
        urutan_chunk: chunkNumber,
        lokasi_file_audio: bucketName,
        nama_file_audio: fileName,
      },
    });
    console.log("✅ Rapat chunk record inserted with ID:", rapatChunk.id);

    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 70 },
    });

    // Publish to RabbitMQ
    const rabbitmqUrl =
      process.env.RABBITMQ_URL ??
      process.env.RABBIT_MQ_URL ??
      "amqp://kurikulum_dev:kurikulum_dev13@10.252.178.62:5672/";
    const exchange = process.env.RABBIT_MQ_EXCHANGE || "sinopsis.pipeline";
    const queue = process.env.RABBIT_MQ_QUEUE || "queue.audio_recorded";

    let connection;
    let channel;

    try {
      connection = await amqp.connect(rabbitmqUrl);
      channel = await connection.createChannel();

      await channel.assertExchange(exchange, "direct", { durable: true });
      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, queue);

      const rabbitmqMessage = {
        rapat_id: job.rapat_id.toString(),
        rapat_chunk_id: rapatChunk.id,
        chunk_order: chunkNumber,
        bucket_name: bucketName,
        filename: fileName,
        upload_timestamp: new Date().toISOString(),
        storage_type: "minio",
        file_size: buffer.length,
        content_type: job.file_type,
      };

      const messageBuffer = Buffer.from(JSON.stringify(rabbitmqMessage));
      channel.publish(exchange, queue, messageBuffer, { persistent: true });
      console.log("✅ RabbitMQ message published successfully");

      await channel.close();
      await connection.close();
    } catch (error) {
      console.error("❌ RabbitMQ publish failed:", error);
      // Don't fail the upload for RabbitMQ errors
    }

    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 85 },
    });

    // Clean up temporary file
    await fs.unlink(job.temp_path).catch((err) => {
      console.warn("⚠️ Failed to delete temp file:", err);
    });

    await prisma.upload_job.update({
      where: { id: jobId },
      data: { progress: 95 },
    });

    // Update rapat status to 2 (finished/uploaded)
    await prisma.rapat.update({
      where: { id: job.rapat_id },
      data: { status_rapat: 2 },
    });

    // Mark as completed
    await prisma.upload_job.update({
      where: { id: jobId },
      data: { status: "completed", progress: 100, completed_at: new Date() },
    });
    console.log(`✅ Upload job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`❌ Error processing upload job ${jobId}:`, error);
    await prisma.upload_job.update({
      where: { id: jobId },
      data: {
        status: "failed",
        progress: 0,
        error_message: error instanceof Error ? error.message : "Unknown error",
      },
    });

    // Try to clean up temp file on error
    try {
      const job = await prisma.upload_job.findUnique({ where: { id: jobId } });
      if (job) {
        await fs.unlink(job.temp_path).catch(() => {});
      }
    } catch {}
  }
}

// Main worker loop state
let isRunning = false;
let workerLoopPromise = null;

async function workerLoop() {
  console.log("🔄 Worker loop starting...");
  while (isRunning) {
    try {
      const pendingJobs = await prisma.upload_job.findMany({
        where: { status: "pending" },
        orderBy: { created_at: "asc" },
        take: 5,
      });

      if (pendingJobs.length > 0) {
        console.log(`📦 Found ${pendingJobs.length} pending jobs`);

        for (const job of pendingJobs) {
          const createdAt = new Date(job.created_at).getTime();
          const ageMs = Date.now() - createdAt;
          // Defer very recent jobs to avoid race with filesystem flush on Windows
          if (ageMs < 1000) {
            console.log(`⏳ Deferring very recent job ${job.id} (age ${ageMs}ms)`);
            continue;
          }
          await processUploadJob(job.id);
        }
      }
    } catch (error) {
      console.error("❌ Worker error:", error);
      // Don't crash, continue processing
    }

    // Wait 1 second before next check
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log("🛑 Worker loop stopped");
}

// Start the worker with automatic crash recovery
export async function startWorker() {
  if (isRunning) {
    console.warn("⚠️ Worker already running");
    return;
  }

  console.log("🚀 Starting upload worker...");

  // Ensure temp directory exists
  await ensureTempDirectory();

  isRunning = true;

  // Start worker loop with crash recovery
  async function runWithRecovery() {
    while (isRunning) {
      try {
        await workerLoop();
      } catch (error) {
        console.error("💥 Worker loop crashed:", error);
        if (isRunning) {
          console.log("🔄 Restarting worker in 5 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          console.log("🔄 Worker restarting...");
        }
      }
    }
  }

  workerLoopPromise = runWithRecovery();
  console.log("✅ Worker started with crash recovery");
}

// Stop the worker gracefully
export async function stopWorker() {
  if (!isRunning) {
    return;
  }

  console.log("🛑 Stopping worker...");
  isRunning = false;

  if (workerLoopPromise) {
    await workerLoopPromise;
  }

  console.log("✅ Worker stopped");
}

// Export for testing/manual processing
export { ensureTempDirectory, processUploadJob };

// Auto-start if run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  console.log("🚀 Running worker in standalone mode");

  await startWorker();

  // Graceful shutdown for standalone mode
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down worker...");
    await stopWorker();
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 Shutting down worker...");
    await stopWorker();
    await prisma.$disconnect();
    process.exit(0);
  });
}
