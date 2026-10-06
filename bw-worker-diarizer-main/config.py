"""
Configuration management for the diarization worker.
"""

import os
from dotenv import load_dotenv


class Config:
    """Configuration class that loads settings from environment variables."""
    
    def __init__(self, env_file: str = '.env'):
        """
        Initialize configuration by loading environment variables.
        
        Args:
            env_file: Path to the environment file
        """
        load_dotenv(env_file)
        
        # Database configuration
        self.database_url = self._get_required_env('DATABASE_URL')
        
        # RabbitMQ configuration
        self.rabbitmq_url = self._get_required_env('RABBITMQ_URL')
        self.rabbitmq_exchange = self._get_required_env('RABBIT_MQ_EXCHANGE')
        self.rabbitmq_input_queue = self._get_required_env('RABBIT_MQ_INPUT_QUEUE')
        self.rabbitmq_output_queue = self._get_required_env('RABBIT_MQ_OUTPUT_QUEUE')
        
        # MinIO configuration
        self.minio_endpoint = self._get_required_env('MINIO_ENDPOINT')
        self.minio_user = self._get_required_env('MINIO_USER')
        self.minio_password = self._get_required_env('MINIO_PASSWORD')
        self.minio_input_bucket = self._get_required_env('MINIO_INPUT_BUCKET')
        
        # HuggingFace configuration
        self.huggingface_auth_token = self._get_required_env('HUGGINGFACE_AUTH_TOKEN')
        
        # Validate configuration
        self._validate_config()
    
    def _get_required_env(self, key: str) -> str:
        """
        Get a required environment variable.
        
        Args:
            key: Environment variable key
            
        Returns:
            Environment variable value
            
        Raises:
            ValueError: If the required environment variable is not set
        """
        value = os.getenv(key)
        if not value:
            raise ValueError(f"Required environment variable {key} is not set")
        return value
    
    def _get_optional_env(self, key: str, default: str = '') -> str:
        """
        Get an optional environment variable.
        
        Args:
            key: Environment variable key
            default: Default value if not set
            
        Returns:
            Environment variable value or default
        """
        return os.getenv(key, default)
    
    def _get_bool_env(self, key: str, default: bool = False) -> bool:
        """
        Get a boolean environment variable.
        
        Args:
            key: Environment variable key
            default: Default value if not set
            
        Returns:
            Boolean value
        """
        value = os.getenv(key, '').lower()
        if value in ('true', '1', 'yes', 'on'):
            return True
        elif value in ('false', '0', 'no', 'off'):
            return False
        else:
            return default
    
    def _validate_config(self):
        """Validate the configuration settings."""
        # Validate MinIO endpoint format
        if not (self.minio_endpoint.startswith('http://') or 
                self.minio_endpoint.startswith('https://')):
            raise ValueError("MINIO_ENDPOINT must start with http:// or https://")
        
        # Validate RabbitMQ URL format
        if not self.rabbitmq_url.startswith('amqp://'):
            raise ValueError("RABBITMQ_URL must start with amqp://")
        
        # Validate database URL format
        if not self.database_url.startswith('postgresql://'):
            raise ValueError("DATABASE_URL must start with postgresql://")
    
    def get_minio_endpoint_parts(self) -> tuple:
        """
        Get MinIO endpoint parts for connection.
        
        Returns:
            Tuple of (endpoint, secure) where secure is True for HTTPS
        """
        if self.minio_endpoint.startswith('https://'):
            return self.minio_endpoint[8:], True
        elif self.minio_endpoint.startswith('http://'):
            return self.minio_endpoint[7:], False
        else:
            raise ValueError("Invalid MinIO endpoint format")
    
    def __str__(self) -> str:
        """String representation of configuration (excluding sensitive data)."""
        return f"""Configuration:
  Database URL: {self.database_url.split('@')[-1] if '@' in self.database_url else '***'}
  RabbitMQ Exchange: {self.rabbitmq_exchange}
  RabbitMQ Input Queue: {self.rabbitmq_input_queue}
  RabbitMQ Output Queue: {self.rabbitmq_output_queue}
  MinIO Endpoint: {self.minio_endpoint}
  MinIO Bucket: {self.minio_input_bucket}
"""