import { getFormProps, useForm } from "@conform-to/react";
import { getZodConstraint, parseWithZod } from "@conform-to/zod";
import { AlertCircle, Calendar, Check, Loader2, Upload, X } from "lucide-react";
import fs from "node:fs/promises";
import { posix as path } from "node:path";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Form,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import { z } from "zod";
import { Field } from "~/components/conform/Field";
import { InputConform } from "~/components/conform/Input";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { getCurrentUser } from "~/lib/auth.server";
import { requirePermission } from "~/lib/rbac.server";
import { upsertRapat } from "~/models/rapat.server";
import { createUploadJob } from "~/models/upload_job.server";

const schema = z.object({
  judul: z.string({ message: "Kolom judul harus diisi" }),
  tempat_rapat: z.string({ message: "Kolom tempat rapat harus diisi" }),
  tanggal: z.string({ message: "Kolom tanggal harus diisi" }),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  // Require permission to upload rapat
  await requirePermission(user, "rapat.create");

  return { user };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  // Require permission to upload rapat
  await requirePermission(user, "rapat.create");

  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema });

  if (submission.status !== "success") {
    return submission.reply();
  }

  const { judul, tempat_rapat, tanggal } = submission.value;
  const audioFile = formData.get("audio") as File;

  if (!audioFile || audioFile.size === 0) {
    return submission.reply({
      formErrors: ["File audio harus diupload"],
    });
  }

  // Convert date from DD-MM-YYYY to YYYY-MM-DD format and add time for valid DateTime
  const convertDateToISO = (dateStr: string): string => {
    const [day, month, year] = dateStr.split("-");
    return `${year}-${month}-${day}T00:00:00.000Z`;
  };

  const tanggalISO = convertDateToISO(tanggal);

  try {
    // Step 1: Create rapat with status 0 (processing) - will be updated to 2 when job completes
    const rapat = await upsertRapat(0, judul, tempat_rapat, 0, tanggalISO);

    // Step 2: Save file to temporary location
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Basic validation before saving
    if (buffer.length === 0) {
      return submission.reply({
        formErrors: ["File audio kosong"],
      });
    }

    // Check maximum size (100MB limit)
    const maxSize = 100 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return submission.reply({
        formErrors: ["File terlalu besar (maksimal 100MB)"],
      });
    }

    // Create temp directory with retries (Windows FS can lag)
    // Use hardcoded /tmp path for Linux server to avoid cross-platform path issues
    const tempDir = path.join("/tmp", "sinopsis-uploads");
    let dirOk = false;
    for (let attempt = 0; attempt < 5 && !dirOk; attempt++) {
      try {
        await fs.mkdir(tempDir, { recursive: true });
        await fs.access(tempDir);
        dirOk = true;
        if (attempt > 0) console.log(`✅ Temp directory ensured after retry #${attempt}:`, tempDir);
      } catch (mkdirError) {
        console.warn(
          `⏳ Temp dir not ready (attempt ${attempt + 1}):`,
          mkdirError instanceof Error ? mkdirError.message : String(mkdirError)
        );
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!dirOk) {
      throw new Error(`Cannot create temp directory: ${tempDir}`);
    }

    // Save to temp file (sanitize original name)
    const originalName = typeof audioFile.name === "string" ? audioFile.name : "upload.bin";
    const baseName = path.basename(originalName);
    const safeBase = baseName
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim();
    const truncated = safeBase.length > 80 ? safeBase.slice(0, 80) : safeBase;
    const tempFileName = `${Date.now()}-${rapat.id}-${truncated}`;
    const tempPath = path.join(tempDir, tempFileName);

    try {
      // Write file with explicit sync to ensure it's fully flushed to disk
      const fileHandle = await fs.open(tempPath, "w");
      await fileHandle.write(buffer);
      await fileHandle.sync(); // Force flush to disk
      await fileHandle.close();
      console.log("✅ File written successfully:", tempPath);

      // Verify file was written and is readable
      const stats = await fs.stat(tempPath);
      console.log(`✅ File verified: ${stats.size} bytes at ${tempPath}`);

      if (stats.size !== buffer.length) {
        throw new Error(`File size mismatch: expected ${buffer.length}, got ${stats.size}`);
      }

      // Small delay to ensure file system has fully committed the file
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (writeError) {
      console.error("Failed to write file:", writeError);
      throw new Error(
        `Cannot write file to ${tempPath}: ${writeError instanceof Error ? writeError.message : String(writeError)}`
      );
    }

    console.log("✅ File saved to temp location:", tempPath);

    // Step 3: Create upload job for background processing
    const job = await createUploadJob(rapat.id, audioFile.name, buffer.length, audioFile.type, tempPath);

    console.log("✅ Upload job created:", job.id);

    // Step 4: Return immediately with job ID - background worker will process it
    return redirect(`/rapat?uploadJobId=${job.id}`);
  } catch (error) {
    console.error("Upload error:", error);
    return submission.reply({
      formErrors: [`Gagal mengupload file: ${error instanceof Error ? error.message : "Unknown error"}`],
    });
  }
}

