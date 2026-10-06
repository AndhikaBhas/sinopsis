# Asynchronous Upload System - Quick Start

## What Changed?

The file upload process is now **asynchronous**. Users no longer wait for the entire processing pipeline (MinIO upload, RabbitMQ, etc.) to complete.

## How It Works

### Before (Synchronous)
1. User uploads file → waits 10-60 seconds
2. Server processes everything: validation, MinIO upload, RabbitMQ, database
3. User finally sees success/error

### After (Asynchronous)
1. User uploads file → **redirected in < 2 seconds**
2. Background worker processes everything
3. User sees live progress on the page

## Key Features

✅ **Instant Response**: Users redirected immediately after upload  
✅ **Real-time Progress**: Live progress bar shows processing status  
✅ **Continue Working**: Users can use the app while files process  
✅ **Better Error Handling**: Detailed error messages, retry capability  
✅ **Scalable**: Can handle multiple concurrent uploads  

## Files Modified

### New Files
- `app/models/upload_job.server.ts` - Job tracking model
- `app/lib/upload-worker.server.ts` - Background worker
- `worker.js` - Worker entry point
- `prisma/migrations/.../migration.sql` - Database migration
- `docs/ASYNC_UPLOAD_IMPLEMENTATION.md` - Full documentation

### Modified Files
- `app/routes/rapat/rapat-upload.tsx` - Now creates jobs instead of processing
- `app/routes/rapat/rapat-index.tsx` - Shows upload progress
- `app/routes/upload-status.tsx` - Returns job status from DB
- `prisma/schema.prisma` - Added `upload_job` table
- `server.js` - Starts background worker automatically

## Database Changes

New table `upload_job`:
- Tracks upload jobs
- Stores status, progress, errors
- Auto-cleanup function included

## Running the System

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

The worker starts automatically with the server.

## User Experience

### Upload Flow
1. User fills form and selects audio file
2. Clicks "Upload" button
3. **Immediately redirected** to rapat list (< 2 seconds)
4. Sees progress notification at top of page
5. Progress bar updates every 2 seconds
6. Success/error message shown when complete

### Progress States
- 🔄 **Processing** - Blue notification with progress bar
- ✅ **Completed** - Green notification with checkmark
- ❌ **Failed** - Red notification with error message

## Monitoring

### Check Active Jobs
```sql
SELECT * FROM upload_job 
WHERE status IN ('pending', 'processing') 
ORDER BY created_at DESC;
```

### Check Failed Jobs
```sql
SELECT id, file_name, error_message, created_at 
FROM upload_job 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

## Testing

1. Upload a small file (few MB) - should complete in ~5 seconds
2. Upload a large file (50+ MB) - watch progress update
3. Stop MinIO and upload - should fail gracefully with error message

## Benefits

### For Users
- No more long waits during upload
- Can upload and continue working
- See what's happening in real-time

### For System
- Better resource utilization
- Can handle multiple uploads
- Failed uploads don't affect others
- Easy to debug and retry

## Configuration

All existing environment variables still apply:
- `STORAGE_TYPE`
- `MINIO_*`
- `RABBIT_MQ_*`

Worker polls every 2 seconds (configurable in `worker.js`).

## Rollback Plan

If issues occur:

1. Stop the server
2. Revert to previous commit
3. Or manually disable worker:
   - Comment out worker start in `server.js`
   - System will work without background processing (synchronous mode)

## Next Steps

Consider implementing:
- [ ] Multiple worker instances for high load
- [ ] Admin dashboard for job monitoring
- [ ] Email notifications for completed uploads
- [ ] Automatic retry for failed jobs
- [ ] Cleanup job for old records

## Support

For issues or questions, see:
- Full docs: `docs/ASYNC_UPLOAD_IMPLEMENTATION.md`
- Code: `app/lib/upload-worker.server.ts`
- Database: `prisma/schema.prisma` (upload_job model)
