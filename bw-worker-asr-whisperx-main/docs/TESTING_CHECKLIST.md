# Testing Checklist - Memory Mode Refactoring

Use this checklist to verify the refactoring is working correctly.

## ✅ Pre-Deployment Checklist

### 1. Code Validation

- [x] Python syntax check passes (`python3 -m py_compile worker.py`)
- [x] All 8 validation tests pass (`python3 test_memory_mode.py`)
- [x] No import errors
- [x] Configuration loads correctly

### 2. Dependencies

- [x] psutil installed (`pip3 install psutil`)
- [ ] All requirements satisfied (`pip3 install -r requirements.txt`)
- [ ] PyTorch with CUDA available (if using GPU)
- [ ] WhisperX installed

### 3. Configuration

- [x] `.env` file updated with new settings
- [x] `USE_MEMORY_MODE=true` set
- [x] `MEMORY_CLEANUP_INTERVAL=10` set
- [ ] Other settings verified (DATABASE_URL, RABBITMQ_URL, etc.)

### 4. Documentation Review

- [x] Read QUICK_SUMMARY.md
- [ ] Read MEMORY_MODE.md
- [ ] Read UPGRADE_TO_MEMORY_MODE.md
- [ ] Understand rollback procedure

---

## ✅ Development Testing

### 5. Local Startup Test

- [ ] Start worker: `python worker.py`
- [ ] Look for: "Memory mode: ENABLED"
- [ ] Look for: "INITIALIZING MODELS"
- [ ] Look for: "MODELS READY"
- [ ] No errors during startup

### 6. Memory Mode Verification

```bash
# Expected startup logs:
[ ] INFO - Memory mode: ENABLED (models persist in memory)
[ ] INFO - Memory cleanup interval: Every 10 jobs
[ ] INFO - ========================================
[ ] INFO - INITIALIZING MODELS (One-time startup)
[ ] INFO - ========================================
[ ] INFO - Loading WhisperX transcription model...
[ ] INFO - ✅ WhisperX model loaded successfully
[ ] INFO - Loading Indonesian alignment model...
[ ] INFO - ✅ Default alignment model loaded for Indonesian
[ ] INFO - Post-initialization Memory: GPU=X.XXgb/X.XXgb
[ ] INFO - ========================================
[ ] INFO - MODELS READY - Worker can now process jobs
[ ] INFO - ========================================
```

### 7. Single Job Test

- [ ] Send one test job to RabbitMQ
- [ ] Job processes successfully
- [ ] Transcript saved to database
- [ ] Memory stats logged
- [ ] No errors or warnings
- [ ] Record job completion time: **\_** seconds

### 8. Multiple Jobs Test

- [ ] Send 3-5 test jobs
- [ ] All jobs process successfully
- [ ] First job time: **\_** seconds (baseline)
- [ ] Second job time: **\_** seconds (should be faster!)
- [ ] Third job time: **\_** seconds (should be faster!)
- [ ] Performance improvement observed: Yes / No
- [ ] Memory usage stable
- [ ] Periodic cleanup triggers (after 10 jobs)

### 9. Memory Monitoring

```bash
# Check GPU memory (if applicable)
[ ] nvidia-smi shows stable memory usage
[ ] Memory around 7-8GB for medium model
[ ] No memory leaks (growing usage)

# Check system memory
[ ] ps aux | grep worker.py shows stable RAM
[ ] RAM around 8-10GB for medium model

# Check worker logs
[ ] Memory stats appear in logs
[ ] Format: "Memory: GPU=X.XXgb/X.XXgb RAM=X.XXgb"
```

### 10. Error Handling

- [ ] Test with invalid audio file (should handle gracefully)
- [ ] Test with missing file (should log error, not crash)
- [ ] Worker stays alive after error
- [ ] Models remain loaded after error

---

## ✅ Production Deployment

### 11. Service Installation

- [ ] Copy files to production server
- [ ] Install dependencies: `pip3 install -r requirements.txt`
- [ ] Update `.env` with production values
- [ ] Verify configuration: `python worker.py validate`

### 12. Systemd Service

- [ ] Service installed: `sudo ./deploy.sh`
- [ ] Service enabled: `sudo systemctl enable sinopsis-worker-asr`
- [ ] Service started: `sudo systemctl start sinopsis-worker-asr`
- [ ] Service running: `sudo systemctl status sinopsis-worker-asr`
- [ ] No errors in status output

### 13. Production Logs

```bash
# Watch logs
[ ] sudo journalctl -u sinopsis-worker-asr -f

# Expected logs:
[ ] "Memory mode: ENABLED"
[ ] "MODELS READY"
[ ] Jobs processing successfully
[ ] Memory stats appearing
[ ] No error messages
```

### 14. Production Performance

- [ ] Monitor first job completion time
- [ ] Monitor subsequent job times
- [ ] Verify 30-40% improvement over time
- [ ] No performance degradation
- [ ] Throughput improved

### 15. Resource Monitoring

```bash
# Set up monitoring
[ ] nvidia-smi for GPU usage
[ ] top/htop for CPU/RAM usage
[ ] Grafana/Prometheus (if available)

# Verify:
[ ] GPU memory stable (~7-8GB)
[ ] RAM usage stable (~8-10GB)
[ ] CPU usage reasonable
[ ] No resource exhaustion
```

---

## ✅ Performance Verification

### 16. Benchmark Comparison

