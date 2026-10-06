use std::str;
use std::sync::Arc;

use anyhow::{anyhow, Context};
use futures_util::StreamExt;
use lapin::message::Delivery;
use lapin::options::{BasicAckOptions, BasicConsumeOptions, BasicNackOptions, BasicQosOptions};
use lapin::types::FieldTable;
use lapin::{Connection, ConnectionProperties};
use tokio_executor_trait::Tokio as TokioExecutor;
#[cfg(unix)]
use tokio_reactor_trait::Tokio as TokioReactor;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, instrument, warn};

use crate::chunking::count_words;
use crate::models::{RabbitMessage, SummaryResult};
use crate::state::AppState;

pub async fn run_consumer(state: Arc<AppState>, shutdown: CancellationToken) -> anyhow::Result<()> {
    info!(event = "rabbitmq.connect_start", uri = %state.config.rabbitmq_uri);
    let connection = Connection::connect(&state.config.rabbitmq_uri, connection_properties())
        .await
        .context("failed to connect to RabbitMQ")?;
    info!(event = "rabbitmq.connect_success");

    let channel = connection
        .create_channel()
        .await
        .context("failed to create RabbitMQ channel")?;

    let prefetch = state.config.rabbitmq_prefetch.clamp(1, 1);

    if prefetch != state.config.rabbitmq_prefetch {
        info!(
            event = "rabbitmq.prefetch_adjusted",
            requested = state.config.rabbitmq_prefetch,
            applied = prefetch,
            "Prefetch forced to 1 to enforce sequential processing"
        );
    }

    channel
        .basic_qos(prefetch, BasicQosOptions::default())
        .await
        .context("failed to set channel QoS")?;

    let mut consumer = channel
        .basic_consume(
            &state.config.rabbitmq_queue,
            "sinopsis_worker",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await
        .context("failed to start consumer")?;

    info!(
        event = "rabbitmq.consume_start",
        queue = %state.config.rabbitmq_queue,
        exchange = state
            .config
            .rabbitmq_exchange
            .as_deref()
            .unwrap_or(""),
        prefetch = prefetch
    );

    let shutdown_fut = shutdown.cancelled();
    tokio::pin!(shutdown_fut);

    loop {
        tokio::select! {
            _ = &mut shutdown_fut => {
                info!(event = "rabbitmq.shutdown_signal", "Shutdown requested; stopping consumer loop");
                break;
            }
            maybe_delivery = consumer.next() => {
                match maybe_delivery {
                    Some(Ok(delivery)) => {
                        let state = state.clone();
                        if let Err(err) = handle_delivery(state, delivery).await {
                            error!(event = "rabbitmq.delivery_error", error = %err);
                        }
                    }
                    Some(Err(err)) => {
                        error!(event = "rabbitmq.consumer_error", error = %err);
                    }
                    None => {
                        info!(event = "rabbitmq.consumer_ended", "Consumer stream closed by broker");
                        break;
                    }
                }
            }
        }
    }

    drop(consumer);

    if let Err(err) = channel.close(200, "graceful shutdown").await {
        warn!(event = "rabbitmq.channel_close_error", error = %err);
    }

    if let Err(err) = connection.close(200, "graceful shutdown").await {
        warn!(event = "rabbitmq.connection_close_error", error = %err);
    }

    info!(event = "rabbitmq.consume_stopped");
    Ok(())
}

#[instrument(skip(state, delivery))]
async fn handle_delivery(state: Arc<AppState>, delivery: Delivery) -> anyhow::Result<()> {
    info!(
        event = "rabbitmq.delivery_received",
        delivery_tag = delivery.delivery_tag
    );

    let rapat_id = match parse_rapat_id(&delivery.data) {
        Ok(id) => id,
        Err(err) => {
            error!(event = "rabbitmq.parse_error", error = %err);
            delivery
                .nack(BasicNackOptions {
                    requeue: false,
                    ..Default::default()
                })
                .await
                .context("failed to nack malformed message")?;
            return Ok(());
        }
    };

    info!(event = "rabbitmq.job_received", rapat_id = rapat_id);

    let result = process_rapat(state.clone(), rapat_id).await;
    match result {
        Ok(summary) => {
            info!(
                event = "rabbitmq.job_completed",
                rapat_id = rapat_id,
                summary_words = count_words(&summary.summary)
            );
            delivery
                .ack(BasicAckOptions::default())
                .await
                .context("failed to ack successful message")?;
            info!(event = "rabbitmq.acknowledged", rapat_id = rapat_id);
        }
        Err(err) => {
            error!(event = "rabbitmq.job_failed", rapat_id = rapat_id, error = %err);
            delivery
                .nack(BasicNackOptions {
                    requeue: state.config.rabbitmq_requeue_on_failure,
                    ..Default::default()
                })
                .await
                .context("failed to nack failed message")?;
            info!(event = "rabbitmq.requeued", rapat_id = rapat_id);
        }
    }

    Ok(())
}

fn connection_properties() -> ConnectionProperties {
    let props = ConnectionProperties::default().with_executor(TokioExecutor::current());
    #[cfg(unix)]
    let props = props.with_reactor(TokioReactor);
    props
}

async fn process_rapat(state: Arc<AppState>, rapat_id: i64) -> anyhow::Result<SummaryResult> {
    info!(
        event = "minio.fetch_start",
        rapat_id = rapat_id,
        "MinIO download step (not required) skipped"
    );
    info!(
        event = "db.fetch_start",
        rapat_id = rapat_id,
        "Loading transcript from database"
    );
    let transcript = state
        .db
        .fetch_transcript(rapat_id)
        .await?
        .ok_or_else(|| anyhow!("transcript not found for rapat_id={rapat_id}"))?;

    let summary = state
        .summarizer
        .summarize(rapat_id, transcript)
        .await
        .context("summarization failed")?;

    info!(
        event = "db.save_start",
        rapat_id = rapat_id,
        "Saving summary into database"
    );
    let json_payload = serde_json::to_value(&summary).context("failed to serialize summary")?;
    state
        .db
        .save_summary(rapat_id, &json_payload)
        .await
        .context("failed to persist summary")?;
    info!(event = "db.save_success", rapat_id = rapat_id);

    Ok(summary)
}

fn parse_rapat_id(payload: &[u8]) -> anyhow::Result<i64> {
    let text = str::from_utf8(payload).context("payload not UTF-8")?.trim();

    if text.is_empty() {
        return Err(anyhow!("payload empty"));
    }

    if let Ok(parsed) = text.parse::<i64>() {
        return Ok(parsed);
    }

    if let Ok(message) = serde_json::from_str::<RabbitMessage>(text) {
        return Ok(message.rapat_id);
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(text) {
        if let Some(id_value) = value
            .get("rapat_id")
            .or_else(|| value.get("id"))
            .or_else(|| value.get("rapatId"))
        {
            if let Some(as_str) = id_value.as_str() {
                return as_str
                    .trim()
                    .parse::<i64>()
                    .context("rapat_id string value invalid")
                    .map_err(Into::into);
            }
            if let Some(as_i64) = id_value.as_i64() {
                return Ok(as_i64);
            }
        }
    }

    Err(anyhow!("unable to extract rapat_id from message"))
}
