# RabbitMQ ConnectionWrongStateError Fix

## Problem Summary

The worker was encountering a `pika.exceptions.ConnectionWrongStateError` during message consumption, specifically after processing audio files and publishing completion messages. This error occurs when RabbitMQ operations conflict with the main event processing loop.

### Error Location
```
File "utils\rabbitmq.py", line 140, in consume_messages
    self.channel.start_consuming()
...
File "pika\adapters\blocking_connection.py", line 498, in _flush_output
    raise exceptions.ConnectionWrongStateError()
```

## Root Cause

**CRITICAL ISSUE**: The main problem was calling `connection.process_data_events()` from within a consumer callback (after publishing a message). This is explicitly forbidden in Pika's BlockingConnection model because:

1. The main consumption loop (`start_consuming()`) is already processing events
2. Calling `process_data_events()` from within a callback creates a nested event loop
3. This causes the connection to enter an invalid state, triggering `ConnectionWrongStateError`

### Additional Issues
1. **Thread Safety**: Connection/channel accessed without proper synchronization
2. **Connection State Management**: Operations performed without checking if connection/channel was open
3. **Lock Conflicts**: Using locks in publish methods called from callbacks can cause deadlocks

## Solutions Implemented

### 1. **REMOVED process_data_events() Call (CRITICAL)**
The most important fix - removed the `process_data_events()` call from `publish_message()`:

```python
# BEFORE (WRONG - causes ConnectionWrongStateError)
self.channel.basic_publish(...)
self.connection.process_data_events(time_limit=0.1)  # ❌ CAUSES ERROR

# AFTER (CORRECT)
self.channel.basic_publish(...)
# No process_data_events() call needed!
# The main event loop handles message delivery automatically
```

### 2. **Removed Lock from publish_message()**
When `publish_message()` is called from within a consumer callback, using a lock can cause deadlocks. Since BlockingConnection is single-threaded by design, the lock was removed.

### 3. **Connection State Validation**
Added connection and channel state checks before operations:
```python
if not self.connection or self.connection.is_closed:
    self._connect()
if not self.channel or self.channel.is_closed:
    self._connect()
```

### 4. **Enhanced Error Handling**
- Wrapped callback with `safe_callback()` to catch and handle errors
- Added proper channel state checks before NACK operations
- Changed `publish_message()` to not raise exceptions (allows processing to continue)

### 5. **Connection Parameters**
Added heartbeat and timeout for better stability:
```python
parameters.heartbeat = 60
parameters.blocked_connection_timeout = 300
```

## Key Code Changes

### utils/rabbitmq.py - publish_message() (MOST IMPORTANT)
```python
def publish_message(self, message: Dict[str, Any], routing_key: str = None):
    # NO LOCK - can cause deadlock when called from callback
    try:
        # Validate connection state
        if not self.connection or self.connection.is_closed:
            self._connect()
        
        # Publish message
        self.channel.basic_publish(
            exchange=self.config.rabbitmq_exchange,
            routing_key=routing_key,
            body=message_body,
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type='application/json',
                content_encoding='utf-8'
            )
        )
        
        # ❌ DO NOT CALL process_data_events() here!
        # The main event loop handles delivery automatically
        
    except Exception as e:
        # Log but don't raise - allow processing to continue
        self.logger.error(f"Failed to publish message: {str(e)}")
```
- Added `threading.Lock()` for thread-safe operations
- Protected `publish_message()` and `close()` methods with lock
- Added `_is_consuming` flag to track consumption state

### 2. Connection State Validation
- Added connection and channel state checks before operations
- Automatic reconnection when connection is closed
- Added heartbeat and timeout parameters to connection:
  ```python
  parameters.heartbeat = 60
  parameters.blocked_connection_timeout = 300
  ```

### 3. Enhanced Error Handling
- Wrapped callback with `safe_callback()` to catch and handle errors
- Added proper channel state checks before NACK operations
- Changed `publish_message()` to not raise exceptions (allows processing to continue)
- Added event processing after publish to ensure message is sent

### 4. Graceful Shutdown
- Added proper consumer cancellation before connection close
- Better handling of KeyboardInterrupt and exceptions
- Protected all cleanup operations with try-except blocks

### 5. Message Processing Safety (main.py)
- Added channel state check before NACK operations
- Better error logging with full tracebacks
- Graceful handling when channel is already closed

## Key Changes

### utils/rabbitmq.py
```python
# Added thread safety
self._lock = threading.Lock()
self._is_consuming = False

# Connection parameters
parameters.heartbeat = 60
parameters.blocked_connection_timeout = 300

# Safe callback wrapper in consume_messages
def safe_callback(ch, method, properties, body):
    try:
        callback(ch, method, properties, body)
    except Exception as callback_error:
        # Handle error and NACK if channel is open
        if ch and not ch.is_closed:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

# Thread-safe publishing with state validation
with self._lock:
    if not self.connection or self.connection.is_closed:
        self._connect()
    # ... publish ...
    self.connection.process_data_events(time_limit=0.1)
```

### main.py
```python
# Better error handling in process_diarization_job
except Exception as e:
    self.logger.error(f"Error processing job: {str(e)}")
    self.logger.exception("Full error traceback:")
    
    try:
        if ch and not ch.is_closed:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        else:
            self.logger.warning("Channel is closed, cannot NACK message")
    except Exception as nack_error:
        self.logger.error(f"Failed to NACK message: {str(nack_error)}")
```

