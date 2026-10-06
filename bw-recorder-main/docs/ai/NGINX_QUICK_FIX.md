# 🚀 QUICK FIX: Nginx Configuration for Recording & Uploads

## Copy-Paste Ready Configuration

Replace your entire server block with this:

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
        
        # CRITICAL FOR RECORDING - DO NOT REMOVE
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

## Installation Steps

```bash
# 1. Edit config file
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf

# 2. Replace content with config above, then save (Ctrl+O, Enter, Ctrl+X)

# 3. Test syntax
sudo nginx -t

# 4. If test passes, reload nginx
sudo systemctl reload nginx

# 5. Verify status
sudo systemctl status nginx
```

## What This Fixes

| Issue | Route | Status |
|-------|-------|--------|
| File uploads fail | `/rapat/upload` | ✅ FIXED |
| Audio recording hangs | `/rapat/create` | ✅ FIXED |
| Cookies not forwarded | All routes | ✅ FIXED |
| 413 Payload Too Large | `/rapat/upload` | ✅ FIXED |

## Expected Results After Fix

✅ **Recording on `/rapat/create`**:
- Click "Mulai Rapat" → records audio
- Click "Selesai Rapat" → uploads and creates record
- Status shows on `/rapat` list

✅ **File uploads on `/rapat/upload`**:
- Drag & drop audio file
- Click "Unggah & Proses"
- File uploads successfully

✅ **Authentication**:
- Login/logout works
- Session persists across pages
- Cookies visible in DevTools

## Debugging (If Still Issues)

### Test 1: Check nginx syntax
```bash
sudo nginx -t
```
Expected: `configuration file ... test passed`

### Test 2: Test direct upload
```bash
curl -v https://sinopsis.bigdata.pens.ac.id/rapat/upload
```
Expected: HTTP response (not connection refused)

### Test 3: Check nginx logs
```bash
sudo tail -20 /var/log/nginx/error.log
```
Expected: No errors related to your domain

### Test 4: Restart nginx fully
```bash
sudo systemctl restart nginx
```

## Key Configuration Highlights

🔴 **CRITICAL**: `proxy_set_header Connection "";`
- This is the main fix for recording hangs
- Allows HTTP/1.1 keep-alive to work properly

🔴 **CRITICAL**: `proxy_http_version 1.1;`
- Required for Connection header to work
- Fixes fetch() timeouts

🟡 **IMPORTANT**: `client_max_body_size 100M;`
- Matches your app's 100MB upload limit
- Without this: 413 Payload Too Large error

🟡 **IMPORTANT**: `proxy_read_timeout 300s;`
- Allows 5 minutes for uploads
- Default 60s too short for large files

## Common Errors & Solutions

### Error: "nginx: [emerg] invalid number of arguments in..."
**Cause**: Regex syntax in `proxy_cookie_domain`
**Solution**: Use the fixed config above (no regex)

### Error: "connection refused"
**Cause**: Backend not running
**Solution**: Verify `http://10.252.178.50:3000` is accessible

### Error: "413 Payload Too Large"
**Cause**: `client_max_body_size` too small
**Solution**: Ensure it's set to `100M`

### Browser shows: "Recording... (hanging)"
**Cause**: Connection header issue
**Solution**: Add `proxy_set_header Connection "";` and `proxy_http_version 1.1;`

### Browser shows: "ERR_INCOMPLETE_RESPONSE"
**Cause**: Buffering issues
**Solution**: Ensure both buffering lines are set to `off`

## File Locations

- Config: `/etc/nginx/conf.d/sinopsis.bigdata.conf`
- Error logs: `/var/log/nginx/error.log`
- Access logs: `/var/log/nginx/access.log`
- Nginx main: `/etc/nginx/nginx.conf`

## Still Having Issues?

1. Check detailed documentation:
   - [NGINX_REVERSE_PROXY_FIX.md](./NGINX_REVERSE_PROXY_FIX.md) - File uploads
   - [NGINX_RECORDING_FIX.md](./NGINX_RECORDING_FIX.md) - Audio recording

2. Check browser DevTools:
   - Console tab for JavaScript errors
   - Network tab for HTTP status
   - Application tab for cookies

3. Collect logs:
   ```bash
   # All nginx errors
   sudo journalctl -u nginx -n 50

   # Backend application errors
   docker logs <container> -n 50  # if using Docker
   ```

4. Test backend directly:
   ```bash
   # Access backend without proxy
   curl -v http://10.252.178.50:3000/rapat/create
   ```

---

**Need help?** Check the detailed fix documents above or test the configuration step by step.
