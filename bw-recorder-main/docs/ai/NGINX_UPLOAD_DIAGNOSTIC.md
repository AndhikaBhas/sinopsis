# 🔍 Upload Failing - Diagnostic Guide

## Status: Nginx is ✅ Working

Nginx is running correctly with proper configuration. The upload failure is now in the **application layer**, not the reverse proxy.

---

## What We Need to Investigate

Since nginx is forwarding requests correctly, the problem could be:

1. **Authentication failure** - User not authenticated
2. **Backend error** - Upload endpoint returning error
3. **File validation** - Audio file not meeting requirements
4. **Database issue** - Can't create rapat record
5. **Storage issue** - Can't save file to disk/storage
6. **Network/Timeout** - Request timeout or connection drop

---

## Diagnostic Steps

### Step 1: Check What Error You're Getting

**In Browser (Chrome/Firefox/Edge):**

1. Open your app
2. Press **F12** to open Developer Tools
3. Go to **Network** tab
4. Try to upload a file or record audio
5. Look for failed requests
6. **Take a screenshot** of:
   - The request that failed
   - Response status (200, 400, 401, 403, 404, 500, etc)
   - Response body/message

**Common error codes:**
- `401` = Not authenticated (login issue)
- `403` = Not authorized (permission issue)
- `404` = Endpoint not found (routing issue)
- `413` = Payload too large (file size issue)
- `500` = Server error (backend crashed)
- `502` = Bad Gateway (nginx/backend communication)
- `504` = Gateway Timeout (backend too slow)

### Step 2: Check Console for JavaScript Errors

In Browser DevTools:
1. Go to **Console** tab
2. Look for red error messages
3. Screenshot any errors

**Example errors to look for:**
```
Uncaught TypeError: Cannot read property 'x' of undefined
Failed to fetch: ERR_INCOMPLETE_RESPONSE
POST /upload-audio 500 (Internal Server Error)
```

### Step 3: Check Backend Application Logs

**If using Docker:**
```bash
# Find container name/id
docker ps | grep sinopsis

# View logs
docker logs <container-id> --tail 100

# Follow logs in real-time
docker logs <container-id> -f
```

**If running as service:**
```bash
# Check service logs
journalctl -u sinopsis -n 100

# Or if it's npm/node
ps aux | grep node
```

**If running directly:**
- Check if application is even running
- Look for error output in console

### Step 4: Test API Endpoints Directly

```bash
# Test if backend is reachable
curl -v http://10.252.178.50:3000/rapat/create

# Test upload endpoint (should fail without auth, but should reach)
curl -v -X POST http://10.252.178.50:3000/upload-audio \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@test.mp3"

# Test through nginx
curl -v https://sinopsis.bigdata.pens.ac.id/rapat/create

# Test upload through nginx
curl -v -X POST https://sinopsis.bigdata.pens.ac.id/upload-audio \
  -H "Content-Type: multipart/form-data" \
  -F "audio=@test.mp3"
```

### Step 5: Check Application Logs for Permission Errors

Look in application logs for messages like:
```
❌ getCurrentUser returned null
❌ User not authenticated
❌ Permission denied
❌ File too large
❌ Invalid audio format
```

---

## Most Common Issues (in order of likelihood)

### Issue 1: **Authentication Failed** (Most Common)

**Symptoms:**
- Recording/upload starts but fails
- Console shows `401` or `403`
- User says "login works but upload fails"

**Diagnosis:**
```bash
# Check if cookies are being sent
curl -v -b "sinopsis_session=..." https://sinopsis.bigdata.pens.ac.id/upload-audio
```

**Fix in DevTools:**
1. F12 → Application → Cookies
2. Look for `sinopsis_session` cookie
3. Is it there? If not, login again
4. Try recording again

**Code check**: In `/app/routes/upload-audio.tsx`, the action function should NOT require authentication, but it might. Check:
```tsx
export async function action({ request }: { request: Request }) {
  const user = await getCurrentUser(request);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ... rest of code
}
```

### Issue 2: **Backend Not Running**

**Symptoms:**
- `502 Bad Gateway` error
- "Cannot connect to upstream"

**Check:**
```bash
# Is the backend running?
ps aux | grep "node\|npm\|react-router"

# Can you reach it?
curl -v http://10.252.178.50:3000/

# Check if port 3000 is listening
netstat -tlnp | grep 3000
# or
ss -tlnp | grep 3000
```

**Fix:**
```bash
# Restart backend
cd /path/to/app
npm start
# or
docker restart <container-id>
```

### Issue 3: **File Validation Failing**

**Symptoms:**
- Upload starts but fails immediately
- Error: "Audio file is empty" or "Invalid file type"

