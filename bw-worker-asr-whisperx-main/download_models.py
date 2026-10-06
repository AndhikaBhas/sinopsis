#!/usr/bin/env python3.11
"""
WhisperX Model Download Script
Downloads ASR and alignment models for Docker builds
"""
import os
import sys
import warnings
warnings.filterwarnings('ignore')

def main():
    # Get environment variables
    asr_model = os.environ.get('ASR_MODEL', 'tiny')
    asr_language = os.environ.get('ASR_LANGUAGE', 'id')
    
    print(f'Downloading WhisperX model: {asr_model}')
    
    try:
        import whisperx
        import torch
        
        # Download ASR model
        print(f'  Downloading {asr_model} model...')
        model = whisperx.load_model(asr_model, 'cpu', compute_type='int8')
        del model
        print(f'  ✅ {asr_model} model downloaded successfully')
        
        # List of supported languages for alignment (matches WhisperX DEFAULT_ALIGN_MODELS)
        supported_languages = [
            'en', 'fr', 'de', 'es', 'it', 'ja', 'zh', 'nl', 'uk', 'pt', 
            'ar', 'cs', 'ru', 'pl', 'hu', 'fi', 'fa', 'el', 'tr', 'da', 
            'he', 'vi', 'ko', 'ur', 'te', 'hi', 'ca', 'ml', 'no', 'nn', 
            'sk', 'sl', 'hr', 'ro', 'eu', 'gl', 'ka', 'lv', 'tl'
        ]
        
        # Download alignment model if supported or custom model specified
        align_model_name = os.environ.get('ALIGN_MODEL', 'auto')
        force_align = os.environ.get('FORCE_ALIGN', 'false').lower() == 'true'
        
        if force_align:
            if asr_language in supported_languages:
                print(f'  Downloading {asr_language} alignment model...')
                try:
                    align_model, _ = whisperx.load_align_model(
                        language_code=asr_language, 
                        device='cpu'
                    )
                    del align_model
                    print(f'  ✅ {asr_language} alignment model downloaded successfully')
                except Exception as e:
                    print(f'  ⚠️  Alignment model download failed: {e}')
            elif align_model_name and align_model_name.lower() != 'auto':
                # Custom model specified (like Wikidepia Indonesian model)
                print(f'  Downloading custom alignment model: {align_model_name}...')
                try:
                    align_model, _ = whisperx.load_align_model(
                        language_code=asr_language, 
                        device='cpu',
                        model_name=align_model_name
                    )
                    del align_model
                    print(f'  ✅ Custom alignment model downloaded: {align_model_name}')
                    print(f'      Language: {asr_language}')
                except Exception as e:
                    print(f'  ⚠️  Custom alignment model download failed: {e}')
                    print(f'      Model: {align_model_name}')
            else:
                print(f'  ⚠️  No alignment model available for {asr_language}')
                print('     (transcription will work without word-level timestamps)')
        else:
            print('  ⚠️  Force alignment disabled - skipping alignment model download')
        
        # Clean up GPU memory if available
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        print('✅ Model download completed successfully')
        
    except Exception as e:
        print(f'❌ Model download failed: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()