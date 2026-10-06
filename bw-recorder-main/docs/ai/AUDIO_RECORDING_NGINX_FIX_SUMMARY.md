# NGINX Audio Recording Fix - Quick Implementation Guide

## Problem Summary

Audio recording works locally (`http://localhost:3000`) but fails when accessed through NGINX reverse proxy (`https://sinopsis.bigdata.pens.ac.id`). This is caused by browser security restrictions for the `getUserMedia()` API.

## Root Cause

Modern browsers require:
1. **HTTPS connection** (Secure Context)
2. **Proper security headers** (Permissions-Policy)
3. **Valid SSL certificate**

When accessing through NGINX without proper headers, the browser blocks microphone access.

## Solution: 3 Steps

### Step 1: Update NGINX Configuration

Add these critical headers to your NGINX config:

```nginx
# CRITICAL: Allow microphone access
add_header Permissions-Policy "microphone=(self), camera=(self)" always;
add_header Feature-Policy "microphone 'self'; camera 'self'" always;

# Additional security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
```

**Complete updated config** available in: `/home/syauqi/sinopsis-recorder/NGINX_RECORDING_FIX_SOLUTION.md`

### Step 2: Apply NGINX Changes

```bash
# Test configuration
sudo nginx -t

# Reload NGINX (no downtime)
sudo systemctl reload nginx

# Verify headers are being sent
curl -I https://sinopsis.bigdata.pens.ac.id | grep -i "permissions-policy"
```

### Step 3: Test the Application

1. **Clear browser cache** (Ctrl+Shift+Delete)
2. Navigate to `https://sinopsis.bigdata.pens.ac.id/rapat/create`
3. Check the **Diagnostik Audio** panel on the right side
4. Click "Mulai Rapat" and grant microphone permission when prompted

## What Changed in Your Code

### 1. Better Error Handling (`app/hooks/use-audio-recorder.ts`)
- Added Indonesian error messages
- Specific handling for:
  - NotAllowedError (permission denied)
  - SecurityError (not using HTTPS)
  - NotFoundError (no microphone)
  - NotReadableError (microphone in use)

### 2. Diagnostic Component (`app/components/audio-recording-diagnostic.tsx`)
- New diagnostic panel showing:
  - ✓ Secure Context status
  - ✓ HTTPS protocol check
  - ✓ getUserMedia API availability
  - ✓ Microphone permission status
  - Warning messages for issues

### 3. Updated Form Layout (`app/routes/rapat/rapat-form.tsx`)
- Added diagnostic panel to the right side
- Shows real-time status of audio recording compatibility

## Expected Behavior After Fix

### Before Clicking "Mulai Rapat"
- Diagnostic panel shows all green checkmarks
- "HTTPS Enabled" shows `https:`
- "Secure Context" shows "Ya"

### After Clicking "Mulai Rapat" (First Time)
- Browser shows permission prompt: "Allow microphone access?"
- User clicks "Allow"
- Recording starts successfully
- Audio waveform visualization appears

### Subsequent Uses
- No permission prompt (already granted)
- Recording starts immediately

## Troubleshooting

### Issue: Diagnostic shows "Koneksi Tidak Aman"
**Solution**: You're accessing via HTTP. Use `https://` URL.

### Issue: "Izin Mikrofon Ditolak"
**Solution**: 
1. Click lock icon in browser address bar
2. Change microphone permission to "Allow"
3. Refresh page

### Issue: Recording still doesn't work
**Check**:
```bash
# Verify NGINX is running latest config
sudo nginx -t
sudo systemctl status nginx

# Check if headers are present
curl -I https://sinopsis.bigdata.pens.ac.id

# Should see:
# Permissions-Policy: microphone=(self), camera=(self)
```

### Issue: Works in Chrome but not Firefox
**Solution**: Firefox requires both `Permissions-Policy` and `Feature-Policy` headers (already included in config).

## Testing Checklist

- [ ] NGINX configuration updated with security headers
- [ ] NGINX config tested: `sudo nginx -t`
- [ ] NGINX reloaded: `sudo systemctl reload nginx`
- [ ] Browser cache cleared
- [ ] Diagnostic panel shows all checks passing
- [ ] Permission prompt appears on first recording attempt
- [ ] Recording starts after granting permission
- [ ] Audio waveform visible during recording
- [ ] Recording stops and saves successfully

## Files Modified

1. ✅ `NGINX_RECORDING_FIX_SOLUTION.md` - Complete documentation
2. ✅ `app/hooks/use-audio-recorder.ts` - Better error handling
3. ✅ `app/components/audio-recording-diagnostic.tsx` - New diagnostic component
4. ✅ `app/routes/rapat/rapat-form.tsx` - Added diagnostic panel

## Quick Test Command

After deploying NGINX changes, run this to verify:

```bash
curl -I https://sinopsis.bigdata.pens.ac.id 2>&1 | grep -E "(permissions-policy|feature-policy)" -i
```

Expected output:
```
Permissions-Policy: microphone=(self), camera=(self)
Feature-Policy: microphone 'self'; camera 'self'
```

## Important Notes

1. **HTTPS is mandatory** - `getUserMedia()` will not work over HTTP (except localhost)
2. **Clear browser cache** - Old security policies may be cached
3. **Permission is per-domain** - Users need to grant once per domain
4. **Mobile browsers** - Same requirements apply (HTTPS + permissions)

## Support

If issues persist:
1. Check browser console (F12) for specific error messages
2. Verify SSL certificate is valid (no warnings in address bar)
3. Test in different browser (Chrome/Firefox/Edge)
4. Check the diagnostic panel for specific issues

## Next Steps After Fix

1. Monitor error logs: `tail -f /var/log/nginx/error.log`
2. Check browser console for any warnings
3. Test from multiple devices/browsers
4. Document any additional issues in GitHub issues