**Check code** in `/app/routes/upload-audio.tsx`:
```tsx
function validateAudioFile(file: File, buffer: Buffer): { isValid: boolean; error?: string } {
  if (!file || file.size === 0 || buffer.length === 0) {
    return { isValid: false, error: "Audio file is empty" };
  }
  // ... more validation
}
```

**Test with valid file:**
- Try uploading a known good MP3 or WebM file
- Not a recording - actual audio file
- Less than 100MB

### Issue 4: **Database Error**

**Symptoms:**
- Error mentions "database" or "prisma"
- "Cannot create rapat record"

**Backend logs would show:**
```
Error: relation "rapat" does not exist
Error: Invalid foreign key
Error: Database connection failed
```

**Fix:**
```bash
# Ensure database is accessible
# Check connection string in .env
cat /path/to/app/.env | grep DATABASE_URL

# Or run migrations
cd /path/to/app
npx prisma migrate deploy
```

### Issue 5: **Temporary File Directory Permission Issue**

**Symptoms:**
- Error: "EACCES: permission denied"
- "Cannot create temp directory"

**Backend logs would show:**
```
Error: EACCES: permission denied, mkdir '/tmp/sinopsis-uploads'
```

**Fix:**
```bash
# Ensure temp directory exists and has permissions
sudo mkdir -p /tmp/sinopsis-uploads
sudo chmod 777 /tmp/sinopsis-uploads

# Or check in code - might be different directory
grep "tmpdir\|/tmp" /app/routes/rapat/rapat-upload.tsx
```

---

## Complete Debugging Checklist

```
NGINX
  ✅ nginx -t passes
  ✅ systemctl status shows "active (running)"
  ✅ Config includes Connection: "" and proxy_http_version 1.1

BACKEND
  [ ] Is backend running? (ps aux | grep node)
  [ ] Can reach backend directly? (curl http://10.252.178.50:3000)
  [ ] Backend logs show no errors? (docker logs / journalctl)
  [ ] Database is accessible? (prisma validate)

AUTHENTICATION
  [ ] User is logged in? (check cookies in DevTools)
  [ ] sinopsis_session cookie exists?
  [ ] Cookie value looks valid (not empty)?

FILE
  [ ] File is actual audio (not empty)?
  [ ] File size < 100MB?
  [ ] File format is MP3/WebM/WAV?

BROWSER
  [ ] No JavaScript console errors? (F12 → Console)
  [ ] Network tab shows what status? (F12 → Network)
  [ ] Response body shows what error? (click request → Response)

APPLICATION LOGS
  [ ] Check for "Error", "failed", "denied" messages
  [ ] Check for permission/auth messages
  [ ] Check for file validation messages
  [ ] Check for database errors
```

---

## Information I Need From You

To help fix the upload issue, please provide:

1. **Error Message**: What exactly do you see when upload fails?
   - Is it in browser? (screenshot)
   - Is it just "upload failed"?

2. **HTTP Status Code**: What does browser Network tab show?
   - 200, 400, 401, 403, 404, 500, 502, 504?

3. **Response Body**: What's the error message from server?
   - Check Network tab → click failed request → Response tab

4. **Backend Status**: Is the application running?
   ```bash
   docker ps
   # or
   ps aux | grep node
   ```

5. **Backend Logs**: What do logs show?
   ```bash
   # Docker
   docker logs <container> --tail 50
   # Or service
   journalctl -u <service> -n 50
   ```

---

## Quick Test Script

Run this to collect diagnostic info:

```bash
#!/bin/bash
echo "=== DIAGNOSTIC INFO ==="
echo ""
echo "1. Nginx Status:"
sudo systemctl status nginx | head -5
echo ""
echo "2. Backend Running:"
ps aux | grep "node\|npm" | grep -v grep
echo ""
echo "3. Backend Reachable:"
curl -s -o /dev/null -w "%{http_code}\n" http://10.252.178.50:3000/
echo ""
echo "4. Can Connect to Nginx:"
curl -s -o /dev/null -w "%{http_code}\n" https://sinopsis.bigdata.pens.ac.id/
echo ""
echo "5. Nginx Error Log (last 10 lines):"
sudo tail -10 /var/log/nginx/error.log
echo ""
echo "6. Backend Logs (last 20 lines):"
docker logs $(docker ps -q | head -1) --tail 20 2>/dev/null || echo "(not in docker)"
```

---

## Next Steps

1. **Collect the diagnostic info** above
2. **Try one of the test scenarios** from the checklist
3. **Share what you find** (errors, logs, etc)
4. **I'll help identify** what's wrong

**Most uploads fail because**: User not authenticated, backend not running, or file validation error.

Let's find which one it is! 🔍
