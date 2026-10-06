# RabbitMQ Heartbeat Timeout Fix for Long-Running Tasks

## The Real Problem

The `ConnectionWrongStateError` was actually caused by **RabbitMQ closing the connection during long-running audio processing**:

```
Stream connection lost: ConnectionResetError(10054, 'An existing connection was forcibly closed by the remote host'
```

### What Was Happening

1. Worker receives message and starts processing audio (takes 2-5 minutes)
2. RabbitMQ heartbeat timeout (60 seconds) expires
3. RabbitMQ server thinks client is dead and **forcibly closes the connection**
4. Worker finishes processing and tries to publish completion message → Fails (connection closed)
5. Worker tries to ACK message → **Channel is closed** → Raises exception
6. Exception handling tries to NACK → Still closed
7. Main loop tries to continue → `ConnectionWrongStateError`

### The Chain Reaction

```
Long Audio Processing (>60s)
    ↓
Heartbeat Timeout
    ↓
RabbitMQ Closes Connection
    ↓
publish_message() fails (connection lost)
    ↓
basic_ack() fails (channel closed)
    ↓
Exception raised in callback
    ↓
ConnectionWrongStateError in main loop
```

## The Solution

### 1. Disable Heartbeat for Long-Running Tasks

```python
# utils/rabbitmq.py - _connect() method
parameters.heartbeat = 0  # Disable heartbeat completely
```

**Why this works:**
- Heartbeat is designed to detect dead connections quickly
- For long-running tasks, it causes false positives
- Setting to `0` disables heartbeat checks
- Alternative: Set to very high value like `3600` (1 hour)

### 2. Protected ACK Operation

```python
# main.py - process_diarization_job()
try:
    if ch and not ch.is_closed:
        ch.basic_ack(delivery_tag=method.delivery_tag)
    else:
        self.logger.warning("Channel is closed, cannot ACK")
except Exception as ack_error:
    self.logger.error(f"Failed to ACK: {str(ack_error)}")
    # Message will be requeued by RabbitMQ
```

**Why this works:**
- Checks channel state before ACK
- Catches exceptions if ACK fails
- Doesn't raise exception, allowing graceful continuation
- RabbitMQ will automatically requeue unacked messages

## What Changed

### utils/rabbitmq.py
```python
# BEFORE (caused timeouts)
parameters.heartbeat = 60

# AFTER (disabled for long tasks)
parameters.heartbeat = 0  # Disable heartbeat for long-running tasks
```

### main.py
```python
# BEFORE (crashed when channel closed)
ch.basic_ack(delivery_tag=method.delivery_tag)

# AFTER (handles closed channel)
try:
    if ch and not ch.is_closed:
        ch.basic_ack(delivery_tag=method.delivery_tag)
    else:
        self.logger.warning("Channel is closed, cannot ACK")
except Exception as ack_error:
    self.logger.error(f"Failed to ACK: {str(ack_error)}")
```

## Understanding Heartbeat

### What is Heartbeat?
- Periodic "ping" between client and server
- Ensures both sides know the connection is alive
- If no data is sent/received within heartbeat interval, connection closes

### When to Use Heartbeat
✅ **Enable (60-600s)** for:
- Short-lived tasks (<30 seconds)
- Interactive applications
- When you need to detect network issues quickly

❌ **Disable (0)** for:
- Long-running tasks (minutes to hours)
- Background workers processing large files
- Tasks with unpredictable duration

### Alternative Approaches

#### Option 1: Very High Heartbeat (Recommended for Production)
```python
parameters.heartbeat = 3600  # 1 hour
```
- Still detects truly dead connections
- Allows for long processing times
- Better than disabling completely

#### Option 2: Consumer Timeout (RabbitMQ 3.8.15+)
```python
# Set on queue declaration
x-consumer-timeout = 3600000  # 1 hour in milliseconds
```
- Server-side timeout for consumer
- Independent of heartbeat
- Requires RabbitMQ configuration

#### Option 3: Threading (Complex)
```python
def process_diarization_job(...):
    # Send heartbeat in background thread
    def heartbeat_sender():
        while processing:
            connection.process_data_events(0.1)
            time.sleep(10)
    
    # Process in main thread
    threading.Thread(target=heartbeat_sender).start()
    result = diarizer.diarize_audio(audio_data)
```
⚠️ **NOT RECOMMENDED**: Complex, error-prone, defeats BlockingConnection purpose

## Expected Behavior Now

### Successful Processing
```
1. Receive message
2. Process audio (5 minutes) ← No timeout!
3. Publish completion message ✅
4. ACK message ✅
5. Wait for next message
```

### If Connection Lost During Processing
```
1. Receive message
2. Process audio (5 minutes)
3. Publish completion message ❌ (connection lost)
   └─> Logged, not raised
4. Try to ACK message ❌ (channel closed)
   └─> Logged, not raised
5. safe_callback catches exception
6. safe_callback tries to NACK ❌ (channel closed)
   └─> Logged, not raised
7. Main loop exits gracefully ✅
8. RabbitMQ requeues unacked message automatically
```

## Monitoring

### Good Signs ✅
```
Successfully connected to RabbitMQ and configured queues
Processing diarization job for rapat_id: 123
Starting speaker diarization...
Successfully published message to output_queue
Successfully processed rapat_id: 123
```

### Warning Signs ⚠️
```
Stream connection lost: ConnectionResetError
Failed to publish message
Channel is closed, cannot ACK message
Message will be requeued by RabbitMQ after timeout
```
→ **Action**: Check RabbitMQ server health, network stability

### Error Signs ❌
```
Failed to connect to RabbitMQ
ConnectionWrongStateError (should not happen now!)
```
→ **Action**: Check RabbitMQ server is running, credentials are correct

## Testing

### Test 1: Normal Processing
```powershell
python main.py
# Send a message
# Should process successfully and ACK
```

### Test 2: Long Processing
```powershell
# Process a very long audio file (>5 minutes)
# Should complete without heartbeat timeout
```

### Test 3: Connection Loss During Processing
```powershell
# Start processing
# Restart RabbitMQ server mid-processing
# Worker should log errors but not crash
# Message should be requeued
```

## Alternative: If You Still Want Heartbeat

If you need heartbeat for other reasons, set it high:

```python
# For tasks up to 10 minutes
parameters.heartbeat = 600

# For tasks up to 30 minutes
parameters.heartbeat = 1800

# For tasks up to 1 hour
parameters.heartbeat = 3600
```

**Rule of thumb**: Set heartbeat to **2x your maximum expected processing time**

## Summary

The `ConnectionWrongStateError` wasn't caused by our code calling `process_data_events()` or `_connect()` (those were real issues too), but by **RabbitMQ forcibly closing the connection due to heartbeat timeout during long audio processing**.

**The fix**: Disable heartbeat (`= 0`) or set it very high (`= 3600`) for long-running tasks.

---

**Last Updated**: October 19, 2025  
**Status**: ✅ FIXED - Heartbeat disabled for long-running tasks
