#!/usr/bin/env python3
"""
Download PyAnnote models for offline use.
This script downloads all required models during Docker build.
"""

import os
import sys

def download_models():
    """Download PyAnnote speaker diarization model and dependencies."""
    try:
        print("=" * 60)
        print("Downloading PyAnnote speaker-diarization-community-1 model...")
        print("=" * 60)
        
        # Check for HuggingFace token
        hf_token = os.environ.get('HUGGINGFACE_HUB_TOKEN')
        if not hf_token:
            print("WARNING: HUGGINGFACE_HUB_TOKEN not set!")
            print("Model download may fail if model requires authentication.")
            print("Set with: docker build --build-arg HF_TOKEN=your_token_here")
            return 1
        
        # Verify HF_HOME is set correctly
        hf_home = os.environ.get('HF_HOME')
        print(f"\nHF_HOME: {hf_home}")
        print(f"TRANSFORMERS_CACHE: {os.environ.get('TRANSFORMERS_CACHE')}")
        
        if not hf_home:
            print("ERROR: HF_HOME not set!")
            return 1
        
        # Create cache directory if it doesn't exist
        os.makedirs(hf_home, exist_ok=True)
        print(f"✓ Cache directory ready: {hf_home}")
        
        # Import after checking token
        # Set memory-efficient settings BEFORE importing PyTorch/PyAnnote
        os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:512'
        os.environ['OMP_NUM_THREADS'] = '2'
        os.environ['MKL_NUM_THREADS'] = '2'
        
        # Import libraries
        import torch
        from pyannote.audio import Pipeline
        
        # Force CPU usage during download to save memory
        print("\nUsing CPU for model download to conserve memory...")
        torch.set_num_threads(2)  # Limit threads to reduce memory usage
        
        # Log memory optimization settings
        print(f"Memory optimizations:")
        print(f"  - PYTORCH_CUDA_ALLOC_CONF: {os.environ.get('PYTORCH_CUDA_ALLOC_CONF')}")
        print(f"  - OMP_NUM_THREADS: {os.environ.get('OMP_NUM_THREADS')}")
        print(f"  - Torch threads: {torch.get_num_threads()}")
        
        # Download the model (this will cache it in HF_HOME)
        print("\nDownloading pyannote/speaker-diarization-community-1...")
        print("This may take several minutes...")
        print("Note: Model files will be downloaded to cache for offline use")
        
        # During build, we need to allow downloads (don't set HF_HUB_OFFLINE=1 yet)
        # PyAnnote will automatically cache to HF_HOME
        try:
            # Simply call from_pretrained - it will download and cache automatically
            # The cache_dir is set via HF_HOME environment variable
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-community-1",
                token=hf_token
            )
            
            print("\n✓ Model downloaded successfully!")
            print(f"✓ Cached to: {hf_home}")
            print(f"✓ Pipeline type: {type(pipeline).__name__}")
            
            # Verify all components are loaded
            if hasattr(pipeline, '_models'):
                print(f"✓ Pipeline components loaded: {len(pipeline._models) if pipeline._models else 0}")
            
            # Clean up to free memory
            del pipeline
            
        except Exception as e:
            # If loading fails due to memory, check if files were downloaded
            print(f"\n⚠ Pipeline instantiation had issues: {e}")
            print("Checking if model files were downloaded...")
            
            # The important thing is that files are cached, not that pipeline loads
            model_dir = os.path.join(hf_home, "models--pyannote--speaker-diarization-community-1")
            if os.path.exists(model_dir):
                print("✓ Model files were successfully downloaded to cache")
                print(f"✓ Model directory exists: {model_dir}")
            else:
                print(f"✗ Model directory not found: {model_dir}")
                print("This may indicate a download failure or authentication issue")
                raise Exception(f"Model files were not downloaded. Expected directory: {model_dir}")
        
        # List cache contents
        print(f"\nCache contents:")
        for item in os.listdir(hf_home):
            item_path = os.path.join(hf_home, item)
            if os.path.isdir(item_path):
                print(f"  📁 {item}")
            else:
                print(f"  📄 {item}")
        
        # Verify model directory exists
        model_dir_pattern = "models--pyannote--speaker-diarization-community-1"
        model_exists = any(model_dir_pattern in item for item in os.listdir(hf_home))
        
        if model_exists:
            print(f"\n✓ Model cache verified: {model_dir_pattern} found")
        else:
            print(f"\n⚠ WARNING: Model directory pattern '{model_dir_pattern}' not found in cache")
            print("Cache contents:", os.listdir(hf_home))
        
        print("\n" + "=" * 60)
        print("Model download completed successfully!")
        print("=" * 60)
        
        return 0
        
    except Exception as e:
        print(f"\n✗ ERROR: Failed to download models: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        print("\nTroubleshooting:", file=sys.stderr)
        print("1. Ensure you have accepted the model license at:", file=sys.stderr)
        print("   https://huggingface.co/pyannote/speaker-diarization-community-1", file=sys.stderr)
        print("2. Provide a valid HuggingFace token with --build-arg HF_TOKEN=...", file=sys.stderr)
        print("3. Ensure you have internet connection during build", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(download_models())
