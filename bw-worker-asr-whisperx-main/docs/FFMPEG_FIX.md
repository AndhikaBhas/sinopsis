# FFmpeg "No such file or directory" Error - SOLVED ✅

## The Problem

When running as a systemd service, you get:

```
ERROR - WhisperX transcription failed: [Errno 2] No such file or directory: 'ffmpeg'
```

## Root Cause

The worker needs `ffmpeg` to decode audio files in memory. When running as a systemd service, the PATH environment variable doesn't include system binary directories like `/usr/bin`, so Python's subprocess can't find `ffmpeg`.

## The Solution

### Quick Fix (Automated)

Run this on your Debian 12 server:

```bash
cd /opt/sinopsis-worker-asr

# Pull latest code (if using git)
git pull

# Run the automated fix
sudo ./helpers/fix-ffmpeg.sh
```

This script will:

1. ✅ Install ffmpeg if missing
2. ✅ Update service file with correct PATH
3. ✅ Reload systemd daemon
4. ✅ Restart the service
5. ✅ Verify everything works

### Manual Fix (Step-by-Step)

If you prefer to fix it manually:

#### Step 1: Install ffmpeg

```bash
# On Debian/Ubuntu
sudo apt-get update
sudo apt-get install -y ffmpeg

# Verify installation
ffmpeg -version
which ffmpeg  # Should show /usr/bin/ffmpeg
```

#### Step 2: Update Service File

Edit `/etc/systemd/system/sinopsis-worker-asr.service` or copy the fixed version:

```bash
# Pull latest changes (if using git)
cd /opt/sinopsis-worker-asr
git pull

# Copy updated service file
sudo cp sinopsis-worker-asr.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload
```

The key change in the service file:

```ini
# OLD (broken)
Environment=PATH=/opt/sinopsis-worker-asr/venv/bin

# NEW (fixed)
Environment=PATH=/opt/sinopsis-worker-asr/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

#### Step 3: Restart Service

```bash
sudo systemctl restart sinopsis-worker-asr.service
```

#### Step 4: Verify Fix

```bash
# Check service is running
sudo systemctl status sinopsis-worker-asr.service

