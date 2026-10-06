import prisma from "../../prisma/client.server";

export type UploadJobStatus = "pending" | "processing" | "completed" | "failed";

export async function createUploadJob(
  rapatId: number,
  fileName: string,
  fileSize: number,
  fileType: string,
  tempPath: string
) {
  return await prisma.upload_job.create({
    data: {
      rapat_id: rapatId,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
      temp_path: tempPath,
      status: "pending",
      progress: 5, // Start at 5% to show immediate feedback
    },
  });
}

export async function getUploadJobById(id: string) {
  return await prisma.upload_job.findUnique({
    where: { id },
  });
}

export async function updateUploadJobStatus(
  id: string,
  status: UploadJobStatus,
  progress: number = 0,
  errorMessage?: string
) {
  return await prisma.upload_job.update({
    where: { id },
    data: {
      status,
      progress,
      error_message: errorMessage,
      completed_at: status === "completed" || status === "failed" ? new Date() : undefined,
    },
  });
}

export async function getPendingJobs(limit: number = 10) {
  return await prisma.upload_job.findMany({
    where: {
      status: "pending",
    },
    orderBy: {
      created_at: "asc",
    },
    take: limit,
  });
}

export async function getActiveJobs(limit: number = 10) {
  return await prisma.upload_job.findMany({
    where: {
      status: {
        in: ["pending", "processing"],
      },
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
  });
}

export async function deleteOldCompletedJobs(daysOld: number = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return await prisma.upload_job.deleteMany({
    where: {
      status: {
        in: ["completed", "failed"],
      },
      completed_at: {
        lt: cutoffDate,
      },
    },
  });
}
