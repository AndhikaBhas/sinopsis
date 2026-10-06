use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TranscriptSegment {
    #[serde(default)]
    #[allow(dead_code)]
    pub timestamp: Option<String>,
    #[serde(
        default,
        alias = "speaker",
        alias = "speaker_name",
        alias = "speaker_label"
    )]
    pub speaker_id: Option<String>,
    #[serde(alias = "text", alias = "utterance", alias = "speech")]
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct RabbitMessage {
    pub rapat_id: i64,
}

#[derive(Debug, Serialize)]
pub struct StageSummary {
    pub stage: String,
    pub word_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SummaryResult {
    pub summary: String,
    pub model: String,
    pub generated_at: DateTime<Utc>,
    pub stages: Vec<StageSummary>,
}
