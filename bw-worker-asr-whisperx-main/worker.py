import os
import sys
import json
import logging
import io
import warnings
import re
import numpy as np
import subprocess
from collections import Counter
from dotenv import load_dotenv

import pika
from minio import Minio
import whisperx
import torch
import psycopg2
from psycopg2.extras import Json
from transcript_merger import check_and_merge_meeting_transcripts
import gc

# Enable TF32 for better performance (suppress pyannote warning)
torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True

# Suppress urllib3 warnings
warnings.filterwarnings('ignore', category=UserWarning, module='urllib3')
# Suppress pyannote reproducibility warnings
warnings.filterwarnings('ignore', category=UserWarning, module='pyannote.audio')
# Suppress torchaudio backend deprecation warnings
warnings.filterwarnings('ignore', category=UserWarning, module='speechbrain')
# Suppress PyTorch Lightning checkpoint upgrade warnings
warnings.filterwarnings('ignore', message='Lightning automatically upgraded.*')
# Suppress model version mismatch warnings
warnings.filterwarnings('ignore', message='Model was trained with.*')

# Load environment variables
load_dotenv()

# Helper function to safely parse environment variables (strips inline comments)
def get_env_value(key, default=''):
    """Get environment variable and strip inline comments (everything after #)"""
    value = os.getenv(key, default)
    # Strip inline comments from .env files
    if isinstance(value, str) and '#' in value:
        value = value.split('#')[0].strip()
    return value

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Reduce pika logging verbosity
logging.getLogger('pika').setLevel(logging.WARNING)

# Configuration from .env
DATABASE_URL = os.getenv('DATABASE_URL')
RABBITMQ_URL = os.getenv('RABBITMQ_URL')
RABBIT_MQ_EXCHANGE = os.getenv('RABBIT_MQ_EXCHANGE')
RABBIT_MQ_INPUT_QUEUE = os.getenv('RABBIT_MQ_INPUT_QUEUE')
RABBIT_MQ_OUTPUT_QUEUE = os.getenv('RABBIT_MQ_OUTPUT_QUEUE')
MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT')
MINIO_USER = os.getenv('MINIO_USER')
MINIO_PASSWORD = os.getenv('MINIO_PASSWORD')
MINIO_BUCKET = os.getenv('MINIO_BUCKET')

# Validate required environment variables
def validate_required_env_vars():
    """Validate that all required environment variables are set."""
    required_vars = {
        'DATABASE_URL': DATABASE_URL,
        'RABBITMQ_URL': RABBITMQ_URL,
        'RABBIT_MQ_EXCHANGE': RABBIT_MQ_EXCHANGE,
        'RABBIT_MQ_INPUT_QUEUE': RABBIT_MQ_INPUT_QUEUE,
        'RABBIT_MQ_OUTPUT_QUEUE': RABBIT_MQ_OUTPUT_QUEUE,
        'MINIO_ENDPOINT': MINIO_ENDPOINT,
        'MINIO_USER': MINIO_USER,
        'MINIO_PASSWORD': MINIO_PASSWORD,
        'MINIO_BUCKET': MINIO_BUCKET
    }
    
    missing_vars = [var for var, value in required_vars.items() if not value]
    
    if missing_vars:
        logger.error("Missing required environment variables:")
        for var in missing_vars:
            logger.error(f"  - {var}")
        logger.error("")
        logger.error("Please create a .env file with the required configuration.")
        logger.error("You can copy .env.example to .env and fill in your values.")
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing_vars)}")
    
    logger.info("All required environment variables are configured")
ASR_MODEL = get_env_value('ASR_MODEL', 'medium')
ASR_DEVICE = get_env_value('ASR_DEVICE', 'cuda')
ASR_COMPUTE_TYPE = get_env_value('ASR_COMPUTE_TYPE', 'float16')
ASR_LANGUAGE = get_env_value('ASR_LANGUAGE', 'id')
ASR_BATCH_SIZE = int(get_env_value('ASR_BATCH_SIZE', '16'))
# WhisperX force alignment settings
FORCE_ALIGN = get_env_value('FORCE_ALIGN', 'false').lower() == 'true'
ALIGN_MODEL = get_env_value('ALIGN_MODEL', 'auto')  # 'auto' uses WhisperX default for the language
RABBITMQ_REQUEUE_ON_FAILURE = get_env_value('RABBITMQ_REQUEUE_ON_FAILURE', 'false').lower() == 'true'
# Memory mode is always enabled (legacy subprocess mode removed)
MEMORY_CLEANUP_INTERVAL = int(get_env_value('MEMORY_CLEANUP_INTERVAL', '10'))  # Force cleanup every N jobs

# Text Cleaning Configuration
ENABLE_REPETITION_CLEANING = get_env_value('ENABLE_REPETITION_CLEANING', 'true').lower() == 'true'
CLEANING_MODE = get_env_value('CLEANING_MODE', 'fast')  # fast, thorough, basic
MIN_REPETITION_COUNT = int(get_env_value('MIN_REPETITION_COUNT', '2'))
MAX_PHRASE_LENGTH = int(get_env_value('MAX_PHRASE_LENGTH', '4'))
CLEANING_SIMILARITY_THRESHOLD = float(get_env_value('CLEANING_SIMILARITY_THRESHOLD', '0.85'))

