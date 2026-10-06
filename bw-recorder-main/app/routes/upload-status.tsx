import type { LoaderFunctionArgs } from "react-router";
import { getUploadJobById } from "~/models/upload_job.server";

// Declare global uploadStatuses from upload-audio.tsx
declare global {
  var uploadStatuses: Map<string, {
    id: string;
    fileName: string;
    status: "processing" | "completed" | "failed";
    result?: any;
    error?: string;
    timestamp: string;
  }>;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("id");

  if (!uploadId) {
    return Response.json(
      {
        success: false,
        error: "Upload ID is required",
      },
      { status: 400 }
    );
  }

  // Validate UUID format - check if it's a proper UUID for upload_job table
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(uploadId)) {
    // Not a UUID - this is from the audio recorder system (upload-audio.tsx)
    // Check in-memory uploadStatuses Map
    const uploadStatus = globalThis.uploadStatuses?.get(uploadId);
    
    if (!uploadStatus) {
      return Response.json(
        {
          success: false,
          error: "Upload not found or expired",
        },
        { status: 404 }
      );
    }
    
    // Return status from in-memory store
    return Response.json({
      success: true,
      upload: {
        id: uploadStatus.id,
        status: uploadStatus.status,
        fileName: uploadStatus.fileName,
        error: uploadStatus.error,
        result: uploadStatus.result,
        timestamp: uploadStatus.timestamp,
      },
    });
  }

  // Get upload job status from database (new async upload system)
  try {
    const uploadJob = await getUploadJobById(uploadId);

    if (!uploadJob) {
      return Response.json(
        {
          success: false,
          error: "Upload not found",
        },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      upload: {
        id: uploadJob.id,
        status: uploadJob.status,
        progress: uploadJob.progress,
        fileName: uploadJob.file_name,
        rapatId: uploadJob.rapat_id,
        error: uploadJob.error_message,
        createdAt: uploadJob.created_at,
        completedAt: uploadJob.completed_at,
      },
    });
  } catch (error) {
    console.error("Error fetching upload job:", error);
    return Response.json(
      {
        success: false,
        error: "Failed to fetch upload status",
      },
      { status: 500 }
    );
  }
}
