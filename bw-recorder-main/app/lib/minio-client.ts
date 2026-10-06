import { Client } from "minio";

export interface MinioConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSSL?: boolean;
  connectionTimeout?: number; // Connection timeout in milliseconds
}

export class MinioClient {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly connectionTimeout: number;

  constructor(config: MinioConfig) {
    // Parse endpoint to extract host and port
    const url = new URL(config.endpoint);

    // Determine the port based on URL or protocol
    let port: number;
    if (url.port) {
      port = Number.parseInt(url.port);
    } else {
      port = url.protocol === "https:" ? 443 : 80;
    }

    // Default to 60 seconds for better handling of large files
    this.connectionTimeout = config.connectionTimeout || 60000;

    this.client = new Client({
      endPoint: url.hostname,
      port,
      useSSL: config.useSSL ?? url.protocol === "https:",
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

    this.bucket = config.bucket;
  }

  /**
   * Wraps a promise with a connection timeout
   */
  private withConnectionTimeout<T>(operation: Promise<T>, operationName: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(`MinIO ${operationName} connection timed out after ${this.connectionTimeout}ms`)
        );
      }, this.connectionTimeout);

      operation
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /**
   * Wraps a promise with a dynamic timeout (for file uploads based on size)
   */
  private withDynamicTimeout<T>(
    operation: Promise<T>,
    operationName: string,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`MinIO ${operationName} connection timed out after ${timeout}ms`));
      }, timeout);

      operation
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  /**
   * Initialize the MinIO client by ensuring the bucket exists
   */
  async initialize(): Promise<void> {
    try {
      const bucketExists = await this.withConnectionTimeout(
        this.client.bucketExists(this.bucket),
        "bucket existence check"
      );

      if (!bucketExists) {
        await this.withConnectionTimeout(this.client.makeBucket(this.bucket), "bucket creation");
        console.log(`MinIO bucket '${this.bucket}' created successfully`);
      }
    } catch (error) {
      console.error("Failed to initialize MinIO bucket:", error);
      throw new Error(
        `MinIO initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Upload a file buffer to MinIO
   */
  async uploadFile(
    fileName: string,
    buffer: Buffer,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<{ url: string; etag: string }> {
    try {
      // Calculate dynamic timeout based on file size
      // Allow at least 30 seconds, plus 10 seconds per MB
      const fileSizeMB = buffer.length / (1024 * 1024);
      const dynamicTimeout = Math.max(30000, Math.ceil(fileSizeMB * 10000 + 20000));
      
      console.log(`Uploading ${fileName} (${fileSizeMB.toFixed(2)} MB) with timeout: ${dynamicTimeout}ms`);

      const uploadResult = await this.withDynamicTimeout(
        this.client.putObject(this.bucket, fileName, buffer, buffer.length, {
          "Content-Type": contentType || "application/octet-stream",
          ...metadata,
        }),
        "file upload",
        dynamicTimeout
      );

      // Generate the URL for accessing the file
      const url = await this.getFileUrl(fileName);

      return {
        url,
        etag: uploadResult.etag,
      };
    } catch (error) {
      console.error("Failed to upload file to MinIO:", error);
      throw new Error(
        `MinIO upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get a presigned URL for accessing a file (expires in 7 days by default)
   */
  async getFileUrl(fileName: string, expiry: number = 7 * 24 * 60 * 60): Promise<string> {
    try {
      return await this.withConnectionTimeout(
        this.client.presignedGetObject(this.bucket, fileName, expiry),
        "presigned URL generation"
      );
    } catch (error) {
      console.error("Failed to generate presigned URL:", error);
      throw new Error(
        `Failed to generate file URL: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Delete a file from MinIO
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, fileName);
    } catch (error) {
      console.error("Failed to delete file from MinIO:", error);
      throw new Error(
        `MinIO delete failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Check if a file exists in MinIO
   */
  async fileExists(fileName: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, fileName);
      return true;
    } catch (error) {
      // Log the error for debugging but return false for file not found scenarios
      console.debug("File does not exist or error checking file:", error);
      return false;
    }
  }
}

/**
 * Create a MinIO client instance from environment variables
 */
export function createMinioClient(): MinioClient | null {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_USER;
  const secretKey = process.env.MINIO_PASSWORD;
  const bucket = process.env.MINIO_BUCKET;
  // Increase default timeout to 60 seconds for better handling of large files
  const connectionTimeout = Number(process.env.STORAGE_CONNECTION_TIMEOUT_MS || "60000");

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    console.warn("MinIO configuration incomplete. Missing required environment variables.");
    return null;
  }

  return new MinioClient({
    endpoint,
    accessKey,
    secretKey,
    bucket,
    connectionTimeout,
  });
}