# ============================================================================
# MODEL MANAGER - Singleton for in-memory model persistence
# ============================================================================

class ModelManager:
    """Singleton class to manage WhisperX models in memory for performance.
    
    This class loads models once at startup and reuses them across all jobs,
    significantly improving throughput by avoiding repeated model loading.
    
    Features:
    - Lazy loading: Models loaded on first use
    - Memory monitoring: Tracks GPU/CPU memory usage
    - Automatic cleanup: Garbage collection after each job
    - Error recovery: Graceful handling of CUDA OOM errors
    - Thread-safe: Single instance shared across requests
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not ModelManager._initialized:
            self.whisper_model = None
            self.alignment_model = None
            self.alignment_metadata = None
            self.device = None
            self.compute_type = None
            self.job_count = 0
            ModelManager._initialized = True
            logger.info("ModelManager initialized (models will be loaded on first use)")
    
    def _get_memory_stats(self):
        """Get current memory usage statistics."""
        stats = {}
        
        # GPU memory if available
        if self.device == 'cuda':
            try:
                import torch
                stats['gpu_allocated'] = torch.cuda.memory_allocated() / 1024**3  # GB
                stats['gpu_reserved'] = torch.cuda.memory_reserved() / 1024**3  # GB
                stats['gpu_max_allocated'] = torch.cuda.max_memory_allocated() / 1024**3  # GB
            except Exception as e:
                logger.warning(f"Could not get GPU memory stats: {e}")
        
        # System memory
        try:
            import psutil
            process = psutil.Process()
            stats['ram_used'] = process.memory_info().rss / 1024**3  # GB
        except ImportError:
            pass
        
        return stats
    
    def _log_memory_stats(self, prefix=""):
        """Log current memory usage."""
        stats = self._get_memory_stats()
        if stats:
            msg = f"{prefix} Memory:"
            if 'gpu_allocated' in stats:
                msg += f" GPU={stats['gpu_allocated']:.2f}GB/{stats['gpu_reserved']:.2f}GB"
            if 'ram_used' in stats:
                msg += f" RAM={stats['ram_used']:.2f}GB"
            logger.info(msg)
    
    def initialize_models(self):
        """Initialize WhisperX models. Called automatically on first transcription."""
        if self.whisper_model is not None:
            logger.debug("Models already initialized, skipping...")
            return
        
        logger.info("="*60)
        logger.info("INITIALIZING MODELS (One-time startup)")
        logger.info("="*60)
        
        try:
            # Determine device
            import torch
            self.device = ASR_DEVICE if ASR_DEVICE in ['cuda', 'cpu'] else 'cuda'
            if self.device == 'cuda' and not torch.cuda.is_available():
                logger.warning("CUDA not available, falling back to CPU")
                self.device = 'cpu'
            
            self.compute_type = ASR_COMPUTE_TYPE if self.device == 'cuda' else 'int8'
            
            logger.info(f"Device: {self.device} | Compute Type: {self.compute_type}")
            logger.info(f"Model: {ASR_MODEL} | Language: {ASR_LANGUAGE} | Batch Size: {ASR_BATCH_SIZE}")
            
            # Load WhisperX transcription model
            logger.info("Loading WhisperX transcription model...")
            self.whisper_model = whisperx.load_model(
                ASR_MODEL, 
                self.device, 
                compute_type=self.compute_type, 
                language=ASR_LANGUAGE
            )
            logger.info("✅ WhisperX model loaded successfully")
            
            # Load alignment model if force alignment is enabled
            if FORCE_ALIGN:
                # Check if language supports alignment before attempting to load
                supported_align_languages = [
                    'en', 'fr', 'de', 'es', 'it', 'ja', 'zh', 'nl', 'uk', 'pt', 
                    'ar', 'cs', 'ru', 'pl', 'hu', 'fi', 'fa', 'el', 'tr', 'da', 
                    'he', 'vi', 'ko', 'ur', 'te', 'hi', 'ca', 'ml', 'no', 'nn', 
                    'sk', 'sl', 'hr', 'ro', 'eu', 'gl', 'ka', 'lv', 'tl'
                ]
                
                # Check if custom model is specified for unsupported language
                has_custom_model = ALIGN_MODEL and ALIGN_MODEL.lower() != 'auto'
                
                if ASR_LANGUAGE not in supported_align_languages and not has_custom_model:
                    logger.warning(f"Language '{ASR_LANGUAGE}' is not supported for force alignment")
                    logger.info("WhisperX alignment models are not available for this language")
                    logger.info("Transcription will work normally with segment-level timestamps")
                    logger.info("Force alignment will be automatically disabled for this session")
                    self.alignment_model = None
                elif ASR_LANGUAGE not in supported_align_languages and has_custom_model:
                    logger.info(f"Loading custom alignment model for {ASR_LANGUAGE}: {ALIGN_MODEL}")
                    try:
                        self.alignment_model, self.alignment_metadata = whisperx.load_align_model(
                            language_code=ASR_LANGUAGE, 
                            device=self.device, 
                            model_name=ALIGN_MODEL
                        )
                        logger.info(f"✅ Custom alignment model loaded: {ALIGN_MODEL}")
                        logger.info(f"   Language: {ASR_LANGUAGE} (Indonesian)")
                        logger.info("   Word-level timestamps now available for Indonesian!")
                    except Exception as e:
                        logger.error(f"Failed to load custom alignment model {ALIGN_MODEL}: {e}")
                        logger.warning("Force alignment will be disabled for this session")
                        self.alignment_model = None
                else:
                    logger.info(f"Loading {ASR_LANGUAGE} alignment model for force alignment...")
                    try:
                        if ALIGN_MODEL and ALIGN_MODEL.lower() != 'auto':
                            self.alignment_model, self.alignment_metadata = whisperx.load_align_model(
                                language_code=ASR_LANGUAGE, 
                                device=self.device, 
                                model_name=ALIGN_MODEL
                            )
                            logger.info(f"✅ Custom alignment model loaded: {ALIGN_MODEL}")
                        else:
                            self.alignment_model, self.alignment_metadata = whisperx.load_align_model(
                                language_code=ASR_LANGUAGE, 
                                device=self.device
                            )
                            logger.info(f"✅ Default alignment model loaded for {ASR_LANGUAGE}")
                    except Exception as e:
                        logger.error(f"Failed to load {ASR_LANGUAGE} alignment model: {e}")
                        logger.warning("Force alignment will be disabled for this session")
                        self.alignment_model = None
            else:
                logger.info("Force alignment disabled, skipping alignment model")
            
            self._log_memory_stats("Post-initialization")
            logger.info("="*60)
            logger.info("MODELS READY - Worker can now process jobs efficiently")
            logger.info("="*60)
            
        except Exception as e:
            logger.error(f"Failed to initialize models: {e}")
            self.cleanup_models()
            raise
    
    def cleanup_models(self):
        """Clean up models from memory. Used for error recovery."""
        logger.warning("Cleaning up models from memory...")
        
        if self.whisper_model is not None:
            del self.whisper_model
            self.whisper_model = None
        
        if self.alignment_model is not None:
            del self.alignment_model
            self.alignment_model = None
            self.alignment_metadata = None
        
        # Force garbage collection
        gc.collect()
        
        # Clear GPU cache if using CUDA
        if self.device == 'cuda':
            try:
                import torch
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
            except Exception as e:
                logger.warning(f"Error clearing CUDA cache: {e}")
        
        logger.info("Models cleaned up from memory")
    
    def periodic_cleanup(self):
        """Perform periodic memory cleanup without unloading models."""
        self.job_count += 1
        
        # Perform cleanup every N jobs
        if self.job_count % MEMORY_CLEANUP_INTERVAL == 0:
            logger.info(f"Periodic cleanup triggered (job count: {self.job_count})")
            gc.collect()
            
            if self.device == 'cuda':
                try:
                    import torch
                    torch.cuda.empty_cache()
                except Exception:
                    pass
            
            self._log_memory_stats("Post-cleanup")
    
    def transcribe(self, audio, filename):
        """Transcribe audio using loaded models.
        
        Args:
            audio: Audio data loaded by whisperx.load_audio()
            filename: Original filename for timestamp extraction
            
        Returns:
            list: Transcript segments with timestamps
        """
        # Ensure models are initialized
        if self.whisper_model is None:
            self.initialize_models()
        
        try:
            self._log_memory_stats("Pre-transcription")
            
            # Extract base timestamp from filename
            base_timestamp = extract_timestamp_from_filename(filename)
            if not base_timestamp:
                logger.warning("Could not extract base timestamp, using current time")
                from datetime import datetime
                base_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            logger.info(f"Starting transcription with base timestamp: {base_timestamp}")
            
            # Transcribe with WhisperX
            result = self.whisper_model.transcribe(
                audio, 
                language=ASR_LANGUAGE, 
                batch_size=ASR_BATCH_SIZE
            )
            logger.info("Initial transcription completed")
            
            # Check if transcription was successful
            if not result or "segments" not in result:
                logger.error("Transcription failed: No result or segments returned")
                raise RuntimeError("WhisperX transcription returned empty or invalid result")
            
            if not result["segments"]:
                logger.warning("Transcription completed but no segments found")
                return []  # Return empty transcript
            
            # Force alignment for word-level timestamps
            if FORCE_ALIGN and self.alignment_model is not None and result["segments"]:
                try:
                    logger.info("Performing phoneme-based force alignment...")
                    aligned_result = whisperx.align(
                        result["segments"], 
                        self.alignment_model, 
                        self.alignment_metadata, 
                        audio, 
                        self.device, 
                        return_char_alignments=False
                    )
                    
                    if aligned_result and "segments" in aligned_result:
                        result = aligned_result
                        logger.info("Force alignment completed successfully")
                    else:
                        logger.warning("Force alignment returned invalid result, keeping original segments")
                        
                except Exception as e:
                    logger.warning(f"Force alignment failed: {e}")
                    logger.info("Continuing with segment-level timestamps only")
            else:
                if not FORCE_ALIGN:
                    logger.info("Force alignment disabled")
                elif self.alignment_model is None:
                    logger.warning("Force alignment enabled but model not loaded")
            
            # Process segments into transcript format
            transcript = self._process_segments(result["segments"], base_timestamp)
            
            self._log_memory_stats("Post-transcription")
            
            # Periodic cleanup
            self.periodic_cleanup()
            
            return transcript
            
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            # Don't cleanup models on transcription errors - they can be reused
            raise
    
    def _process_segments(self, segments, base_timestamp):
        """Process WhisperX segments into transcript format."""
        transcript = []
        full_text = ""
        segment_count = 0
        
        for segment in segments:
            if not segment:
                continue
            
            segment_count += 1
            
            # Use word-level timestamps if available from force alignment
            if "words" in segment and segment["words"]:
                for word in segment["words"]:
                    if not word or not isinstance(word, dict):
                        continue
                    
                    if "start" in word and "end" in word and "word" in word:
                        start_timestamp = calculate_segment_timestamp(base_timestamp, word["start"])
                        end_timestamp = calculate_segment_timestamp(base_timestamp, word["end"])
                        
                        # Clean word text if enabled
                        word_text = word["word"].strip() if word["word"] else ""
                        if ENABLE_REPETITION_CLEANING:
                            word_text = clean_transcription_text(word_text, CLEANING_MODE)
                        
                        if word_text:
                            word_data = {
                                'start': start_timestamp,
                                'end': end_timestamp,
                                'text': word_text
                            }
                            transcript.append(word_data)
                            full_text += word_text + " "
            else:
                # Fallback to segment-level timestamps
                start_time = segment.get("start", 0) if segment else 0
                end_time = segment.get("end", 0) if segment else 0
                start_timestamp = calculate_segment_timestamp(base_timestamp, start_time)
                end_timestamp = calculate_segment_timestamp(base_timestamp, end_time)
                
                # Clean segment text if enabled
                segment_text = segment.get("text", "").strip() if segment else ""
                if ENABLE_REPETITION_CLEANING:
                    segment_text = clean_transcription_text(segment_text, CLEANING_MODE)
                
                if segment_text:
                    segment_data = {
                        'start': start_timestamp,
                        'end': end_timestamp,
                        'text': segment_text
                    }
                    transcript.append(segment_data)
                    full_text += segment_text + " "
        
        logger.info(f"Generated {len(transcript)} transcript entries ({segment_count} original segments)")
        logger.info(f"Total transcribed text length: {len(full_text.strip())} characters")
        
        return transcript

# Global model manager instance
_model_manager = None

def get_model_manager():
    """Get the global ModelManager instance."""
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager

# ============================================================================
# End of MODEL MANAGER
# ============================================================================

def get_minio_client():
    """Initialize MinIO client."""
    return Minio(
        MINIO_ENDPOINT.replace('http://', '').replace('https://', ''),
        access_key=MINIO_USER,
        secret_key=MINIO_PASSWORD,
        secure=MINIO_ENDPOINT.startswith('https://')
    )

def clean_with_regex(text):
    """Clean repetitive text using regex patterns - fast method."""
    if not text or len(text.strip()) == 0:
        return text
    
    # Step 1: Remove excessive punctuation repetitions
    text = re.sub(r'([.!?]){2,}', r'\1', text)
    text = re.sub(r'([,;:]){2,}', r'\1', text)
    text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
    
    # Step 2: Remove word-level repetitions
    words = text.split()
    cleaned_words = []
    
    i = 0
    while i < len(words):
        current_word = words[i].lower().strip('.,!?;:')
        
        # Count consecutive repetitions
        repeat_count = 1
        j = i + 1
        
        while j < len(words) and words[j].lower().strip('.,!?;:') == current_word:
            repeat_count += 1
            j += 1
        
        # Keep only one instance if repeated
        if repeat_count >= MIN_REPETITION_COUNT:
            cleaned_words.append(words[i])
            i = j
        else:
            cleaned_words.append(words[i])
            i += 1
    
    # Step 3: Remove phrase repetitions
    text = ' '.join(cleaned_words)
    words = text.split()
    
    # Check for phrase repetitions (2-MAX_PHRASE_LENGTH words)
    final_words = []
    i = 0
    
    while i < len(words):
        found_repeat = False
        
        for phrase_len in range(min(MAX_PHRASE_LENGTH, len(words) - i), 1, -1):
            if i + phrase_len * MIN_REPETITION_COUNT <= len(words):
                phrase = words[i:i+phrase_len]
                
                # Count consecutive repetitions of the phrase
                repeat_count = 1
                j = i + phrase_len
                
                while j + phrase_len <= len(words) and words[j:j+phrase_len] == phrase:
                    repeat_count += 1
                    j += phrase_len
                
                if repeat_count >= MIN_REPETITION_COUNT:
                    # Keep only one instance of the repeated phrase
                    final_words.extend(phrase)
                    i = j
                    found_repeat = True
                    break
        
        if not found_repeat:
            final_words.append(words[i])
            i += 1
    
    return ' '.join(final_words).strip()

def clean_with_ngrams(text, n=3):
    """Clean repetitive n-grams from text - thorough method."""
    if not text or len(text.strip()) == 0:
        return text
        
    words = text.split()
    if len(words) < n:
        return text
    
    # Generate n-grams and count occurrences
    ngram_counts = Counter()
    ngram_positions = []
    
    for i in range(len(words) - n + 1):
        ngram = tuple(word.lower().strip('.,!?;:') for word in words[i:i+n])
        ngram_counts[ngram] += 1
        ngram_positions.append((i, ngram))
    
    # Mark repetitive n-grams for removal
    words_to_keep = [True] * len(words)
    
    for ngram, count in ngram_counts.items():
        if count >= MIN_REPETITION_COUNT:
            # Keep only the first occurrence
            first_occurrence = True
            for pos, gram in ngram_positions:
                if gram == ngram:
                    if first_occurrence:
                        first_occurrence = False
                    else:
                        # Mark words for removal
                        for j in range(pos, pos + n):
                            if j < len(words_to_keep):
                                words_to_keep[j] = False
    
    # Reconstruct text
    cleaned_words = [word for i, word in enumerate(words) if words_to_keep[i]]
    return ' '.join(cleaned_words).strip()

def clean_transcription_text(text, mode="fast"):
    """Clean repetitive text with hybrid approach."""
    if not text or len(text.strip()) == 0:
        return text
    
    original_length = len(text)
    
    if mode == "basic":
        # No cleaning
        cleaned_text = text
    elif mode == "fast":
        # Use regex only - best for real-time
        cleaned_text = clean_with_regex(text)
    elif mode == "thorough":
        # Regex first, then N-gram for complex patterns
        cleaned_text = clean_with_regex(text)
        cleaned_text = clean_with_ngrams(cleaned_text)
    else:
        # Default to fast mode
        cleaned_text = clean_with_regex(text)
    
    cleaned_length = len(cleaned_text)
    reduction_percent = ((original_length - cleaned_length) / original_length * 100) if original_length > 0 else 0
    
    if reduction_percent > 5:  # Log only if significant cleaning occurred
        logger.info(f"Text cleaning ({mode}): {original_length} → {cleaned_length} chars (-{reduction_percent:.1f}%)")
    
    return cleaned_text

def find_ffmpeg():
    """Find ffmpeg executable in system PATH.
    
    Returns:
        str: Path to ffmpeg executable
    
    Raises:
        RuntimeError: If ffmpeg is not found
    """
    import shutil
    
    # Try to find ffmpeg in PATH
    ffmpeg_path = shutil.which('ffmpeg')
    
    if ffmpeg_path:
        return ffmpeg_path
    
    # Common installation paths to check
    common_paths = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',  # macOS Homebrew
        '/snap/bin/ffmpeg',  # Ubuntu snap
    ]
    
    for path in common_paths:
        if os.path.exists(path):
            logger.info(f"Found ffmpeg at: {path}")
            return path
    
    # ffmpeg not found
    error_msg = (
        "ffmpeg not found in system PATH or common locations.\n"
        "Please install ffmpeg:\n"
        "  - Debian/Ubuntu: sudo apt-get install -y ffmpeg\n"
        "  - CentOS/RHEL: sudo yum install -y ffmpeg\n"
        "  - macOS: brew install ffmpeg\n"
        "  - Or download from: https://ffmpeg.org/download.html"
    )
    logger.error(error_msg)
    raise RuntimeError(error_msg)

def download_audio_from_minio(filename):
    """Download audio file from MinIO directly to memory.
    
    Returns:
        io.BytesIO: In-memory file object containing audio data
    """
    logger.info(f"Downloading file from MinIO: {filename}")
    client = get_minio_client()
    
    try:
        # Download directly to memory using get_object
        response = client.get_object(MINIO_BUCKET, filename)
        
        # Read all data into BytesIO
        audio_data = io.BytesIO(response.read())
        
        # Close the response
        response.close()
        response.release_conn()
        
        # Reset stream position to beginning for reading
        audio_data.seek(0)
        
        # Get file size for logging
        audio_size_mb = len(audio_data.getvalue()) / (1024 * 1024)
        logger.info(f"Downloaded {filename} to memory ({audio_size_mb:.2f} MB)")
        
        return audio_data
        
    except Exception as e:
        logger.error(f"Failed to download {filename}: {e}")
        raise

def extract_timestamp_from_filename(filename):
    """Extract timestamp from filename and return base datetime string."""
    try:
        # Extract timestamp part from filename (e.g., "79_003_20250923_002851_standardized.webm")
        # Expected format: {prefix}_{YYYYMMDD}_{HHMMSS}_{suffix}
        parts = filename.split('_')
        if len(parts) >= 4:
            date_part = parts[-3]  # YYYYMMDD
            time_part = parts[-2]  # HHMMSS
            
            # Extract date components
            year = date_part[:4]
            month = date_part[4:6]
            day = date_part[6:8]
            
            # Extract time components
            hour = time_part[:2]
            minute = time_part[2:4]
            second = time_part[4:6]
            
            # Create base timestamp string
            base_timestamp = f"{year}-{month}-{day} {hour}:{minute}:{second}"
            
            logger.info(f"Extracted base timestamp from {filename}: {base_timestamp}")
            return base_timestamp
        else:
            logger.warning(f"Could not extract timestamp from filename: {filename}")
            return None
    except Exception as e:
        logger.warning(f"Error extracting timestamp from {filename}: {e}")
        return None

def calculate_segment_timestamp(base_timestamp, offset_seconds):
    """Calculate timestamp by adding offset seconds to base timestamp."""
    from datetime import datetime, timedelta
    try:
        # Parse base timestamp
        dt = datetime.strptime(base_timestamp, "%Y-%m-%d %H:%M:%S")
        # Add offset
        new_dt = dt + timedelta(seconds=offset_seconds)
        # Return only time in HH:MM:SS format
        return new_dt.strftime("%H:%M:%S")
    except Exception as e:
        logger.error(f"Error calculating timestamp: {e}")
        return base_timestamp

def transcribe_audio(audio_data, filename):
    """Transcribe audio using WhisperX with persistent in-memory models.
    
    Args:
        audio_data: BytesIO object containing audio data from MinIO
        filename: Original filename for timestamp extraction
    
    Returns:
        list: Transcript segments with timestamps
    
    Note: Uses ffmpeg to decode audio from BytesIO via stdin pipe.
    Everything runs in memory - zero disk I/O!
    """
    logger.info("Transcribing audio with in-memory models (100% memory processing)")
    try:
        # Load audio from BytesIO using ffmpeg subprocess (stdin pipe)
        # This works with any format and keeps everything in memory
        logger.info(f"Loading audio from memory buffer: {filename}")
        
        import subprocess
        
        # Find ffmpeg executable
        try:
            ffmpeg_path = find_ffmpeg()
        except RuntimeError as e:
            logger.error(f"Cannot proceed without ffmpeg: {e}")
            raise
        
        # Reset BytesIO position to start
        audio_data.seek(0)
        
        # Use ffmpeg to decode audio from stdin (BytesIO data)
        # Output: 16-bit PCM, mono, 16kHz (WhisperX standard)
        cmd = [
            ffmpeg_path,  # Use found ffmpeg path
            "-nostdin",
            "-threads", "0",
            "-i", "pipe:0",  # Read from stdin
            "-f", "s16le",   # 16-bit PCM
            "-ac", "1",      # Mono
            "-acodec", "pcm_s16le",
            "-ar", "16000",  # 16kHz
            "-"              # Output to stdout
        ]
        
        # Run ffmpeg with audio data as stdin
        process = subprocess.run(
            cmd,
            input=audio_data.getvalue(),  # BytesIO data as stdin
            capture_output=True,
            check=True
        )
        
        # Convert output to numpy array
        audio = np.frombuffer(process.stdout, np.int16).flatten().astype(np.float32) / 32768.0
        
        logger.info(f"Audio loaded in memory: {len(audio)/16000:.2f} seconds, 16000Hz, mono")
        
        # Use ModelManager for transcription
        model_manager = get_model_manager()
        transcript = model_manager.transcribe(audio, filename)
        
        logger.info("WhisperX transcription completed successfully (100% in-memory)")
        return transcript
        
    except FileNotFoundError as e:
        logger.error(f"ffmpeg executable not found: {e}")
        logger.error("Please ensure ffmpeg is installed and in system PATH")
        raise RuntimeError("ffmpeg not found. Install with: sudo apt-get install -y ffmpeg")
    except subprocess.CalledProcessError as e:
        logger.error(f"ffmpeg audio decoding failed: {e.stderr.decode() if e.stderr else str(e)}")
        raise RuntimeError(f"Failed to decode audio: {e.stderr.decode() if e.stderr else str(e)}")
    except Exception as e:
        logger.error(f"WhisperX transcription failed: {e}")
        raise



def save_transcript_to_db(rapat_chunk_id, transcript):
    """Save transcript to database (timestamped segments only)."""
    logger.info(f"Saving transcript for rapat_chunk_id: {rapat_chunk_id}")
    try:
        # Format as strict JSON with only timestamped segments
        json_transcript = []
        for segment in transcript:
            json_transcript.append({
                "start": segment['start'],
                "end": segment['end'],
                "text": segment['text']
            })
        
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE rapat_chunk SET transkrip = %s WHERE id = %s",
            (Json(json_transcript), rapat_chunk_id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        logger.info(f"Transcript saved for rapat_chunk_id: {rapat_chunk_id}")
    except Exception as e:
        logger.error(f"Failed to save transcript: {e}")
        raise

def publish_meeting_complete(rapat_id):
    """Publish message to output queue when meeting is complete."""
    try:
        from datetime import datetime
        
        # Create message payload
        message = {
            "rapat_id": rapat_id,
            "timestamp": datetime.now().isoformat()
        }
        
        # Connect to RabbitMQ
        connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        channel = connection.channel()
        
        # Declare output queue
        channel.queue_declare(queue=RABBIT_MQ_OUTPUT_QUEUE, durable=True)
        
        # Publish message
        channel.basic_publish(
            exchange='',
            routing_key=RABBIT_MQ_OUTPUT_QUEUE,
            body=json.dumps(message),
            properties=pika.BasicProperties(
                delivery_mode=2,  # Make message persistent
            )
        )
        
        connection.close()
        logger.info(f"Published meeting complete message for rapat_id: {rapat_id}")
        
    except Exception as e:
        logger.error(f"Failed to publish meeting complete message: {e}")

def process_job(job_data):
    """Process a single transcription job using in-memory models.
    
    - Downloads audio directly to memory (no temp files)
    - Transcribes using persistent ModelManager models
    - No subprocess overhead, no file cleanup needed
    """
    try:
        # Use rapat_chunk_id from the message
        rapat_chunk_id = job_data.get('rapat_chunk_id') or job_data.get('chunk_id')
        audio_filename = job_data.get('filename') or job_data.get('audio_filename')

        logger.info(f"Starting transcription job for rapat_chunk_id: {rapat_chunk_id}, audio: {audio_filename}")

        # Download audio directly to memory
        logger.info("Downloading audio from MinIO to memory...")
        audio_data = download_audio_from_minio(audio_filename)
        logger.info("Audio download to memory completed")
        
        # Transcribe using in-memory models and in-memory audio
        logger.info("Starting WhisperX transcription...")
        transcript = transcribe_audio(audio_data, audio_filename)
        logger.info("WhisperX transcription completed")

        logger.info("Saving transcription results to database...")
        # Save to DB
        save_transcript_to_db(rapat_chunk_id, transcript)
        logger.info("Transcription results saved to database successfully")

        # Check if meeting is complete and merge transcripts after processing this chunk
        if 'rapat_id' in job_data:
            logger.info(f"Checking if meeting {job_data['rapat_id']} is complete for transcript merging...")
            check_and_merge_meeting_transcripts(job_data['rapat_id'])

        logger.info(f"Complete transcription job finished for rapat_chunk_id: {rapat_chunk_id}")
        logger.info("No temporary files to clean up (everything processed in memory)")

    except Exception as e:
        logger.error(f"Transcription job failed for rapat_chunk_id: {rapat_chunk_id}: {e}")
        raise



def main():
    """Main worker - continuously processes messages.
    
    Message Acknowledgment Strategy:
    - Uses manual acknowledgment (auto_ack=False) to ensure messages stay in queue until processed
    - Successfully processed jobs are acknowledged (removed from queue)
    - Failed jobs are nacked based on RABBITMQ_REQUEUE_ON_FAILURE setting:
      * True: Failed jobs are requeued for retry
      * False: Failed jobs are rejected (sent to dead letter queue if configured)
    - Connection failures automatically requeue unacknowledged messages
    """
    import signal
    import time
    
    logger.info("Starting ASR worker service...")
    
    # Check for .env file
    if os.path.exists('.env'):
        logger.info("Using .env file for configuration")
    else:
        logger.warning("No .env file found - using system environment variables")
        if os.path.exists('.env.example'):
            logger.warning("Hint: Copy .env.example to .env and configure your settings")
    
    # Validate environment variables first
    try:
        validate_required_env_vars()
    except RuntimeError as e:
        logger.error(f"Configuration error: {e}")
        return 1
    
    # Check for ffmpeg availability early
    logger.info("Checking system dependencies...")
    try:
        ffmpeg_path = find_ffmpeg()
        logger.info(f"✓ ffmpeg found: {ffmpeg_path}")
    except RuntimeError as e:
        logger.error(f"✗ ffmpeg check failed: {e}")
        logger.error("")
        logger.error("CRITICAL: ffmpeg is required for audio processing")
        logger.error("Install ffmpeg before starting the worker:")
        logger.error("  Debian/Ubuntu: sudo apt-get install -y ffmpeg")
        logger.error("  CentOS/RHEL: sudo yum install -y ffmpeg")
        logger.error("  macOS: brew install ffmpeg")
        return 1
    
    logger.info("Audio processing: Direct to memory (no temporary files)")
    logger.info("Memory mode: ENABLED (models persist in memory)")
    logger.info(f"Memory cleanup interval: Every {MEMORY_CLEANUP_INTERVAL} jobs")
    logger.info(f"RabbitMQ requeue on failure: {RABBITMQ_REQUEUE_ON_FAILURE}")
    logger.info(f"Text cleaning enabled: {ENABLE_REPETITION_CLEANING}")
    if ENABLE_REPETITION_CLEANING:
        logger.info(f"Cleaning mode: {CLEANING_MODE}, min repetitions: {MIN_REPETITION_COUNT}, max phrase length: {MAX_PHRASE_LENGTH}")
    
    # Signal handler for graceful shutdown
    shutdown_requested = False
    
    def signal_handler(signum, frame):
        nonlocal shutdown_requested
        logger.info(f"Received signal {signum}, initiating graceful shutdown...")
        shutdown_requested = True
    
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    connection = None
    channel = None
    
    while not shutdown_requested:
        try:
            # Connect to RabbitMQ if not connected
            if not connection or connection.is_closed:
                logger.info("Connecting to RabbitMQ...")
                
                if not RABBITMQ_URL:
                    raise RuntimeError("RABBITMQ_URL is not configured")
                    
                parameters = pika.URLParameters(RABBITMQ_URL)
                parameters.heartbeat = 60  # Use heartbeat for service mode
                connection = pika.BlockingConnection(parameters)
                channel = connection.channel()
                
                # Declare exchange and queue
                channel.exchange_declare(exchange=RABBIT_MQ_EXCHANGE, exchange_type='direct', durable=True)
                channel.queue_declare(queue=RABBIT_MQ_INPUT_QUEUE, durable=True)
                channel.queue_bind(exchange=RABBIT_MQ_EXCHANGE, queue=RABBIT_MQ_INPUT_QUEUE)
                logger.info("Connected to RabbitMQ successfully")
            
            # Get one message with manual acknowledgment
            method_frame, _, body = channel.basic_get(queue=RABBIT_MQ_INPUT_QUEUE, auto_ack=False)
            
            if method_frame:
                delivery_tag = method_frame.delivery_tag
                message_acknowledged = False
                
                try:
                    job_data = json.loads(body)
                    rapat_chunk_id = job_data.get('rapat_chunk_id', 'unknown')
                    logger.info(f"Processing job: rapat_chunk_id={rapat_chunk_id}")
                    
                    # Process job with transcription
                    process_job(job_data)
                    
                    # Job completed successfully - acknowledge the message
                    try:
                        if connection.is_open and channel.is_open:
                            channel.basic_ack(delivery_tag=delivery_tag)
                            message_acknowledged = True
                            logger.info(f"Job {rapat_chunk_id}: Successfully processed and acknowledged")
                        else:
                            logger.error(f"Job {rapat_chunk_id}: Cannot acknowledge - connection closed")
                    except Exception as ack_e:
                        logger.error(f"Job {rapat_chunk_id}: Failed to acknowledge message: {ack_e}")
                    
                except json.JSONDecodeError as json_e:
                    logger.error(f"Invalid JSON in message: {json_e}")
                    # Invalid JSON - reject without requeue
                    try:
                        if connection.is_open and channel.is_open:
                            channel.basic_nack(delivery_tag=delivery_tag, requeue=False)
                            message_acknowledged = True
                            logger.warning("Invalid JSON message rejected (not requeued)")
                    except Exception as nack_e:
                        logger.error(f"Failed to nack invalid JSON message: {nack_e}")
                        
                except Exception as e:
                    logger.error(f"Transcription job failed: {e}")
                    
                    # Job failed - decide whether to requeue or reject based on configuration
                    requeue_on_failure = RABBITMQ_REQUEUE_ON_FAILURE
                    
                    try:
                        if connection.is_open and channel.is_open:
                            channel.basic_nack(delivery_tag=delivery_tag, requeue=requeue_on_failure)
                            message_acknowledged = True
                            action = "requeued" if requeue_on_failure else "rejected"
                            logger.warning(f"Failed job {action} due to error: {e}")
                        else:
                            logger.error("Cannot nack failed job - connection closed. Message will be requeued automatically")
                    except Exception as nack_e:
                        logger.error(f"Failed to nack failed job: {nack_e}")
                
                # Safety check - if message wasn't acknowledged and connection is still open, nack it
                if not message_acknowledged:
                    try:
                        if connection and connection.is_open and channel and channel.is_open:
                            channel.basic_nack(delivery_tag=delivery_tag, requeue=True)
                            logger.warning("Message not acknowledged - sending nack with requeue=True as safety measure")
                    except Exception as safety_e:
                        logger.error(f"Safety nack failed: {safety_e}")
            else:
                # No message available, wait before checking again
                logger.debug("No jobs available, waiting...")
                time.sleep(5)  # Wait 5 seconds before checking again
                
        except pika.exceptions.AMQPConnectionError as e:
            logger.error(f"RabbitMQ connection error: {e}")
            
            # Provide helpful troubleshooting information
            if "Connection refused" in str(e):
                logger.error("RabbitMQ server is not running or not accessible")
                logger.error("Troubleshooting steps:")
                logger.error("  1. Check if RabbitMQ is installed and running")
                logger.error("  2. Verify RABBITMQ_URL in .env file")
                logger.error("  3. Check firewall settings")
                logger.error("  4. For local development, install RabbitMQ:")
                logger.error("     - macOS: brew install rabbitmq && brew services start rabbitmq")
                logger.error("     - Linux: sudo apt install rabbitmq-server && sudo systemctl start rabbitmq-server")
                logger.error("     - Docker: docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management")
            elif "Authentication failed" in str(e):
                logger.error("RabbitMQ authentication failed")
                logger.error("Check username/password in RABBITMQ_URL")
            elif "not found" in str(e).lower():
                logger.error("RabbitMQ host not found")
                logger.error("Check the hostname/IP address in RABBITMQ_URL")
            
            logger.warning("Connection lost - any unacknowledged messages will be requeued automatically")
            logger.info("Attempting to reconnect in 10 seconds...")
            time.sleep(10)
            if connection and not connection.is_closed:
                try:
                    connection.close()
                except Exception:
                    pass
            connection = None
            channel = None
            
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            time.sleep(5)
    
    # Graceful shutdown
    logger.info("Shutting down worker service...")
    if connection and not connection.is_closed:
        try:
            connection.close()
            logger.info("RabbitMQ connection closed")
        except Exception as close_e:
            logger.error(f"Failed to close connection: {close_e}")
    
    logger.info("Worker service stopped")

if __name__ == "__main__":
    # Validate environment and start worker
    try:
        validate_required_env_vars()
        main()
    except RuntimeError as e:
        logger.error(f"Configuration error: {e}")
        sys.exit(1)