# Watch logs (should show no errors)
sudo journalctl -u sinopsis-worker-asr.service -f
```

You should see:

```
INFO - Checking system dependencies...
INFO - ✓ ffmpeg found: /usr/bin/ffmpeg
INFO - Audio processing: Direct to memory (no temporary files)
INFO - MODELS READY - Worker can now process jobs efficiently
```

## Why This Happened

### Normal User Session vs Systemd Service

When you run the worker manually (as your user), your shell includes default system paths:

```bash
echo $PATH
# Shows: /usr/local/bin:/usr/bin:/bin:...
```

But systemd services have a **minimal PATH** by default for security. They don't include `/usr/bin` unless explicitly configured.

### Our Audio Processing Approach

The worker uses `ffmpeg` to decode audio directly in memory:

```python
cmd = ["ffmpeg", "-i", "pipe:0", ...]  # Tries to run 'ffmpeg'
subprocess.run(cmd, ...)
```

Python's `subprocess` module uses the PATH to find executables. No PATH = no ffmpeg = error.

## Technical Details

### What the Fix Does

1. **Adds system paths to service environment:**

   ```ini
   Environment=PATH=/opt/sinopsis-worker-asr/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   ```

2. **Python code now finds ffmpeg:**

   - New helper function `find_ffmpeg()` searches PATH
   - Checks common installation locations as fallback
   - Provides clear error messages if ffmpeg is missing

3. **Early validation:**
   - Worker checks for ffmpeg at startup
   - Fails fast with helpful error message
   - Prevents confusing errors later during processing

### Code Changes

The Python code now:

1. **Finds ffmpeg intelligently:**

   ```python
   def find_ffmpeg():
       """Find ffmpeg executable in system PATH."""
       import shutil
       ffmpeg_path = shutil.which('ffmpeg')
       if not ffmpeg_path:
           # Check common locations
           # Provide installation instructions
           raise RuntimeError("ffmpeg not found...")
       return ffmpeg_path
   ```

2. **Uses absolute path:**

   ```python
   ffmpeg_path = find_ffmpeg()  # e.g., '/usr/bin/ffmpeg'
   cmd = [ffmpeg_path, "-i", "pipe:0", ...]
   ```

3. **Validates at startup:**
   ```python
   def main():
       # ... other checks ...
       try:
           ffmpeg_path = find_ffmpeg()
           logger.info(f"✓ ffmpeg found: {ffmpeg_path}")
       except RuntimeError as e:
           logger.error("Install ffmpeg before starting")
           return 1
   ```

## Prevention

To prevent this on new installations:

1. **Always install ffmpeg first:**

   ```bash
   sudo apt-get install -y ffmpeg
   ```

2. **Use the health check script:**

   ```bash
   ./helpers/check-service.sh
   ```

   This will detect missing ffmpeg before you start the service.

3. **Follow deployment guide:**
   See `docs/DEPLOYMENT_GUIDE.md` for complete setup steps.

## Related Issues

### "ffprobe: command not found"

Same issue, same fix. ffprobe is installed with ffmpeg.

### "sox: command not found"

Different tool. Our worker doesn't use sox, only ffmpeg.

### "av: No module named 'av'"

Different issue - that's a Python library. Install with: `pip install av`

## Troubleshooting

### Still Getting the Error?

1. **Verify ffmpeg is installed:**

   ```bash
   which ffmpeg
   ffmpeg -version
   ```

2. **Check service PATH:**

   ```bash
   sudo systemctl show sinopsis-worker-asr.service --property=Environment
   ```

   Should show PATH with `/usr/bin` included.

3. **Test as service user:**

   ```bash
   sudo -u syauqi bash -c 'which ffmpeg'
   ```

4. **Check recent logs:**

   ```bash
   sudo journalctl -u sinopsis-worker-asr.service -n 100
   ```

5. **Run health check:**
   ```bash
   ./helpers/check-service.sh
   ```

### ffmpeg Installed But Still Not Found?

If `which ffmpeg` shows it's installed but the service still can't find it:

1. Check if it's in a non-standard location:

   ```bash
   find /usr -name ffmpeg 2>/dev/null
   ```

2. If found in unusual location, add that path to service file:

   ```ini
   Environment=PATH=/opt/sinopsis-worker-asr/venv/bin:/your/custom/path:/usr/bin:/bin
   ```

3. Create a symlink (alternative):
   ```bash
   sudo ln -s /path/to/ffmpeg /usr/local/bin/ffmpeg
   ```

## Testing

After applying the fix, test with a sample job:

```bash
# Watch logs
sudo journalctl -u sinopsis-worker-asr.service -f

# In another terminal, send a test message to RabbitMQ
# (use your actual job format)
```

Look for these log entries:

```
INFO - ✓ ffmpeg found: /usr/bin/ffmpeg
INFO - Loading audio from memory buffer: ...
INFO - Audio loaded in memory: X.XX seconds, 16000Hz, mono
INFO - WhisperX transcription completed successfully
```

## Summary

**Problem:** Systemd service couldn't find ffmpeg
**Cause:** Minimal PATH in systemd environment
**Solution:** Install ffmpeg + update service PATH
**Prevention:** Use health check scripts before deployment

The fix is now permanent in the codebase. Future deployments won't have this issue if you:

1. Install ffmpeg system-wide
2. Use the updated service file
3. Run the health check script

---

**Status:** ✅ FIXED in latest code
**Automated Fix:** `sudo ./helpers/fix-ffmpeg.sh`
**Documentation:** This file

**Related Files:**

- Service file: `sinopsis-worker-asr.service`
- Fix script: `helpers/fix-ffmpeg.sh`
- Health check: `helpers/check-service.sh`
- Deployment guide: `docs/DEPLOYMENT_GUIDE.md`
- Service troubleshooting: `docs/SYSTEMD_SERVICE.md`
