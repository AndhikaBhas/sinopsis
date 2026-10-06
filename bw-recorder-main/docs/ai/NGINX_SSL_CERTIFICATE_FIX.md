# 🔧 Nginx SSL Certificate Error - Diagnostic & Fix

## The Error You Got

```
BIO_new_file("/etc/letsencrypt/live/bigdata.pens.ac.id/fullchain.pem") failed
(SSL: error:0200100D:system library:fopen:Permission denied
```

This means:
1. ❌ SSL certificate path is wrong OR
2. ❌ Certificate file doesn't exist OR
3. ❌ Permission issues on certificate files

## Step 1: Find Your Actual Certificate Path

Run these commands:

```bash
# List all certificates
sudo ls -la /etc/letsencrypt/live/

# You should see something like:
# drwxr-xr-x 2 root root  ... pens.ac.id
# drwxr-xr-x 2 root root  ... example.com

# Check if your certificate exists
sudo ls -la /etc/letsencrypt/live/pens.ac.id/
# or
sudo ls -la /etc/letsencrypt/live/bigdata.pens.ac.id/
```

## Step 2: Update Nginx Config With Correct Path

**Most Common Issue**: The certificate directory name doesn't match your config.

### Check Your Current Config
```bash
sudo grep "ssl_certificate" /etc/nginx/conf.d/sinopsis.bigdata.conf
```

### Common Certificate Paths (check which one exists)

If your certificate is under `pens.ac.id` (without `bigdata.`):
```nginx
ssl_certificate /etc/letsencrypt/live/pens.ac.id/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/pens.ac.id/privkey.pem;
```

If under `bigdata.pens.ac.id` (with `bigdata.`):
```nginx
ssl_certificate /etc/letsencrypt/live/bigdata.pens.ac.id/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/bigdata.pens.ac.id/privkey.pem;
```

If you need to check which domain is in the certificate:
```bash
# List ALL certificate directories
sudo ls /etc/letsencrypt/live/ | grep -i pens
sudo ls /etc/letsencrypt/live/ | grep -i bigdata
```

## Step 3: Fix Permissions

If the certificate exists but has permission issues:

```bash
# Fix certificate permissions
sudo chmod 755 /etc/letsencrypt/live/
sudo chmod 755 /etc/letsencrypt/live/pens.ac.id/
sudo chmod 755 /etc/letsencrypt/archive/
sudo chmod 755 /etc/letsencrypt/archive/pens.ac.id/

# Fix file permissions
sudo chmod 644 /etc/letsencrypt/live/pens.ac.id/fullchain.pem
sudo chmod 644 /etc/letsencrypt/live/pens.ac.id/privkey.pem
```

## Step 4: Verify Nginx Can Read Certificates

```bash
# Test if nginx user can read the certificate
sudo -u nginx cat /etc/letsencrypt/live/pens.ac.id/fullchain.pem > /dev/null && echo "✅ OK" || echo "❌ Permission denied"
```

## Step 5: Test & Reload

```bash
# Test configuration
sudo nginx -t

# If it passes, reload
sudo systemctl reload nginx

# Check status
sudo systemctl status nginx
```

## Alternative: Temporary Workaround (Development Only)

If you're having certificate issues, you can temporarily use HTTP without SSL for testing:

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

⚠️ **Use this only for testing/debugging!** For production, you need proper SSL.

## Step 6: Regenerate Certificate If Needed

If certificate is expired or missing, regenerate it:

```bash
# Using Certbot
sudo certbot certonly --webroot -w /var/www/html -d sinopsis.bigdata.pens.ac.id

# Or if it's a wildcard
sudo certbot certonly --dns-manual -d "*.bigdata.pens.ac.id"
```

## Quick Diagnosis Script

Run this to diagnose the issue:

```bash
#!/bin/bash
echo "=== SSL Certificate Diagnostic ==="
echo ""
echo "1. Available certificates:"
sudo ls -la /etc/letsencrypt/live/ | grep -i "pens\|bigdata"
echo ""
echo "2. Checking fullchain.pem:"
sudo ls -la /etc/letsencrypt/live/*/fullchain.pem 2>/dev/null || echo "❌ No certificates found"
echo ""
echo "3. Checking privkey.pem:"
sudo ls -la /etc/letsencrypt/live/*/privkey.pem 2>/dev/null || echo "❌ No private keys found"
echo ""
echo "4. Testing nginx config:"
sudo nginx -t
```

## Common Solutions

### Issue: Certificate path has different domain name
**Example**: Config has `bigdata.pens.ac.id` but cert is under `pens.ac.id`

**Fix**: Update nginx config to use the actual certificate path:
```bash
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf

# Change:
ssl_certificate /etc/letsencrypt/live/pens.ac.id/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/pens.ac.id/privkey.pem;
```

### Issue: Certificate file doesn't exist
**Error**: `fopen:Permission denied`

**Fix**: Regenerate certificate:
```bash
sudo certbot certonly --standalone -d sinopsis.bigdata.pens.ac.id --agree-tos -n
```

### Issue: Permission denied even with correct path
**Fix**: Fix permissions:
```bash
sudo chmod 755 /etc/letsencrypt/live/
sudo chmod 755 /etc/letsencrypt/live/*/
```

## Debug with Actual Error Messages

If you still get errors after fixes:

```bash
# See detailed error
sudo nginx -t -c /etc/nginx/nginx.conf

# Check nginx error log
sudo tail -50 /var/log/nginx/error.log

# Try manual startup to see errors
sudo nginx -s stop
sudo nginx
```

## Next Steps After Fixing SSL

1. ✅ Fix SSL certificate path/permissions (this step)
2. ✅ Verify `sudo nginx -t` passes
3. ✅ Reload: `sudo systemctl reload nginx`
4. ✅ Test recording on `/rapat/create`
5. ✅ Test upload on `/rapat/upload`

---

**What to do now**:

1. Run: `sudo ls -la /etc/letsencrypt/live/`
2. Tell me what directories you see
3. I'll provide exact fix for your certificate path
