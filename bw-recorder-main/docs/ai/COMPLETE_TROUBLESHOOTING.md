# 🎯 COMPLETE TROUBLESHOOTING GUIDE

## Executive Summary

### Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Nginx Reverse Proxy | ✅ FIXED | Configuration correct, running, forwarding requests |
| SSL Certificates | ✅ FIXED | Loaded and working |
| Proxy Headers | ✅ FIXED | Connection, HTTP/1.1, timeouts all configured |
| Backend Application | ❓ UNKNOWN | Need to diagnose |
| Database | ❓ UNKNOWN | Need to verify |
| File Upload | ❌ FAILING | Likely due to backend issue, not proxy |

### Bottom Line

**Nginx is perfect now.** The upload failure is happening at the **application level**, not the reverse proxy.

---

## What You've Already Done ✅

1. ✅ Fixed nginx SSL certificate issue
2. ✅ Applied correct proxy configuration
3. ✅ Verified nginx is running (`nginx -t` passes)
4. ✅ All proxy headers are set correctly

---

## What's Likely Broken ❌

1. **Backend application not running** - Most likely
2. **Cannot write to `/tmp/sinopsis-uploads`** - Very likely
3. **Database connection failed** - Possible
4. **File validation error** - Less likely

---

## Quick Diagnosis (5 minutes)

Run these 3 commands:

```bash
# 1. Is backend running?
ps aux | grep node | grep -v grep

# 2. Can you reach it?
curl -v http://10.252.178.50:3000/

# 3. Can it write files?
ls -la /tmp/sinopsis-uploads
```

**Share the output with me.**

---

## If Backend is NOT Running

```bash
cd /home/syauqi/sinopsis-recorder
npm start

# Wait for startup (10-30 seconds)
# You should see: "🚀 Server running on port 3000"
```

---

## If Temp Directory Permission Error

```bash
sudo mkdir -p /tmp/sinopsis-uploads
sudo chmod 777 /tmp/sinopsis-uploads

# Verify
ls -la /tmp/sinopsis-uploads
```

---

## If Database Error

```bash
# Check database is running
systemctl status postgresql

# If not, start it
sudo systemctl start postgresql

# Verify app can connect
cd /home/syauqi/sinopsis-recorder
npx prisma db push
```

---

## Complete Step-by-Step Guide

### Step 1: Verify Backend Status

```bash
# Check if running
ps aux | grep -E "node|npm|react" | grep -v grep

# Output should look like:
# user 12345 0.0 0.5 ... node server.js
# or
# user 12345 0.0 0.5 ... npm start

# If NOTHING appears: Backend is NOT running → Go to Step 2
# If something appears: Backend IS running → Go to Step 3
```

### Step 2: Start the Backend

```bash
# Navigate to app
cd /home/syauqi/sinopsis-recorder

# Build if needed
npm run build

# Start server
npm start

# You should see output like:
# 🚀 Starting production server...
# Server running on port 3000
# ✅ Environment variables loaded

# Let it run for 10-30 seconds, then continue
```

### Step 3: Verify Backend is Accessible

```bash
# Test if it's responding
curl -v http://10.252.178.50:3000/

# Should return:
# HTTP/1.1 200 OK (or 404, but not "Connection refused")

# If "Connection refused" → Backend crashed, check logs below
```

### Step 4: Fix Temp Directory Permissions

```bash
# Create directory
sudo mkdir -p /tmp/sinopsis-uploads

# Set permissions
sudo chmod 777 /tmp/sinopsis-uploads

# Verify
ls -la /tmp/sinopsis-uploads
# Should show: drwxrwxrwx (all permissions)
```

### Step 5: Check Application Logs

**If using Docker:**
```bash
# Find container
docker ps | grep -i sinopsis

# View logs
docker logs <container-id> --tail 100

# Watch for:
# ERROR, FAIL, PERMISSION, DATABASE, CANNOT
```

**If using systemd:**
```bash
# View logs
journalctl -u sinopsis -n 100
```

**If running npm directly:**
- Logs appear in terminal where `npm start` was run
- Look for red error messages

### Step 6: Test Upload

1. Open browser to your app
2. Go to `/rapat/upload`
3. Try uploading a small audio file (< 10MB)
4. Check browser DevTools (F12) → Network tab
5. What HTTP status do you see?

### Step 7: If Still Failing

```bash
# Open DevTools (F12)
# Go to Network tab
# Try upload
# Click on the failed request
# Click "Response" tab
# Copy the error message

# Share with me:
# - HTTP status code
# - Error message
# - Any other details
```

---

## Common Errors & Fixes

### Error: "Connection Refused" or "ECONNREFUSED"

**Cause**: Backend not running
```bash
cd /home/syauqi/sinopsis-recorder
npm start &
```

