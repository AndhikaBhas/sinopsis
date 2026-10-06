# Service Error Quick Reference

## Quick Diagnostic Commands

```bash
# Check service status
sudo systemctl status sinopsis-worker-asr.service

# View last 50 log lines
sudo journalctl -u sinopsis-worker-asr.service -n 50

# Follow logs in real-time
sudo journalctl -u sinopsis-worker-asr.service -f

# Check if ffmpeg is available
which ffmpeg

# Run health check
./helpers/check-service.sh
```

---

## Common Errors & One-Line Fixes

### ❌ Error: "No such file or directory: 'ffmpeg'"

**Quick Fix:**

```bash
sudo ./helpers/fix-ffmpeg.sh
```

**Manual Fix:**

```bash
sudo apt-get install -y ffmpeg && sudo ./helpers/deploy-service.sh && sudo systemctl restart sinopsis-worker-asr
```

**Details:** See `docs/FFMPEG_FIX.md`

---

### ❌ Error: "Missing required environment variables"

**Quick Fix:**

```bash
cd /opt/sinopsis-worker-asr && cp .env.example .env && nano .env
```

**Then restart:**

```bash
sudo systemctl restart sinopsis-worker-asr
```

**Details:** Ensure all required variables are set in `/opt/sinopsis-worker-asr/.env`

---

### ❌ Error: "Connection refused" (RabbitMQ)

**Quick Fix:**

```bash
sudo systemctl start rabbitmq-server && sudo systemctl restart sinopsis-worker-asr
```

**Check status:**

```bash
sudo systemctl status rabbitmq-server
```

**Details:** See `docs/RABBITMQ_TROUBLESHOOTING.md`

---

### ❌ Error: "Could not connect to server" (PostgreSQL)

**Quick Fix:**

```bash
sudo systemctl start postgresql && sudo systemctl restart sinopsis-worker-asr
```

**Check status:**

```bash
sudo systemctl status postgresql
```

**Test connection:**

```bash
psql "$DATABASE_URL"
```

---

### ❌ Error: "Permission denied"

**Quick Fix:**

```bash
sudo ./helpers/fix-permissions.sh && sudo systemctl restart sinopsis-worker-asr
```

**Manual fix:**

```bash
sudo chown -R syauqi:syauqi /opt/sinopsis-worker-asr
sudo chmod 755 /opt/sinopsis-worker-asr
```

---

### ❌ Error: "CUDA error" or "GPU not available"

**Check GPU:**

```bash
nvidia-smi
```

**Add user to video group:**

```bash
sudo usermod -aG video syauqi
sudo systemctl restart sinopsis-worker-asr
```

**Details:** See `docs/CUDA_FIX_SUMMARY.md`

---

### ❌ Error: "ModuleNotFoundError"

**Quick Fix:**

```bash
cd /opt/sinopsis-worker-asr && source venv/bin/activate && pip install -r requirements.txt
sudo systemctl restart sinopsis-worker-asr
```

**Verify:**

```bash
/opt/sinopsis-worker-asr/venv/bin/python -c "import whisperx; import torch; print('OK')"
```

---

### ❌ Service fails to start (general)

**Full diagnostic:**

```bash
./helpers/check-service.sh
```

**View detailed error:**

```bash
sudo journalctl -u sinopsis-worker-asr.service -n 100 --no-pager
```

**Try manual run:**

```bash
cd /opt/sinopsis-worker-asr
source venv/bin/activate
python worker.py
# Press Ctrl+C to stop, then fix reported errors
```

---

## Service Management Commands

```bash
# Start service
sudo systemctl start sinopsis-worker-asr

# Stop service
sudo systemctl stop sinopsis-worker-asr

# Restart service
sudo systemctl restart sinopsis-worker-asr

# Check status
sudo systemctl status sinopsis-worker-asr

# Enable auto-start on boot
sudo systemctl enable sinopsis-worker-asr

# Disable auto-start
sudo systemctl disable sinopsis-worker-asr

# View configuration
sudo systemctl cat sinopsis-worker-asr
```

---

## Deployment/Update Commands

