# NGINX Recording Issue - Complete Solution

## Problem Analysis

When the application works locally but fails to record audio when accessed through NGINX reverse proxy, the issue is related to browser security requirements for the `getUserMedia()` API.

## Root Causes

1. **Secure Context Requirement**: Modern browsers require HTTPS for microphone access
2. **Missing Security Headers**: Additional headers needed for media device access
3. **WebRTC/HTTPS Configuration**: Browser needs proper security context signals

## Complete NGINX Configuration Fix

Replace your current NGINX configuration with this updated version:

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

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=63072000" always;
    
    # CRITICAL: Security headers for getUserMedia() API
    add_header Permissions-Policy "microphone=(self), camera=(self)" always;
    add_header Feature-Policy "microphone 'self'; camera 'self'" always;
    
    # Additional security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 100M;

    location / {
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $server_name;
        
        # CRITICAL: WebSocket and upgrade support
        proxy_set_header Connection "";
        proxy_set_header Upgrade $http_upgrade;
        proxy_http_version 1.1;

        # Cookie handling
        proxy_cookie_path / /;

        # Content headers
        proxy_set_header Content-Type $content_type;
        proxy_set_header Content-Length $content_length;

        # Timeout settings for long recordings
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # CRITICAL: Disable buffering for streaming audio
        proxy_buffering off;
        proxy_request_buffering off;

        proxy_cache_bypass $http_upgrade;

        # Backend server
        proxy_pass http://10.252.178.50:3000;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

## Key Changes Explained

### 1. Permissions-Policy Header (Most Important)
```nginx
add_header Permissions-Policy "microphone=(self), camera=(self)" always;
```
This header explicitly allows microphone access for the same origin.

### 2. Feature-Policy Header (Backward Compatibility)
```nginx
add_header Feature-Policy "microphone 'self'; camera 'self'" always;
```
Older browsers use Feature-Policy instead of Permissions-Policy.

### 3. TLS 1.3 Support
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
```
Added TLS 1.3 for better security and performance.

## Application-Side Improvements

### Update Error Handling in use-audio-recorder.ts

Add better error messaging for permission issues:

```typescript
const startRecording = useCallback(async () => {
    try {
      setError(null);
      setAudioBlob(null);
      setDuration(0);

      // ... existing code ...

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: enhancedProcessing ? { exact: true } : true,
          noiseSuppression: enhancedProcessing ? { exact: true } : true,
          autoGainControl: enhancedProcessing ? { exact: true } : true,
          sampleRate: { ideal: 16000, min: 8000, max: 48000 },
          channelCount: { exact: 1 },
          sampleSize: { ideal: 16 },
        },
      });

      // ... rest of code ...
    } catch (err) {
      console.error("Failed to start recording:", err);
      
      let errorMessage = "Failed to start recording.";
      
      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          errorMessage = "Microphone access denied. Please allow microphone permissions in your browser.";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          errorMessage = "No microphone found. Please connect a microphone and try again.";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          errorMessage = "Microphone is already in use by another application.";
        } else if (err.name === "OverconstrainedError") {
          errorMessage = "Your microphone doesn't support the required settings.";
        } else if (err.name === "SecurityError") {
          errorMessage = "Cannot access microphone. Please make sure you're using HTTPS.";
        } else {
          errorMessage = `Recording error: ${err.message}`;
        }
      }
      
      setError(errorMessage);
      cleanupAudioResources();
    }
  }, [/* ... dependencies ... */]);
```

## Deployment Steps

1. **Update NGINX configuration**:
   ```bash
   sudo nano /etc/nginx/sites-available/sinopsis.bigdata.pens.ac.id
   ```

2. **Test the configuration**:
   ```bash
   sudo nginx -t
   ```

3. **Reload NGINX** (no downtime):
   ```bash
   sudo systemctl reload nginx
   ```

4. **Verify the headers** are being sent:
   ```bash
   curl -I https://sinopsis.bigdata.pens.ac.id
   ```

   You should see:
   ```
   Permissions-Policy: microphone=(self), camera=(self)
   Feature-Policy: microphone 'self'; camera 'self'
   ```

5. **Clear browser cache** and test:
   - Press Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
   - Clear cached images and files
   - Close and reopen browser
   - Navigate to https://sinopsis.bigdata.pens.ac.id/rapat/create

## Troubleshooting

### If recording still doesn't work:

1. **Check browser console** (F12):
   - Look for `NotAllowedError` or `SecurityError`
   - Check if there are mixed content warnings

2. **Verify HTTPS is working**:
   - URL should show `https://` with a lock icon
   - Check SSL certificate is valid

3. **Test microphone permissions**:
   - Visit chrome://settings/content/microphone (Chrome)
   - Visit about:preferences#privacy (Firefox)
   - Make sure your site is allowed

4. **Check browser compatibility**:
   ```javascript
   // Add this to your component for debugging
   useEffect(() => {
     console.log("Navigator info:", {
       userAgent: navigator.userAgent,
       hasGetUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
       isSecureContext: window.isSecureContext,
       protocol: window.location.protocol
     });
   }, []);
   ```

5. **Verify backend server is accessible**:
   ```bash
   # On NGINX server
   curl http://10.252.178.50:3000
   ```

## Common Issues and Solutions

### Issue: "NotAllowedError: Permission denied"
**Solution**: User needs to manually allow microphone access in browser permissions.

### Issue: "SecurityError: Only secure origins are allowed"
**Solution**: Ensure HTTPS is properly configured and certificates are valid.

### Issue: Recording works in Chrome but not Firefox
**Solution**: Firefox has stricter security requirements. Make sure both Permissions-Policy headers are present.

### Issue: First recording fails but subsequent attempts work
**Solution**: This is normal - browser needs user to explicitly grant permission on first attempt.

## Testing Checklist

- [ ] NGINX configuration updated and reloaded
- [ ] Browser cache cleared
- [ ] Site accessed via HTTPS (not HTTP)
- [ ] Microphone permission prompt appears on first attempt
- [ ] Recording starts successfully after granting permission
- [ ] Audio levels/visualization shows during recording
- [ ] Recording stops and saves properly
- [ ] Test from multiple browsers (Chrome, Firefox, Edge)
- [ ] Test from different devices/networks

## Additional Security Considerations

If you need to restrict microphone access further:

```nginx
# Only allow microphone on specific routes
location /rapat/ {
    add_header Permissions-Policy "microphone=(self)" always;
    # ... other proxy settings ...
}

# Disable microphone on other routes
location / {
    add_header Permissions-Policy "microphone=()" always;
    # ... other proxy settings ...
}
```

## References

- [MDN: getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy)
- [Chrome: Feature Policy](https://developer.chrome.com/docs/privacy-sandbox/permissions-policy/)