### Error: "Permission denied" writing to /tmp

**Cause**: Directory permission issue
```bash
sudo chmod 777 /tmp/sinopsis-uploads
```

### Error: "Database connection failed"

**Cause**: Database not running
```bash
sudo systemctl start postgresql
```

### Error: "Audio file is empty"

**Cause**: Invalid file or wrong encoding
- Try different audio file
- Try MP3 instead of WebM
- Ensure file is not corrupted

### Error: "413 Payload Too Large"

**Cause**: File larger than limit (already fixed, but verify)
```bash
grep client_max_body_size /etc/nginx/conf.d/sinopsis.bigdata.conf
# Should show: client_max_body_size 100M;
```

---

## Checklist for Full Verification

```
Nginx
  ☐ sudo nginx -t shows "test passed"
  ☐ sudo systemctl status nginx shows "active (running)"
  ☐ sudo tail -5 /var/log/nginx/error.log shows no errors

Backend
  ☐ ps aux | grep node shows running process
  ☐ curl http://10.252.178.50:3000/ returns response
  ☐ No errors in docker logs or journalctl

Filesystem
  ☐ ls -la /tmp/sinopsis-uploads shows directory
  ☐ Directory has full permissions (drwxrwxrwx)
  ☐ touch /tmp/sinopsis-uploads/test.txt succeeds

Database
  ☐ systemctl status postgresql shows running
  ☐ npx prisma db push shows no errors
  ☐ Application logs show "Database connected"

Authentication
  ☐ User is logged in (check cookies in DevTools)
  ☐ sinopsis_session cookie exists
  ☐ Cookie value is not empty

Upload Test
  ☐ Can access /rapat/upload page
  ☐ Can select audio file
  ☐ HTTP status on upload is 200 (not 400, 401, 404, 500)
  ☐ Upload completes successfully

Final
  ☐ Go to /rapat and verify rapat was created
  ☐ Recording on /rapat/create also works
  ☐ No errors in browser console (F12)
  ☐ All features working
```

---

## Files I Created for Reference

| File | Use |
|------|-----|
| `NGINX_RECORDING_ISSUE_FIX.md` | Why recording was failing (now fixed) |
| `NGINX_SSL_AND_UPLOAD_FIX.md` | SSL certificate configuration |
| `UPLOAD_FAILED_SOLUTIONS.md` | Solutions for upload failures |
| `NGINX_UPLOAD_DIAGNOSTIC.md` | Detailed diagnostic steps |
| `STATUS_REPORT.md` | Current status of all components |
| `NEXT_STEPS_UPLOAD.md` | What to check next |
| `docs/NGINX_RECORDING_FIX.md` | Technical details |
| `docs/NGINX_VISUAL_EXPLANATION.md` | Visual diagrams |
| `docs/NGINX_COMPLETE_SOLUTION.md` | Comprehensive guide |
| `docs/NGINX_SSL_CERTIFICATE_FIX.md` | SSL troubleshooting |

---

## Getting Help

When things don't work, provide:

1. **The exact error message** (screenshot or full text)
2. **HTTP status code** (200, 400, 401, 403, 404, 500, 502, etc)
3. **Output of key commands**:
   ```bash
   ps aux | grep node
   curl http://10.252.178.50:3000/
   docker logs <id> --tail 50
   ```
4. **Browser console errors** (F12 → Console tab)
5. **Browser Network tab** (F12 → Network tab → failed request)

With this info, I can provide exact fixes.

---

## Quick Reference: One-Liners

```bash
# Check backend
ps aux | grep node | grep -v grep

# Start backend
cd /home/syauqi/sinopsis-recorder && npm start &

# Fix temp directory
sudo mkdir -p /tmp/sinopsis-uploads && sudo chmod 777 /tmp/sinopsis-uploads

# Reload nginx
sudo systemctl reload nginx

# See nginx errors
sudo tail -20 /var/log/nginx/error.log

# See backend logs (Docker)
docker logs $(docker ps -aq --filter name=sinopsis) --tail 100

# See backend logs (systemd)
journalctl -u sinopsis -n 100

# Test backend response
curl -v http://10.252.178.50:3000/

# Test upload through nginx
curl -X POST -F "audio=@test.mp3" https://sinopsis.bigdata.pens.ac.id/upload-audio
```

---

## Summary

1. ✅ **Nginx is working perfectly** - no changes needed
2. ❌ **Backend might not be running** - verify with `ps aux | grep node`
3. ❓ **File permissions might be wrong** - fix with `sudo chmod 777 /tmp/sinopsis-uploads`
4. ❓ **Database might be down** - check with `systemctl status postgresql`

**Most likely fix**: Start the backend application.

---

**Run the 3 diagnostic commands above and share the output, and I can tell you exactly what's wrong!**
