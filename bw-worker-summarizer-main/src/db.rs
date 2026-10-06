use anyhow::Context;
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use tracing::{debug, info, instrument};

use crate::config::AppConfig;

#[derive(Clone)]
pub struct Database {
    pool: PgPool,
}

impl Database {
    pub async fn connect(config: &AppConfig) -> anyhow::Result<Self> {
        info!(event = "db.connect_start", "Connecting to PostgreSQL");
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(&config.database_url)
            .await
            .context("failed to connect to database")?;
        info!(
            event = "db.connect_success",
            "Database connection established"
        );
        Ok(Self { pool })
    }

    #[instrument(skip(self), fields(rapat_id = rapat_id))]
    pub async fn fetch_transcript(&self, rapat_id: i64) -> anyhow::Result<Option<Value>> {
        info!(
            event = "db.read_start",
            rapat_id = rapat_id,
            "Fetching rapat transcript"
        );
        let record = sqlx::query("SELECT diarisasi_transkrip FROM rapat WHERE id = $1")
            .bind(rapat_id)
            .fetch_optional(&self.pool)
            .await
            .context("database query failed")?;

        let result = match record {
            Some(row) => {
                // Attempt to read as JSON first, fallback to text
                if let Ok(json_value) = row.try_get::<Value, _>("diarisasi_transkrip") {
                    info!(
                        event = "db.read_success_json",
                        rapat_id = rapat_id,
                        "Transcript fetched as JSON"
                    );
                    Some(json_value)
                } else if let Ok(text_value) = row.try_get::<String, _>("diarisasi_transkrip") {
                    info!(
                        event = "db.read_success_text",
                        rapat_id = rapat_id,
                        "Transcript fetched as TEXT"
                    );
                    serde_json::from_str(&text_value)
                        .map(Some)
                        .context("failed to parse transcript text as JSON")?
                } else {
                    info!(
                        event = "db.read_empty",
                        rapat_id = rapat_id,
                        "Transcript column is NULL or unsupported"
                    );
                    None
                }
            }
            None => {
                info!(
                    event = "db.read_not_found",
                    rapat_id = rapat_id,
                    "No rapat row found"
                );
                None
            }
        };
        debug!(
            event = "db.read_complete",
            rapat_id = rapat_id,
            has_transcript = result.is_some()
        );
        Ok(result)
    }

    #[instrument(skip(self, summary), fields(rapat_id = rapat_id))]
    pub async fn save_summary(&self, rapat_id: i64, summary: &Value) -> anyhow::Result<()> {
        info!(
            event = "db.write_start",
            rapat_id = rapat_id,
            "Saving summarization result"
        );
        let affected = sqlx::query("UPDATE rapat SET ringkasan = $1 WHERE id = $2")
            .bind(summary)
            .bind(rapat_id)
            .execute(&self.pool)
            .await
            .context("failed to update rapat.ringkasan")?;

        info!(
            event = "db.write_success",
            rapat_id = rapat_id,
            rows_affected = affected.rows_affected()
        );
        Ok(())
    }
}