| Metric          | Before (Expected) | After (Actual) | Improvement |
| --------------- | ----------------- | -------------- | ----------- |
| First job       | 180s              | **\_** s       | **\_** %    |
| Second job      | 180s              | **\_** s       | **\_** %    |
| Third job       | 180s              | **\_** s       | **\_** %    |
| 10 jobs total   | 1800s             | **\_** s       | **\_** %    |
| Baseline memory | Low               | **\_** GB      | -           |

**Target:** 30-40% improvement for jobs after the first

### 17. Memory Stability

Monitor over 24 hours:

| Time     | GPU Memory | RAM       | Jobs Completed |
| -------- | ---------- | --------- | -------------- |
| Startup  | **\_** GB  | **\_** GB | 0              |
| 1 hour   | **\_** GB  | **\_** GB | **\_**         |
| 4 hours  | **\_** GB  | **\_** GB | **\_**         |
| 8 hours  | **\_** GB  | **\_** GB | **\_**         |
| 24 hours | **\_** GB  | **\_** GB | **\_**         |

**Expected:** Stable memory, no continuous growth

### 18. Throughput Analysis

| Period | Jobs Completed | Avg Time/Job | Notes |
| ------ | -------------- | ------------ | ----- |
| Hour 1 | **\_**         | **\_** s     |       |
| Hour 2 | **\_**         | **\_** s     |       |
| Hour 4 | **\_**         | **\_** s     |       |
| Day 1  | **\_**         | **\_** s     |       |

**Target:** Consistent or improving performance

---

## ✅ Edge Cases & Stress Testing

### 19. Edge Case Testing

- [ ] Empty audio file
- [ ] Corrupted audio file
- [ ] Very long audio (>30 min)
- [ ] Very short audio (<10 sec)
- [ ] No speech in audio
- [ ] Multiple languages in audio

### 20. Stress Testing

- [ ] Process 50 jobs consecutively
- [ ] Process jobs with no delay between them
- [ ] Monitor memory during stress test
- [ ] Verify periodic cleanup works
- [ ] No crashes or hangs
- [ ] Performance remains stable

### 21. Recovery Testing

- [ ] Kill worker during processing
- [ ] Restart worker
- [ ] Models reload successfully
- [ ] Unacked messages reprocessed
- [ ] No data loss
- [ ] Worker recovers gracefully

---

## ✅ Rollback Testing

### 22. Legacy Mode Test

```bash
# Switch to legacy mode
[ ] Set USE_MEMORY_MODE=false in .env
[ ] Restart worker
[ ] Verify logs show legacy mode
[ ] Process test jobs
[ ] Legacy mode works correctly
[ ] Can switch back to memory mode
```

### 23. Rollback Procedure

```bash
# If issues arise:
[ ] Stop worker
[ ] Set USE_MEMORY_MODE=false
[ ] Restart worker
[ ] System operates normally
[ ] Document issue for review
```

---

## ✅ Documentation & Knowledge Transfer

### 24. Documentation Complete

- [x] QUICK_SUMMARY.md created
- [x] MEMORY_MODE.md created
- [x] UPGRADE_TO_MEMORY_MODE.md created
- [x] REFACTORING_SUMMARY.md created
- [x] CHANGELOG.md updated
- [x] README.md updated
- [x] .env.example updated

### 25. Team Briefing

- [ ] Explained new architecture to team
- [ ] Demonstrated memory mode benefits
- [ ] Showed monitoring approach
- [ ] Explained rollback procedure
- [ ] Answered questions

---

## ✅ Sign-Off

### Final Checks

- [ ] All tests above completed
- [ ] Performance improvement verified
- [ ] No critical issues found
- [ ] Documentation reviewed
- [ ] Team trained
- [ ] Monitoring in place

### Approval

**Tested by:** **********\_\_**********  
**Date:** **********\_\_**********  
**Production ready:** Yes / No  
**Comments:**

---

---

---

---

## 🎉 Success Criteria

✅ **Code Quality**

- All validation tests pass
- No syntax or import errors
- Clean code review

✅ **Functionality**

- Worker starts successfully
- Jobs process correctly
- Transcripts saved accurately

✅ **Performance**

- 30-40% throughput improvement
- Faster job completion after first job
- Stable memory usage

✅ **Reliability**

- No crashes or hangs
- Graceful error handling
- Automatic recovery

✅ **Observability**

- Logs show memory stats
- Health monitoring works
- Easy troubleshooting

✅ **Documentation**

- Complete guides available
- Team trained
- Rollback documented

---

## 🚨 Red Flags (Stop Deployment If)

❌ **Critical Issues:**

- Worker won't start
- Frequent crashes
- Memory continuously growing
- Jobs failing consistently
- Performance worse than before
- CUDA OOM errors on every job

❌ **Major Issues:**

- Inconsistent performance
- Occasional crashes
- Memory leaks detected
- Jobs timing out
- Error rate >5%

⚠️ **Minor Issues (Can Deploy with Monitoring):**

- Slightly higher memory usage than expected
- Occasional cleanup needed
- Performance improvement less than 30%
- Minor logging issues

---

## 📞 Support

If issues found during testing:

1. Check [MEMORY_MODE.md](MEMORY_MODE.md) troubleshooting section
2. Review [UPGRADE_TO_MEMORY_MODE.md](UPGRADE_TO_MEMORY_MODE.md)
3. Try rollback to legacy mode
4. Check worker logs for specific errors
5. Monitor resource usage (GPU/RAM)

---

**Remember:** Legacy mode is always available as fallback (`USE_MEMORY_MODE=false`)
