# 🎯 Upload Failed - Most Likely Causes & Solutions

## Current Status
✅ Nginx is running and forwarding requests correctly
❌ Upload/Recording is still failing

This means the issue is in the **application layer**, not the reverse proxy.

---

## Most Likely Issues (in order)

### Issue #1: **Backend Application Not Running** (40% probability)

**Check if backend is running:**

```bash
# Check if application process exists
ps aux | grep -i "node\|npm\|react" | grep -v grep

# Check if port 3000 is listening
lsof -i :3000
# or
netstat -tlnp | grep 3000
```

**If NOT running:**

```bash
# Navigate to app directory
cd /home/syauqi/sinopsis-recorder

# Start the application
npm start

# Or if using Docker
docker ps
docker restart <container-id>
```

**Expected output:**
```
🚀 Server running on port 3000
Server listening...
Application started
```

---

### Issue #2: **Cannot Create Temp Directory** (30% probability)

**The app saves files to `/tmp/sinopsis-uploads` but might not have permission.**

**Check:**
```bash
# Does the directory exist?
ls -la /tmp/sinopsis-uploads

# What are the permissions?
stat /tmp/sinopsis-uploads

# Can the app write to it?
sudo touch /tmp/sinopsis-uploads/test.txt
ls /tmp/sinopsis-uploads/test.txt
```

**If it fails, fix permissions:**

```bash
# Create directory with proper permissions
sudo mkdir -p /tmp/sinopsis-uploads
sudo chmod 777 /tmp/sinopsis-uploads

# Verify
ls -la /tmp/sinopsis-uploads
```

**Or change in code** (`/app/routes/rapat/rapat-upload.tsx` line 94):

```tsx
// Instead of /tmp/sinopsis-uploads, use a different directory
const tempDir = path.join(process.cwd(), "uploads", "temp");
await fs.mkdir(tempDir, { recursive: true });
```

---

### Issue #3: **Database Connection Failed** (15% probability)

**The app can't connect to the database when creating the rapat record.**

**Check:**
```bash
# Look at .env file for database URL
cat /home/syauqi/sinopsis-recorder/.env | grep DATABASE_URL

# Can you connect to database?
psql $DATABASE_URL -c "SELECT 1"

# Check if database service is running
systemctl status postgresql
# or
systemctl status postgres
```

**If database is down:**

```bash
# Restart database
sudo systemctl restart postgresql

# Or verify it's running
sudo systemctl status postgresql
```

**If DATABASE_URL is missing:**

```bash
# Check .env file
nano /home/syauqi/sinopsis-recorder/.env

# Should contain:
# DATABASE_URL="postgresql://user:password@host:5432/dbname"
```

---

### Issue #4: **User Not Authenticated** (10% probability)

This would show a 401 error, but let's verify anyway.

**In Browser DevTools:**
1. Open DevTools (F12)
2. Go to **Application** tab
3. Go to **Cookies**
4. Look for `sinopsis_session` cookie
5. Is it there? Does it have a value?

**If NO cookie:**
- You're not logged in
- Login first, then try upload

**If YES cookie:**
- Copy the cookie value
- Test directly:
```bash
curl -b "sinopsis_session=<paste-cookie-value>" \
  https://sinopsis.bigdata.pens.ac.id/rapat/create
```

---

### Issue #5: **File Too Large or Invalid Format** (5% probability)

**The upload validation is rejecting your file.**

**Check file requirements:**
- File size: < 100MB
- Format: MP3, WebM, WAV, M4A, etc.
- Not corrupted or empty

**Test with a valid file:**

```bash
# Test upload with curl
curl -X POST \
  -F "audio=@/path/to/valid-audio.mp3" \
  https://sinopsis.bigdata.pens.ac.id/upload-audio

# What response do you get?
# 200 = Success
# 400 = Invalid file
# 401 = Not authenticated
# 500 = Server error
```

---

## Step-by-Step Diagnosis

### Step 1: Verify Backend is Running

```bash
# Check if running
ps aux | grep node

# If not, start it
cd /home/syauqi/sinopsis-recorder
npm start &

# Wait 10 seconds for startup
sleep 10

# Test if it responds
curl -v http://localhost:3000/

# Should return HTML or 200 status
```

