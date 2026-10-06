-- CreateTable
CREATE TABLE "upload_job" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rapat_id" INTEGER NOT NULL,
    "file_name" VARCHAR NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" VARCHAR NOT NULL,
    "temp_path" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'pending',
    "progress" SMALLINT NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "upload_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_job_status_created_at_idx" ON "upload_job"("status", "created_at");

-- CreateIndex
CREATE INDEX "upload_job_rapat_id_idx" ON "upload_job"("rapat_id");
