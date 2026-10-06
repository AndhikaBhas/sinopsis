use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context};
use chrono::Utc;
use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use tracing::{debug, info, instrument, warn};

use crate::chunking::{chunk_text, count_words};
use crate::config::AppConfig;
use crate::models::{StageSummary, SummaryResult, TranscriptSegment};

const OVERLAP_RATIO: f32 = 0.3;
const MAX_ITERATIONS: usize = 6;

#[derive(Clone)]
pub struct Summarizer {
    config: Arc<AppConfig>,
    client: Client,
}

impl Summarizer {
    pub fn new(config: Arc<AppConfig>) -> anyhow::Result<Self> {
        let timeout = Duration::from_secs(config.ollama_timeout_secs.max(30));
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .context("failed to build HTTP client")?;
        Ok(Self { config, client })
    }

    #[instrument(skip(self, transcript_json), fields(rapat_id = rapat_id))]
    pub async fn summarize(
        &self,
        rapat_id: i64,
        transcript_json: Value,
    ) -> anyhow::Result<SummaryResult> {
        info!(
            event = "summarizer.start",
            rapat_id = rapat_id,
            "Starting summarization pipeline"
        );

        let segments = extract_segments(transcript_json)?;
        if segments.is_empty() {
            bail!("transcript is empty");
        }

        let normalized = build_transcript_text(&segments);
        let normalized_words = count_words(&normalized);
        info!(
            event = "summarizer.normalized",
            rapat_id = rapat_id,
            segments = segments.len(),
            words = normalized_words,
            "Transcript normalized"
        );

        let half_context = (self.config.model_context_length / 2).max(32);
        let mut stages = Vec::new();

        if normalized_words <= half_context {
            info!(
                event = "summarizer.single_stage",
                rapat_id = rapat_id,
                "Transcript within single-pass threshold"
            );
            let summary = self
                .call_ollama(&normalized)
                .await
                .context("ollama summarization failed")?;
            stages.push(StageSummary {
                stage: "single_pass".to_string(),
                word_count: normalized_words,
                note: Some("Summarized in one call".to_string()),
            });
            return Ok(SummaryResult {
                summary,
                model: self.config.ollama_model.clone(),
                generated_at: Utc::now(),
                stages,
            });
        }

        info!(
            event = "summarizer.multi_stage",
            rapat_id = rapat_id,
            half_context = half_context,
            "Starting iterative summarization"
        );
        let mut current_text = normalized;
        let mut iteration = 0usize;

        loop {
            iteration += 1;
            if iteration > MAX_ITERATIONS {
                warn!(
                    event = "summarizer.max_iterations",
                    rapat_id = rapat_id,
                    iteration = iteration,
                    "Reached max iterations; returning current text"
                );
                stages.push(StageSummary {
                    stage: format!("iteration_{}_aborted", iteration),
                    word_count: count_words(&current_text),
                    note: Some(
                        "Max iterations reached; returning latest combined text".to_string(),
                    ),
                });
                return Ok(SummaryResult {
                    summary: current_text,
                    model: self.config.ollama_model.clone(),
                    generated_at: Utc::now(),
                    stages,
                });
            }

            let chunk_words_limit = half_context;
            let chunks = chunk_text(&current_text, chunk_words_limit, OVERLAP_RATIO);
            if chunks.is_empty() {
                bail!("chunking resulted in empty set");
            }

            info!(
                event = "summarizer.iteration_start",
                rapat_id = rapat_id,
                iteration = iteration,
                chunks = chunks.len(),
                chunk_words_limit = chunk_words_limit,
                "Processing chunk summaries"
            );

            let mut chunk_summaries = Vec::with_capacity(chunks.len());
            for (idx, chunk) in chunks.iter().enumerate() {
                let chunk_word_count = count_words(chunk);
                debug!(
                    event = "summarizer.chunk_request",
                    rapat_id = rapat_id,
                    iteration = iteration,
                    chunk_index = idx,
                    chunk_word_count = chunk_word_count,
                    "Sending chunk to Ollama"
                );
                let summary = self
                    .call_ollama(chunk)
                    .await
                    .with_context(|| format!("ollama summarization failed for chunk {idx}"))?;
                chunk_summaries.push(summary);
            }

            let combined = chunk_summaries.join("\n\n");
            let combined_word_count = count_words(&combined);
            stages.push(StageSummary {
                stage: format!("iteration_{}", iteration),
                word_count: combined_word_count,
                note: Some(format!("chunks_processed={}", chunk_summaries.len())),
            });

            info!(
                event = "summarizer.iteration_combined",
                rapat_id = rapat_id,
                iteration = iteration,
                combined_word_count = combined_word_count,
                "Chunk summaries combined"
            );

            if combined_word_count <= half_context {
                info!(
                    event = "summarizer.final_pass",
                    rapat_id = rapat_id,
                    iteration = iteration,
                    "Executing final summarization pass"
                );
                let summary = self
                    .call_ollama(&combined)
                    .await
                    .context("final Ollama summarization failed")?;
                stages.push(StageSummary {
                    stage: "final".to_string(),
                    word_count: count_words(&summary),
                    note: Some("Final pass after iterative reduction".to_string()),
                });

                return Ok(SummaryResult {
                    summary,
                    model: self.config.ollama_model.clone(),
                    generated_at: Utc::now(),
                    stages,
                });
            }

            info!(
                event = "summarizer.iteration_continue",
                rapat_id = rapat_id,
                iteration = iteration,
                combined_word_count = combined_word_count,
                "Combined result still over threshold; repeating"
            );
            current_text = combined;
        }
    }

