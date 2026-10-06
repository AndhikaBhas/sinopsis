# Systemd Service Fixes - October 1, 2025

## Issues Fixed

### 1. **PATH Environment Variable**

**Problem:** Service only had venv bin in PATH, missing system binaries like `ffmpeg`

**Fix:** Updated PATH to include full system paths:

```ini
Environment=PATH=/opt/sinopsis-worker-asr/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

**Why:** Worker needs `ffmpeg` to decode audio from memory. Without it in PATH, subprocess calls fail.

---

### 2. **Environment File Loading**

**Problem:** Service wasn't loading `.env` file with configuration

**Fix:** Added EnvironmentFile directive:

```ini
EnvironmentFile=-/opt/sinopsis-worker-asr/.env
```

**Why:** The `-` prefix makes it optional (won't fail if missing), but will load variables when present.

---

### 3. **Absolute Paths in ExecStart**

**Problem:** Using relative path `worker.py` which could fail depending on context

**Fix:** Changed to absolute paths:

```ini
ExecStart=/opt/sinopsis-worker-asr/venv/bin/python /opt/sinopsis-worker-asr/worker.py
```

**Why:** Systemd services should always use absolute paths for reliability.

---

## Files Modified

1. **`sinopsis-worker-asr.service`**
   - Updated PATH environment
   - Added EnvironmentFile
   - Fixed ExecStart paths

## Files Created

1. **`docs/SYSTEMD_SERVICE.md`**

   - Complete systemd service documentation
   - Installation instructions
   - Troubleshooting guide for all common issues
   - Monitoring commands
   - Deployment checklist

2. **`helpers/check-service.sh`**

   - Automated health check script
   - Validates all service prerequisites
   - Provides step-by-step fixes for issues
   - Checks dependencies, files, and service status

3. **`helpers/deploy-service.sh`**

   - Quick deployment/update script
   - Copies service file
   - Reloads systemd
   - Handles restarts safely

4. **`helpers/README.md`** (Updated)
   - Added documentation for new scripts
   - Updated usage scenarios

---

## Common Errors Resolved

### Error: "ffmpeg: command not found"

**Cause:** PATH didn't include system binaries
**Fixed by:** Adding full PATH to service file

### Error: "Missing required environment variables"

**Cause:** .env file not loaded
**Fixed by:** Adding EnvironmentFile directive

### Error: "No such file or directory: worker.py"

**Cause:** Relative path in ExecStart
**Fixed by:** Using absolute paths

### Error: "Permission denied"

**Cause:** Wrong ownership or permissions
**Fixed by:** Documented in troubleshooting guide, use `helpers/fix-permissions.sh`

### Error: "CUDA not available"

**Cause:** GPU not accessible to service user
**Fixed by:** Documented in troubleshooting guide (add user to video group)

---

## How to Deploy

### On Debian 12 Server

```bash
# 1. Navigate to project directory
cd /opt/sinopsis-worker-asr

# 2. Run health check
./helpers/check-service.sh

# 3. Fix any reported issues

# 4. Deploy service
sudo ./helpers/deploy-service.sh

# 5. Start service
sudo systemctl start sinopsis-worker-asr

# 6. Monitor logs
sudo journalctl -u sinopsis-worker-asr -f
```

---

## Verification Steps

After deployment, verify everything works:

```bash
# 1. Check service is running
sudo systemctl status sinopsis-worker-asr

# 2. Check logs for errors
sudo journalctl -u sinopsis-worker-asr -n 50

# 3. Verify GPU is being used (if applicable)
watch -n 1 nvidia-smi

# 4. Monitor system resources
./helpers/monitor.sh

# 5. Send test job through RabbitMQ and verify processing
```

---

## Related Documentation

- **Service Configuration:** `sinopsis-worker-asr.service`
- **Detailed Guide:** `docs/SYSTEMD_SERVICE.md`
- **Installation:** `docs/INSTALL.md`
- **Deployment:** `docs/DEPLOYMENT_GUIDE.md`
- **Helper Scripts:** `helpers/README.md`

---

## Rollback Plan

If issues arise, to rollback:

```bash
# 1. Stop service
sudo systemctl stop sinopsis-worker-asr

# 2. Restore old service file from backup
sudo cp /etc/systemd/system/sinopsis-worker-asr.service.backup /etc/systemd/system/sinopsis-worker-asr.service

# 3. Reload and restart
sudo systemctl daemon-reload
sudo systemctl start sinopsis-worker-asr
```

---

## Testing Performed

- ✅ Service file syntax validation
- ✅ Health check script tested
- ✅ Deploy script tested
- ✅ Documentation reviewed
- ✅ All paths verified
- ✅ Environment variable loading confirmed

---

## Notes for Production

1. **Always backup** before making changes:

   ```bash
   sudo cp /etc/systemd/system/sinopsis-worker-asr.service /etc/systemd/system/sinopsis-worker-asr.service.backup
   ```

2. **Test in staging** environment first if available

3. **Monitor closely** after deployment for the first few jobs

4. **Keep logs** for at least 7 days for troubleshooting

5. **Document any additional changes** specific to your environment

---

## Success Criteria

Service deployment is successful when:

- ✅ Service starts without errors
- ✅ Logs show "MODELS READY - Worker can now process jobs efficiently"
- ✅ GPU is detected and used (if applicable)
- ✅ Worker successfully processes test jobs
- ✅ Service auto-restarts on failure
- ✅ Service starts on system boot
