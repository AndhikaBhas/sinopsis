"""
Speaker Diarization Worker

A background worker that processes audio files for speaker diarization using PyAnnote.
Subscribes to RabbitMQ for job information and updates database with results.
"""

import sys
import json
import signal
import time
from typing import Dict, Optional, List
from datetime import datetime, timedelta

# Third-party imports
import torch

# Local imports
from config import Config
from utils.logger import setup_logger
from utils.rabbitmq import RabbitMQHandler
from utils.minio_client import MinIOClient
from utils.database import DatabaseHandler
from processors.diarizer import SpeakerDiarizer


class DiarizationWorker:
    """Main worker class for speaker diarization processing."""
    
    def __init__(self):
        """Initialize the diarization worker."""
        self.config = Config()
        self.logger = setup_logger(__name__)
        self.running = True
        
        # Initialize handlers
        self.rabbitmq = None
        self.minio_client = None
        self.db_handler = None
        self.diarizer = None
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        self.logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False
        
        # Stop RabbitMQ consumption immediately
        if self.rabbitmq and hasattr(self.rabbitmq, 'channel') and self.rabbitmq.channel:
            try:
                self.rabbitmq.channel.stop_consuming()
            except Exception as e:
                self.logger.debug(f"Error stopping RabbitMQ consumption: {e}")
        
    def initialize_components(self):
        """Initialize all required components."""
        try:
            self.logger.info("Initializing worker components...")
            
            # Log system and device information
            self.logger.info("=== System Information ===")
            if torch.cuda.is_available():
                gpu_count = torch.cuda.device_count()
                for i in range(gpu_count):
                    gpu_name = torch.cuda.get_device_name(i)
                    gpu_memory = torch.cuda.get_device_properties(i).total_memory / 1024**3
                    self.logger.info(f"GPU {i}: {gpu_name} ({gpu_memory:.1f}GB)")
                self.logger.info(f"CUDA version: {torch.version.cuda}")
                self.logger.info("Worker will use GPU for processing")
            else:
                self.logger.info("No GPU available, worker will use CPU")
                self.logger.info(f"CPU threads: {torch.get_num_threads()}")
            
            self.logger.info(f"PyTorch version: {torch.__version__}")
            self.logger.info("=============================")
            
            # Initialize RabbitMQ handler
            self.logger.info("Connecting to RabbitMQ...")
            self.rabbitmq = RabbitMQHandler(self.config)
            
            # Initialize MinIO client
            self.logger.info("Connecting to MinIO...")
            self.minio_client = MinIOClient(self.config)
            
            # Initialize database handler
            self.logger.info("Connecting to database...")
            self.db_handler = DatabaseHandler(self.config)
            
            # Initialize speaker diarizer
            self.logger.info("Loading diarization model...")
            self.diarizer = SpeakerDiarizer(self.config)
            
            self.logger.info("All components initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize components: {str(e)}")
            raise
    
    def process_diarization_job(self, ch, method, properties, body):
        """
        Process a diarization job from RabbitMQ queue.
        
        Args:
            ch: Channel object
            method: Delivery method
            properties: Message properties
            body: Message body containing job information
        """
        job_data = None
        
        try:
            # Parse job data
            job_data = json.loads(body.decode('utf-8'))
            rapat_id = job_data.get('rapat_id')
            file_name = job_data.get('file_name')
            
            if not rapat_id:
                raise ValueError("Missing rapat_id in job data")
            
            if not file_name:
                raise ValueError("Missing file_name in job data")
                
            self.logger.info(f"Processing diarization job for rapat_id: {rapat_id}")
            
            # Verify channel is still alive before starting long processing
            if ch.is_closed:
                self.logger.error("Channel closed before processing, message will be requeued")
                return  # Will be requeued automatically by RabbitMQ
            
            # Get meeting data from database
            self.logger.info(f"Fetching meeting data for rapat_id: {rapat_id}")
            meeting_data = self.db_handler.get_meeting_data(rapat_id)
            
            if not meeting_data:
                raise ValueError(f"No meeting data found for rapat_id: {rapat_id}")
            
            # Download audio file from MinIO using file name from message
            self.logger.info(f"Downloading audio file: {file_name}")
            audio_data = self.minio_client.download_file(file_name)
            
            # Perform speaker diarization
            self.logger.info("Starting speaker diarization...")
            diarization_result = self.diarizer.diarize_audio(audio_data)
            
            # Parse start time from filename and format timing
            start_time = self._parse_start_time_from_filename(file_name)
            if start_time:
                diarization_result = self._format_diarization_with_start_time(diarization_result, start_time)
            
            # Merge diarization with existing transcript
            self.logger.info("Merging diarization results with existing transcript...")
            existing_transcript = meeting_data.get('transkrip', '{}')
            merged_transcript = self._merge_transcript_with_diarization(
                existing_transcript, diarization_result, start_time
            )
            
            # Update database with merged results
            self.logger.info(f"Updating database for rapat_id: {rapat_id}")
            self.db_handler.update_meeting_results_with_diarization(
                rapat_id, 
                diarization_result,
                merged_transcript
            )
            
            # Publish completion message to output queue
            self.logger.info("Publishing completion message...")
            completion_message = {
                'rapat_id': rapat_id,
                'status': 'completed',
                'processed_at': self._get_current_timestamp()
            }
            self.rabbitmq.publish_message(completion_message)
            
            # Acknowledge the message only after successful completion
            try:
                if ch and not ch.is_closed:
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    self.logger.info(f"Successfully processed rapat_id: {rapat_id}")
                else:
                    self.logger.warning("Channel is closed, cannot ACK message - will be requeued by RabbitMQ")
            except Exception as ack_error:
                self.logger.error(f"Failed to ACK message: {str(ack_error)}")
                self.logger.warning("Message will be requeued by RabbitMQ after timeout")
            
            # Display waiting message after successful processing
            self.logger.info("Waiting for messages. To exit press CTRL+C")
            
        except Exception as e:
            self.logger.error(f"Error processing job: {str(e)}")
            self.logger.exception("Full error traceback:")
            
            # Try to NACK the message - but handle cases where channel might be closed
            try:
                if ch and not ch.is_closed:
                    self.logger.info("NACKing message with requeue=False (dead letter queue)")
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                else:
                    self.logger.warning("Channel is closed, cannot NACK message")
            except Exception as nack_error:
                self.logger.error(f"Failed to NACK message: {str(nack_error)}")
                # Message will be requeued by RabbitMQ after timeout
    
    def _get_current_timestamp(self) -> str:
        """Get current timestamp in ISO format."""
        from datetime import datetime
        return datetime.now().isoformat()
    
    def _parse_start_time_from_filename(self, filename: str) -> Optional[str]:
        """Extract start time from filename segment 3 and format as HH:MM:SS.
        
        Args:
            filename: Audio filename (e.g., "48_20250928_101906_spliced.webm")
            
        Returns:
            Start time in HH:MM:SS format or None if parsing fails
        """
        try:
            # Split filename by underscore and get segment 3 (index 2)
            parts = filename.split('_')
            if len(parts) >= 3:
                time_part = parts[2]  # segment 3
                
                # Parse time format HHMMSS
                if len(time_part) >= 6 and time_part.isdigit():
                    hours = time_part[:2]
                    minutes = time_part[2:4]
                    seconds = time_part[4:6]
                    
                    # Format as HH:MM:SS
                    formatted_time = f"{hours}:{minutes}:{seconds}"
                    self.logger.debug(f"Parsed start time from filename {filename}: {formatted_time}")
                    return formatted_time
                    
            self.logger.warning(f"Could not parse start time from filename: {filename}")
            return None
            
        except Exception as e:
            self.logger.warning(f"Error parsing start time from filename {filename}: {str(e)}")
            return None
    
    def _format_diarization_with_start_time(self, diarization_result: Dict, start_time_str: str) -> Dict:
        """Format diarization results with proper timing based on start time.
        
        Args:
            diarization_result: Original diarization results
            start_time_str: Start time in HH:MM:SS format
            
        Returns:
            Formatted diarization results with proper timing
        """
        try:
            if not start_time_str:
                return diarization_result
                
            # Parse start time
            start_time = datetime.strptime(start_time_str, "%H:%M:%S")
            
            # Create a copy of the result to modify
            formatted_result = diarization_result.copy()
            formatted_segments = []
            
            # Format each segment with proper timing
            for segment in diarization_result.get('segments', []):
                # Calculate actual time by adding segment offset to start time
                segment_start_seconds = segment.get('start_time', 0)
                segment_end_seconds = segment.get('end_time', 0)
                
                # Add segment times to start time
                actual_start_time = start_time + timedelta(seconds=segment_start_seconds)
                actual_end_time = start_time + timedelta(seconds=segment_end_seconds)
                
                formatted_segment = {
                    'start': actual_start_time.strftime("%H:%M:%S"),
                    'end': actual_end_time.strftime("%H:%M:%S"),
                    'speaker': segment.get('speaker', 'UNKNOWN'),
                    'duration': segment.get('duration', 0)
                }
                
                formatted_segments.append(formatted_segment)
            
            formatted_result['segments'] = formatted_segments
            formatted_result['audio_start_time'] = start_time_str
            
            return formatted_result
            
        except Exception as e:
            self.logger.warning(f"Error formatting diarization with start time: {str(e)}")
            return diarization_result
    
    def _merge_transcript_with_diarization(self, existing_transcript: str, diarization_result: Dict, start_time: Optional[str]) -> str:
        """
        Merge diarization results with existing transcript by matching overlapping segments.
        Format output as: [HH:MM:SS - HH:MM:SS] speaker: text message
        
        Args:
            existing_transcript: JSON string of existing transcript
            diarization_result: Diarization result dictionary
            start_time: Start time from filename in HH:MM:SS format
            
        Returns:
            Merged transcript as formatted string
        """
        try:
            # Parse existing transcript
            transcript_data = self._parse_existing_transcript(existing_transcript)
            
            # Get transcript segments if they exist
            existing_segments = transcript_data.get('segments', [])
            if not existing_segments and 'transcript' in transcript_data:
                # Handle simple transcript format
                existing_segments = self._extract_segments_from_text(transcript_data['transcript'])
            
            # Get diarization segments
            diarization_segments = diarization_result.get('segments', [])
            
            if not diarization_segments:
                self.logger.warning("No diarization segments found, returning original transcript")
                return existing_transcript
            
            self.logger.info(f"Merging {len(existing_segments)} transcript segments with {len(diarization_segments)} diarization segments")
            
            # Merge segments by matching overlaps
            merged_segments = self._match_and_merge_segments(existing_segments, diarization_segments)
            
            # Format as requested: [HH:MM:SS - HH:MM:SS] speaker: text message
            # formatted_output = self._format_merged_segments(merged_segments)
            
            # Create final result structure
            result = {
                # 'formatted_transcript': formatted_output,
                'segments': merged_segments,
                'diarization_metadata': {
                    'total_duration': diarization_result.get('total_duration', 0),
                    'num_speakers': diarization_result.get('num_speakers', 0),
                    'speakers': diarization_result.get('speakers', {}),
                    'audio_start_time': start_time,
                    'merged_at': self._get_current_timestamp()
                },
                # 'original_transcript': transcript_data
            }
            
            return json.dumps(result, ensure_ascii=False, indent=2)
            
        except Exception as e:
            self.logger.error(f"Error merging transcript with diarization: {str(e)}")
            # Fallback: return diarization-only format
            return self._format_diarization_only(diarization_result, start_time)
    
    def _parse_existing_transcript(self, existing_transcript: str) -> Dict:
        """Parse existing transcript from various formats."""
        try:
            if isinstance(existing_transcript, str):
                if existing_transcript.strip() in ('', '{}', 'null'):
                    return {}
                else:
                    parsed = json.loads(existing_transcript)
                    # Handle array format (list of segments)
                    if isinstance(parsed, list):
                        return {'segments': parsed}
                    # Handle object format
                    elif isinstance(parsed, dict):
                        return parsed
                    else:
                        return {'original_data': str(parsed)}
            elif isinstance(existing_transcript, dict):
                return existing_transcript
            elif isinstance(existing_transcript, list):
                return {'segments': existing_transcript}
            else:
                return {'original_data': str(existing_transcript)}
        except json.JSONDecodeError:
            # Treat as plain text
            return {'transcript': existing_transcript}
    
    def _extract_segments_from_text(self, text: str) -> List[Dict]:
        """Extract segments from plain text transcript (basic implementation)."""
        # This is a basic implementation - can be enhanced based on actual transcript format
        lines = text.split('\n')
        segments = []
        
        for i, line in enumerate(lines):
            if line.strip():
                segments.append({
                    'text': line.strip(),
                    'segment_id': i,
                    'estimated_start': i * 10,  # Rough estimate
                    'estimated_end': (i + 1) * 10
                })
        
        return segments
    
    def _match_and_merge_segments(self, transcript_segments: List[Dict], diarization_segments: List[Dict]) -> List[Dict]:
        """Match transcript segments with diarization segments and combine text with speaker info."""
        merged_segments = []
        
        if not transcript_segments:
            # No existing transcript, use diarization only with placeholder text
            for seg in diarization_segments:
                merged_segments.append({
                    'start': seg.get('start', ''),
                    'end': seg.get('end', ''),
                    'speaker': seg.get('speaker', 'UNKNOWN'),
                    'text': f"[No transcript - Speaker {seg.get('speaker', 'UNKNOWN')}]",
                    'confidence': 'diarization_only'
                })
            return merged_segments
        
        if not diarization_segments:
            # No diarization, use transcript only
            for t_seg in transcript_segments:
                merged_segments.append({
                    'start': t_seg.get('start', '00:00:00'),
                    'end': t_seg.get('end', '00:00:00'),
                    'speaker': 'UNKNOWN',
                    'text': t_seg.get('text', ''),
                    'confidence': 'transcript_only'
                })
            return merged_segments
        
        # Both transcript and diarization available - match by time overlap
        def time_to_seconds(time_str):
            """Convert HH:MM:SS to seconds."""
            try:
                h, m, s = map(int, time_str.split(':'))
                return h * 3600 + m * 60 + s
            except (ValueError, AttributeError):
                return 0
        
        for t_seg in transcript_segments:
            best_match = None
            best_overlap = 0
            
            t_start_str = t_seg.get('start', '00:00:00')
            t_end_str = t_seg.get('end', '00:00:00')
            t_start = time_to_seconds(t_start_str)
            t_end = time_to_seconds(t_end_str)
            
            for d_seg in diarization_segments:
                d_start_str = d_seg.get('start', '00:00:00')
                d_end_str = d_seg.get('end', '00:00:00')
                d_start = time_to_seconds(d_start_str)
                d_end = time_to_seconds(d_end_str)
                
                # Calculate overlap
                overlap_start = max(t_start, d_start)
                overlap_end = min(t_end, d_end)
                overlap_duration = max(0, overlap_end - overlap_start)
                
                if overlap_duration > best_overlap:
                    best_overlap = overlap_duration
                    best_match = d_seg
            
            if best_match and best_overlap > 0:
                # Found matching diarization segment - combine transcript text with speaker
                merged_segments.append({
                    'start': best_match.get('start', ''),
                    'end': best_match.get('end', ''),
                    'speaker': best_match.get('speaker', 'UNKNOWN'),
                    'text': t_seg.get('text', ''),  # Use actual transcript text
                    'confidence': 'matched'
                })
            else:
                # No diarization match found, use transcript timing with unknown speaker
                merged_segments.append({
                    'start': t_start_str,
                    'end': t_end_str,
                    'speaker': 'UNKNOWN',
                    'text': t_seg.get('text', ''),  # Use actual transcript text
                    'confidence': 'transcript_only'
                })
        
        # Sort by start time (convert HH:MM:SS back to seconds for sorting)
        def time_to_seconds(time_str):
            try:
                h, m, s = map(int, time_str.split(':'))
                return h * 3600 + m * 60 + s
            except (ValueError, AttributeError):
                return 0
        
        merged_segments.sort(key=lambda x: time_to_seconds(x.get('start', '00:00:00')))
        
        # Merge consecutive segments from the same speaker
        merged_segments = self._merge_consecutive_segments(merged_segments)
        
        return merged_segments
    
    def _merge_consecutive_segments(self, segments: List[Dict]) -> List[Dict]:
        """Merge consecutive segments from the same speaker."""
        if not segments:
            return segments
        
        merged = []
        current_segment = None
        
        def time_to_seconds(time_str):
            """Convert HH:MM:SS to seconds."""
            try:
                h, m, s = map(int, time_str.split(':'))
                return h * 3600 + m * 60 + s
            except (ValueError, AttributeError):
                return 0
        

        
        for segment in segments:
            speaker = segment.get('speaker', 'UNKNOWN')
            text = segment.get('text', '').strip()
            start = segment.get('start', '00:00:00')
            end = segment.get('end', '00:00:00')
            
            # Skip segments without text
            if not text:
                continue
            
            if current_segment is None:
                # First segment
                current_segment = {
                    'start': start,
                    'end': end,
                    'speaker': speaker,
                    'text': text,
                    'confidence': segment.get('confidence', 'unknown')
                }
            elif (current_segment['speaker'] == speaker and 
                  time_to_seconds(start) - time_to_seconds(current_segment['end']) <= 30):  # Max 30 seconds gap
                # Same speaker and close timing - merge with current segment
                current_segment['end'] = end
                current_segment['text'] += ' ' + text
                # Keep the best confidence level
                if segment.get('confidence') == 'matched' or current_segment['confidence'] != 'matched':
                    current_segment['confidence'] = segment.get('confidence', 'unknown')
            else:
                # Different speaker or too far apart - save current and start new
                merged.append(current_segment)
                current_segment = {
                    'start': start,
                    'end': end,
                    'speaker': speaker,
                    'text': text,
                    'confidence': segment.get('confidence', 'unknown')
                }
        
        # Don't forget the last segment
        if current_segment is not None:
            merged.append(current_segment)
        
        self.logger.debug(f"Merged {len(segments)} segments into {len(merged)} consecutive segments")
        return merged
    
    def _format_merged_segments(self, segments: List[Dict]) -> str:
        """Format segments as: [HH:MM:SS - HH:MM:SS] speaker: text message"""
        formatted_lines = []
        
        for segment in segments:
            start_time = segment.get('start', '00:00:00')
            end_time = segment.get('end', '00:00:00')
            speaker = segment.get('speaker', 'UNKNOWN')
            text = segment.get('text', '').strip()
            
            if text:  # Only include segments with text
                formatted_line = f"[{start_time} - {end_time}] {speaker}: {text}"
                formatted_lines.append(formatted_line)
        
        return '\n'.join(formatted_lines)
    
    def _seconds_to_hms(self, seconds: float) -> str:
        """Convert seconds to HH:MM:SS format."""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    
    def start_worker(self):
        """Start the worker and begin consuming messages with automatic reconnection."""
        retry_delay = 5  # Start with 5 seconds
        max_retry_delay = 300  # Max 5 minutes between retries
        
        while self.running:
            try:
                self.initialize_components()
                
                self.logger.info("Starting diarization worker...")
                self.logger.info(f"Consuming from queue: {self.config.rabbitmq_input_queue}")
                
                # Add connection status check
                if not self.rabbitmq.connection or self.rabbitmq.connection.is_closed:
                    raise ConnectionError("RabbitMQ connection is not established")
                
                self.logger.info("RabbitMQ connection confirmed, starting message consumption...")
                
                # Check queue status
                try:
                    queue_method = self.rabbitmq.channel.queue_declare(
                        queue=self.config.rabbitmq_input_queue, 
                        passive=True
                    )
                    message_count = queue_method.method.message_count
                    self.logger.info(f"Queue {self.config.rabbitmq_input_queue} has {message_count} messages waiting")
                except Exception as queue_error:
                    self.logger.warning(f"Could not check queue status: {queue_error}")
                
                # Reset retry delay on successful connection
                retry_delay = 5
                
                # Start consuming messages
                self.rabbitmq.consume_messages(self.process_diarization_job)
                
                # If we get here, consumption ended gracefully
                if not self.running:
                    self.logger.info("Worker shutdown requested")
                    break
                
            except KeyboardInterrupt:
                self.logger.info("Worker interrupted by user")
                self.running = False
                break
                
            except Exception as e:
                self.logger.error(f"Worker error: {str(e)}")
                self.logger.exception("Full traceback:")
                
                if not self.running:
                    break
                
                # Cleanup before reconnecting
                try:
                    self.cleanup()
                except Exception as cleanup_error:
                    self.logger.debug(f"Cleanup error: {cleanup_error}")
                
                # Wait before reconnecting with exponential backoff
                self.logger.info(f"Reconnecting in {retry_delay} seconds...")
                time.sleep(retry_delay)
                
                # Exponential backoff
                retry_delay = min(retry_delay * 2, max_retry_delay)
                self.logger.info("Attempting to reconnect...")
        
        # Final cleanup
        self.cleanup()
    
    def cleanup(self):
        """Cleanup resources before shutdown."""
        self.logger.info("Cleaning up resources...")
        
        if self.rabbitmq:
            self.rabbitmq.close()
        
        if self.db_handler:
            self.db_handler.close()
            
        self.logger.info("Cleanup completed")


def main():
    """Main entry point."""
    try:
        worker = DiarizationWorker()
        worker.start_worker()
    except ValueError as e:
        # Configuration error - likely missing environment variables
        print(f"Configuration Error: {str(e)}")
        print("\nPlease check your .env file and ensure all required environment variables are set.")
        print("Copy .env.example to .env and update with your settings:")
        print("  cp .env.example .env")
        print("  nano .env")
        sys.exit(1)
    except Exception as e:
        # For other errors, try to log them if possible
        try:
            worker.logger.error(f"Worker failed to start: {str(e)}")
        except Exception:
            print(f"Worker failed to start: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
