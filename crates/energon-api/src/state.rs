use std::{
    collections::HashMap,
    env,
    sync::{
        Arc, RwLock,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use energon_core::{AuditRecord, MemoryRecord, PromotionAuditRecord};
use sqlx::PgPool;

use crate::x402::X402Config;

#[derive(Clone)]
pub struct AppState {
    pub storage: StorageBackend,
    pub auth: AuthConfig,
    pub x402: X402Config,
    pub retrieval_candidate_limit: i64,
    next_memory: Arc<AtomicU64>,
    next_promotion: Arc<AtomicU64>,
    next_request: Arc<AtomicU64>,
}

#[derive(Clone)]
pub struct AuthConfig {
    pub dev_identity_headers: bool,
    pub admin_token: Option<String>,
    pub api_key_pepper: Option<String>,
}

#[derive(Clone)]
pub enum StorageBackend {
    Memory(InMemoryStorage),
    Postgres(PgPool),
}

#[derive(Clone)]
pub struct InMemoryStorage {
    pub memories: Arc<RwLock<Vec<MemoryRecord>>>,
    pub audits: Arc<RwLock<HashMap<String, AuditRecord>>>,
    pub promotion_audits: Arc<RwLock<HashMap<String, PromotionAuditRecord>>>,
}

impl AppState {
    fn new_with_x402(x402: X402Config) -> Self {
        Self {
            storage: StorageBackend::Memory(InMemoryStorage::new()),
            auth: AuthConfig {
                dev_identity_headers: true,
                admin_token: env::var("ENERGON_ADMIN_TOKEN").ok(),
                api_key_pepper: env::var("ENERGON_API_KEY_PEPPER").ok(),
            },
            x402,
            retrieval_candidate_limit: retrieval_candidate_limit(),
            next_memory: Arc::new(AtomicU64::new(1)),
            next_promotion: Arc::new(AtomicU64::new(1)),
            next_request: Arc::new(AtomicU64::new(1)),
        }
    }

    pub async fn from_env() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let x402 = X402Config::from_env()
            .map_err(|message| std::io::Error::new(std::io::ErrorKind::InvalidInput, message))?;

        let Some(database_url) = env::var("DATABASE_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
        else {
            tracing::info!("DATABASE_URL is not set; using in-memory storage");
            return Ok(Self::new_with_x402(x402));
        };

        let pool = energon_db::pool::connect(&database_url).await?;
        let api_key_pepper = required_env("ENERGON_API_KEY_PEPPER")?;

        let dev_identity_headers = env::var("ENERGON_DEV_AUTH")
            .ok()
            .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true"));

        tracing::info!("DATABASE_URL is set; using Postgres storage");

        Ok(Self {
            storage: StorageBackend::Postgres(pool),
            auth: AuthConfig {
                dev_identity_headers,
                admin_token: env::var("ENERGON_ADMIN_TOKEN").ok(),
                api_key_pepper: Some(api_key_pepper),
            },
            x402,
            retrieval_candidate_limit: retrieval_candidate_limit(),
            next_memory: Arc::new(AtomicU64::new(1)),
            next_promotion: Arc::new(AtomicU64::new(1)),
            next_request: Arc::new(AtomicU64::new(1)),
        })
    }

    pub fn next_memory_id(&self) -> String {
        let id = self.next_memory.fetch_add(1, Ordering::Relaxed);
        format!("mem_{}_{}", now_unix_ms(), id)
    }

    pub fn next_request_id(&self) -> String {
        let id = self.next_request.fetch_add(1, Ordering::Relaxed);
        format!("ctx_{}_{}", now_unix_ms(), id)
    }

    pub fn next_promotion_id(&self) -> String {
        let id = self.next_promotion.fetch_add(1, Ordering::Relaxed);
        format!("prom_{}_{}", now_unix_ms(), id)
    }
}

fn retrieval_candidate_limit() -> i64 {
    env::var("ENERGON_RETRIEVAL_CANDIDATE_LIMIT")
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(500)
}

fn required_env(name: &'static str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("{name} must be set when DATABASE_URL is configured"),
            )
            .into()
        })
}

impl InMemoryStorage {
    fn new() -> Self {
        Self {
            memories: Arc::new(RwLock::new(Vec::new())),
            audits: Arc::new(RwLock::new(HashMap::new())),
            promotion_audits: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

pub fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
