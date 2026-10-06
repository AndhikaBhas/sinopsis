"""
Database handler for PostgreSQL operations.
"""

import json
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, Any, Optional
from utils.logger import LoggerMixin


class DatabaseHandler(LoggerMixin):
    """Handler for database operations."""
    
    def __init__(self, config):
        """
        Initialize database handler.
        
        Args:
            config: Configuration object
        """
        self.config = config
        self.connection = None
        self._connect()
    
    def _connect(self):
        """Establish connection to PostgreSQL database."""
        try:
            self.logger.info("Connecting to PostgreSQL database...")
            self.logger.debug(f"Database URL: {self.config.database_url.split('@')[-1] if '@' in self.config.database_url else 'localhost'}")
            
            self.connection = psycopg2.connect(
                self.config.database_url,
                cursor_factory=RealDictCursor
            )
            
            # Set autocommit to False for transaction control
            self.connection.autocommit = False
            
            # Test the connection immediately
            with self.connection.cursor() as cursor:
                cursor.execute("SELECT version()")
                version_info = cursor.fetchone()
                self.logger.debug(f"Connected to: {version_info}")
            
            self.logger.info("Successfully connected to PostgreSQL database")
            
        except psycopg2.OperationalError as e:
            self.logger.error(f"Database connection failed - operational error: {str(e)}")
            self.logger.error("Please check your database URL, credentials, and that the database server is running")
            raise
        except psycopg2.Error as e:
            self.logger.error(f"Database connection failed - psycopg2 error: {str(e)}")
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error connecting to database: {str(e)}")
            raise
    
    def get_meeting_data(self, rapat_id: int) -> Optional[Dict[str, Any]]:
        """
        Get meeting data from the rapat table.
        
        Args:
            rapat_id: ID of the meeting
            
        Returns:
            Dictionary containing meeting data or None if not found
        """
        try:
            self.logger.debug(f"Fetching meeting data for rapat_id: {rapat_id}")
            
            with self.connection.cursor() as cursor:
                query = """
                    SELECT 
                        id,
                        judul,
                        transkrip,
                        ringkasan,
                        diarisasi,
                        diarisasi_transkrip
                    FROM rapat 
                    WHERE id = %s
                """
                
                cursor.execute(query, (rapat_id,))
                result = cursor.fetchone()
                
                if result:
                    self.logger.debug(f"Found meeting data for rapat_id: {rapat_id}")
                    return dict(result)
                else:
                    self.logger.warning(f"No meeting data found for rapat_id: {rapat_id}")
                    return None
                    
        except psycopg2.Error as e:
            self.logger.error(f"Database error fetching meeting data: {str(e)}")
            self.connection.rollback()
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error fetching meeting data: {str(e)}")
            raise
    
    def update_meeting_results_with_diarization(self, rapat_id: int, diarization_results: Dict[str, Any], merged_transcript: str):
        """
        Update meeting results with diarization data in new JSONB columns.
        
        Args:
            rapat_id: ID of the meeting
            diarization_results: Raw diarization results for 'diarisasi' field
            merged_transcript: Merged transcript data for 'diarisasi_transkrip' field
        """
        try:
            self.logger.debug(f"Updating meeting results with diarization for rapat_id: {rapat_id}")
            
            with self.connection.cursor() as cursor:
                # Convert data to JSON for JSONB columns
                import json
                diarization_json = json.dumps(diarization_results, ensure_ascii=False) if isinstance(diarization_results, dict) else diarization_results
                merged_transcript_json = merged_transcript if isinstance(merged_transcript, str) else json.dumps(merged_transcript, ensure_ascii=False)
                
                # Update both new JSONB columns
                update_query = """
                    UPDATE rapat 
                    SET 
                        diarisasi = %s::jsonb,
                        diarisasi_transkrip = %s::jsonb
                    WHERE id = %s
                """
                
                cursor.execute(update_query, (diarization_json, merged_transcript_json, rapat_id))
                
                if cursor.rowcount == 0:
                    raise ValueError(f"No meeting found with rapat_id: {rapat_id}")
                
                # Commit the transaction
                self.connection.commit()
                
                self.logger.info(f"Successfully updated meeting with diarization data for rapat_id: {rapat_id}")
                
        except psycopg2.Error as e:
            self.logger.error(f"Database error updating meeting with diarization: {str(e)}")
            self.connection.rollback()
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error updating meeting with diarization: {str(e)}")
            self.connection.rollback()
            raise
    
    def update_meeting_results(self, rapat_id: int, diarization_results: Dict[str, Any]):
        """
        Update meeting results by appending diarization data to the transkrip field.
        
        Args:
            rapat_id: ID of the meeting
            diarization_results: Diarization results to append to transkrip
        """
        try:
            self.logger.debug(f"Updating meeting results for rapat_id: {rapat_id}")
            
            with self.connection.cursor() as cursor:
                # First, get the current transkrip data
                select_query = "SELECT transkrip FROM rapat WHERE id = %s"
                cursor.execute(select_query, (rapat_id,))
                result = cursor.fetchone()
                
                if not result:
                    raise ValueError(f"No meeting found with rapat_id: {rapat_id}")
                
                current_transkrip = result['transkrip'] or '{}'
                
                # Parse existing transkrip
                try:
                    if isinstance(current_transkrip, str):
                        if current_transkrip.strip() in ('', '{}', 'null'):
                            existing_data = {}
                        else:
                            existing_data = json.loads(current_transkrip)
                    elif isinstance(current_transkrip, dict):
                        existing_data = current_transkrip
                    else:
                        existing_data = {'original_data': str(current_transkrip)}
                except json.JSONDecodeError:
                    self.logger.warning(f"Invalid JSON in existing transkrip for rapat_id {rapat_id}, creating new structure")
                    existing_data = {'original_transkrip': current_transkrip}
                
                # Append diarization results to existing data
                existing_data['diarization'] = diarization_results
                existing_data['speakers'] = diarization_results.get('speakers', {})
                existing_data['segments'] = diarization_results.get('segments', [])
                existing_data['diarization_added_at'] = self._get_current_timestamp()
                
                # Convert back to JSON string
                updated_transkrip = json.dumps(existing_data, ensure_ascii=False, indent=2)
                
                # Update only the transkrip field
                update_query = """
                    UPDATE rapat 
                    SET transkrip = %s
                    WHERE id = %s
                """
                
                cursor.execute(update_query, (updated_transkrip, rapat_id))
                
                if cursor.rowcount == 0:
                    raise ValueError(f"No meeting found with rapat_id: {rapat_id}")
                
                # Commit the transaction
                self.connection.commit()
                
                self.logger.info(f"Successfully updated meeting results for rapat_id: {rapat_id} (appended to transkrip)")
                
        except psycopg2.Error as e:
            self.logger.error(f"Database error updating meeting results: {str(e)}")
            self.connection.rollback()
            raise
        except Exception as e:
            self.logger.error(f"Unexpected error updating meeting results: {str(e)}")
            self.connection.rollback()
            raise
    
    def _get_current_timestamp(self) -> str:
        """Get current timestamp in ISO format."""
        from datetime import datetime
        return datetime.now().isoformat()
    
    def test_connection(self) -> bool:
        """
        Test database connection.
        
        Returns:
            True if connection is working, False otherwise
        """
        try:
            with self.connection.cursor() as cursor:
                cursor.execute("SELECT 1 as test_value")
                result = cursor.fetchone()
                # Handle both RealDictCursor (dict) and regular cursor (tuple) results
                if isinstance(result, dict):
                    return result.get('test_value') == 1
                else:
                    return result[0] == 1
                
        except Exception as e:
            self.logger.error(f"Database connection test failed: {str(e)}")
            return False
    
    def close(self):
        """Close database connection."""
        try:
            if self.connection:
                self.logger.info("Closing database connection...")
                self.connection.close()
                self.logger.info("Database connection closed")
        except Exception as e:
            self.logger.error(f"Error closing database connection: {str(e)}")
    
    def __del__(self):
        """Destructor to ensure connection is closed."""
        self.close()