    async fn call_ollama(&self, body_text: &str) -> anyhow::Result<String> {
        let endpoint = format!(
            "{}/api/generate",
            self.config.ollama_base_url.trim_end_matches('/')
        );
        let prompt = format!("{}\n\n{}", self.config.prompt_text, body_text);
        let payload = serde_json::json!({
            "model": self.config.ollama_model,
            "prompt": prompt,
            "stream": false
        });

        let prompt_words = count_words(&prompt);
        info!(
            event = "ollama.prompt",
            model = %self.config.ollama_model,
            length = prompt.len(),
            words = prompt_words,
            %prompt,
            "Full prompt dispatched to Ollama"
        );

        debug!(event = "ollama.request", model = %self.config.ollama_model);
        let response = self
            .client
            .post(endpoint)
            .json(&payload)
            .send()
            .await
            .context("failed to call Ollama")?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            warn!(event = "ollama.error", %status, body = %text);
            bail!("Ollama returned error: {status}");
        }

        let body: OllamaResponse = response
            .json()
            .await
            .context("failed to deserialize Ollama response")?;
        let summary = body.response.trim().to_string();

        if summary.is_empty() {
            bail!("Ollama response was empty");
        }
        Ok(summary)
    }
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    #[serde(default)]
    response: String,
}

fn extract_segments(value: Value) -> anyhow::Result<Vec<TranscriptSegment>> {
    match value {
        Value::Array(items) => items
            .into_iter()
            .map(|item| serde_json::from_value(item).context("failed to parse transcript segment"))
            .collect(),
        Value::String(text) => {
            let parsed: Value =
                serde_json::from_str(&text).context("failed to parse transcript text as JSON")?;
            extract_segments(parsed)
        }
        Value::Object(map) => {
            if let Some(segments) = map.get("segments").cloned() {
                return extract_segments(segments);
            }
            if let Some(items) = map.get("items").cloned() {
                return extract_segments(items);
            }
            if let Some(data) = map.get("data").cloned() {
                return extract_segments(data);
            }
            let joined = map
                .values()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            if joined.is_empty() {
                bail!("unsupported transcript object format");
            }
            Ok(vec![TranscriptSegment {
                timestamp: None,
                speaker_id: None,
                content: joined,
            }])
        }
        other => bail!("unsupported transcript format: {other:?}"),
    }
}

fn build_transcript_text(segments: &[TranscriptSegment]) -> String {
    segments
        .iter()
        .map(|segment| {
            let cleaned = strip_timestamp(&segment.content).trim().to_string();
            if let Some(speaker) = segment
                .speaker_id
                .as_deref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
            {
                let prefixed = format!("{}:", speaker);
                let cleaned_upper = cleaned.to_ascii_uppercase();
                let prefixed_upper = prefixed.to_ascii_uppercase();
                if cleaned_upper.starts_with(&prefixed_upper) {
                    cleaned
                } else if cleaned.is_empty() {
                    prefixed
                } else {
                    format!("{} {}", prefixed, cleaned)
                }
            } else {
                cleaned
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn strip_timestamp(text: &str) -> &str {
    let trimmed = text.trim_start();
    if let Some(rest) = trimmed.strip_prefix('[') {
        if let Some(closing_idx) = rest.find(']') {
            let (candidate, after) = rest.split_at(closing_idx);
            let candidate = candidate.trim();
            let looks_like_timestamp = candidate
                .chars()
                .all(|c| c.is_ascii_digit() || matches!(c, ':' | '.' | ',' | '-' | ' '))
                && candidate.chars().any(|c| c.is_ascii_digit());
            if looks_like_timestamp {
                return after[1..].trim_start();
            }
        }
    }
    trimmed
}
