use tracing::{debug, warn};

pub fn count_words(input: &str) -> usize {
    input.split_whitespace().count()
}

pub fn chunk_text(input: &str, max_words: usize, overlap_ratio: f32) -> Vec<String> {
    if max_words == 0 {
        warn!(
            event = "chunking.max_words_zero",
            "Requested chunk size is zero; returning entire input"
        );
        return vec![input.to_string()];
    }

    let words: Vec<&str> = input.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }

    let overlap_ratio = overlap_ratio.clamp(0.0, 0.95);
    let overlap_words = ((max_words as f32) * overlap_ratio).round() as usize;
    let step = max_words.saturating_sub(overlap_words).max(1);

    debug!(
        event = "chunking.start",
        total_words = words.len(),
        max_words = max_words,
        overlap_words = overlap_words,
        step = step
    );

    let mut chunks = Vec::new();
    let mut index = 0;
    while index < words.len() {
        let end = (index + max_words).min(words.len());
        let chunk = words[index..end].join(" ");
        chunks.push(chunk);
        if end >= words.len() {
            break;
        }
        index += step;
    }

    debug!(event = "chunking.completed", chunks = chunks.len());
    chunks
}
