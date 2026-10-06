"""
RabbitMQ handler for message queue operations.
"""

import json
import pika
import threading
from typing import Dict, Any, Callable
from utils.logger import LoggerMixin


class RabbitMQHandler(LoggerMixin):
    """Handler for RabbitMQ operations."""
    
    def __init__(self, config):
        """
        Initialize RabbitMQ handler.
        
        Args:
            config: Configuration object
        """
        self.config = config
        self.connection = None
        self.channel = None
        self._lock = threading.Lock()  # Thread safety lock
        self._is_consuming = False
        self._connect()
    
    def _connect(self):
        """Establish connection to RabbitMQ."""
        try:
            self.logger.info(f"Connecting to RabbitMQ: {self.config.rabbitmq_url}")
            
            # Parse connection parameters
            parameters = pika.URLParameters(self.config.rabbitmq_url)
            
            # Add connection parameters for long-running tasks
            # Set heartbeat to 0 to disable it, or use a very high value
            # This is necessary because audio processing can take longer than default timeout
            parameters.heartbeat = 0  # Disable heartbeat for long-running tasks
            parameters.blocked_connection_timeout = 300
            
            self.logger.debug(f"Connection parameters: host={parameters.host}, port={parameters.port}, vhost={parameters.virtual_host}")
            
            # Establish connection
            self.connection = pika.BlockingConnection(parameters)
            self.channel = self.connection.channel()
            
            self.logger.info("RabbitMQ connection established, setting up exchanges and queues...")
            
            # Declare exchange
            self.channel.exchange_declare(
                exchange=self.config.rabbitmq_exchange,
                exchange_type='direct',
                durable=True
            )
            self.logger.debug(f"Exchange declared: {self.config.rabbitmq_exchange}")
            
            # Declare input queue
            queue_result = self.channel.queue_declare(
                queue=self.config.rabbitmq_input_queue,
                durable=True
            )
            self.logger.debug(f"Input queue declared: {self.config.rabbitmq_input_queue}, messages: {queue_result.method.message_count}")
            
            # Declare output queue
            self.channel.queue_declare(
                queue=self.config.rabbitmq_output_queue,
                durable=True
            )
            self.logger.debug(f"Output queue declared: {self.config.rabbitmq_output_queue}")
            
            # Bind input queue to exchange
            self.channel.queue_bind(
                exchange=self.config.rabbitmq_exchange,
                queue=self.config.rabbitmq_input_queue,
                routing_key=self.config.rabbitmq_input_queue
            )
            
            # Bind output queue to exchange
            self.channel.queue_bind(
                exchange=self.config.rabbitmq_exchange,
                queue=self.config.rabbitmq_output_queue,
                routing_key=self.config.rabbitmq_output_queue
            )
            
            # Set QoS to process one message at a time
            self.channel.basic_qos(prefetch_count=1)
            
            self.logger.info("Successfully connected to RabbitMQ and configured queues")
            
        except Exception as e:
            self.logger.error(f"Failed to connect to RabbitMQ: {str(e)}")
            self.logger.exception("Full RabbitMQ connection error traceback:")
            raise
    
    def consume_messages(self, callback: Callable):
        """
        Start consuming messages from the input queue.
        
        Args:
            callback: Function to call for each message
        """
        try:
            self.logger.info(f"Starting to consume messages from queue: {self.config.rabbitmq_input_queue}")
            
            # Check connection status
            if not self.connection or self.connection.is_closed:
                self.logger.error("RabbitMQ connection is closed, attempting to reconnect...")
                self._connect()
            elif not self.channel or self.channel.is_closed:
                self.logger.error("RabbitMQ channel is closed, attempting to reconnect...")
                self._connect()
            
            # Set up consumer with specific tag
            self.logger.info("Setting up message consumer...")
            
            # Wrap callback to handle connection state
            def safe_callback(ch, method, properties, body):
                try:
                    callback(ch, method, properties, body)
                except Exception as callback_error:
                    self.logger.error(f"Error in message callback: {str(callback_error)}")
                    # Try to NACK the message if connection is still alive
                    try:
                        if ch and not ch.is_closed:
                            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                            self.logger.info("Message NACKed after callback error")
                    except Exception as nack_error:
                        self.logger.error(f"Failed to NACK message: {str(nack_error)}")
            
            consumer_tag = self.channel.basic_consume(
                queue=self.config.rabbitmq_input_queue,
                on_message_callback=safe_callback,
                auto_ack=False,  # Manual acknowledgement
                consumer_tag="sinopsis-worker-diarizer"
            )
            
            self.logger.info(f"Consumer set up with tag: {consumer_tag}")
            self.logger.info("Waiting for messages. To exit press CTRL+C")
            
            # Start consuming with graceful shutdown support
            self._is_consuming = True
            try:
                self.channel.start_consuming()
            except KeyboardInterrupt:
                self.logger.info("Stopping message consumption due to KeyboardInterrupt...")
                self._is_consuming = False
                if self.channel and not self.channel.is_closed:
                    self.channel.stop_consuming()
                # Wait for any pending deliveries
                if self.connection and not self.connection.is_closed:
                    try:
                        self.connection.process_data_events(time_limit=1)
                    except Exception as process_error:
                        self.logger.debug(f"Error processing final events: {str(process_error)}")
            except Exception as consume_error:
                self.logger.error(f"Error during message consumption: {str(consume_error)}")
                self._is_consuming = False
                raise
            finally:
                self._is_consuming = False
            
        except Exception as e:
            self.logger.error(f"Error consuming messages: {str(e)}")
            self.logger.exception("Full RabbitMQ error traceback:")
            self._is_consuming = False
            raise
    
    def publish_message(self, message: Dict[str, Any], routing_key: str = None):
        """
        Publish a message to the output queue.
        
        Args:
            message: Message data to publish
            routing_key: Optional routing key (defaults to output queue name)
        """
        # NOTE: Do NOT reconnect from within a callback!
        # Reconnecting involves queue_declare and other operations that
        # will cause ConnectionWrongStateError when called from callback
        try:
            # Check connection state before publishing
            if not self.connection or self.connection.is_closed:
                self.logger.error("Connection is closed, cannot publish message")
                raise ConnectionError("RabbitMQ connection is closed")
            
            if not self.channel or self.channel.is_closed:
                self.logger.error("Channel is closed, cannot publish message")
                raise ConnectionError("RabbitMQ channel is closed")
            
            if routing_key is None:
                routing_key = self.config.rabbitmq_output_queue
            
            message_body = json.dumps(message, ensure_ascii=False)
            
            self.logger.debug(f"Publishing message to {routing_key}: {message}")
            
            self.channel.basic_publish(
                exchange=self.config.rabbitmq_exchange,
                routing_key=routing_key,
                body=message_body,
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Make message persistent
                    content_type='application/json',
                    content_encoding='utf-8'
                )
            )
            
            # DO NOT call process_data_events() here!
            # If called from within a consumer callback, this will cause
            # ConnectionWrongStateError because the main loop is already
            # processing events. The message will be sent automatically
            # by the main event loop.
            
            self.logger.info(f"Successfully published message to {routing_key}")
            
        except Exception as e:
            self.logger.error(f"Failed to publish message: {str(e)}")
            # Don't raise - allow processing to continue even if notification fails
            self.logger.warning("Continuing despite publish failure...")
    
    def close(self):
        """Close RabbitMQ connection."""
        with self._lock:  # Thread-safe closing
            try:
                # Stop consuming if active
                if self._is_consuming and self.channel and not self.channel.is_closed:
                    try:
                        self.logger.info("Stopping message consumption...")
                        self.channel.stop_consuming()
                    except Exception as stop_error:
                        self.logger.debug(f"Error stopping consumption: {str(stop_error)}")
                
                # Close connection
                if self.connection and not self.connection.is_closed:
                    self.logger.info("Closing RabbitMQ connection...")
                    try:
                        # Cancel all consumers first
                        if self.channel and not self.channel.is_closed:
                            self.channel.cancel()
                    except Exception as cancel_error:
                        self.logger.debug(f"Error canceling consumers: {str(cancel_error)}")
                    
                    # Close the connection
                    try:
                        self.connection.close()
                        self.logger.info("RabbitMQ connection closed")
                    except Exception as close_error:
                        self.logger.debug(f"Error closing connection: {str(close_error)}")
                        
            except Exception as e:
                self.logger.error(f"Error closing RabbitMQ connection: {str(e)}")
    
    def __del__(self):
        """Destructor to ensure connection is closed."""
        try:
            self.close()
        except Exception:
            pass  # Ignore errors during cleanup