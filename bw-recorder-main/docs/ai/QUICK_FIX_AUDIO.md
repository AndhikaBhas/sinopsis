# 🎤 Audio Recording Fix - Quick Reference

## 🔴 Problem
Recording works locally but fails through NGINX proxy.

## 🟢 Solution
Add security headers to NGINX configuration.

---

## 📋 Quick Fix (Copy-Paste)

### Add to NGINX config (inside `server` block for HTTPS):

```nginx
# CRITICAL: Allow microphone access
add_header Permissions-Policy "microphone=(self), camera=(self)" always;
add_header Feature-Policy "microphone 'self'; camera 'self'" always;
```

### Apply:
```bash
sudo nano /etc/nginx/sites-available/sinopsis.bigdata.pens.ac.id
# Add the headers above
sudo nginx -t
sudo systemctl reload nginx
```

---

## ✅ Verification

### 1. Check headers:
```bash
curl -I https://sinopsis.bigdata.pens.ac.id | grep -i "permissions"
```

### 2. Test in browser:
1. Visit: https://sinopsis.bigdata.pens.ac.id/rapat/create
2. Check "Diagnostik Audio" panel (right side)
3. Should show all ✓ green checkmarks

---

## 🚀 Automated Fix

Run on NGINX server:
```bash
sudo bash update-nginx-for-audio.sh
```

---

## 📊 What to Expect

### Before Fix:
- ❌ Recording button doesn't work
- ❌ SecurityError in console
- ❌ No permission prompt

### After Fix:
- ✅ Browser asks: "Allow microphone?"
- ✅ Recording starts after permission
- ✅ Waveform visualization appears

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| No permission prompt | Clear browser cache |
| "Permission denied" | Click lock icon → Allow microphone |
| Still not working | Verify HTTPS works (lock icon visible) |
| Works in Chrome, not Firefox | Both headers must be present |

---

## 📁 Documentation

Detailed docs:
- `NGINX_RECORDING_FIX_SOLUTION.md` - Complete guide
- `AUDIO_RECORDING_NGINX_FIX_SUMMARY.md` - Implementation steps
- `AUDIO_FIX_BEFORE_AFTER.md` - Visual comparison

---

## 🆘 Emergency Rollback

```bash
# Restore from automatic backup
sudo cp /etc/nginx/sites-available/sinopsis.bigdata.pens.ac.id.backup.* \
       /etc/nginx/sites-available/sinopsis.bigdata.pens.ac.id
sudo systemctl reload nginx
```

---

## ✨ Key Points

1. **HTTPS is required** - getUserMedia() only works over HTTPS
2. **Headers are critical** - Permissions-Policy tells browser to allow access
3. **User permission needed** - Browser will prompt on first use
4. **No code changes needed** - This is purely NGINX configuration

---

## 📞 Support

If still not working:
1. Check browser console (F12)
2. Verify SSL certificate is valid
3. Test in different browser
4. Check "Diagnostik Audio" panel for specific issue
