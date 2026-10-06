"""
MinIO client for object storage operations.
"""

from io import BytesIO
from minio import Minio
from minio.error import S3Error
from utils.logger import LoggerMixin


class MinIOClient(LoggerMixin):
    """Client for MinIO object storage operations."""
    
    def __init__(self, config):
        """
        Initialize MinIO client.
        
        Args:
            config: Configuration object
        """
        self.config = config
        self.client = None
        self._connect()
    
    def _connect(self):
        """Establish connection to MinIO."""
        try:
            endpoint, secure = self.config.get_minio_endpoint_parts()
            
            self.logger.info(f"Connecting to MinIO: {endpoint} (secure: {secure})")
            
            self.client = Minio(
                endpoint,
                access_key=self.config.minio_user,
                secret_key=self.config.minio_password,
                secure=secure
            )
            
            # Test connection by checking if bucket exists
            bucket_exists = self.client.bucket_exists(self.config.minio_input_bucket)
            if not bucket_exists:
                self.logger.warning(f"Bucket '{self.config.minio_input_bucket}' does not exist")
            
            self.logger.info("Successfully connected to MinIO")
            
        except Exception as e:
            self.logger.error(f"Failed to connect to MinIO: {str(e)}")
            raise
    
    def download_file(self, file_path: str) -> BytesIO:
        """
        Download file from MinIO storage.
        
        Args:
            file_path: Path to the file in the bucket
            
        Returns:
            BytesIO object containing the file data
            
        Raises:
            Exception: If download fails
        """
        try:
            self.logger.info(f"Downloading file from MinIO: {file_path}")
            
            # Get object from MinIO
            response = self.client.get_object(
                self.config.minio_input_bucket,
                file_path
            )
            
            # Read data into BytesIO
            file_data = BytesIO()
            
            total_size = 0
            for chunk in response.stream(32 * 1024):  # 32KB chunks
                file_data.write(chunk)
                total_size += len(chunk)
            
            # Reset pointer to beginning
            file_data.seek(0)
            
            self.logger.info(f"Successfully downloaded {total_size} bytes from {file_path}")
            
            return file_data
            
        except S3Error as e:
            self.logger.error(f"MinIO S3 error downloading {file_path}: {str(e)}")
            raise
        except Exception as e:
            self.logger.error(f"Error downloading file {file_path}: {str(e)}")
            raise
        finally:
            # Close the response stream
            if 'response' in locals():
                response.close()
                response.release_conn()
    
    def file_exists(self, file_path: str) -> bool:
        """
        Check if a file exists in MinIO storage.
        
        Args:
            file_path: Path to the file in the bucket
            
        Returns:
            True if file exists, False otherwise
        """
        try:
            self.client.stat_object(self.config.minio_input_bucket, file_path)
            return True
        except S3Error as e:
            if e.code == 'NoSuchKey':
                return False
            else:
                self.logger.error(f"Error checking file existence {file_path}: {str(e)}")
                raise
        except Exception as e:
            self.logger.error(f"Error checking file existence {file_path}: {str(e)}")
            raise
    
    def get_file_info(self, file_path: str) -> dict:
        """
        Get file information from MinIO storage.
        
        Args:
            file_path: Path to the file in the bucket
            
        Returns:
            Dictionary containing file information
        """
        try:
            stat = self.client.stat_object(self.config.minio_input_bucket, file_path)
            
            return {
                'object_name': stat.object_name,
                'size': stat.size,
                'etag': stat.etag,
                'last_modified': stat.last_modified,
                'content_type': stat.content_type,
                'metadata': stat.metadata
            }
            
        except Exception as e:
            self.logger.error(f"Error getting file info {file_path}: {str(e)}")
            raise