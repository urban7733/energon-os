//! Training versions for agents and training controls for operators.
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use energon_core::training::{
    JobTrigger, TrainingConfig, TrainingJob, TrainingKind, TrainingVersion, UpdateTrainingConfig,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;

use crate::{
    artifacts::DOWNLOAD_TTL_SECONDS,
    errors::ApiError,
    jwt::operator_from_request,
    middleware::auth::identity_from_request,
    state::{AppState, StorageBackend, now_unix_ms},
};

const MAX_LIMIT: i64 = 100;

fn pool(state: &AppState) -> Result<&PgPool, ApiError> {
    match &state.storage {
        StorageBackend::Postgres(pool) => Ok(pool),
        StorageBackend::Memory(_) => Err(ApiError::BadRequest(
            "training requires Postgres storage (set DATABASE_URL)".to_owned(),
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct LimitQuery {
    pub limit: Option<i64>,
}

/// A version as delivered to an agent: adapters come with a short-lived download link.
#[derive(Debug, Serialize)]
pub struct DeliveredVersion {
    #[serde(flatten)]
    pub version: TrainingVersion,
    pub adapter_download_url: Option<String>,
    pub adapter_download_expires_in_s: Option<u64>,
}

fn deliver(state: &AppState, version: TrainingVersion) -> DeliveredVersion {
    let url = match (&version.adapter, &state.artifacts) {
        (Some(adapter), Some(store)) => {
            store.download_url(&adapter.uri, (now_unix_ms() / 1000) as u64)
        }
        _ => None,
    };
    DeliveredVersion {
        adapter_download_expires_in_s: url.as_ref().map(|_| DOWNLOAD_TTL_SECONDS),
        adapter_download_url: url,
        version,
    }
}

/* ───────────────────────── Agent ───────────────────────── */

/// `GET /v1/training/latest` — the live version for the calling agent, or `null`.
pub async fn latest(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let version = match &state.storage {
        StorageBackend::Memory(_) => None,
        StorageBackend::Postgres(pool) => {
            energon_db::training::live_version(pool, &agent.org_id, &agent.agent_id).await?
        }
    };
    Ok(Json(
        json!({ "version": version.map(|version| deliver(&state, version)) }),
    ))
}

/// `GET /v1/training/versions` — the calling agent's version history, newest first.
pub async fn versions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LimitQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let limit = query.limit.unwrap_or(30).clamp(1, MAX_LIMIT);
    let versions = match &state.storage {
        StorageBackend::Memory(_) => Vec::new(),
        StorageBackend::Postgres(pool) => {
            energon_db::training::list_versions(pool, &agent.org_id, &agent.agent_id, limit).await?
        }
    };
    Ok(Json(json!({ "versions": versions, "limit": limit })))
}

/* ───────────────────────── Operator ───────────────────────── */

async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    org_id: &str,
    agent_id: &str,
) -> Result<(), ApiError> {
    let operator = operator_from_request(state.jwt.as_ref(), headers).await?;
    operator.require_org(org_id)?;
    if !energon_db::training::agent_in_org(pool(state)?, org_id, agent_id).await? {
        return Err(ApiError::NotFound(format!(
            "agent not found in org: {agent_id}"
        )));
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct TrainingOverview {
    pub org_id: String,
    pub agent_id: String,
    pub config: TrainingConfig,
    pub config_saved: bool,
    pub runs_total: i64,
    pub runs_successful: i64,
    pub runs_since_last_job: i64,
    pub jobs: Vec<TrainingJob>,
    pub versions: Vec<TrainingVersion>,
}

/// `GET /v1/orgs/{org_id}/agents/{agent_id}/training`
pub async fn overview(
    State(state): State<AppState>,
    Path((org_id, agent_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<TrainingOverview>, ApiError> {
    authorize(&state, &headers, &org_id, &agent_id).await?;
    let pool = pool(&state)?;
    let stored = energon_db::training::get_config(pool, &org_id, &agent_id).await?;
    let (runs_total, runs_successful) =
        energon_db::training::run_counts(pool, &org_id, &agent_id).await?;
    let since = energon_db::training::last_job_created_at(pool, &org_id, &agent_id)
        .await?
        .unwrap_or(0);
    let runs_since_last_job =
        energon_db::training::count_successful_runs_since(pool, &org_id, &agent_id, since).await?;
    Ok(Json(TrainingOverview {
        config_saved: stored.is_some(),
        config: stored.unwrap_or_else(|| TrainingConfig::default_for(&org_id, &agent_id)),
        runs_total,
        runs_successful,
        runs_since_last_job,
        jobs: energon_db::training::list_jobs(pool, &org_id, &agent_id, 20).await?,
        versions: energon_db::training::list_versions(pool, &org_id, &agent_id, 30).await?,
        org_id,
        agent_id,
    }))
}

/// `PUT /v1/orgs/{org_id}/agents/{agent_id}/training/config`
pub async fn update_config(
    State(state): State<AppState>,
    Path((org_id, agent_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(input): Json<UpdateTrainingConfig>,
) -> Result<Json<TrainingConfig>, ApiError> {
    authorize(&state, &headers, &org_id, &agent_id).await?;
    let config = TrainingConfig::apply(&org_id, &agent_id, input, now_unix_ms())
        .map_err(|error| ApiError::BadRequest(error.to_string()))?;
    energon_db::training::upsert_config(pool(&state)?, &config).await?;
    Ok(Json(config))
}

/// `POST /v1/orgs/{org_id}/agents/{agent_id}/training/jobs` — train now.
pub async fn start_job(
    State(state): State<AppState>,
    Path((org_id, agent_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<TrainingJob>, ApiError> {
    authorize(&state, &headers, &org_id, &agent_id).await?;
    let pool = pool(&state)?;
    let config = energon_db::training::get_config(pool, &org_id, &agent_id)
        .await?
        .unwrap_or_else(|| TrainingConfig::default_for(&org_id, &agent_id));
    let (_, successful) = energon_db::training::run_counts(pool, &org_id, &agent_id).await?;
    if successful == 0 && config.kind == TrainingKind::Adapter {
        return Err(ApiError::BadRequest(
            "adapter training needs at least one successful run".to_owned(),
        ));
    }
    let job = TrainingJob::queued(
        state.next_job_id(),
        &config,
        JobTrigger::Operator,
        u32::try_from(successful).unwrap_or(u32::MAX),
        now_unix_ms(),
    );
    if !energon_db::training::create_job(pool, &job).await? {
        return Err(ApiError::BadRequest(
            "a training job is already active for this agent".to_owned(),
        ));
    }
    Ok(Json(job))
}

/// `POST /v1/orgs/{org_id}/agents/{agent_id}/training/versions/{version_id}/rollback`
pub async fn rollback(
    State(state): State<AppState>,
    Path((org_id, agent_id, version_id)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Result<Json<TrainingVersion>, ApiError> {
    authorize(&state, &headers, &org_id, &agent_id).await?;
    energon_db::training::rollback_to(pool(&state)?, &org_id, &agent_id, &version_id)
        .await?
        .map(Json)
        .ok_or_else(|| ApiError::NotFound(format!("version not found: {version_id}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn headers() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("x-energon-agent-id", HeaderValue::from_static("agent_a"));
        headers.insert("x-energon-org-id", HeaderValue::from_static("org_1"));
        headers
    }

    #[tokio::test]
    async fn agents_without_training_get_an_empty_answer() {
        let state = AppState::for_dream_tests();
        let Json(body) = latest(State(state.clone()), headers()).await.unwrap();
        assert!(body["version"].is_null());
        let Json(body) = versions(
            State(state),
            headers(),
            Query(LimitQuery { limit: Some(5) }),
        )
        .await
        .unwrap();
        assert_eq!(body["versions"].as_array().unwrap().len(), 0);
    }
}
