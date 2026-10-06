# Torchvision ABI Compatibility Fix

## Problem

When running the Docker image on Debian 12, you may encounter this error:

```
/opt/venv/lib/python3.10/site-packages/torchvision/io/image.py:13: UserWarning:
Failed to load image Python extension: '/opt/venv/lib/python3.10/site-packages/torchvision/image.so:
undefined symbol: _ZN3c1017RegisterOperatorsD1Ev'
```

## Root Cause

This error occurs due to **ABI (Application Binary Interface) incompatibility** between PyTorch and torchvision. Specifically:

- The error `undefined symbol: _ZN3c1017RegisterOperatorsD1Ev` indicates that torchvision was compiled against a different version of PyTorch's C++ ABI
- This happens when PyTorch and torchvision are not from the same build

### Why This Happens

PyTorch provides pre-built wheels with specific CUDA versions in their naming:

- `torch==2.1.0+cu121` (compiled for CUDA 12.1)
- `torch==2.1.0+cu118` (compiled for CUDA 11.8)
- `torch==2.1.0+cpu` (CPU-only)

When you install:

```bash
pip install torch==2.1.0 torchvision==0.16.0 --index-url https://download.pytorch.org/whl/cu121
```

Pip might:

1. Install `torch==2.1.0+cu121` (correct)
2. Install `torchvision==0.16.0` from PyPI (wrong - generic build)
3. Result: ABI mismatch

## Solution

**Explicitly specify the full version including the CUDA tag** for all PyTorch packages:

```dockerfile
# ✅ CORRECT - Ensures all packages are from the same build
RUN pip install --no-cache-dir \
    torch==2.1.0+cu121 \
    torchaudio==2.1.0+cu121 \
    torchvision==0.16.0+cu121 \
    --index-url https://download.pytorch.org/whl/cu121
```

```dockerfile
# ❌ WRONG - May pull mismatched versions
RUN pip install --no-cache-dir \
    torch==2.1.0 \
    torchaudio==2.1.0 \
    torchvision==0.16.0 \
    --index-url https://download.pytorch.org/whl/cu121
```

## Implementation in Dockerfile

The updated Dockerfile now uses conditional logic to ensure proper version matching:

```dockerfile
RUN if [ "${CUDA_VERSION}" = "cpu" ]; then \
        pip install --no-cache-dir \
            torch==2.1.0+cpu \
            torchaudio==2.1.0+cpu \
            torchvision==0.16.0+cpu \
            --index-url https://download.pytorch.org/whl/cpu; \
    elif [ "${CUDA_VERSION}" = "cu118" ]; then \
        pip install --no-cache-dir \
            torch==2.1.0+cu118 \
            torchaudio==2.1.0+cu118 \
            torchvision==0.16.0+cu118 \
            --index-url https://download.pytorch.org/whl/cu118; \
    else \
        pip install --no-cache-dir \
            torch==2.1.0+cu121 \
            torchaudio==2.1.0+cu121 \
            torchvision==0.16.0+cu121 \
            --index-url https://download.pytorch.org/whl/cu121; \
    fi
```

## How to Rebuild

```bash
# Clean rebuild to ensure fix is applied
docker system prune -f

# Build with GPU support (CUDA 12.x)
./buildDocker.sh gpu

# Or for CUDA 11.8
./buildDocker.sh gpu cu118

# Or for CPU-only
./buildDocker.sh cpu
```

## Verification

After rebuilding and running the container:

```bash
# Run the container
docker run --gpus all -it sinopsis-worker:gpu python -c "
import torch
import torchvision
print(f'PyTorch: {torch.__version__}')
print(f'Torchvision: {torchvision.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
print('No ABI warnings!')
"
```

Expected output (no warnings):

```
PyTorch: 2.1.0+cu121
Torchvision: 0.16.0+cu121
CUDA available: True
No ABI warnings!
```

## Version Compatibility Matrix

| CUDA Version   | PyTorch     | Torchaudio  | Torchvision  | Index URL |
| -------------- | ----------- | ----------- | ------------ | --------- |
| CUDA 12.1-12.4 | 2.1.0+cu121 | 2.1.0+cu121 | 0.16.0+cu121 | whl/cu121 |
| CUDA 11.8      | 2.1.0+cu118 | 2.1.0+cu118 | 0.16.0+cu118 | whl/cu118 |
| CPU only       | 2.1.0+cpu   | 2.1.0+cpu   | 0.16.0+cpu   | whl/cpu   |

## Related Issues

This is different from the previous torchvision warning about `libjpeg` and `libpng`. That was about missing image codec libraries, while this is about C++ ABI compatibility.

**Previous issue**: Missing image libraries (fixed by installing `libjpeg62-turbo` and `libpng16-16`)  
**This issue**: ABI mismatch (fixed by using explicit version tags)

## Additional Notes

### Why +cu121 Works for CUDA 12.2, 12.3, 12.4

PyTorch's `cu121` builds are forward-compatible with newer CUDA 12.x versions:

- `cu121` = compiled with CUDA 12.1 SDK
- Works with CUDA 12.1, 12.2, 12.3, 12.4 runtime
- Uses CUDA 12.x driver API which is stable

### Checking Installed Versions

Inside the container:

```bash
pip list | grep torch
```

Should show:

```
torch                     2.1.0+cu121
torchaudio                2.1.0+cu121
torchvision               0.16.0+cu121
```

All three must have the **same suffix** (+cu121, +cu118, or +cpu).

## References

- [PyTorch Install Guide](https://pytorch.org/get-started/locally/)
- [PyTorch Wheel Index](https://download.pytorch.org/whl/)
- [Torchvision Compatibility](https://github.com/pytorch/vision#installation)

---

_Fixed: October 5, 2025_
