#!/usr/bin/env python3
"""
Verification script to test if PyAnnote can import and load correctly.
This verifies that torchcodec has been removed (the root cause of std::bad_alloc).
"""

import sys
import os

def test_pyannote_import():
    """Test that PyAnnote imports without torchcodec causing std::bad_alloc."""
    print("=" * 80)
    print("PYANNOTE IMPORT TEST")
    print("=" * 80)
    
    # Step 1: Check if torchcodec is NOT installed
    print("\n[1/4] Checking if torchcodec is removed...")
    try:
        import torchcodec
        print("     ✗ ERROR: torchcodec is still installed!")
        print("     This will cause std::bad_alloc errors.")
        print("     Run: pip uninstall -y torchcodec")
        return False
    except ImportError:
        print("     ✓ torchcodec is not installed (GOOD)")
    
    # Step 2: Import torch
    print("\n[2/4] Importing torch...")
    try:
        import torch
        torch.set_num_threads(4)
        torch.set_num_interop_threads(2)
        print(f"     ✓ PyTorch {torch.__version__} imported")
    except Exception as e:
        print(f"     ✗ Failed to import torch: {e}")
        return False
    
    # Step 3: Set up basic environment variables
    print("\n[3/4] Setting up environment...")
    os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'max_split_size_mb:256,expandable_segments:True')
    os.environ.setdefault('OMP_NUM_THREADS', '4')
    os.environ.setdefault('MKL_NUM_THREADS', '4')
    print("     ✓ Environment configured")
    
    # Step 4: Import PyAnnote Pipeline
    print("\n[4/4] Importing PyAnnote Pipeline...")
    print("     Note: This would crash with std::bad_alloc if torchcodec was installed")
    try:
        from pyannote.audio import Pipeline
        print("     ✓ PyAnnote Pipeline imported successfully!")
        print("     ✓ No std::bad_alloc error!")
    except Exception as e:
        print(f"     ✗ Failed to import Pipeline: {e}")
        print("\n     If you see 'std::bad_alloc', check:")
        print("     1. Is torchcodec installed? (should NOT be)")
        print("     2. Run: pip list | grep torchcodec")
        print("     3. If found, run: pip uninstall -y torchcodec")
        return False
    
    print("\n" + "=" * 80)
    print("✅ SUCCESS: PyAnnote imports correctly!")
    print("=" * 80)
    print("\nVerification complete:")
    print("  ✓ torchcodec is not installed")
    print("  ✓ PyTorch imports successfully")
    print("  ✓ PyAnnote imports successfully")
    print("  ✓ No std::bad_alloc errors")
    print("\nYour setup is ready to run!")
    print("=" * 80)
    
    return True


def main():
    """Run verification test."""
    print("\n" + "=" * 80)
    print("PYANNOTE VERIFICATION SCRIPT")
    print("=" * 80)
    print(f"Python version: {sys.version}")
    print(f"Platform: {sys.platform}")
    print("=" * 80)
    
    success = test_pyannote_import()
    
    if success:
        print("\n✅ Verification passed!")
        print("   Run 'python main.py' to start the worker.")
    else:
        print("\n❌ Verification failed!")
        print("   Check the error messages above.")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
