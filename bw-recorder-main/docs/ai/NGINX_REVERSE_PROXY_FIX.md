# Nginx Reverse Proxy Configuration for Sinopsis

## Problems Identified

### 1. File Uploads to `/rapat/upload` not working
- Missing proxy headers (X-Forwarded-*)
- Incorrect cookie handling
- Missing file upload size limits
- Missing proxy timeouts

### 2. Audio Recording on `/rapat/create` not working (NEW)
- Missing `Connection` header handling (CRITICAL)
- Fetch requests timeout
- HTTP protocol version issues
- Request body headers not preserved

**See also**: [NGINX_RECORDING_FIX.md](./NGINX_RECORDING_FIX.md) for detailed recording fix

## Solution: Corrected Nginx Configuration

Replace your current location block with this corrected configuration:

```nginx
server {
    if ($host = sinopsis.bigdata.pens.ac.id) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen       80;
    listen       [::]:80;
    server_name  sinopsis.bigdata.pens.ac.id;
    return 308 https://$host$request_uri;
}

# Settings for a TLS enabled server.
server {
    listen       443 ssl http2;
    listen       [::]:443 ssl http2;
    server_name  sinopsis.bigdata.pens.ac.id;
    index index.html index.htm index.php;
    
    ssl_certificate /etc/letsencrypt/live/bigdata.pens.ac.id/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/bigdata.pens.ac.id/privkey.pem; # managed by Certbot
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout  1d;

    ssl_protocols TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # HSTS (ngx_http_headers_module is required) (63072000 seconds)
    add_header Strict-Transport-Security "max-age=63072000" always;

    # ✅ CRITICAL: Allow large file uploads (100MB to match app limit)
    client_max_body_size 100M;

    location / {
        # ✅ CRITICAL: Forward all required proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;

        # ✅ CRITICAL: Preserve cookies properly
        proxy_cookie_path / /;

        # ✅ IMPORTANT: Set timeouts for large file uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # ✅ IMPORTANT: Don't buffer to avoid memory issues with large files
        proxy_buffering off;
        proxy_request_buffering off;

        # Proxy pass to backend
        proxy_pass http://10.252.178.50:3000;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

## Key Changes Made

### 1. **Added `client_max_body_size 100M;`**
   - **Why**: Your app accepts files up to 100MB (see `rapat-upload.tsx`)
   - **Without this**: Nginx will reject files larger than the default 1MB
   - **Error you'd see**: `413 Payload Too Large`

### 2. **Added `X-Forwarded-Proto` and `X-Forwarded-Host`**
   - **Why**: Your app needs to know the real protocol (https) and hostname
   - **Without this**: Redirects might use wrong protocol/domain
   - **Impact**: Cookie domain validation, login redirects, etc.

### 3. **Fixed `proxy_cookie_path` (removed regex)**
   - **Why**: Simple path rewriting doesn't need regex
   - **Old syntax**: `proxy_cookie_domain ~ ^(.*)$ "$host";` ❌ INVALID
   - **New syntax**: `proxy_cookie_path / /;` ✅ CORRECT
   - **What it does**: Maps backend path `/` to frontend path `/`

### 4. **Added timeout settings**
   - **`proxy_connect_timeout 300s`**: Wait up to 5 min for backend to connect
   - **`proxy_send_timeout 300s`**: Wait up to 5 min for backend to receive data
   - **`proxy_read_timeout 300s`**: Wait up to 5 min for backend to send response
   - **Why**: Default is 60s, which is too short for large file uploads

### 5. **Added buffering settings**
   - **`proxy_buffering off`**: Don't buffer response in Nginx (send directly)
   - **`proxy_request_buffering off`**: Don't buffer request body
   - **Why**: Avoids memory issues with large files

## How to Apply

1. **Edit your nginx config** (likely at `/etc/nginx/conf.d/sinopsis.bigdata.conf`):
   ```bash
   sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf
   ```

2. **Replace the `location /` block** with the corrected version above

3. **Test the configuration**:
   ```bash
   sudo nginx -t
   ```
   
   You should see:
   ```
   nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
   nginx: configuration file /etc/nginx/nginx.conf test passed
   ```

4. **Reload nginx**:
   ```bash
   sudo systemctl reload nginx
   ```

5. **Verify it's running**:
   ```bash
   sudo systemctl status nginx
   ```

## Testing the Fix

1. **Test authentication works**:
   - Try logging in to the app
   - Check browser DevTools → Application → Cookies
   - Verify `sinopsis_session` cookie is present

2. **Test file upload**:
   - Go to `/rapat/upload`
   - Try uploading a small audio file first (< 5MB)
   - Check browser Network tab to see if request succeeds
   - Check server logs for any errors

3. **Debug if still failing**:
   ```bash
   # Check nginx error log
   sudo tail -f /var/log/nginx/error.log
   
   # Check backend app logs
   docker logs <container-id>  # or your backend log method
   ```

## Common Issues After Fix

### Issue: "413 Payload Too Large"
- **Cause**: `client_max_body_size` not set correctly
- **Fix**: Make sure it's `100M` and check there are no conflicting settings

### Issue: Cookies still not working
- **Cause**: SameSite or Secure flags
- **Check**: Browser console for cookie warnings
- **Fix**: Ensure HTTPS is working (which it should be with your SSL cert)

### Issue: Still getting permission denied on error.log
- **Cause**: Running nginx without sudo privileges
- **Fix**: Run with `sudo` when testing: `sudo nginx -t`

## Reference

For more details on proxy headers:
- [Nginx proxy_set_header documentation](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)
- [Nginx proxy_cookie_path documentation](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cookie_path)