export default function RapatUpload() {
  const lastResult = useActionData<typeof action>();
  const navigation = useNavigation();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSubmitting = navigation.state === "submitting";

  // Simulate upload progress based on file size and submission state
  useEffect(() => {
    if (!isSubmitting) {
      setUploadProgress(0);
      return;
    }

    // Estimate upload time based on file size
    const fileSize = audioFile?.size || 0;
    const estimatedSeconds = Math.max(2, Math.min(15, fileSize / (1024 * 1024))); // 2-15 seconds based on file size
    const intervalMs = 100; // Update every 100ms
    const incrementPerInterval = (100 / (estimatedSeconds * 1000)) * intervalMs;

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        // Speed up to 70%, then slow down
        const next = prev + incrementPerInterval * (prev < 70 ? 1 : 0.3);
        // Cap at 98% until actual completion (was 95% but caused confusion on slow networks)
        return Math.min(98, next);
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isSubmitting, audioFile?.size]);

  // Complete progress when navigation is done
  useEffect(() => {
    if (navigation.state === "idle" && uploadProgress > 0) {
      setUploadProgress(100);
      // Reset after a brief delay
      const timeout = setTimeout(() => {
        setUploadProgress(0);
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [navigation.state, uploadProgress]);

  // Get today's date in DD-MM-YYYY format
  const today = (() => {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  })();

  const [form, fields] = useForm({
    lastResult,
    constraint: getZodConstraint(schema),
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
    shouldRevalidate: "onInput",
    defaultNoValidate: false,
    defaultValue: {
      tanggal: today,
    },
  });

  const handleFileSelect = useCallback((file: File | null) => {
    if (file) {
      // Validate file type
      if (!file.type.includes("audio/") && !file.type.includes("video/")) {
        alert("File harus berupa audio atau video");
        return;
      }

      // Validate file size (100MB max)
      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        alert("File terlalu besar (maksimal 100MB)");
        return;
      }

      setAudioFile(file);
    } else {
      setAudioFile(null);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelect(file);
  };

  const handleRemoveFile = () => {
    setAudioFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="grid grid-cols-12 gap-2">
      <Card className="col-span-12 lg:col-span-7 md:col-span-9 sm:col-span-9">
        <CardHeader>
          <CardTitle>Unggah Rekaman Rapat</CardTitle>
          <CardDescription>Unggah file audio rapat yang sudah ada untuk diproses.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" {...getFormProps(form)} encType="multipart/form-data">
            <Field>
              <Label htmlFor={fields.judul.id}>Judul</Label>
              <InputConform meta={fields.judul} type="text" />
              {fields.judul.errors && <div className="text-red-500 text-sm mt-1">{fields.judul.errors}</div>}
            </Field>

            <div className="flex flex-col md:flex-row gap-4">
              <Field className="flex-1">
                <Label htmlFor={fields.tempat_rapat.id}>Tempat</Label>
                <InputConform meta={fields.tempat_rapat} type="text" />
                {fields.tempat_rapat.errors && (
                  <div className="text-red-500 text-sm mt-1">{fields.tempat_rapat.errors}</div>
                )}
              </Field>
              <Field className="w-full md:w-[180px]">
                <Label htmlFor={fields.tanggal.id}>Tanggal</Label>
                <div className="relative">
                  <InputConform
                    meta={fields.tanggal}
                    type="text"
                    placeholder="DD-MM-YYYY"
                    pattern="\d{2}-\d{2}-\d{4}"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  />
                  <input
                    type="date"
                    id="hidden-date-picker"
                    className="absolute opacity-0 pointer-events-none"
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      if (dateValue) {
                        const [year, month, day] = dateValue.split("-");
                        const formattedDate = `${day}-${month}-${year}`;
                        const textInput = document.querySelector(
                          `input[name="${fields.tanggal.name}"]`
                        ) as HTMLInputElement;
                        if (textInput) {
                          textInput.value = formattedDate;
                          textInput.dispatchEvent(new Event("input", { bubbles: true }));
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const dateInput = document.getElementById("hidden-date-picker") as HTMLInputElement;
                      if (dateInput) {
                        dateInput.showPicker?.();
                      }
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    <Calendar className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
                {fields.tanggal.errors && <div className="text-red-500 text-sm mt-1">{fields.tanggal.errors}</div>}
              </Field>
            </div>

            <Field>
              <Label>File Audio</Label>
              <label
                htmlFor="audio-file-input"
                className={`relative border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer block ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                } ${audioFile ? "bg-gray-50 dark:bg-gray-800" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  id="audio-file-input"
                  ref={fileInputRef}
                  type="file"
                  name="audio"
                  accept="audio/*,video/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={isSubmitting}
                />

                {!audioFile ? (
                  <div className="text-center pointer-events-none">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      Drag & drop file audio di sini, atau{" "}
                      <span className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                        browse
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                      Mendukung format audio/video (maksimal 100MB)
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0 pointer-events-none">
                      <div className="flex-shrink-0">
                        <Check className="h-8 w-8 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {audioFile.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(audioFile.size)} • {audioFile.type}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemoveFile();
                      }}
                      className="flex-shrink-0 ml-4 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      disabled={isSubmitting}
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>
                )}
              </label>
            </Field>

            {form.errors && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 mb-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-400">Error</h3>
                    <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                      <ul className="list-disc list-inside space-y-1">
                        {form.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 mt-6">
              <Button type="button" variant="outline" onClick={() => globalThis.history.back()} disabled={isSubmitting}>
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !audioFile}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Mengupload...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Unggah & Proses
                  </>
                )}
              </Button>
            </div>

            {/* Upload Progress Bar */}
            {isSubmitting && uploadProgress > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Menyiapkan upload...</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  >
                    <div className="h-full w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <p>📤 Mengirim file ke server dan membuat job pemrosesan...</p>
                  <p className="mt-1 text-gray-400">
                    Anda akan diarahkan ke halaman daftar rapat untuk melihat progress pemrosesan.
                  </p>
                </div>
              </div>
            )}
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
