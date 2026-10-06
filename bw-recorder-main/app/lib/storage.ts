import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { createMinioClient, MinioClient } from "./minio-client";

export type StorageType = "filesystem" | "fs" | "minio";

export interface UploadResult {
  success: boolean;
  fileName: string;
  filePath: string;
  url?: string;
  etag?: string;
  size: number;
  type: string;
  uploadedAt: string;
  storageType: StorageType;
}

export interface StorageProvider {
  uploadFile(fileName: string, buffer: Buffer, contentType: string): Promise<UploadResult>;
}

export class FileSystemStorage implements StorageProvider {
  private readonly uploadsDir: string;

  constructor() {
    this.uploadsDir = join(process.cwd(), "uploads", "audio");
  }

  async uploadFile(fileName: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    try {
      // Create uploads directory if it doesn't exist
      if (!existsSync(this.uploadsDir)) {
        await mkdir(this.uploadsDir, { recursive: true });
      }

      const filePath = join(this.uploadsDir, fileName);
      await writeFile(filePath, buffer);

      return {
        success: true,
        fileName,
        filePath: `/uploads/audio/${fileName}`,
        size: buffer.length,
        type: contentType,
        uploadedAt: new Date().toISOString(),
        storageType: "filesystem",
      };
    } catch (error) {
      throw new Error(
        `Filesystem storage upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

export class MinIOStorage implements StorageProvider {
  private readonly minioClient: MinioClient;

  constructor(minioClient: MinioClient) {
    this.minioClient = minioClient;
  }

  async uploadFile(fileName: string, buffer: Buffer, contentType: string): Promise<UploadResult> {
    try {
      // Initialize MinIO client (ensure bucket exists)
      await this.minioClient.initialize();

      // Upload file to MinIO
      const result = await this.minioClient.uploadFile(fileName, buffer, contentType, {
        "uploaded-at": new Date().toISOString(),
        "original-size": buffer.length.toString(),
      });

      return {
        success: true,
        fileName,
        filePath: result.url,
        url: result.url,
        etag: result.etag,
        size: buffer.length,
        type: contentType,
        uploadedAt: new Date().toISOString(),
        storageType: "minio",
      };
    } catch (error) {
      throw new Error(
        `MinIO storage upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

/**
 * Create a storage provider based on the configuration
 */
export function createStorageProvider(): StorageProvider {
  const storageType = process.env.STORAGE_TYPE || "filesystem";

  switch (storageType) {
    case "minio": {
      const minioClient = createMinioClient();
      if (!minioClient) {
        throw new Error(
          "MinIO storage configuration incomplete. Please ensure MINIO_ENDPOINT, MINIO_USER, MINIO_PASSWORD, and MINIO_BUCKET environment variables are set."
        );
      }
      return new MinIOStorage(minioClient);
    }
    case "fs":
    case "filesystem":
    default:
      return new FileSystemStorage();
  }
}

/**
 * Get the current storage type from environment
 */
export function getStorageType(): StorageType {
  const type = process.env.STORAGE_TYPE || "filesystem";
  return (type === "fs" ? "filesystem" : type) as StorageType;
}
