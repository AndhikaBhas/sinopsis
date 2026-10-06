# 🔧 SSL Certificate & Upload Error - Complete Fix

## Problem Analysis

Your nginx won't start because of certificate path issues:

```
BIO_new_file("/etc/letsencrypt/live/bigdata.pens.ac.id/fullchain.pem") failed
```

**Translation**: The certificate file path is wrong or doesn't exist.

---

## Solution: Check Your Actual Certificate

The certificate is likely under `pens.ac.id` (not `bigdata.pens.ac.id`).

### What You Need to Find Out

Ask your system administrator or check:

```bash
# Which certificate path do you actually have?
sudo ls /etc/letsencrypt/live/
```

**Most likely scenarios:**

1. **Certificate is under `pens.ac.id`** (wildcard cert for all subdomains)
   - Path: `/etc/letsencrypt/live/pens.ac.id/`
   - Files: `fullchain.pem`, `privkey.pem`

2. **Certificate is under `bigdata.pens.ac.id`** (specific subdomain)
   - Path: `/etc/letsencrypt/live/bigdata.pens.ac.id/`
   - Files: `fullchain.pem`, `privkey.pem`

3. **Certificate doesn't exist yet**
   - Need to generate new certificate

---

## Quick Fix Guide

### Option A: Certificate Under `pens.ac.id` (Most Common)

If the directory `/etc/letsencrypt/live/pens.ac.id/` exists:

**Edit your nginx config:**
```bash
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf
```

**Find these lines:**
```nginx
ssl_certificate /etc/letsencrypt/live/bigdata.pens.ac.id/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/bigdata.pens.ac.id/privkey.pem;
```

**Replace with:**
```nginx
ssl_certificate /etc/letsencrypt/live/pens.ac.id/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/pens.ac.id/privkey.pem;
```

**Save:** Ctrl+O, Enter, Ctrl+X

**Test:**
```bash
sudo nginx -t
```

If it says `test passed`, reload:
```bash
sudo systemctl reload nginx
```

---

### Option B: Use HTTP Instead (For Testing)

If you want to test without SSL temporarily:

**Edit config:**
```bash
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf
```

**Replace ENTIRE server block with:**
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sinopsis.bigdata.pens.ac.id;

    client_max_body_size 100M;

    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-Host $server_name;
        
        proxy_set_header Connection "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_http_version 1.1;
        
        proxy_cookie_path / /;
        
        proxy_set_header Content-Type $content_type;
        proxy_set_header Content-Length $content_length;
        
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        proxy_buffering off;
        proxy_request_buffering off;
        
        proxy_cache_bypass $http_upgrade;

        proxy_pass http://10.252.178.50:3000;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

**Save:** Ctrl+O, Enter, Ctrl+X

**Test:**
```bash
sudo nginx -t
```

**Reload:**
```bash
sudo systemctl reload nginx
```

**Access app at:** `http://sinopsis.bigdata.pens.ac.id` (not https)

---

### Option C: Generate New Certificate

If the certificate doesn't exist:

```bash
# Generate certificate for subdomain
sudo certbot certonly --standalone -d sinopsis.bigdata.pens.ac.id

# Or generate wildcard certificate
sudo certbot certonly --dns-manual -d "*.bigdata.pens.ac.id"

# Then reload nginx
sudo systemctl reload nginx
```

---

## Step-by-Step Instructions

### Step 1: Check Which Option Applies to You

Run one of these to see your certificates:

```bash
# List all certificates
sudo ls /etc/letsencrypt/live/

# Most likely output shows one of:
# - pens.ac.id
# - bigdata.pens.ac.id
# - some.other.domain
```

### Step 2: Based on Result, Choose Your Fix

**If you see `pens.ac.id`:**
→ Use **Option A** above

**If you see nothing / empty list:**
→ Use **Option C** to generate certificate

**If you just want to test quickly without SSL:**
→ Use **Option B** above

### Step 3: Apply the Fix

```bash
# Edit
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf

# Paste correct config

# Test
sudo nginx -t

# If "test passed", reload
sudo systemctl reload nginx
```

### Step 4: Verify

```bash
# Check nginx is running
sudo systemctl status nginx

# Should show: active (running)
```

### Step 5: Test Upload & Recording

1. Open browser to your app
2. Go to `/rapat/create`
3. Try recording audio
4. Go to `/rapat/upload`
5. Try uploading file

---

## If You Still Get Errors

### Error: Still "Permission denied" on certificate

```bash
# Fix permissions
sudo chmod 755 /etc/letsencrypt/live/
sudo chmod 755 /etc/letsencrypt/live/*/
sudo chmod 644 /etc/letsencrypt/live/*/fullchain.pem
sudo chmod 644 /etc/letsencrypt/live/*/privkey.pem

# Test again
sudo nginx -t
```

### Error: "no such file or directory"

```bash
# Verify certificate exists
sudo ls -la /etc/letsencrypt/live/pens.ac.id/fullchain.pem

# If not found, generate it
sudo certbot certonly --standalone -d sinopsis.bigdata.pens.ac.id
```

### Error: Nginx still won't start

```bash
# See detailed errors
sudo journalctl -u nginx -n 20

# Or check error log
sudo tail -20 /var/log/nginx/error.log

# Try restarting
sudo systemctl restart nginx
```

---

## After SSL is Fixed, Recording Still Not Working?

If nginx starts fine but recording still fails:

1. **Check browser console:**
   - F12 → Console tab
   - Any errors? Screenshot helps

2. **Check browser Network tab:**
   - F12 → Network tab
   - Try recording
   - Look for `/upload-audio` request
   - What's the HTTP status? (200, 404, 500, etc?)

3. **Check backend logs:**
   - If using Docker: `docker logs <container-id>`
   - If using systemd: `journalctl -u your-service -n 50`

4. **Test direct backend access:**
   ```bash
   # Can you reach backend directly?
   curl -v http://10.252.178.50:3000/rapat/create
   ```

---

## Summary

1. **Find your certificate path**
   ```bash
   sudo ls /etc/letsencrypt/live/
   ```

2. **Update nginx config with correct path**
   - If `pens.ac.id` exists → use `/etc/letsencrypt/live/pens.ac.id/`
   - If nothing exists → generate new cert or use HTTP

3. **Test & reload**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Test app**
   - Recording on `/rapat/create`
   - Upload on `/rapat/upload`

---

**What to tell me:**
- What does `sudo ls /etc/letsencrypt/live/` show?
- Does nginx start now with your changes?
- If recording still fails, what error in browser console?