```bash
# Full deployment
sudo ./helpers/deploy-service.sh

# Just copy service file and reload
sudo cp sinopsis-worker-asr.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart sinopsis-worker-asr

# Health check
./helpers/check-service.sh

# Monitor resources
sudo ./helpers/monitor.sh
```

---

## Log Management

```bash
# Recent logs
sudo journalctl -u sinopsis-worker-asr -n 100

# Logs from last hour
sudo journalctl -u sinopsis-worker-asr --since "1 hour ago"

# Logs from specific time
sudo journalctl -u sinopsis-worker-asr --since "2025-10-01 14:00:00"

# Follow logs with timestamps
sudo journalctl -u sinopsis-worker-asr -f -o short-precise

# Search logs for specific text
sudo journalctl -u sinopsis-worker-asr | grep "ERROR"

# Export logs to file
sudo journalctl -u sinopsis-worker-asr -n 500 > service-logs.txt
```

---

## Validation Commands

```bash
# Check all prerequisites
./helpers/check-service.sh

# Test Python environment
/opt/sinopsis-worker-asr/venv/bin/python -c "
import whisperx
import torch
import pika
print('✓ All imports successful')
print(f'CUDA available: {torch.cuda.is_available()}')
"

# Test ffmpeg
ffmpeg -version

# Test GPU
nvidia-smi

# Test database connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Test RabbitMQ
telnet localhost 5672  # Should connect, press Ctrl+] then 'quit'
```

---

## Emergency Procedures

### Service is consuming too much memory

```bash
# Restart service
sudo systemctl restart sinopsis-worker-asr

# Set memory limit (edit service file)
sudo nano /etc/systemd/system/sinopsis-worker-asr.service
# Add: MemoryMax=8G
sudo systemctl daemon-reload
sudo systemctl restart sinopsis-worker-asr
```

### Service is in a crash loop

```bash
# Stop service
sudo systemctl stop sinopsis-worker-asr

# Check logs for error
sudo journalctl -u sinopsis-worker-asr -n 100

# Fix the error, then start
sudo systemctl start sinopsis-worker-asr
```

### Need to completely reset

```bash
# Stop service
sudo systemctl stop sinopsis-worker-asr

# Disable service
sudo systemctl disable sinopsis-worker-asr

# Remove service file
sudo rm /etc/systemd/system/sinopsis-worker-asr.service

# Reload daemon
sudo systemctl daemon-reload

# Then redeploy from scratch
cd /opt/sinopsis-worker-asr
sudo ./helpers/deploy-service.sh
```

---

## Getting Help

If problems persist:

1. **Run full diagnostics:**

   ```bash
   ./helpers/check-service.sh > diagnosis.txt
   sudo journalctl -u sinopsis-worker-asr -n 200 > logs.txt
   ```

2. **Check documentation:**

   - `docs/FFMPEG_FIX.md` - ffmpeg errors
   - `docs/SYSTEMD_SERVICE.md` - service issues
   - `docs/DEPLOYMENT_GUIDE.md` - deployment problems
   - `docs/RABBITMQ_TROUBLESHOOTING.md` - RabbitMQ issues

3. **Share these files:**
   - `diagnosis.txt`
   - `logs.txt`
   - Your `.env` file (remove sensitive data!)
   - Output of `nvidia-smi` (if using GPU)

---

## Best Practices

✅ **Always check service status after changes:**

```bash
sudo systemctl status sinopsis-worker-asr
```

✅ **Monitor logs after deployment:**

```bash
sudo journalctl -u sinopsis-worker-asr -f
```

✅ **Run health check before starting:**

```bash
./helpers/check-service.sh
```

✅ **Backup before major changes:**

```bash
sudo cp /etc/systemd/system/sinopsis-worker-asr.service{,.backup}
```

✅ **Test in manual mode first:**

```bash
cd /opt/sinopsis-worker-asr && source venv/bin/activate && python worker.py
```

---

**Last Updated:** October 1, 2025
**See also:** `docs/SYSTEMD_SERVICE.md` for detailed troubleshooting
