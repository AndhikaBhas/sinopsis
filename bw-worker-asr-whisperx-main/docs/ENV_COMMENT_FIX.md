# Environment Variable Comment Fix

## Problem

When running the service via systemd, the worker crashed with this error:

```
ValueError: invalid literal for int() with base 10: '10  # Force garbage collection every N jobs'
```

This occurred because the `.env` file contained inline comments like:

```bash
MEMORY_CLEANUP_INTERVAL=10  # Force garbage collection every N jobs
```

## Root Cause

Unlike shell scripts or some configuration parsers, Python's `os.getenv()` does **not** automatically strip comments. When loading environment variables from `.env` files via `python-dotenv`, the entire string after the `=` sign (including comments) becomes the value.

When the code tries to convert this to an integer:

```python
int(os.getenv('MEMORY_CLEANUP_INTERVAL', '10'))  # Fails!
```

It attempts to convert `"10  # Force garbage collection every N jobs"` to an integer, which causes a `ValueError`.

## Solution

Added a helper function `get_env_value()` that safely parses environment variables by stripping inline comments:

```python
def get_env_value(key, default=''):
    """Get environment variable and strip inline comments (everything after #)"""
    value = os.getenv(key, default)
    # Strip inline comments from .env files
    if isinstance(value, str) and '#' in value:
        value = value.split('#')[0].strip()
    return value
```

All configuration variables that need type conversion now use this helper:

```python
MEMORY_CLEANUP_INTERVAL = int(get_env_value('MEMORY_CLEANUP_INTERVAL', '10'))
ASR_BATCH_SIZE = int(get_env_value('ASR_BATCH_SIZE', '16'))
MIN_REPETITION_COUNT = int(get_env_value('MIN_REPETITION_COUNT', '2'))
CLEANING_SIMILARITY_THRESHOLD = float(get_env_value('CLEANING_SIMILARITY_THRESHOLD', '0.85'))
```

## Best Practices for .env Files

### ✅ Recommended: Comments on Separate Lines

```bash
# Force cleanup every N jobs
MEMORY_CLEANUP_INTERVAL=10

# Batch size for ASR processing
ASR_BATCH_SIZE=16
```

### ⚠️ Now Supported but Less Clean: Inline Comments

```bash
MEMORY_CLEANUP_INTERVAL=10  # Force cleanup every N jobs
ASR_BATCH_SIZE=16  # Batch size for ASR processing
```

With the fix, both formats now work correctly. However, separate-line comments are still preferred for better readability.

## Files Modified

- `worker.py`: Added `get_env_value()` helper function and updated all numeric environment variable parsing

## Testing

To verify the fix:

1. Create a `.env` file with inline comments:

   ```bash
   MEMORY_CLEANUP_INTERVAL=10  # Force cleanup every N jobs
   ASR_BATCH_SIZE=16  # Batch size
   ```

2. Run the worker:

   ```bash
   python worker.py
   ```

3. Verify it starts without ValueError

## Related Issues

- This fix prevents crashes when `.env` files contain inline comments
- Makes the code more robust and user-friendly
- Consistent with common configuration file expectations

## Date

Fixed: October 2, 2025
