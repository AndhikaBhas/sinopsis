#!/usr/bin/env python3
"""
Memory-optimized startup script for the diarization worker.
Sets up environment variables and memory limits before starting the main application.
"""

import os
import sys
import subprocess


def setup_memory_optimizations():
    """Configure environment variables for memory optimization."""
    
    print("=" * 60)
    print("Setting up memory optimizations...")
    print("=" * 60)
    
    # PyTorch CUDA memory management
    if 'PYTORCH_CUDA_ALLOC_CONF' not in os.environ:
        os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:512'
        print("✓ Set PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512")
    
    # Thread limits to reduce memory overhead
    if 'OMP_NUM_THREADS' not in os.environ:
        os.environ['OMP_NUM_THREADS'] = '4'
        print("✓ Set OMP_NUM_THREADS=4")
    
    if 'MKL_NUM_THREADS' not in os.environ:
        os.environ['MKL_NUM_THREADS'] = '4'
        print("✓ Set MKL_NUM_THREADS=4")
    
    # Memory allocator optimizations
    if 'MALLOC_TRIM_THRESHOLD_' not in os.environ:
        os.environ['MALLOC_TRIM_THRESHOLD_'] = '100000'
        print("✓ Set MALLOC_TRIM_THRESHOLD_=100000")
    
    # Disable PyTorch JIT if not needed (saves memory)
    if 'PYTORCH_JIT' not in os.environ:
        os.environ['PYTORCH_JIT'] = '0'
        print("✓ Set PYTORCH_JIT=0 (JIT disabled to save memory)")
    
    print("=" * 60)
    print()


def check_system_resources():
    """Check and log available system resources."""
    try:
        import psutil
        
        print("System Resources:")
        print("-" * 60)
        
        # Memory
        mem = psutil.virtual_memory()
        print(f"Total RAM: {mem.total / (1024**3):.2f} GB")
        print(f"Available RAM: {mem.available / (1024**3):.2f} GB")
        print(f"Used RAM: {mem.used / (1024**3):.2f} GB ({mem.percent}%)")
        
        # Swap
        swap = psutil.swap_memory()
        print(f"Total Swap: {swap.total / (1024**3):.2f} GB")
        print(f"Available Swap: {swap.free / (1024**3):.2f} GB")
        
        # CPU
        print(f"CPU Cores: {psutil.cpu_count(logical=True)} logical, {psutil.cpu_count(logical=False)} physical")
        
        print("-" * 60)
        
        # Warnings for low memory
        if mem.available < 4 * 1024**3:  # Less than 4GB available
            print("⚠ WARNING: Low memory available (< 4GB)")
            print("⚠ Consider increasing system RAM or Docker memory limit")
            print("⚠ Application may experience memory errors")
        
        print()
        
    except ImportError:
        print("Note: Install psutil for system resource monitoring")
        print("      pip install psutil")
        print()
    except Exception as e:
        print(f"Unable to check system resources: {e}")
        print()


def main():
    """Main startup function."""
    
    # Setup memory optimizations
    setup_memory_optimizations()
    
    # Check system resources
    check_system_resources()
    
    # Start main application
    print("Starting diarization worker...")
    print("=" * 60)
    print()
    
    try:
        # Import and run main application
        # This allows environment variables to be set before any imports
        import main as worker_main
        
        # The main module will handle its own execution
        sys.exit(0)
        
    except KeyboardInterrupt:
        print("\n\nReceived interrupt signal, shutting down...")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
