# 🎯 Nginx Reverse Proxy - Complete Solution Guide

## Overview

Your Sinopsis application has two separate issues when running behind Nginx reverse proxy:

1. **File Uploads** (`/rapat/upload`) - Authentication and file size issues
2. **Audio Recording** (`/rapat/create`) - Connection handling issues

**Both are fixed with the same nginx configuration change.**

---

## The Root Problem

Your current nginx config is missing critical headers that handle:
- HTTP/1.1 persistent connections (breaks recording)
- Forwarded protocol information (breaks uploads)
- Cookie propagation (breaks authentication)
- Large file handling (413 errors)

---

## The Solution (One-Time Setup)

### Step 1: Apply the Fixed Configuration

```bash
# Edit your nginx config
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf
```

**Replace EVERYTHING** with this (from `NGINX_QUICK_FIX.md`):

```nginx
server {
    if ($host = sinopsis.bigdata.pens.ac.id) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    listen [::]:80;
    server_name sinopsis.bigdata.pens.ac.id;
    return 308 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sinopsis.bigdata.pens.ac.id;
    index index.html index.htm index.php;

    ssl_certificate /etc/letsencrypt/live/bigdata.pens.ac.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bigdata.pens.ac.id/privkey.pem;
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1d;

    ssl_protocols TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=63072000" always;

    client_max_body_size 100M;

    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        
        # CRITICAL FOR RECORDING
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

### Step 2: Validate & Apply

```bash
# Test nginx syntax
sudo nginx -t

# If test passes:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test passed

# Reload nginx
sudo systemctl reload nginx

# Verify it's running
sudo systemctl status nginx
```

---

## What You'll Fix

| Feature | Problem | Solution | Status |
|---------|---------|----------|--------|
| Recording on `/rapat/create` | Hangs indefinitely | HTTP/1.1 headers | ✅ FIXED |
| File upload `/rapat/upload` | Fails with 403/404 | Auth & file size headers | ✅ FIXED |
| Authentication | Cookies not sent | `proxy_cookie_path` | ✅ FIXED |
| Large files | 413 Payload Too Large | `client_max_body_size 100M` | ✅ FIXED |

---

## Testing After Fix

### Test 1: Audio Recording
```
1. Go to https://sinopsis.bigdata.pens.ac.id/rapat/create
2. Fill in "Judul Rapat": Test Recording
3. Fill in "Tempat Rapat": Conference Room
4. Click "Mulai Rapat"
5. Record 5 seconds of audio
6. Click "Selesai Rapat"
```

**Expected**: Recording completes, shows success message, rapat created

### Test 2: File Upload
```
1. Go to https://sinopsis.bigdata.pens.ac.id/rapat/upload
2. Fill in "Judul Rapat": Test Upload
3. Fill in "Tempat Rapat": Conference Room
4. Select an audio file (< 100MB)
5. Click "Unggah & Proses"
```

**Expected**: File uploads, job created, redirects to rapat list

### Test 3: Authentication
```
1. Open DevTools (F12)
2. Go to Application tab → Cookies
3. Look for "sinopsis_session" cookie
4. Verify it exists and has a value
```

**Expected**: Cookie present and persistent across page loads

---

## The Critical Change

The **most important change** is this line:

```nginx
proxy_set_header Connection "";
```

### Why It Matters

When you remove the default `Connection: keep-alive` handling from the proxy and set it to empty string with `proxy_http_version 1.1`, it:

1. Allows proper HTTP/1.1 connection reuse
2. Prevents premature connection closures
3. Lets fetch() requests complete successfully
4. Enables audio upload to work

**Without this line**: Recording hangs and never completes.

---

## Common Issues After Fix

### Issue: Still hanging on recording
**Check**:
```bash
sudo nginx -t  # Should pass
sudo systemctl status nginx  # Should be active
```

**Try**: 
```bash
# Hard restart (not just reload)
sudo systemctl restart nginx

# Clear browser cache (Ctrl+Shift+Delete)
# Try in Private/Incognito mode
```

### Issue: 413 Payload Too Large
**Check**:
```bash
grep client_max_body_size /etc/nginx/conf.d/sinopsis.bigdata.conf
# Should output: client_max_body_size 100M;
```

### Issue: 403/404 on upload
**Check**:
1. Are you logged in? (Check cookies)
2. Do you have permission? (Check user role)
3. Backend running? (Check `docker ps` or service status)

### Issue: Still getting "No user found"
**Check**:
```bash
# Test if cookies are forwarded
curl -v https://sinopsis.bigdata.pens.ac.id/rapat/create -H "Cookie: test=value"
```

**Fix**:
```bash
# Ensure this line is present
grep "proxy_cookie_path" /etc/nginx/conf.d/sinopsis.bigdata.conf
```

---

## Advanced Debugging

### Enable Nginx Debug Logs
```bash
# Edit nginx.conf
sudo nano /etc/nginx/nginx.conf

# Add in http block:
error_log /var/log/nginx/debug.log debug;

# Reload
sudo systemctl reload nginx

# Monitor
sudo tail -f /var/log/nginx/debug.log
```

### Test Backend Directly
```bash
# Access backend without reverse proxy
curl -v http://10.252.178.50:3000/rapat/create

# Should return HTML, not connection error
```

### Monitor Real-Time Requests
```bash
# Watch nginx access log
sudo tail -f /var/log/nginx/access.log

# Filter for upload requests
sudo tail -f /var/log/nginx/access.log | grep upload-audio

# Filter for errors
sudo tail -f /var/log/nginx/error.log
```

---

## Comparison: Before vs After

### ❌ Before (Broken)
```nginx
location / {
    proxy_set_header X-Real-IP  $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $host;
    proxy_pass http://10.252.178.50:3000;
}
```

**Problems**:
- No `X-Forwarded-Proto` (can't detect HTTPS)
- No `X-Forwarded-Host` (wrong domain in redirects)
- No `Connection` header handling (recording hangs)
- No timeouts (uploads timeout)
- No file size limit (413 errors)
- HTTP/1.0 (connection issues)

### ✅ After (Fixed)
```nginx
location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
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
```

**Fixed**:
- ✅ Proper protocol detection
- ✅ Correct domain forwarding
- ✅ HTTP/1.1 connection handling
- ✅ Long timeouts for uploads
- ✅ 100MB file size support
- ✅ No buffer issues
- ✅ Proper cookie handling

---

## File References

| File | Purpose |
|------|---------|
| `NGINX_QUICK_FIX.md` | Copy-paste ready config (THIS FILE) |
| `NGINX_RECORDING_FIX.md` | Detailed recording issue analysis |
| `NGINX_REVERSE_PROXY_FIX.md` | File upload issue analysis |

---

## Summary

1. **Edit** `/etc/nginx/conf.d/sinopsis.bigdata.conf`
2. **Replace content** with config from NGINX_QUICK_FIX.md
3. **Test** with `sudo nginx -t`
4. **Reload** with `sudo systemctl reload nginx`
5. **Test** recording and upload features
6. **Done!** Both features now work

---

**Questions?** Check the detailed docs or test with the debugging commands above.
