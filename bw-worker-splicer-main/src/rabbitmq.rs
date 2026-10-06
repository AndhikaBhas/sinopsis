use lapin::{Connection, ConnectionProperties, options::*, types::FieldTable, Channel, Consumer, BasicProperties};
use serde::{Deserialize, Serialize};
use log::info;

#[derive(Debug, Deserialize)]
pub struct JobMessage {
    pub rapat_id: String,
}

#[derive(Debug, Serialize)]
pub struct CompletionMessage {
    pub rapat_id: String,
    pub file_name: String,
    pub bucket_name: String,
}

pub async fn create_connection(rabbitmq_url: &str) -> Result<Connection, Box<dyn std::error::Error>> {
    info!("Connecting to RabbitMQ: {}", rabbitmq_url);
    let conn = Connection::connect(rabbitmq_url, ConnectionProperties::default()).await?;
    info!("Connected to RabbitMQ");
    Ok(conn)
}

pub async fn create_channel(conn: &Connection) -> Result<Channel, Box<dyn std::error::Error>> {
    let channel = conn.create_channel().await?;
    Ok(channel)
}

pub async fn setup_queues(channel: &Channel, exchange: &str, output_queue: &str) -> Result<(), Box<dyn std::error::Error>> {
    // Declare exchange
    channel.exchange_declare(exchange, lapin::ExchangeKind::Direct, ExchangeDeclareOptions { durable: true, ..Default::default() }, FieldTable::default()).await?;

    // Declare queues
    // channel.queue_declare(input_queue, QueueDeclareOptions::default(), FieldTable::default()).await?; // Removed as not needed
    channel.queue_declare(output_queue, QueueDeclareOptions { durable: true, ..Default::default() }, FieldTable::default()).await?;

    // Bind queues to exchange
    // channel.queue_bind(input_queue, exchange, input_queue, QueueBindOptions::default(), FieldTable::default()).await?; // Removed as not needed
    channel.queue_bind(output_queue, exchange, output_queue, QueueBindOptions::default(), FieldTable::default()).await?;

    info!("Queues set up: {}", output_queue);
    Ok(())
}

pub async fn consume_messages(channel: &Channel, queue: &str) -> Result<Consumer, Box<dyn std::error::Error>> {
    let consumer = channel.basic_consume(queue, "sinopsis-worker", BasicConsumeOptions::default(), FieldTable::default()).await?;
    info!("Consuming messages from queue: {}", queue);
    Ok(consumer)
}

pub async fn publish_message(channel: &Channel, exchange: &str, routing_key: &str, message: &CompletionMessage) -> Result<(), Box<dyn std::error::Error>> {
    let payload = serde_json::to_string(message)?;
    channel.basic_publish(exchange, routing_key, BasicPublishOptions::default(), payload.as_bytes(), BasicProperties::default()).await?;
    info!("Published message: {:?}", message);
    Ok(())
}