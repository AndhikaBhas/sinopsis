"""
Speaker diarization processor using PyAnnote.
"""

# Import warnings suppression first (keeps logs clean)
import suppress_warnings

import os
import warnings
from io import BytesIO
from typing import Dict, Any, List

import torch

# Configure threading BEFORE any parallel operations
# Must be done early to prevent "cannot set number of interop threads after parallel work" error
torch.set_num_threads(4)
torch.set_num_interop_threads(2)

# Set up basic environment variables for memory efficiency
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'max_split_size_mb:256,expandable_segments:True')
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('MKL_NUM_THREADS', '4')

import torchaudio
from pyannote.audio import Pipeline
from utils.logger import LoggerMixin

# Optional audio processing libraries for better format support
try:
    import soundfile as sf
    import librosa
    HAS_LIBROSA = True
except ImportError:
    HAS_LIBROSA = False

try:
    from pydub import AudioSegment
    HAS_PYDUB = True
except ImportError:
    HAS_PYDUB = False


class SpeakerDiarizer(LoggerMixin):
    """Speaker diarization processor using PyAnnote."""
    
    def __init__(self, config):
        """
        Initialize speaker diarizer.
        
        Args:
            config: Configuration object containing HuggingFace auth token
        """
        self.config = config
        self.pipeline = None
        self.device = None
        self._initialize_pipeline()
    
    def _initialize_pipeline(self):
        """Initialize PyAnnote diarization pipeline."""
        try:
            self.logger.info("Initializing PyAnnote diarization pipeline...")
            
            # Set HuggingFace auth token
            os.environ['HUGGINGFACE_HUB_TOKEN'] = self.config.huggingface_auth_token
            
            # Check cache location
            hf_home = os.environ.get('HF_HOME', '~/.cache/huggingface')
            self.logger.info(f"HuggingFace cache location: {hf_home}")
            
            # Determine device
            device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            
            if torch.cuda.is_available():
                gpu_name = torch.cuda.get_device_name(0)
                gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
                self.logger.info(f"GPU available: {gpu_name} with {gpu_memory:.1f}GB memory")
                self.logger.info(f"Using GPU device: {device}")
            else:
                self.logger.info("GPU not available, using CPU device")
                self.logger.info(f"CPU cores available: {torch.get_num_threads()}")
            
            self.device = device
            
            # Load the pre-trained pipeline
            # Note: Accept user conditions at https://huggingface.co/pyannote/speaker-diarization-community-1
            # Models are pre-cached during Docker build at /opt/huggingface_cache
            # When HF_HUB_OFFLINE=1, HuggingFace Hub will automatically use cached files
            self.logger.info("Loading PyAnnote model...")
            
            # Check if running in offline mode
            offline_mode = os.environ.get('HF_HUB_OFFLINE', '0') == '1'
            if offline_mode:
                self.logger.info("Running in OFFLINE mode - using cached models only")
                self.logger.info(f"Cache location: {os.environ.get('HF_HOME', 'default')}")
            
            # PyAnnote will automatically use cached models when HF_HUB_OFFLINE=1 is set
            # No need for local_files_only parameter - it's handled by environment variables
            self.pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-community-1",
                token=self.config.huggingface_auth_token
            )
            
            self.logger.info("Model loaded successfully")
            
            # Move to GPU if available
            if device.type == 'cuda':
                self.logger.info(f"Moving model to device: {device}")
                self.pipeline = self.pipeline.to(device)
                torch.cuda.empty_cache()
            
            self.logger.info(f"PyAnnote pipeline initialized successfully on device: {device}")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize PyAnnote pipeline: {str(e)}")
            # Set a default device even if initialization fails
            self.device = torch.device('cpu')
            raise
    
    
    def diarize_audio(self, audio_data: BytesIO) -> Dict[str, Any]:
        """
        Perform speaker diarization on audio data with memory optimizations.
        
        Args:
            audio_data: Audio data as BytesIO object
            
        Returns:
            Dictionary containing diarization results
        """
        try:
            self.logger.info("Starting speaker diarization...")
            
            # Log current device being used
            current_device = getattr(self, 'device', torch.device('cpu'))
            if current_device is None:
                current_device = torch.device('cpu')
            if current_device.type == 'cuda':
                gpu_memory_used = torch.cuda.memory_allocated(current_device) / 1024**3  # GB
                gpu_memory_total = torch.cuda.get_device_properties(current_device).total_memory / 1024**3  # GB
                self.logger.info(f"Processing on GPU: {current_device} (Memory: {gpu_memory_used:.2f}GB/{gpu_memory_total:.1f}GB)")
            else:
                self.logger.info(f"Processing on CPU: {current_device}")
            
            # Get original file size for logging
            audio_data.seek(0, 2)  # Seek to end
            file_size = audio_data.tell()
            audio_data.seek(0)  # Reset to beginning
            self.logger.info(f"Audio file size: {file_size} bytes")
            
            # Try to load audio in-memory, prioritizing formats that work well with WebM
            waveform = None
            sample_rate = None
            
            # First, try pydub as it handles WebM/Vorbis well (in-memory)
            if HAS_PYDUB:
                self.logger.debug("Trying pydub first for WebM support (in-memory)...")
                waveform, sample_rate = self._load_audio_with_pydub(audio_data)
            
            # If pydub failed, try librosa/soundfile as fallback (in-memory)
            if waveform is None and HAS_LIBROSA:
                self.logger.info("Trying librosa/soundfile as fallback audio loader (in-memory)...")
                waveform, sample_rate = self._load_audio_with_librosa(audio_data)
            
            # If still no format worked, raise an error
            if waveform is None:
                raise ValueError("Unable to load audio file - format not supported or file corrupted. Supported formats: WAV, MP3, M4A, FLAC, OGG, WEBM")
            
            # Validate audio data
            if waveform.numel() == 0:
                raise ValueError("Audio file is empty or contains no audio data")
            
            if sample_rate <= 0:
                raise ValueError(f"Invalid sample rate: {sample_rate}")
            
            # If stereo, convert to mono by taking the mean
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
                self.logger.debug("Converted stereo audio to mono")
            
            # Resample if necessary (PyAnnote expects 16kHz)
            target_sample_rate = 16000
            if sample_rate != target_sample_rate:
                self.logger.debug(f"Resampling from {sample_rate}Hz to {target_sample_rate}Hz")
                
                # CRITICAL FIX: Use librosa for resampling to avoid std::bad_alloc in torchaudio.transforms.Resample
                # The torchaudio Resampler allocates large C++ buffers that can trigger std::bad_alloc
                # even when plenty of RAM is available due to memory fragmentation
                try:
                    if HAS_LIBROSA:
                        import numpy as np
                        # Convert to numpy for librosa resampling
                        waveform_np = waveform.numpy()
                        # Librosa resampling is more memory-efficient
                        waveform_np = librosa.resample(
                            waveform_np, 
                            orig_sr=sample_rate, 
                            target_sr=target_sample_rate,
                            res_type='kaiser_fast'  # Faster, less memory
                        )
                        waveform = torch.from_numpy(waveform_np)
                        self.logger.debug("Resampled using librosa (memory-efficient)")
                    else:
                        # Fallback to torchaudio with smaller buffer
                        # Force garbage collection before creating resampler
                        import gc
                        gc.collect()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                        
                        resampler = torchaudio.transforms.Resample(
                            orig_freq=sample_rate,
                            new_freq=target_sample_rate
                        )
                        waveform = resampler(waveform)
                        
                        # Cleanup immediately
                        del resampler
                        gc.collect()
                    
                    sample_rate = target_sample_rate
                except Exception as e:
                    self.logger.error(f"Resampling failed: {e}")
                    # Try one more time with even more aggressive cleanup
                    import gc
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    
                    raise RuntimeError(f"Audio resampling failed (std::bad_alloc likely). Original error: {e}")
            
            # Validate final audio length
            audio_duration = waveform.shape[1] / sample_rate
            self.logger.info(f"Audio duration: {audio_duration:.2f} seconds")
            
            if audio_duration < 0.5:
                raise ValueError(f"Audio too short for diarization: {audio_duration:.2f} seconds")
            
            # Create audio info dictionary for PyAnnote
            audio_info = {
                "waveform": waveform,
                "sample_rate": sample_rate
            }
            
            # Perform diarization
            # Note: PyAnnote handles inference mode internally, don't wrap with torch.no_grad()
            # Using torch.no_grad() can cause "Inference tensors do not track version counter"
            # error with InstanceNorm layers in PyTorch 2.8.0+
            self.logger.info("Running diarization inference...")
            diarization = self.pipeline(audio_info)
            
            # Clear audio data from memory
            del waveform
            del audio_info
            
            # Clear CUDA cache if using GPU
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            # Process results
            results = self._process_diarization_results(diarization)
            
            self.logger.info(f"Diarization completed. Found {len(results['speakers'])} speakers")
            
            # Force garbage collection to free memory
            import gc
            gc.collect()
            
            return results
                        
        except Exception as e:
            self.logger.error(f"Error during diarization: {str(e)}")
            # Clean up on error
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            import gc
            gc.collect()
            raise
    
    def _load_audio_with_librosa(self, audio_data: BytesIO) -> tuple:
        """
        Fallback method to load audio using librosa/soundfile (in-memory).
        
        Args:
            audio_data: Audio data as BytesIO object
            
        Returns:
            Tuple of (waveform, sample_rate)
        """
        try:
            # Reset BytesIO to beginning
            audio_data.seek(0)
            
            # Try soundfile first (better format support, in-memory)
            try:
                waveform_np, sample_rate = sf.read(audio_data, always_2d=True)
                # soundfile returns (samples, channels), we need (channels, samples)
                waveform_np = waveform_np.T
                self.logger.info(f"Successfully loaded audio with soundfile (in-memory): shape={waveform_np.shape}, sample_rate={sample_rate}")
            except Exception:
                # Reset and fallback to librosa with warnings suppressed
                audio_data.seek(0)
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    waveform_np, sample_rate = librosa.load(audio_data, sr=None, mono=False)
                    self.logger.info(f"Successfully loaded audio with librosa (in-memory): shape={waveform_np.shape}, sample_rate={sample_rate}")
            
            # Convert numpy array to torch tensor
            if waveform_np.ndim == 1:
                waveform = torch.from_numpy(waveform_np).unsqueeze(0)  # Add channel dimension
            else:
                waveform = torch.from_numpy(waveform_np)
            
            return waveform, sample_rate
                        
        except Exception as e:
            self.logger.debug(f"Librosa/soundfile fallback failed: {str(e)}")
            return None, None
    
    def _load_audio_with_pydub(self, audio_data: BytesIO) -> tuple:
        """
        Method to load audio using pydub (supports WebM/Vorbis, in-memory).
        
        Args:
            audio_data: Audio data as BytesIO object
            
        Returns:
            Tuple of (waveform, sample_rate)
        """
        try:
            # Reset BytesIO to beginning
            audio_data.seek(0)
            
            # Try to detect format and load with pydub (in-memory)
            audio_segment = None
            
            # Try different format hints for pydub
            formats_to_try = ['webm', 'ogg', 'mp3', 'wav', 'flac', 'm4a']
            
            for fmt in formats_to_try:
                try:
                    audio_segment = AudioSegment.from_file(audio_data, format=fmt)
                    self.logger.debug(f"Successfully loaded with pydub using format: {fmt} (in-memory)")
                    break
                except Exception:
                    audio_data.seek(0)  # Reset for next attempt
                    continue
            
            if audio_segment is None:
                # Try without format hint
                audio_data.seek(0)
                audio_segment = AudioSegment.from_file(audio_data)
            
            # Convert to numpy array
            samples = audio_segment.get_array_of_samples()
            
            # Convert to numpy array with proper shape
            import numpy as np
            if audio_segment.channels == 2:
                # Stereo
                waveform_np = np.array(samples, dtype=np.float32).reshape((-1, 2)).T
            else:
                # Mono
                waveform_np = np.array(samples, dtype=np.float32).reshape((1, -1))
            
            # Normalize to [-1, 1] range
            waveform_np = waveform_np / (2**15)  # Assuming 16-bit audio
            
            # Convert to torch tensor
            waveform = torch.from_numpy(waveform_np.astype(np.float32))
            sample_rate = audio_segment.frame_rate
            
            self.logger.info(f"Successfully loaded audio with pydub (in-memory): shape={waveform.shape}, sample_rate={sample_rate}")
            return waveform, sample_rate
                        
        except Exception as e:
            self.logger.debug(f"Pydub loading failed: {str(e)}")
            return None, None
    
    def _process_diarization_results(self, diarization) -> Dict[str, Any]:
        """
        Process PyAnnote diarization results into a structured format.
        
        Args:
            diarization: PyAnnote diarization object (DiarizeOutput in v4.x)
            
        Returns:
            Dictionary containing processed results
        """
        try:
            self.logger.debug("Processing diarization results...")
            
            segments = []
            speakers = {}
            speaker_times = {}
            
            # In pyannote.audio 4.x, the output has a speaker_diarization attribute
            # that contains the Annotation object
            annotation = diarization.speaker_diarization if hasattr(diarization, 'speaker_diarization') else diarization
            
            # Extract segments and speaker information
            for segment, _, speaker in annotation.itertracks(yield_label=True):
                start_time = segment.start
                end_time = segment.end
                duration = end_time - start_time
                
                # Add segment
                segments.append({
                    'start_time': round(start_time, 3),
                    'end_time': round(end_time, 3),
                    'duration': round(duration, 3),
                    'speaker': speaker
                })
                
                # Track speaker statistics
                if speaker not in speaker_times:
                    speaker_times[speaker] = 0
                speaker_times[speaker] += duration
            
            # Create speaker summary
            total_duration = sum(speaker_times.values())
            for speaker, speaking_time in speaker_times.items():
                speakers[speaker] = {
                    'speaking_time': round(speaking_time, 3),
                    'percentage': round((speaking_time / total_duration * 100), 2) if total_duration > 0 else 0,
                    'segments_count': len([s for s in segments if s['speaker'] == speaker])
                }
            
            # Sort segments by start time
            segments.sort(key=lambda x: x['start_time'])
            
            results = {
                'total_duration': round(total_duration, 3),
                'num_speakers': len(speakers),
                'speakers': speakers,
                'segments': segments,
                'summary': {
                    'total_segments': len(segments),
                    'average_segment_duration': round(total_duration / len(segments), 3) if segments else 0,
                    'speaker_list': list(speakers.keys())
                }
            }
            
            self.logger.debug(f"Processed {len(segments)} segments for {len(speakers)} speakers")
            
            return results
            
        except Exception as e:
            self.logger.error(f"Error processing diarization results: {str(e)}")
            raise
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about the loaded model.
        
        Returns:
            Dictionary containing model information
        """
        try:
            device = str(getattr(self, 'device', 'not_loaded')) if self.pipeline else 'not_loaded'
        except Exception:
            device = 'unknown'
        
        return {
            'model_name': 'pyannote/speaker-diarization-community-1',
            'device': device,
            'pytorch_version': torch.__version__,
            'cuda_available': torch.cuda.is_available()
        }