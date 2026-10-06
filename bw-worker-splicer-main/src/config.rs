use std::env;

#[derive(Debug)]
pub struct Config {
    pub rabbitmq_url: String,
    pub rabbitmq_exchange: String,
    pub input_queue: String,
    pub output_queue: String,
    pub database_url: String,
    pub minio_endpoint: String,
    pub minio_access_key: String,
    pub minio_secret_key: String,
    pub input_bucket: String,
    pub output_bucket: String,
}

pub fn load_config() -> Result<Config, Box<dyn std::error::Error>> {
    Ok(Config {
        rabbitmq_url: env::var("RABBITMQ_URL")?,
        rabbitmq_exchange: env::var("RABBIT_MQ_EXCHANGE")?,
        input_queue: env::var("RABBIT_MQ_INPUT_QUEUE")?,
        output_queue: env::var("RABBIT_MQ_OUTPUT_QUEUE")?,
        database_url: env::var("DATABASE_URL")?,
        minio_endpoint: env::var("MINIO_ENDPOINT")?,
        minio_access_key: env::var("MINIO_ACCESS_KEY")?,
        minio_secret_key: env::var("MINIO_SECRET_KEY")?,
        input_bucket: env::var("MINIO_INPUT_BUCKET")?,
        output_bucket: env::var("MINIO_OUTPUT_BUCKET")?,
    })
}