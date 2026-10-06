# Archived Memory Fix Documentation

## Why These Files Are Here

These documents describe various attempts to fix the `std::bad_alloc` error **before** we discovered the actual root cause.

**The real issue**: `torchcodec` 0.8.0 had a memory allocation bug with PyTorch 2.8.0+cu128

**The actual fix**: Simply remove torchcodec - see [TORCHCODEC_FIX.md](../../../TORCHCODEC_FIX.md)

---

## Historical Context

Between October 2025, we experienced `std::bad_alloc` errors and tried many approaches:

1. **Memory allocation optimizations** - jemalloc, malloc tuning
2. **Linux kernel settings** - overcommit, THP, ulimits
3. **PyAnnote loader patching** - safe_pyannote_loader module
4. **Thread management** - limiting threads during load
5. **Docker memory limits** - shm-size, memory flags

**All of these were workarounds** for what turned out to be a simple dependency issue.

---

## What We Learned

### ❌ Ineffective Approaches

1. **jemalloc** - Didn't fix the issue (torchcodec still crashed)
2. **Kernel tuning** - Not the problem (plenty of RAM available)
3. **Monkey-patching** - Added complexity without solving root cause
4. **High-RAM detection** - Overengineered for wrong problem

### ✅ What Actually Worked

1. **Root cause analysis** - Tested individual imports
2. **Systematic elimination** - Found torchcodec was the culprit
3. **Simple solution** - Just remove the broken dependency
4. **Code simplification** - Removed all workarounds

---

## Files in This Archive

### Fix Attempts
- `CRITICAL_FIX_BAD_ALLOC.md` - Early fix attempt
- `PYANNOTE_4_FIX.md` - PyAnnote 4.0 specific fixes
- `JEMALLOC_FIX.md` - jemalloc solution attempt
- `LINUX_FIX_README.md` - Linux kernel tuning
- `MEMORY_FIX_QUICKREF.md` - Memory optimization guide

### Implementation Docs
- `FIX_IMPLEMENTATION_COMPLETE.md` - Safe loader implementation
- `FIX_APPLIED_README.md` - Applied fix documentation
- `FIXES_APPLIED.md` - Multiple fix attempts
- `IMPORT_FIX_GUIDE.md` - Import order fixes
- `SOLUTION_SUMMARY.md` - Summary of attempted solutions

### Reference Files
- `CHEAT_SHEET_128GB.txt` - High-RAM system guide
- `QUICK_FIX_REFERENCE.txt` - Quick fix commands
- `IMPORT_FIX_QUICKREF.txt` - Import order reference
- `DEBUG_OUTPUT_GUIDE.md` - Debugging guide
- `LINUX_QUICK_CHECKLIST.md` - Linux setup checklist

---

## Timeline

- **Early October**: First std::bad_alloc errors reported
- **Mid October**: Tried jemalloc, kernel tuning, safe loader
- **October 20**: Implemented safe_pyannote_loader workaround
- **October 21**: Discovered torchcodec was the actual cause
- **October 21**: Simplified code, removed all workarounds

---

## Lessons

1. **Find root cause first** - Don't build complex workarounds
2. **Test systematically** - Isolate the problem
3. **Keep it simple** - Simple solutions are often best
4. **Document journey** - Historical context is valuable

---

## Current Solution

See the main documentation:
- [TORCHCODEC_FIX.md](../../../TORCHCODEC_FIX.md)
- [CODE_SIMPLIFICATION_SUMMARY.md](../../../CODE_SIMPLIFICATION_SUMMARY.md)
- [README.md](../../../README.md)

---

**Archived**: October 21, 2025  
**Reason**: Superseded by simpler solution