### Step 2: Verify Temp Directory

```bash
# Create and fix permissions
sudo mkdir -p /tmp/sinopsis-uploads
sudo chmod 777 /tmp/sinopsis-uploads

# Test write permission
touch /tmp/sinopsis-uploads/test.txt && echo "✅ OK" || echo "❌ Failed"
```

### Step 3: Verify Database Connection

```bash
# Test database is accessible
cd /home/syauqi/sinopsis-recorder

# Run Prisma validation
npx prisma db push

# Should not error out
```

### Step 4: Test Upload Through Nginx

```bash
# Try upload through reverse proxy
curl -v -X POST \
  -F "judul=Test" \
  -F "tempat_rapat=Room" \
  -F "audio=@test.mp3" \
  https://sinopsis.bigdata.pens.ac.id/rapat/upload

# Check response (200, 400, 500, etc)
```

### Step 5: Check Application Logs

**If using Docker:**
```bash
# Find container
docker ps

# View logs
docker logs <container-id> --tail 100

# Watch live
docker logs <container-id> -f
```

**If using systemd service:**
```bash
# View logs
journalctl -u sinopsis -n 100

# Watch live
journalctl -u sinopsis -f
```

**Look for messages like:**
```
Error:
Failed:
Permission:
Cannot:
Upload:
Unauthorized:
```

---

## Quick Checklist

```
☐ Backend running? (ps aux | grep node)
☐ Can reach backend? (curl http://localhost:3000)
☐ Temp dir writable? (touch /tmp/sinopsis-uploads/test.txt)
☐ Database working? (npx prisma db push)
☐ User logged in? (check cookies in DevTools)
☐ File valid? (< 100MB, MP3/WebM, not corrupted)
☐ Nginx logs show no errors? (sudo tail -20 /var/log/nginx/error.log)
☐ App logs show no errors? (docker logs <id> | grep -i error)
```

---

## What Information Do You Need To Give Me?

To help fix this, please run and share:

```bash
# 1. Is backend running?
ps aux | grep -i "node\|npm" | grep -v grep

# 2. Can backend accept connections?
curl -v http://localhost:3000/

# 3. Do temp directories exist?
ls -la /tmp/sinopsis-uploads

# 4. What's in the error log?
sudo tail -50 /var/log/nginx/error.log

# 5. Backend logs (if Docker)
docker logs <container-id> --tail 100

# 6. The EXACT error you see when upload fails
# (screenshot of browser Network tab or console)
```

---

## Most Common Quick Fixes

### Fix 1: Restart Everything
```bash
# Stop app
pkill -f "node\|npm"

# Fix permissions
sudo chmod 777 /tmp/sinopsis-uploads

# Restart app
cd /home/syauqi/sinopsis-recorder
npm start &

# Wait 10 seconds
sleep 10

# Try upload again
```

### Fix 2: Create Missing Directory
```bash
sudo mkdir -p /tmp/sinopsis-uploads
sudo chmod 777 /tmp/sinopsis-uploads
```

### Fix 3: Reload Nginx
```bash
sudo systemctl reload nginx
sudo systemctl restart nginx
```

### Fix 4: Restart Everything
```bash
# Restart all services
sudo systemctl restart nginx
docker restart $(docker ps -q)
# or
cd /home/syauqi/sinopsis-recorder && npm start &
```

---

## What's Likely NOT the Problem

✅ Nginx - We verified it's working
✅ SSL Certificates - Nginx test passes
✅ Proxy headers - We fixed these already
✅ Connection handling - Fixed with proxy_http_version 1.1

---

## Next Action

**Tell me:**

1. What happens when you try to upload?
   - Does recording start?
   - Does it hang? For how long?
   - What's the final error?

2. Check browser DevTools Network tab:
   - What's the HTTP status code?
   - 200? 400? 404? 500? 502?
   - What's in the response?

3. Run diagnostic commands above and share output

4. Is backend running?
   ```bash
   ps aux | grep node
   ```

5. Can you see error logs?
   ```bash
   docker logs <id> 2>&1 | tail -50
   # or
   journalctl -u sinopsis -n 50
   ```

Once you provide this info, I can give you the exact fix! 🎯
