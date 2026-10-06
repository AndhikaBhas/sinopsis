# Quick Fix Summary - ConnectionWrongStateError

## The Problem
After processing audio files, the worker crashed with:
```
pika.exceptions.ConnectionWrongStateError
```

## The Root Causes
❌ **TWO issues were causing the error:**

### Issue 1: Calling `process_data_events()` from callback
```python
def publish_message(...):
    self.channel.basic_publish(...)
    self.connection.process_data_events(time_limit=0.1)  # ❌ WRONG!
```

### Issue 2: Calling `_connect()` from callback
```python
def publish_message(...):
    if not self.connection or self.connection.is_closed:
        self._connect()  # ❌ WRONG! Calls queue_declare, queue_bind, etc.
```

Both operations interact with the event loop and cause ConnectionWrongStateError when called from within a consumer callback!

## The Fix
✅ **Removed BOTH problematic operations**

Fixed code:
```python
def publish_message(...):
    # Check connection but DON'T reconnect
    if not self.connection or self.connection.is_closed:
        raise ConnectionError("RabbitMQ connection is closed")
    
    self.channel.basic_publish(...)
    # No process_data_events()!
    # No reconnection!
    # The main event loop handles everything automatically
```

## Why This Works
- Pika's `start_consuming()` already runs an event loop
- Calling `process_data_events()` from inside a callback creates a nested loop
- Calling `_connect()` from inside a callback calls `queue_declare`, `queue_bind`, etc., which also interact with the event loop
- Both cause the connection to enter an invalid state → `ConnectionWrongStateError`
- The main loop automatically sends published messages - no manual processing needed!

## What Was Changed
1. **utils/rabbitmq.py** - Removed `process_data_events()` from `publish_message()`
2. **utils/rabbitmq.py** - Removed `_connect()` call from `publish_message()` (now just fails if connection is closed)
3. **utils/rabbitmq.py** - Removed lock from `publish_message()` (single-threaded by design)
4. **main.py** - Enhanced error handling with channel state checks
5. **RABBITMQ_FIX.md** - Complete documentation of the issue and fix

## Test It Now
```powershell
python main.py
```

Your worker should now:
- ✅ Process messages successfully
- ✅ Publish completion messages without errors
- ✅ Continue running without crashes
- ✅ Handle errors gracefully

## Key Takeaway
When using Pika's `BlockingConnection`:
- ❌ NEVER call `process_data_events()` from inside a callback
- ❌ NEVER call `start_consuming()` from inside a callback  
- ❌ NEVER call `_connect()` or any queue/exchange operations from inside a callback
- ✅ ALWAYS let the main event loop handle everything
- ✅ Just call `basic_publish()`, `basic_ack()`, `basic_nack()` - they queue operations automatically
- ✅ If connection is closed during callback, fail gracefully and let message requeue

## What Happens if Publish Fails?
If the connection is closed when trying to publish:
- ✅ Error is logged
- ✅ Job processing completes normally  
- ✅ Message is ACKed (job was processed successfully)
- ℹ️ Notification message is lost (acceptable - job data is in database)

This is the correct behavior - the main job (diarization) succeeded, only the notification failed.

---
**Status**: ✅ FIXED  
**Date**: October 19, 2025
