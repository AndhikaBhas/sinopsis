mod chunking;
mod config;
mod db;
mod messaging;
mod models;
mod state;
mod summarizer;

use std::sync::Arc;

use anyhow::Context;
use config::AppConfig;
use state::AppState;
use tokio_util::sync::CancellationToken;
use tracing::{error, info};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let dotenv_result = dotenvy::dotenv();
    init_tracing();

    match dotenv_result {
        Ok(_) => info!(
            event = "worker.dotenv",
            message = "Loaded environment from .env"
        ),
        Err(err) => {
            info!(event = "worker.dotenv_missing", error = %err, "Proceeding without .env file")
        }
    }

    info!(
        event = "worker.start",
        "Sinopsis summarization worker starting up"
    );

    let has_rabbit_mq_url = std::env::var("RABBIT_MQ_URL").is_ok();
    let has_rabbitmq_url = std::env::var("RABBITMQ_URL").is_ok();
    let has_rabbitmq_uri = std::env::var("RABBITMQ_URI").is_ok();
    info!(
        event = "worker.env_check",
        has_rabbit_mq_url, has_rabbitmq_url, has_rabbitmq_uri
    );

    let config = Arc::new(AppConfig::from_env().context("failed to load configuration")?);
    info!(event = "worker.config_loaded", rabbitmq_queue = %config.rabbitmq_queue);

    let db = db::Database::connect(&config).await?;
    let summarizer = summarizer::Summarizer::new(config.clone())?;
    let state = Arc::new(AppState::new(
        config.clone(),
        db.clone(),
        summarizer.clone(),
    ));

    info!(event = "worker.ready", "Starting RabbitMQ consumer loop");

    let shutdown_token = CancellationToken::new();
    let mut consumer_future = Box::pin(messaging::run_consumer(
        state.clone(),
        shutdown_token.clone(),
    ));
    let mut signal_future = Box::pin(async {
        tokio::signal::ctrl_c()
            .await
            .context("failed to install Ctrl+C handler")
    });

    let result = tokio::select! {
        res = &mut consumer_future => res,
        res = &mut signal_future => {
            match res {
                Ok(()) => info!(event = "worker.shutdown_signal", "Ctrl+C received; initiating graceful shutdown"),
                Err(err) => {
                    error!(event = "worker.shutdown_signal_error", error = %err);
                    return Err(err);
                }
            }

            shutdown_token.cancel();
            consumer_future.as_mut().await
        }
    };

    match result {
        Ok(()) => info!(event = "worker.stopped", "Worker terminated gracefully"),
        Err(err) => {
            error!(event = "worker.shutdown_error", error = %err);
            return Err(err);
        }
    }

    Ok(())
}

fn init_tracing() {
    let default_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    if tracing_subscriber::fmt()
        .with_env_filter(default_filter)
        .with_target(true)
        .compact()
        .try_init()
        .is_err()
    {
        // Logging already initialized; ignore.
    }
}
