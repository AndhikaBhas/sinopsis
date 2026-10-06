use std::sync::Arc;

use crate::config::AppConfig;
use crate::db::Database;
use crate::summarizer::Summarizer;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub db: Database,
    pub summarizer: Summarizer,
}

impl AppState {
    pub fn new(config: Arc<AppConfig>, db: Database, summarizer: Summarizer) -> Self {
        Self {
            config,
            db,
            summarizer,
        }
    }
}
