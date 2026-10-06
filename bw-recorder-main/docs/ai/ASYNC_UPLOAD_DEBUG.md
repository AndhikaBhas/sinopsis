# Async Upload Issue: Investigation Summary

## Current Status

✅ **Upload Job Created:** File successfully uploaded to temp folder  
✅ **Worker Running:** Background worker is processing jobs  
✅ **Validation Passed:** 43MB file validated successfully  
⚠️ **Stuck at 40%:** MinIO upload stage is not completing  

## What's Working

1. **File Upload to Temp** ✅
   - File: `vocals.wav` (43MB)
   - Location: `C:\Users\Syauqi\AppData\Local\Temp\sinopsis-uploads\`
   - Job ID: `a1a3c9bb-7ff0-4170-b60b-9531fc36bee7`

2. **Worker Process** ✅
   - Successfully polls database
   - Finds pending jobs
   - Starts processing
   - Validates files

3. **Database Integration** ✅
   - `upload_job` table created
   - Jobs tracked properly
   - Status updates working (0% → 10% → 20% → 30% → 40%)

## What's Not Working

### MinIO Upload (Stuck at 40%)

**Symptoms:**
- Progress stops at 40%
- No error messages in database
- File not appearing in MinIO bucket

**Possible Causes:**
1. **Network Issue:** MinIO server `10.252.178.141:9000` unreachable
2. **Timeout:** 43MB file taking too long, connection timing out
3. **Silent Failure:** MinIO client not throwing error, but upload failing
4. **Bucket Permissions:** Worker doesn't have write permission to bucket

## Investigation Steps

### 1. Test MinIO Connectivity

```javascript
// test-minio.mjs
import { config } from "dotenv";
import { Client } from "minio";

config();

const endpointUrl = new URL(process.env.MINIO_ENDPOINT);
const minioClient = new Client({
  endPoint: endpointUrl.hostname,
  port: Number.parseInt(endpointUrl.port) || 9000,
  useSSL: endpointUrl.protocol === "https:",
  accessKey: process.env.MINIO_USER,
  secretKey: process.env.MINIO_PASSWORD,
});

console.log("Testing MinIO connection...");
console.log(`Endpoint: ${endpointUrl.hostname}:${endpointUrl.port}`);
console.log(`Bucket: ${process.env.MINIO_BUCKET}`);

try {
  // Test 1: List buckets
  const buckets = await minioClient.listBuckets();
  console.log("✅ Connected! Buckets:", buckets.map(b => b.name));

  // Test 2: Check if bucket exists
  const bucketExists = await minioClient.bucketExists(process.env.MINIO_BUCKET);
  console.log(`✅ Bucket ${process.env.MINIO_BUCKET} exists:`, bucketExists);

  // Test 3: Upload small test file
  const testData = Buffer.from("test");
  await minioClient.putObject(
    process.env.MINIO_BUCKET,
    `test-${Date.now()}.txt`,
    testData,
    testData.length
  );
  console.log("✅ Test upload successful!");

} catch (error) {
  console.error("❌ MinIO Error:", error);
}
```

Run:
```bash
node test-minio.mjs
```

### 2. Check Worker Logs

The worker should show detailed logs. If it's stuck at MinIO upload with no output, the upload is hanging (not failing).

**Expected logs:**
```
🔄 Processing upload job: a1a3c9bb-7ff0-4170-b60b-9531fc36bee7
Audio file validation passed: { ... }
✅ File uploaded to MinIO: rapat_300_chunk_001_xxx.wav
✅ Rapat chunk record inserted with ID: 456
✅ RabbitMQ message published successfully
✅ Upload job completed successfully
```

**Current logs:**
```
🔄 Processing upload job: a1a3c9bb-7ff0-4170-b60b-9531fc36bee7
Audio file validation passed: { ... }
[STUCK HERE - no further output]
```

### 3. Add Timeout to MinIO Upload

The MinIO client doesn't have a timeout by default. Large files can hang indefinitely.

**Solution:** Add timeout to worker.js around line 130:

```javascript
// Before
await minioClient.putObject(bucketName, fileName, buffer, buffer.length, {
  "Content-Type": job.file_type,
});

// After - with timeout
const uploadPromise = minioClient.putObject(bucketName, fileName, buffer, buffer.length, {
  "Content-Type": job.file_type,
});

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("MinIO upload timeout (60s)")), 60000)
);

await Promise.race([uploadPromise, timeoutPromise]);
```

### 4. Check Network/Firewall

```powershell
# Test if MinIO server is reachable
Test-NetConnection -ComputerName 10.252.178.141 -Port 9000

# Should show: TcpTestSucceeded : True
```

## Recommended Solutions

### Immediate Fix (Development)

**Option 1:** Reset the stuck job and retry
```sql
UPDATE upload_job 
SET status = 'pending', progress = 0 
WHERE id = 'a1a3c9bb-7ff0-4170-b60b-9531fc36bee7';
```

**Option 2:** Use smaller test file
- Upload a smaller file (< 5MB) to test if size is the issue

**Option 3:** Check MinIO server health
- Verify MinIO is running and accessible
- Check bucket permissions
- Review MinIO logs

### Long-term Fix (Production)

1. **Add Timeouts:** Prevent indefinite hangs
2. **Add Retry Logic:** Automatically retry failed uploads
3. **Chunked Uploads:** Split large files into smaller chunks
4. **Better Error Handling:** Catch and log all MinIO errors
5. **Health Checks:** Verify MinIO connectivity before processing

## Current Configuration

```env
STORAGE_TYPE=minio
MINIO_ENDPOINT=http://10.252.178.141:9000
MINIO_USER=sinopsis
MINIO_PASSWORD=sinopsis231
MINIO_BUCKET=sinopsis-audio-raw
```

## Next Steps

1. ✅ Run `node test-minio.mjs` to verify MinIO connectivity
2. ✅ Check if smaller files upload successfully
3. ✅ Add timeout to worker.js MinIO upload
4. ✅ Check MinIO server logs for errors
5. ✅ Consider adding retry logic

## Workaround for Development

If MinIO is the issue, temporarily switch to filesystem storage:

```env
STORAGE_TYPE=filesystem
```

This will save files locally instead of MinIO, allowing you to test the rest of the async upload system.

## Summary

**The async upload system is working correctly** except for the MinIO upload step. The issue is likely:
- Network connectivity to MinIO server
- MinIO upload timeout for large files
- Silent failure in MinIO client

Once MinIO connectivity is resolved, the system should work end-to-end.
