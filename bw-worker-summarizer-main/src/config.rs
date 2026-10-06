use std::env;
use std::fs;
use std::path::PathBuf;

type Result<T> = std::result::Result<T, ConfigError>;

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("missing environment variable: {0}")]
    Missing(&'static str),
    #[error("failed to parse environment variable {key}: {source}")]
    Parse {
        key: &'static str,
        source: Box<dyn std::error::Error + Send + Sync>,
    },
    #[error("failed to read prompt file: {0}")]
    PromptFileRead(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub rabbitmq_uri: String,
    pub rabbitmq_queue: String,
    pub rabbitmq_exchange: Option<String>,
    pub rabbitmq_prefetch: u16,
    pub rabbitmq_requeue_on_failure: bool,
    pub ollama_base_url: String,
    pub ollama_model: String,
    pub model_context_length: usize,
    pub prompt_text: String,
    pub ollama_timeout_secs: u64,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: get_env("DATABASE_URL")?,
            rabbitmq_uri: get_env_alias(&["RABBITMQ_URL", "RABBIT_MQ_URL", "RABBITMQ_URI"])?
                .trim()
                .to_string(),
            rabbitmq_queue: get_env_alias(&[
                "RABBIT_MQ_INPUT_QUEUE",
                "RABBITMQ_INPUT_QUEUE",
                "RABBITMQ_QUEUE",
            ])?
            .trim()
            .to_string(),
            rabbitmq_exchange: get_env_optional(&["RABBIT_MQ_EXCHANGE", "RABBITMQ_EXCHANGE"])
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            rabbitmq_prefetch: get_env_parse_alias(
                &["RABBIT_MQ_PREFETCH", "RABBITMQ_PREFETCH"],
                1,
            )?,
            rabbitmq_requeue_on_failure: get_env_parse_alias(
                &[
                    "RABBIT_MQ_REQUEUE_ON_FAILURE",
                    "RABBITMQ_REQUEUE_ON_FAILURE",
                ],
                true,
            )?,
            ollama_base_url: get_env_alias(&["OLLAMA_HOST", "OLLAMA_BASE_URL"])?
                .trim()
                .to_string(),
            ollama_model: get_env("OLLAMA_MODEL")?,
            model_context_length: get_env_parse("MODEL_CONTEXT_LENGTH", 4096)?,
            prompt_text: load_prompt_text()?,
            ollama_timeout_secs: get_env_parse("OLLAMA_TIMEOUT_SECS", 120)?,
        })
    }
}

fn get_env(key: &'static str) -> Result<String> {
    env::var(key).map_err(|_| ConfigError::Missing(key))
}

fn get_env_optional(keys: &[&'static str]) -> Option<String> {
    keys.iter().find_map(|&key| env::var(key).ok())
}

fn get_env_alias(keys: &[&'static str]) -> Result<String> {
    for &key in keys {
        match env::var(key) {
            Ok(value) => return Ok(value),
            Err(env::VarError::NotPresent) => continue,
            Err(_) => return Err(ConfigError::Missing(key)),
        }
    }

    if let Some(&primary) = keys.first() {
        Err(ConfigError::Missing(primary))
    } else {
        Err(ConfigError::Missing("ENV_ALIAS_UNSPECIFIED"))
    }
}

fn get_env_parse<T>(key: &'static str, default: T) -> Result<T>
where
    T: std::str::FromStr + Copy,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    match env::var(key) {
        Ok(val) => val.parse().map_err(|err| ConfigError::Parse {
            key,
            source: Box::new(err),
        }),
        Err(env::VarError::NotPresent) => Ok(default),
        Err(_) => Err(ConfigError::Missing(key)),
    }
}

fn get_env_parse_alias<T>(keys: &[&'static str], default: T) -> Result<T>
where
    T: std::str::FromStr + Copy,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    for &key in keys {
        match env::var(key) {
            Ok(value) => {
                return value.parse().map_err(|err| ConfigError::Parse {
                    key,
                    source: Box::new(err),
                })
            }
            Err(env::VarError::NotPresent) => continue,
            Err(_) => return Err(ConfigError::Missing(key)),
        }
    }
    Ok(default)
}

fn load_prompt_text() -> Result<String> {
    // Try PROMPT_FILE env var first, then fall back to default location
    let prompt_path = env::var("PROMPT_FILE")
        .unwrap_or_else(|_| "prompt.txt".to_string());
    
    let path = PathBuf::from(&prompt_path);
    
    // Read the file content
    let content = fs::read_to_string(&path)
        .map_err(|e| {
            eprintln!("Failed to read prompt file at '{}': {}", path.display(), e);
            e
        })?;
    
    Ok(content)
}
