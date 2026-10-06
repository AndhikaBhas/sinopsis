# Running Async Upload in Development

## Problem

The async upload worker is **only started automatically in production** (`npm start`).  
In development mode (`npm run dev`), only the Vite dev server runs, so the worker needs to be started separately.

## Solution

### Development Mode (Recommended)

Run **TWO terminals** simultaneously:

**Terminal 1 - Dev Server:**
```bash
npm run dev
```

**Terminal 2 - Worker:**
```bash
npm run dev:worker
```

### How It Works

1. **Terminal 1** runs the React Router dev server (Vite)
   - Handles HTTP requests
   - Serves the UI
   - Creates upload jobs in database

2. **Terminal 2** runs the background worker
   - Polls database every 2 seconds
   - Processes pending upload jobs
   - Updates job status and progress

### Production Mode

In production, everything starts automatically:

```bash
npm run build
npm start
```

The `server.js` file starts both:
- React Router production server
- Background worker process

## Quick Start Guide

### First Time Setup

1. Make sure database migration is applied:
```bash
npx prisma generate
```

2. Check if `upload_job` table exists:
```bash
npx prisma studio
# Look for upload_job table
```

### Daily Development

1. Start dev server:
```bash
npm run dev
```

2. In a **new terminal**, start worker:
```bash
npm run dev:worker
```

3. Upload a file through the UI

4. Watch the worker terminal for progress logs

### Checking Job Status

Use the check-jobs script:
```bash
node check-jobs.mjs
```

Output example:
```
📊 Upload Jobs:
================

ID: a1a3c9bb-7ff0-4170-b60b-9531fc36bee7
Rapat ID: 300
File: vocals.wav
Status: completed
Progress: 100%
Created: Sun Oct 19 2025 18:14:43 GMT+0700
---
```

## Troubleshooting

### Worker Not Processing Jobs

**Problem:** Files saved to temp folder but not uploaded to MinIO.

**Solution:** Make sure the worker is running!
```bash
# Check if worker is running
Get-Process | Where-Object {$_.ProcessName -eq "node"}

# Start worker if not running
npm run dev:worker
```

### Jobs Stuck in "Processing"

**Problem:** Job progress stops at a certain percentage.

**Check:**
1. Worker terminal for errors
2. MinIO connectivity: `echo $env:MINIO_ENDPOINT`
3. RabbitMQ connectivity
4. Network issues

**Solution:**
```bash
# Restart worker
# Kill existing node processes
taskkill /F /IM node.exe
# Start worker again
npm run dev:worker
```

### MinIO Upload Fails

**Error:** `InvalidEndpointError: Invalid endPoint`

**Solution:** The worker now automatically parses the MINIO_ENDPOINT URL.  
Check your .env file:
```
MINIO_ENDPOINT=http://10.252.178.141:9000
```

### Temp Files Not Cleaned Up

**Problem:** Files accumulate in temp directory.

**Location:** `C:\Users\<username>\AppData\Local\Temp\sinopsis-uploads\`

**Solution:**
```powershell
# Manual cleanup
Remove-Item "$env:TEMP\sinopsis-uploads\*" -Force
```

## Monitoring

### Watch Worker Logs

The worker terminal shows real-time progress:
```
🚀 Starting upload worker...
✅ Worker is running
📦 Found 1 pending jobs
🔄 Processing upload job: a1a3c9bb-7ff0-4170-b60b-9531fc36bee7
Audio file validation passed: {
  size: 43061292,
  type: 'audio/wav',
  sizeInKB: '42052.04',
  bufferLength: 43061292
}
✅ File uploaded to MinIO: rapat_300_chunk_001_1760872483142.wav
✅ Rapat chunk record inserted with ID: 456
✅ RabbitMQ message published successfully
✅ Upload job a1a3c9bb-7ff0-4170-b60b-9531fc36bee7 completed successfully
```

### Check Database Directly

```powershell
# Open Prisma Studio
npx prisma studio
# Navigate to upload_job table
```

Or use SQL:
```sql
SELECT id, status, progress, file_name, error_message
FROM upload_job
ORDER BY created_at DESC
LIMIT 5;
```

## Tips

### Auto-Restart Worker on Changes

For development, you might want to auto-restart the worker when code changes.

Install nodemon:
```bash
npm install --save-dev nodemon
```

Add to package.json:
```json
"dev:worker:watch": "nodemon worker.js"
```

Run:
```bash
npm run dev:worker:watch
```

### Multiple Workers

For high load, run multiple worker instances:
```bash
# Terminal 2
npm run dev:worker

# Terminal 3
npm run dev:worker

# Terminal 4
npm run dev:worker
```

Each worker will process jobs independently.

### Background Worker (Windows)

To run worker in background without keeping terminal open:
```powershell
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "worker.js"
```

To stop:
```powershell
taskkill /F /IM node.exe
```

## Summary

**Key Points:**
- ✅ Development requires TWO terminals (dev server + worker)
- ✅ Production starts both automatically
- ✅ Worker processes jobs every 2 seconds
- ✅ Use `node check-jobs.mjs` to monitor status
- ✅ Check worker terminal for detailed logs

**Common Commands:**
```bash
# Development
npm run dev              # Terminal 1
npm run dev:worker       # Terminal 2

# Check status
node check-jobs.mjs

# Production
npm run build
npm start                # Starts both server + worker
```
