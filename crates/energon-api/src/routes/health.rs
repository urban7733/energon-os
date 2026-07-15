use std::time::Duration;

use axum::{Json, extract::State};
use serde::Serialize;

use crate::state::{AppState, StorageBackend};

const DB_PROBE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
    pub storage: &'static str,
    pub database: &'static str,
}

/// Liveness plus readiness: reports whether the configured storage backend is
/// reachable without leaking any configuration details.
pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let (storage, database) = match &state.storage {
        StorageBackend::Memory(_) => ("memory", "none"),
        StorageBackend::Postgres(pool) => {
            let probe =
                tokio::time::timeout(DB_PROBE_TIMEOUT, sqlx::query("SELECT 1").execute(pool)).await;

            match probe {
                Ok(Ok(_)) => ("postgres", "connected"),
                Ok(Err(_)) | Err(_) => ("postgres", "unavailable"),
            }
        }
    };

    Json(HealthResponse {
        status: if database == "unavailable" {
            "degraded"
        } else {
            "ok"
        },
        service: "energon-os",
        version: env!("CARGO_PKG_VERSION"),
        storage,
        database,
    })
}
