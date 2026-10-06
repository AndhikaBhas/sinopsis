# 🎯 Summary: Why Recording Fails & How to Fix It

## The Problem

Your audio recording on `/rapat/create` hangs indefinitely when behind Nginx reverse proxy because:

1. **Missing `Connection` header handling** (most critical)
2. **Wrong HTTP version** (HTTP/1.0 instead of 1.1)
3. **Missing protocol forwarding** (`X-Forwarded-Proto`)
4. **Connection gets dropped** during fetch request

When you click "Mulai Rapat", the frontend:
1. Records audio ✅
2. Creates FormData with audio blob ✅
3. Calls `fetch("/upload-audio", { method: "POST", body: formData })` 
4. Waits for response... **⏳ NEVER COMES** ❌
5. Connection timeout after 30 seconds

## The Root Cause

Your nginx configuration doesn't preserve HTTP/1.1 connections properly, so when the browser makes a fetch request:

```
Browser → Nginx → Backend Server
                  ✅ Request received
Nginx closes connection (wrong headers)
Browser waits... forever
Backend sends response → Nginx has no connection
Browser timeout → Error
```

## The One-Line Fix

Add this to your nginx `location /` block:

```nginx
proxy_set_header Connection "";
proxy_http_version 1.1;
```

This tells nginx:
- Use HTTP/1.1 protocol (not 1.0)
- Let browser and backend manage connections directly
- Don't forcefully close connections after each request

## Complete Fixed Config

Replace your entire server block in `/etc/nginx/conf.d/sinopsis.bigdata.conf` with:

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

    # NEW: Allow 100MB uploads
    client_max_body_size 100M;

    location / {
        # Standard headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;

        # ⭐ CRITICAL FIX - These two lines fix recording
        proxy_set_header Connection "";
        proxy_http_version 1.1;
        
        # For protocol upgrades
        proxy_set_header Upgrade $http_upgrade;

        # Cookie handling
        proxy_cookie_path / /;

        # Preserve body headers
        proxy_set_header Content-Type $content_type;
        proxy_set_header Content-Length $content_length;

        # Timeouts for large uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # Don't buffer streams
        proxy_buffering off;
        proxy_request_buffering off;

        # Cache bypass
        proxy_cache_bypass $http_upgrade;

        # Backend server
        proxy_pass http://10.252.178.50:3000;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

## Apply It Now

```bash
# 1. Backup current config
sudo cp /etc/nginx/conf.d/sinopsis.bigdata.conf{,.backup}

# 2. Edit
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf

# 3. Copy entire config above, paste in editor, save

# 4. Test
sudo nginx -t

# 5. If OK, reload
sudo systemctl reload nginx

# 6. Verify
sudo systemctl status nginx
```

## What Gets Fixed

✅ Recording on `/rapat/create` - stops hanging
✅ File uploads on `/rapat/upload` - work properly
✅ Authentication - cookies forwarded correctly
✅ Large files - 100MB limit supported

## Test It

1. Visit: `https://sinopsis.bigdata.pens.ac.id/rapat/create`
2. Fill form:
   - Judul Rapat: "Test"
   - Tempat Rapat: "Room A"
3. Click "Mulai Rapat"
4. Record 5 seconds
5. Click "Selesai Rapat"
6. **Should complete in seconds** (was hanging before)

## Still Doesn't Work?

Check nginx:
```bash
sudo nginx -t          # Should say "test passed"
sudo systemctl status nginx  # Should show "active (running)"
sudo tail -20 /var/log/nginx/error.log  # Any errors?
```

Test backend:
```bash
curl -v http://10.252.178.50:3000/rapat/create  # Should respond
```

Check browser:
- F12 → Network tab → check `/upload-audio` requests
- F12 → Console tab → any JavaScript errors?

## Why This Works

The two critical lines:
```nginx
proxy_set_header Connection "";  # Allow persistent connections
proxy_http_version 1.1;          # Use HTTP/1.1 protocol
```

Tell Nginx to:
1. Not override the Connection header from browser
2. Use HTTP/1.1 which supports persistent connections
3. Keep the connection open for the entire fetch operation
4. Return the response back to browser before closing

Without these, Nginx drops the connection prematurely and the browser times out.

---

**That's it!** One config change fixes both recording and uploads. Apply it and you're done.
