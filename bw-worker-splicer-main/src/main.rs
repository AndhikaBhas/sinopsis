mod config;
mod db;
mod minio;
mod rabbitmq;
mod audio;

use log::{debug, info, error};
use lapin::options::BasicAckOptions;
use futures::stream::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    dotenv::dotenv().ok();

    info!("Starting sinopsis-worker-splicer v{}", env!("CARGO_PKG_VERSION"));
    info!("Using temporary files for audio processing (not named pipes)");

    // Load configuration
    info!("Loading configuration");
    let config = config::load_config()?;
    info!("Configuration loaded successfully");

    // Initialize ffmpeg
    info!("Initializing FFmpeg");
    audio::init_ffmpeg();
    info!("FFmpeg initialized");

    // Create RabbitMQ connection
    info!("Creating RabbitMQ connection");
    let conn = rabbitmq::create_connection(&config.rabbitmq_url).await?;
    let channel = rabbitmq::create_channel(&conn).await?;
    info!("RabbitMQ channel created");

    // Setup queues
    rabbitmq::setup_queues(&channel, &config.rabbitmq_exchange, &config.output_queue).await?;

    // Create MinIO client
    info!("Creating MinIO S3 client");
    let minio_client = minio::create_s3_client(&config.minio_endpoint, &config.minio_access_key, &config.minio_secret_key);
    info!("MinIO client created");

    // Consume messages
    let mut consumer = rabbitmq::consume_messages(&channel, &config.input_queue).await?;

    info!("Worker is ready to process jobs");

    while let Some(delivery) = consumer.next().await {
        match delivery {
            Ok(delivery) => {
                let message: rabbitmq::JobMessage = match serde_json::from_slice(&delivery.data) {
                    Ok(msg) => msg,
                    Err(e) => {
                        error!("Failed to parse message: {}", e);
                        delivery.ack(BasicAckOptions::default()).await?;
                        continue;
                    }
                };

                info!("Received job for rapat_id: {}", message.rapat_id);
                debug!("Received message data: {:?}", &delivery.data);

                // Process the job
                match process_job(&message.rapat_id, &config, &minio_client).await {
                    Ok((file_name, bucket_name)) => {
                        // Publish completion message
                        let completion_msg = rabbitmq::CompletionMessage {
                            rapat_id: message.rapat_id.clone(),
                            file_name,
                            bucket_name,
                        };
                        if let Err(e) = rabbitmq::publish_message(&channel, &config.rabbitmq_exchange, &config.output_queue, &completion_msg).await {
                            error!("Failed to publish completion message: {}", e);
                        }
                        // Acknowledge only after successful processing and publishing
                        delivery.ack(BasicAckOptions::default()).await?;
                    }
                    Err(e) => {
                        error!("Failed to process job for rapat_id {}: {}", message.rapat_id, e);
                        // Do not acknowledge failed jobs, so they can be retried
                    }
                }
            }
            Err(e) => {
                error!("Error receiving message: {}", e);
            }
        }
    }

    Ok(())
}

async fn process_job(rapat_id: &str, config: &config::Config, minio_client: &rusoto_s3::S3Client) -> Result<(String, String), Box<dyn std::error::Error>> {
    info!("Processing job for rapat_id: {} (in-memory mode)", rapat_id);

    // Get audio chunks from DB
    info!("Retrieving audio chunks from database for rapat_id: {}", rapat_id);
    let chunks = db::get_audio_chunks(rapat_id, &config.database_url).await?;
    if chunks.is_empty() {
        return Err("No audio chunks found".into());
    }
    info!("Found {} audio chunks", chunks.len());

    // Prepare chunk keys for MinIO download
    let chunk_keys: Vec<String> = chunks
        .iter()
        .map(|chunk| chunk.nama_file_audio.replace(".webm", "_standardized.webm"))
        .collect();
    
    info!("Prepared {} chunk keys for processing", chunk_keys.len());
    debug!("Chunk keys: {:?}", chunk_keys);

    // Extract date/time info from first chunk for logging
    if let Some(first_chunk) = chunk_keys.first() {
        let parts: Vec<&str> = first_chunk.split('_').collect();
        if parts.len() >= 4 {
            debug!("Extracted date: {}, time: {} from first chunk", parts[2], parts[3]);
        }
    }

    // Process audio chunks entirely in memory
    info!("Processing audio chunks in memory (no local files)");
    let processed_audio_data = audio::join_audio_chunks_in_memory(
        minio_client,
        &config.input_bucket,
        &chunk_keys
    ).await?;
    
    info!("Audio processing completed successfully ({} bytes)", processed_audio_data.len());

    // Extract date and time from the first chunk filename for output naming
    let output_filename = if let Some(first_chunk) = chunk_keys.first() {
        // Extract date and time from filename like: "26_001_20250927_151030_standardized.webm"
        let parts: Vec<&str> = first_chunk.split('_').collect();
        if parts.len() >= 4 {
            let date_part = parts[2]; // "20250927"
            let time_part = parts[3]; // "151030"
            format!("{}_{}_{}_{}.webm", rapat_id, date_part, time_part, "spliced")
        } else {
            format!("{}.webm", rapat_id)
        }
    } else {
        format!("{}.webm", rapat_id)
    };
    
    info!("Uploading processed audio directly from memory to MinIO bucket: {}", config.output_bucket);
    debug!("Output filename: {}", output_filename);
    
    minio::upload_data_from_memory(
        minio_client,
        &config.output_bucket,
        &output_filename,
        processed_audio_data
    ).await?;
    
    info!("Upload completed successfully");
    info!("Successfully processed rapat_id: {} (fully in-memory, no local files)", rapat_id);
    
    Ok((output_filename, config.output_bucket.clone()))
}