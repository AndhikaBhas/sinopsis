#!/bin/bash

# Script to verify that the Docker image can run offline
# Tests that all models are properly cached

set -e

IMAGE_NAME=${1:-sinopsis-worker-diarizer:latest}

echo "======================================"
echo "Offline Mode Verification"
echo "======================================"
echo ""
echo "Testing image: $IMAGE_NAME"
echo ""

# Test 1: Check if HuggingFace cache directory exists
echo "Test 1: Checking cache directory..."
if docker run --rm $IMAGE_NAME ls -la /opt/huggingface_cache > /dev/null 2>&1; then
    echo "✓ Cache directory exists"
else
    echo "✗ Cache directory NOT found"
    exit 1
fi
echo ""

# Test 2: Check if model files exist
echo "Test 2: Checking for PyAnnote model files..."
MODEL_CHECK=$(docker run --rm $IMAGE_NAME ls /opt/huggingface_cache | grep -c "models--pyannote" || true)
if [ "$MODEL_CHECK" -gt 0 ]; then
    echo "✓ PyAnnote model files found ($MODEL_CHECK model directories)"
    docker run --rm $IMAGE_NAME ls /opt/huggingface_cache | grep "models--pyannote"
else
    echo "✗ PyAnnote model files NOT found"
    echo "  Cache contents:"
    docker run --rm $IMAGE_NAME ls -la /opt/huggingface_cache
    exit 1
fi
echo ""

# Test 3: Check environment variables
echo "Test 3: Checking offline environment variables..."
OFFLINE_VARS=$(docker run --rm $IMAGE_NAME bash -c 'echo "HF_HUB_OFFLINE=$HF_HUB_OFFLINE"; echo "TRANSFORMERS_OFFLINE=$TRANSFORMERS_OFFLINE"; echo "HF_DATASETS_OFFLINE=$HF_DATASETS_OFFLINE"')
echo "$OFFLINE_VARS"
if echo "$OFFLINE_VARS" | grep -q "HF_HUB_OFFLINE=1"; then
    echo "✓ Offline mode is properly configured"
else
    echo "⚠ WARNING: Offline mode may not be properly configured"
fi
echo ""

# Test 4: Test Python import (without network)
echo "Test 4: Testing Python imports without network..."
if docker run --rm --network=none $IMAGE_NAME python -c "
import os
print('Python import test:')
print('  HF_HOME:', os.environ.get('HF_HOME'))
print('  HF_HUB_OFFLINE:', os.environ.get('HF_HUB_OFFLINE'))
try:
    import torch
    print('✓ PyTorch imported successfully')
except Exception as e:
    print('✗ PyTorch import failed:', e)
    exit(1)
try:
    from pyannote.audio import Pipeline
    print('✓ PyAnnote imported successfully')
except Exception as e:
    print('✗ PyAnnote import failed:', e)
    exit(1)
print('✓ All imports successful')
" 2>&1; then
    echo "✓ Python imports work without network"
else
    echo "✗ Python imports failed without network"
    exit 1
fi
echo ""

# Test 5: Verify model can be loaded (with timeout, as this takes time)
echo "Test 5: Testing model loading in offline mode..."
echo "  (This may take 30-60 seconds...)"
if timeout 120 docker run --rm --network=none \
    -e HUGGINGFACE_AUTH_TOKEN=dummy_token_not_used_in_offline_mode \
    $IMAGE_NAME python -c "
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
print('Attempting to load pipeline in offline mode...')
try:
    from pyannote.audio import Pipeline
    pipeline = Pipeline.from_pretrained(
        'pyannote/speaker-diarization-community-1',
        use_auth_token='dummy',
        local_files_only=True
    )
    print('✓ Pipeline loaded successfully from cache!')
    print('✓ Model is ready for offline use')
except Exception as e:
    print('✗ Failed to load pipeline:', str(e))
    import traceback
    traceback.print_exc()
    exit(1)
" 2>&1; then
    echo "✓ Model loads successfully in offline mode"
else
    echo "✗ Model failed to load in offline mode"
    echo ""
    echo "Possible causes:"
    echo "  1. Models weren't fully downloaded during build"
    echo "  2. Cache directory wasn't properly copied to runtime stage"
    echo "  3. HF_TOKEN was invalid during build"
    exit 1
fi
echo ""

# Summary
echo "======================================"
echo "✓ All Offline Verification Tests Passed!"
echo "======================================"
echo ""
echo "The Docker image is properly configured for offline operation."
echo "You can now run the container without internet access:"
echo ""
echo "  docker run --network=none $IMAGE_NAME"
echo ""
echo "Or with regular networking (still uses cached models):"
echo "  docker run $IMAGE_NAME"
echo ""
