#!/usr/bin/env python3
"""
Environment validation script for Sinopsis ASR Worker.

This script validates that all required environment variables are properly
configured and provides helpful feedback on configuration issues.
"""

import os
import sys
from dotenv import load_dotenv

def validate_database_config():
    """Validate database configuration."""
    print("🗄️  Database Configuration")
    
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL is not set")
        return False
    
    if not database_url.startswith('postgresql://'):
        print("⚠️  DATABASE_URL should start with 'postgresql://'")
        return False
    
    print("✅ DATABASE_URL is configured")
    return True

def validate_rabbitmq_config():
    """Validate RabbitMQ configuration."""
    print("\n🐰 RabbitMQ Configuration")
    
    required_vars = [
        'RABBITMQ_URL',
        'RABBIT_MQ_EXCHANGE', 
        'RABBIT_MQ_INPUT_QUEUE',
        'RABBIT_MQ_OUTPUT_QUEUE'
    ]
    
    all_good = True
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            print(f"❌ {var} is not set")
            all_good = False
        else:
            print(f"✅ {var} is configured")
    
    return all_good

def validate_minio_config():
    """Validate MinIO configuration."""
    print("\n📦 MinIO Configuration")
    
    required_vars = [
        'MINIO_ENDPOINT',
        'MINIO_USER',
        'MINIO_PASSWORD',
        'MINIO_BUCKET'
    ]
    
    all_good = True
    for var in required_vars:
        value = os.getenv(var)
        if not value:
            print(f"❌ {var} is not set")
            all_good = False
        else:
            print(f"✅ {var} is configured")
    
    # Validate endpoint format
    endpoint = os.getenv('MINIO_ENDPOINT')
    if endpoint and not (endpoint.startswith('http://') or endpoint.startswith('https://')):
        print("⚠️  MINIO_ENDPOINT should start with 'http://' or 'https://'")
    
    return all_good

def validate_asr_config():
    """Validate ASR configuration."""
    print("\n🎤 ASR Configuration")
    
    # Required ASR settings
    asr_model = os.getenv('ASR_MODEL', 'medium')
    asr_device = os.getenv('ASR_DEVICE', 'cuda')
    asr_language = os.getenv('ASR_LANGUAGE', 'id')
    
    print(f"✅ ASR_MODEL: {asr_model}")
    print(f"✅ ASR_DEVICE: {asr_device}")
    print(f"✅ ASR_LANGUAGE: {asr_language}")
    
    # Validate model choice
    valid_models = ['tiny', 'small', 'medium', 'large-v2']
    if asr_model not in valid_models:
        print(f"⚠️  ASR_MODEL '{asr_model}' is not in recommended models: {valid_models}")
    
    # Validate device choice
    if asr_device not in ['cuda', 'cpu']:
        print(f"⚠️  ASR_DEVICE '{asr_device}' should be 'cuda' or 'cpu'")
    
    # Check force alignment settings
    force_align = os.getenv('FORCE_ALIGN', 'true').lower() == 'true'
    align_model = os.getenv('ALIGN_MODEL', 'jonatasgrosman/wav2vec2-large-xlsr-53-indonesian')
    
    print(f"✅ FORCE_ALIGN: {force_align}")
    if force_align:
        print(f"✅ ALIGN_MODEL: {align_model}")
    else:
        print("ℹ️  Force alignment is disabled")
    
    return True

def validate_text_cleaning_config():
    """Validate text cleaning configuration."""
    print("\n🧹 Text Cleaning Configuration")
    
    enable_cleaning = os.getenv('ENABLE_REPETITION_CLEANING', 'true').lower() == 'true'
    cleaning_mode = os.getenv('CLEANING_MODE', 'fast')
    
    print(f"✅ ENABLE_REPETITION_CLEANING: {enable_cleaning}")
    
    if enable_cleaning:
        print(f"✅ CLEANING_MODE: {cleaning_mode}")
        
        valid_modes = ['basic', 'fast', 'thorough']
        if cleaning_mode not in valid_modes:
            print(f"⚠️  CLEANING_MODE '{cleaning_mode}' is not in valid modes: {valid_modes}")
        
        # Additional cleaning parameters
        min_rep = os.getenv('MIN_REPETITION_COUNT', '2')
        max_phrase = os.getenv('MAX_PHRASE_LENGTH', '4')
        
        print(f"✅ MIN_REPETITION_COUNT: {min_rep}")
        print(f"✅ MAX_PHRASE_LENGTH: {max_phrase}")
    else:
        print("ℹ️  Text cleaning is disabled")
    
    return True

def check_deprecated_settings():
    """Check for deprecated settings from faster-whisper."""
    print("\n⚠️  Checking for Deprecated Settings")
    
    deprecated_vars = [
        'ASR_VAD_FILTER',
        'ASR_BEAM_SIZE', 
        'ASR_REPETITION_PENALTY',
        'ASR_NO_REPEAT_NGRAM_SIZE',
        'ASR_CONDITION_ON_PREVIOUS_TEXT'
    ]
    
    found_deprecated = False
    for var in deprecated_vars:
        if os.getenv(var):
            print(f"⚠️  {var} is deprecated and will be ignored")
            found_deprecated = True
    
    if not found_deprecated:
        print("✅ No deprecated settings found")
    else:
        print("ℹ️  These settings were used by faster-whisper but are not needed for WhisperX")
    
    return not found_deprecated

def main():
    """Run all validation checks."""
    print("🔧 Sinopsis ASR Worker - Environment Validation")
    print("=" * 60)
    
    # Load .env file if it exists
    if os.path.exists('.env'):
        load_dotenv()
        print("✅ Loaded .env file")
    elif os.path.exists('.env.example'):
        print("⚠️  No .env file found, but .env.example exists")
        print("   Please copy .env.example to .env and configure your settings")
        return 1
    else:
        print("❌ No .env file found and no .env.example available")
        print("   Using system environment variables only")
        return 1
    
    # Run all validation checks
    checks = [
        ("Database", validate_database_config),
        ("RabbitMQ", validate_rabbitmq_config),
        ("MinIO", validate_minio_config),
        ("ASR", validate_asr_config),
        ("Text Cleaning", validate_text_cleaning_config),
        ("Deprecated Settings", check_deprecated_settings)
    ]
    
    all_passed = True
    results = []
    
    for check_name, check_func in checks:
        try:
            result = check_func()
            results.append((check_name, result))
            if not result:
                all_passed = False
        except Exception as e:
            print(f"\n❌ {check_name} validation failed with error: {e}")
            results.append((check_name, False))
            all_passed = False
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Validation Summary")
    print("=" * 60)
    
    for check_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {check_name}")
    
    if all_passed:
        print("\n🎉 All validation checks passed!")
        print("Your environment is properly configured for WhisperX.")
        return 0
    else:
        print("\n⚠️  Some validation checks failed.")
        print("Please fix the issues above before running the worker.")
        return 1

if __name__ == "__main__":
    sys.exit(main())