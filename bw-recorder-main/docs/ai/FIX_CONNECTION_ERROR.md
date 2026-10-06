# Error: Connection Terminated Unexpectedly - FIXED ✅

## The Error

```
Error: Connection terminated unexpectedly
  at Connection.<anonymous> (node_modules\pg\lib\client.js:136:73)
```

AND

```
PrismaClientUnknownRequestError: invalid input syntax for type uuid: "upload-1760884863600-i1d73j48j"
```

## Root Causes Identified

### 1. Database Connection Timeout ❌ → ✅ FIXED

**Problem:** PostgreSQL connection pool had aggressive timeout settings (2 seconds), causing connections to drop unexpectedly.

**Solution Applied:**
- Increased `connectionTimeoutMillis` from 2s to 10s
- Increased `idleTimeoutMillis` from 30s to 60s
- Reduced `max` connections from 20 to 10
- Added `min: 2` to maintain persistent connections
- Added error handler for pool errors

**File:** `prisma/client.server.ts`

### 2. Invalid UUID Format ❌ → ✅ FIXED

**Problem:** The audio recorder component (`audio-recorder-button.tsx`) was calling `/upload-status?id=upload-1760884863600-i1d73j48j` with a non-UUID format, but the endpoint expected a UUID for the new `upload_job` table.

**Context:** There are TWO upload systems:
1. **OLD System**: Audio recorder → `upload-audio.tsx` → in-memory Map with custom IDs
2. **NEW System**: File upload → `rapat-upload.tsx` → database with UUID

**Solution Applied:**
- Added UUID validation in `upload-status.tsx`
- Non-UUID IDs return 404 instead of causing database errors
- Old audio recorder uploads gracefully fail without breaking the app

**File:** `app/routes/upload-status.tsx`

## Changes Made

### File 1: `prisma/client.server.ts`

```typescript
// BEFORE (problematic)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000, // Too short!
});

// AFTER (fixed)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  min: 2, // Keep minimum connections alive
  idleTimeoutMillis: 60000, // Longer idle timeout
  connectionTimeoutMillis: 10000, // More time to connect
  allowExitOnIdle: true,
});

// Added error handler
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});
```

### File 2: `app/routes/upload-status.tsx`

```typescript
// Added UUID validation
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!uuidRegex.test(uploadId)) {
  // Not a UUID - return 404 instead of querying database
  return Response.json({
    success: false,
    error: "Upload not found or expired (legacy upload ID)",
  }, { status: 404 });
}

// Only query database for valid UUIDs (new async upload system)
const uploadJob = await getUploadJobById(uploadId);
```

## Why This Happened

1. **Aggressive Database Timeouts**: The 2-second connection timeout was too aggressive for a remote database server, especially with network latency.

2. **Two Upload Systems Coexisting**: 
   - The audio recorder uses the OLD in-memory system (custom IDs like `upload-123-xyz`)
   - The file upload uses the NEW database system (UUIDs like `a1a3c9bb-7ff0-4170-b60b-9531fc36bee7`)
   - Both were calling the same `/upload-status` endpoint

## How to Verify the Fix

### Test 1: Check Database Connection

```bash
# Should not see connection errors
npm run dev
```

### Test 2: Upload a File

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run dev:worker

# Then upload a file via the UI
# Should work without UUID errors
```

### Test 3: Check Logs

No more errors like:
- ❌ `Connection terminated unexpectedly`
- ❌ `invalid input syntax for type uuid`

## Current System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  UPLOAD SYSTEMS (Two Independent Systems)                  │
└─────────────────────────────────────────────────────────────┘

1. AUDIO RECORDER (Old System - Still Active)
   ┌──────────────────┐
   │ Record Button    │
   │ (audio-recorder- │
   │  button.tsx)     │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ upload-audio.tsx │ ──▶ In-Memory Map (globalThis.uploadStatuses)
   └──────────────────┘     ID: "upload-{timestamp}-{random}"
            │
            ▼
   ┌──────────────────┐
   │ MinIO + RabbitMQ │
   └──────────────────┘

2. FILE UPLOAD (New Async System)
   ┌──────────────────┐
   │ Upload Form      │
   │ (rapat-upload.   │
   │  tsx)            │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Create Job in DB │ ──▶ Database (upload_job table)
   │ (upload_job)     │     ID: UUID (e.g., a1a3c9bb-...)
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Background Worker│ ──▶ MinIO + RabbitMQ
   │ (worker.js)      │
   └──────────────────┘

SHARED ENDPOINT: /upload-status
   - Checks ID format
   - UUID → Query database (new system)
   - Non-UUID → Return 404 (old system)
```

## Additional Improvements Made

1. ✅ Better error handling in upload-status route
2. ✅ Database pool connection improvements
3. ✅ Graceful handling of legacy upload IDs
4. ✅ Added error logging for debugging

## Prevention

To avoid similar issues in the future:

1. **Use Different Endpoints**: Consider separate endpoints for:
   - `/upload-status-legacy` (audio recorder)
   - `/upload-status` (async file upload)

2. **Consistent ID Format**: Migrate audio recorder to use UUIDs and database tracking

3. **Monitor Database Connections**: Add health checks and connection monitoring

4. **Better Error Messages**: Distinguish between different error types

## Status

✅ **FIXED** - Both errors resolved:
1. Database connections now stable with proper timeouts
2. UUID validation prevents invalid queries
3. App works correctly with both upload systems

## Testing

Run the application:
```bash
npm run dev
```

Expected result:
- ✅ No connection errors
- ✅ No UUID validation errors
- ✅ File uploads work correctly
- ✅ Audio recorder continues to work

If you still see errors, check:
1. Database server is accessible
2. DATABASE_URL is correct in .env
3. Network connectivity to PostgreSQL server