### utils/rabbitmq.py - consume_messages()
```python
def safe_callback(ch, method, properties, body):
    try:
        callback(ch, method, properties, body)
    except Exception as callback_error:
        self.logger.error(f"Error in message callback: {str(callback_error)}")
        # NACK message if channel is still open
        if ch and not ch.is_closed:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

self.channel.basic_consume(
    queue=self.config.rabbitmq_input_queue,
    on_message_callback=safe_callback,
    auto_ack=False
)

self._is_consuming = True
self.channel.start_consuming()  # This handles all event processing
```

### main.py - process_diarization_job()
```python
try:
    # ... process job ...
    
    # Publish completion message
    # This is safe because we removed process_data_events() from publish_message()
    self.rabbitmq.publish_message(completion_message)
    
    # Acknowledge message
    ch.basic_ack(delivery_tag=method.delivery_tag)
    
except Exception as e:
    self.logger.error(f"Error processing job: {str(e)}")
    
    # Check channel state before NACK
    if ch and not ch.is_closed:
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    else:
        self.logger.warning("Channel is closed, cannot NACK message")
```

## Why This Fix Works

### The Pika Event Loop Model
Pika's `BlockingConnection` uses a single-threaded event loop:

```
┌─────────────────────────────────────┐
│   start_consuming()                 │
│   ├── Process incoming messages     │
│   ├── Call user callbacks           │
│   │   └── Your process_job()        │
│   │       ├── Do work               │
│   │       ├── basic_publish() ✅    │
│   │       └── basic_ack() ✅        │
│   └── Handle outgoing messages      │
└─────────────────────────────────────┘
```

**What NOT to do inside a callback:**
```python
❌ self.connection.process_data_events()  # Creates nested loop!
❌ self.channel.start_consuming()         # Creates nested loop!
❌ with lock: ...                          # Can deadlock (single-threaded)
```

**What IS safe inside a callback:**
```python
✅ self.channel.basic_publish()           # Queues message for sending
✅ self.channel.basic_ack()               # Queues acknowledgment
✅ self.channel.basic_nack()              # Queues negative acknowledgment
✅ Database operations
✅ File I/O
✅ CPU-intensive work
```

The main event loop (`start_consuming()`) automatically:
- Sends queued published messages
- Sends queued acknowledgments
- Receives new messages
- Maintains heartbeat

## Testing Recommendations

1. **Basic Operation**: Start worker and process a message successfully
2. **Message Publishing**: Verify completion messages are sent to output queue
3. **Error Handling**: Send malformed messages and verify proper NACK
4. **Graceful Shutdown**: Press Ctrl+C during processing and verify clean shutdown
5. **Long Running**: Process multiple messages sequentially
6. **Connection Recovery**: Temporarily disconnect RabbitMQ and verify reconnection

## Expected Behavior

- **Normal Operation**: Messages consumed → processed → published → acknowledged
- **On Error**: Messages NACKed without ConnectionWrongStateError
- **On Shutdown**: Clean disconnect with proper cleanup
- **During Processing**: Completion messages published successfully

## Common Pitfalls with Pika BlockingConnection

### ❌ NEVER Do These in a Callback:
1. `connection.process_data_events()` - Causes ConnectionWrongStateError
2. `channel.start_consuming()` - Creates nested consumption loop
3. Heavy thread synchronization - BlockingConnection is single-threaded
4. Long blocking operations - Use worker threads instead

### ✅ ALWAYS Safe in a Callback:
1. `channel.basic_publish()` - Messages queued and sent by main loop
2. `channel.basic_ack()` - Acknowledgment queued and sent by main loop
3. `channel.basic_nack()` - Negative ack queued and sent by main loop
4. Business logic (database, files, processing)

## Monitoring

Watch for these log messages:
- ✅ "Successfully connected to RabbitMQ and configured queues"
- ✅ "Successfully processed rapat_id: X"
- ✅ "Successfully published message to output_queue"
- ⚠️ "Connection closed, attempting to reconnect..."
- ⚠️ "Failed to publish message" (non-fatal)
- ❌ "ConnectionWrongStateError" (should NOT appear anymore)

## Additional Notes

- **No locks in publish_message()**: BlockingConnection is single-threaded by design
- **No process_data_events() calls**: The main loop handles all event processing
- **Heartbeat set to 60s**: Detects dead connections
- **Publish errors are logged but not raised**: Processing continues even if notification fails
- **Channel state checked before NACK**: Prevents errors when channel is closed

## If Issues Persist

1. **Check Pika version**: Ensure you're using a recent version (1.3.0+)
   ```bash
   pip show pika
   ```

2. **Enable DEBUG logging**:
   ```python
   import logging
   logging.basicConfig(level=logging.DEBUG)
   ```

3. **Verify RabbitMQ server**:
   - Check server logs for connection issues
   - Verify memory and connection limits
   - Check network connectivity

4. **Consider AsyncIO adapter**: For complex scenarios, Pika's AsyncIO adapter is more flexible than BlockingConnection

5. **Review callback duration**: Long-running callbacks can cause heartbeat timeouts

## References

- [Pika Documentation - BlockingConnection](https://pika.readthedocs.io/en/stable/modules/adapters/blocking.html)
- [Common BlockingConnection Mistakes](https://pika.readthedocs.io/en/stable/faq.html)
- [RabbitMQ Best Practices](https://www.rabbitmq.com/best-practices.html)

---

**Last Updated**: October 19, 2025  
**Status**: ✅ FIXED - ConnectionWrongStateError resolved
