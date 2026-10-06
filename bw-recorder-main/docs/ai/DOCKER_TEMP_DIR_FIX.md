# 🐳 Docker Container Issue: Missing Temp Directory

## Problem

The `/tmp/sinopsis-uploads` directory doesn't exist **inside the Docker container**. This directory is created when the app tries to save uploaded files, but it doesn't have the right permissions.

## Solution: Create Directory in Docker

Since you're running the app in Docker, you need to create the directory **inside the container**.

### Option 1: Create Directory in Docker Container (Recommended)

```bash
# Find your container ID or name
docker ps | grep -i sinopsis

# You should see something like:
# 1234567 sinopsis-app:latest ... Up

# Create the directory inside the container
docker exec <container-id> mkdir -p /tmp/sinopsis-uploads
docker exec <container-id> chmod 777 /tmp/sinopsis-uploads

# Verify it was created
docker exec <container-id> ls -la /tmp/sinopsis-uploads
```

**Example:**
```bash
docker exec sinopsis-app mkdir -p /tmp/sinopsis-uploads
docker exec sinopsis-app chmod 777 /tmp/sinopsis-uploads
```

### Option 2: Add to Dockerfile (Permanent Fix)

If you want the directory to be created automatically every time the container starts, add this to your Dockerfile:

```dockerfile
# In your Dockerfile, add after the COPY commands:

RUN mkdir -p /tmp/sinopsis-uploads && chmod 777 /tmp/sinopsis-uploads
```

**Then rebuild:**
```bash
docker build -t sinopsis-recorder:latest .
docker-compose up --force-recreate  # if using docker-compose
# or
docker run -d <your-other-flags> sinopsis-recorder:latest
```

### Option 3: Create Volume Mount (Best for Production)

Use Docker volumes to persist uploads:

**If using docker-compose:**

```yaml
services:
  sinopsis:
    image: sinopsis-recorder:latest
    ports:
      - "3000:3000"
    volumes:
      - sinopsis-uploads:/tmp/sinopsis-uploads
    environment:
      - DATABASE_URL=postgresql://...
      # ... other env vars

volumes:
  sinopsis-uploads:
    driver: local
```

**Then run:**
```bash
docker-compose up -d
```

**If using docker run:**
```bash
docker run -d \
  -p 3000:3000 \
  -v sinopsis-uploads:/tmp/sinopsis-uploads \
  -e DATABASE_URL="postgresql://..." \
  sinopsis-recorder:latest
```

---

## Step-by-Step Fix (Right Now)

### Step 1: Find Your Container

```bash
docker ps | grep -i sinopsis
```

**Note the CONTAINER ID or NAME**

### Step 2: Create Directory Inside Container

```bash
docker exec <CONTAINER_ID> mkdir -p /tmp/sinopsis-uploads
docker exec <CONTAINER_ID> chmod 777 /tmp/sinopsis-uploads
```

**Example:**
```bash
docker exec 1234567890ab mkdir -p /tmp/sinopsis-uploads
docker exec 1234567890ab chmod 777 /tmp/sinopsis-uploads
```

### Step 3: Verify

```bash
docker exec <CONTAINER_ID> ls -la /tmp/sinopsis-uploads
```

**Should show:** `drwxrwxrwx` (all permissions set)

### Step 4: Test Upload

1. Open browser to your app
2. Go to `/rapat/upload`
3. Try uploading a small audio file
4. Should work now! ✅

---

## If Still Failing After Creating Directory

Check the app logs inside Docker:

```bash
# View logs
docker logs <CONTAINER_ID> --tail 100

# Watch live logs
docker logs <CONTAINER_ID> -f

# Look for errors like:
# - "EACCES: permission denied"
# - "Cannot create directory"
# - "File not found"
```

---

## Alternative: Change Directory in Code

If you can't create directories in Docker easily, you can change where files are saved:

**In `/app/routes/rapat/rapat-upload.tsx` (line ~94):**

```tsx
// Current (line 94):
const tempDir = path.join(tmpdir(), "sinopsis-uploads");

// Change to:
const tempDir = path.join(process.cwd(), "uploads");
```

Then the files will be saved in the app's working directory instead of `/tmp`.

---

## Quick Reference

```bash
# Find container
docker ps | grep sinopsis

# Create directory
docker exec <ID> mkdir -p /tmp/sinopsis-uploads
docker exec <ID> chmod 777 /tmp/sinopsis-uploads

# Verify
docker exec <ID> ls -la /tmp/sinopsis-uploads

# View logs
docker logs <ID> -f

# Test
# Go to https://sinopsis.bigdata.pens.ac.id/rapat/upload
# Try uploading
```

---

## Next Steps

1. **Run the docker exec commands** above
2. **Try uploading** a file
3. **Check logs** if it still fails

That should fix the issue! 🚀
