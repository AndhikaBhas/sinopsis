# ⚡ QUICK START: Apply The Fix Now

## In 3 Simple Steps

### Step 1: Edit Config File
```bash
sudo nano /etc/nginx/conf.d/sinopsis.bigdata.conf
```

### Step 2: Find This Block
```nginx
location / {
    proxy_set_header X-Real-IP  $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $host;
    proxy_pass http://10.252.178.50:3000;
}
```

### Step 3: Replace With This
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

### Step 4: Save & Test
```bash
# Save: Ctrl+O, Enter, Ctrl+X

# Test syntax
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

---

## Done! ✅

Your recording and uploads should now work.

### Verify
1. Go to `https://sinopsis.bigdata.pens.ac.id/rapat/create`
2. Fill form and record
3. Should complete in 2-3 seconds (not hang)

### If Still Having Issues
See: `NGINX_COMPLETE_SOLUTION.md` for debugging

---

## What Changed

| Setting | Before | After | Why |
|---------|--------|-------|-----|
| `X-Forwarded-For` | `$remote_addr` | `$proxy_add_x_forwarded_for` | Full IP chain |
| `Connection` | (default: close) | `""` | **Fixes recording hang** |
| `HTTP version` | 1.0 | 1.1 | Keep-alive support |
| `X-Forwarded-Proto` | Missing | Added | HTTPS detection |
| Read timeout | 60s | 300s | Large uploads |
| Buffering | On | Off | Stream support |

---

**That's it! Just copy-paste and reload nginx.**
