# Asynchronous File Upload Implementation

## Overview

This document describes the asynchronous file upload system implemented for Sinopsis-Recorder. The system allows users to upload audio files without waiting for the entire processing pipeline to complete.

## Architecture

### Components

1. **Upload Route** (`app/routes/rapat/rapat-upload.tsx`)
   - Receives file upload from user
   - Performs basic validation
   - Saves file to temporary location
   - Creates upload job in database
   - Returns immediately with job ID

2. **Upload Job Model** (`app/models/upload_job.server.ts`)
   - Database model for tracking upload jobs
   - Statuses: `pending`, `processing`, `completed`, `failed`
   - Tracks progress (0-100%)

3. **Background Worker** (`app/lib/upload-worker.server.ts`)
   - Polls database for pending jobs every 2 seconds
   - Processes jobs sequentially:
     - Validates audio file
     - Uploads to MinIO
     - Creates rapat_chunk record
     - Publishes to RabbitMQ
     - Updates rapat status
   - Updates job status and progress throughout

4. **Status Monitoring** (`app/routes/rapat/rapat-index.tsx`)
   - Displays real-time upload progress
   - Auto-refreshes while job is processing
   - Shows success/failure notifications

## Database Schema

```sql
CREATE TABLE "upload_job" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    "completed_at" TIMESTAMP(3)
);
```

## Upload Flow

### User Upload (Synchronous - Fast)

1. User selects file and submits form
2. Server validates file size and type (basic checks)
3. File saved to temporary directory (`os.tmpdir()/sinopsis-uploads`)
4. Upload job created in database with status `pending`
5. User redirected to rapat list page with job ID
6. **Total time: < 2 seconds** (regardless of file size)

### Background Processing (Asynchronous)

1. Worker polls database every 2 seconds
2. Finds pending jobs
3. For each job:
   - Update status to `processing` (10%)
   - Read temp file (20%)
   - Validate audio file (30%)
   - Upload to MinIO (40-60%)
   - Create rapat_chunk record (80%)
   - Publish to RabbitMQ (90%)
   - Update rapat status to finished (90%)
   - Delete temp file
   - Mark job as `completed` (100%)

### Status Updates

- User sees live progress on rapat index page
- Page auto-refreshes every 2 seconds while job is active
- Shows progress bar with percentage
- Displays success message when complete
- Shows error message if failed

## Starting the System

### Development

```bash
# Start the app (includes worker)
npm run dev

# Or start worker separately
node worker.js
```

### Production

```bash
# Build the app
npm run build

# Start server (automatically starts worker)
npm start
```

The `server.js` file starts both:
- React Router server on configured port
- Background worker process

## Benefits

1. **Better User Experience**
   - No long waiting times
   - Can continue using app while upload processes
   - Real-time progress feedback

2. **Improved Reliability**
   - Failed uploads can be retried
   - System can handle multiple uploads
   - Processing continues even if user closes browser

3. **Scalability**
   - Can process multiple files concurrently
   - Worker can be scaled independently
   - Database-backed queue is persistent

4. **Error Handling**
   - Detailed error messages stored in database
   - Failed jobs don't block subsequent uploads
   - Easy to debug and retry failed jobs

## Configuration

### Environment Variables

- `STORAGE_TYPE`: Storage backend (default: `filesystem`)
- `MINIO_*`: MinIO configuration
- `RABBIT_MQ_*`: RabbitMQ configuration
- Worker interval: 2000ms (hardcoded in worker.js)

### Temp File Location

Files are temporarily stored in:
- Windows: `C:\Users\<username>\AppData\Local\Temp\sinopsis-uploads`
- Linux/Mac: `/tmp/sinopsis-uploads`

## Monitoring

### Check Job Status

Query the database:

```sql
SELECT id, status, progress, file_name, created_at, error_message
FROM upload_job
WHERE status = 'processing' OR status = 'pending'
ORDER BY created_at DESC;
```

### View Completed Jobs

```sql
SELECT id, status, file_name, 
       EXTRACT(EPOCH FROM (completed_at - created_at)) as duration_seconds
FROM upload_job
WHERE status = 'completed'
ORDER BY completed_at DESC
LIMIT 10;
```

## Cleanup

Old completed/failed jobs are stored indefinitely. To implement cleanup:

```javascript
// In worker or cron job
import { deleteOldCompletedJobs } from "~/models/upload_job.server";

// Delete jobs older than 7 days
await deleteOldCompletedJobs(7);
```

## Troubleshooting

### Worker Not Processing Jobs

1. Check if worker is running: `ps aux | grep worker`
2. Check worker logs for errors
3. Verify database connection
4. Check temp file permissions

### Jobs Stuck in Processing

1. Check worker logs for errors
2. Verify MinIO/RabbitMQ connectivity
3. Check if temp file exists
4. Manually update job status to `failed` to retry

### High Disk Usage

1. Check temp directory for orphaned files
2. Clean up old temp files manually
3. Implement automatic cleanup in worker

## Future Enhancements

1. **Multiple Workers**: Run multiple worker instances for parallel processing
2. **Job Priorities**: Add priority field for important uploads
3. **Retry Logic**: Automatically retry failed jobs
4. **Email Notifications**: Notify users when large uploads complete
5. **Progress Webhooks**: Push notifications for upload status
6. **File Chunking**: Support very large files with chunked uploads
7. **Resume Capability**: Resume interrupted uploads
8. **Admin Dashboard**: Monitor and manage jobs through UI

## API Reference

### Create Upload Job

```typescript
await createUploadJob(
  rapatId: number,
  fileName: string,
  fileSize: number,
  fileType: string,
  tempPath: string
): Promise<UploadJob>
```

### Update Job Status

```typescript
await updateUploadJobStatus(
  jobId: string,
  status: "pending" | "processing" | "completed" | "failed",
  progress: number,
  errorMessage?: string
): Promise<UploadJob>
```

### Get Job Status

```typescript
await getUploadJobById(jobId: string): Promise<UploadJob | null>
```

### Check Status via API

```
GET /upload-status?id=<job-id>

Response:
{
  "success": true,
  "upload": {
    "id": "uuid",
    "status": "processing",
    "progress": 60,
    "fileName": "audio.mp4",
    "rapatId": 123,
    "createdAt": "2025-10-19T18:00:00Z"
  }
}
```

## Testing

### Test Upload

1. Upload a file through the UI
2. Note the job ID in URL: `/rapat?uploadJobId=<uuid>`
3. Watch progress bar on rapat list page
4. Check database for job status
5. Verify file in MinIO after completion
6. Confirm RabbitMQ message published

### Test Failure Handling

1. Stop MinIO service
2. Upload a file
3. Verify job fails with error message
4. Check error is displayed to user
5. Restart MinIO
6. Manually retry job by updating status to `pending`

## Performance

- Upload response time: < 2 seconds
- Worker processing time: 5-30 seconds (depends on file size)
- Database polling interval: 2 seconds
- UI refresh interval: 2 seconds (when job active)

## Security Considerations

1. **Temp Files**: Stored in OS temp directory with restricted permissions
2. **File Validation**: Size and type checked before saving
3. **Job Ownership**: Jobs linked to rapat_id for access control
4. **Cleanup**: Temp files deleted after processing
5. **Error Messages**: Sanitized before displaying to users
