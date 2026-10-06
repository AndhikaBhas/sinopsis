import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a chunked filename with 4-part format
 * Format: {rapatId}_{chunkNumber}_{dateStr}_{timeStr}
 * - rapatId: rapat ID (defaults to "mid" if not provided)
 * - chunkNumber: 3-digit zero-padded chunk number (001, 002, etc.)
 * - dateStr: YYYYMMDD
 * - timeStr: HHMMSS
 * @param chunkNumber - The chunk number (default: 1)
 * @param date - Optional date object, defaults to current time
 * @param rapatId - Optional rapat ID, will use "mid" if not provided or invalid
 * @returns Formatted filename string
 */
function generateChunkedFilename(
  chunkNumber: number = 1,
  date: Date = new Date(),
  rapatId?: string
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  const chunkStr = String(chunkNumber).padStart(3, "0"); // 001, 002, 003, etc.
  const dateStr = `${year}${month}${day}`;
  const timeStr = `${hours}${minutes}${seconds}`;

  // Handle null, undefined, empty string, or "null" string
  const safeRapatId = rapatId && rapatId !== "null" && rapatId.trim() !== "" ? rapatId : "mid";

  return `${safeRapatId}_${chunkStr}_${dateStr}_${timeStr}`;
}

/**
 * Generates a filename with 4-part format for audio recordings
 * Format: {rapatId}_{chunkNumber}_{dateStr}_{timeStr}.extension
 * @param extension - File extension (default: 'webm')
 * @param chunkNumber - Chunk number (default: 1)
 * @param date - Optional date object for timestamp, defaults to current time
 * @param rapatId - Optional rapat ID, will use "mid" if not provided or invalid
 * @returns Formatted filename
 */
export function generateAudioFilename(
  extension: string = "webm",
  chunkNumber: number = 1,
  date?: Date,
  rapatId?: string
): string {
  const filename = generateChunkedFilename(chunkNumber, date, rapatId);
  return `${filename}.${extension}`;
}
