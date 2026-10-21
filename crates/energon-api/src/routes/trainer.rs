//! Callbacks for the GPU trainer. Authenticated with a per-job token, never
//! with an agent API key. The release gate runs here, not in the trainer.
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use energon_core::training::{
    JobStatus, RunRecord, TrainingConfig, TrainingJob, TrainingResult, TrainingVersion,
    VersionStatus, job_token,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::{
    errors::ApiError,
    state::{AppState, StorageBackend, now_unix_ms},
};

/// Newest runs handed to one training job.
const DATASET_RUN_LIMIT: i64 = 5_000;
const MAX_ERROR_CHARS: usize = 2_000;

async fn authorized_job(
    state: &AppState,
    headers: &HeaderMap,
    job_id: &str,
) -> Result<(PgPool, TrainingJob), ApiError> {
    let secret = state.trainer_secret.as_deref().ok_or_else(|| {
        ApiError::Unauthorized(
            "trainer callbacks are not configured (ENERGON_TRAINER_SECRET)".to_owned(),
        )
    })?;
    let token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().strip_prefix("Bearer "))
        .ok_or_else(|| ApiError::Unauthorized("missing job token".to_owned()))?;
    let token_job = job_token::verify(secret, token.trim(), (now_unix_ms() / 1000) as u64)
        .ok_or_else(|| ApiError::Unauthorized("invalid or expired job token".to_owned()))?;
    if token_job != job_id {
        return Err(ApiError::Forbidden(
            "job token does not match this job".to_owned(),
        ));
    }
    let StorageBackend::Postgres(pool) = &state.storage else {
        return Err(ApiError::BadRequest(
            "training requires Postgres storage".to_owned(),
        ));
    };
    let job = energon_db::training::get_job(pool, job_id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("training job not found: {job_id}")))?;
    Ok((pool.clone(), job))
}

#[derive(Debug, Serialize)]
pub struct Dataset {
    pub job: TrainingJob,
    pub config: TrainingConfig,
    /// The version currently serving the agent: the bar to beat, and the
    /// starting point for compiled instructions.
    pub live_version: Option<TrainingVersion>,
    /// Only this agent's runs, already redacted at ingest.
    pub runs: Vec<RunRecord>,
}

/// `GET /v1/trainer/jobs/{job_id}/dataset`
pub async fn dataset(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Dataset>, ApiError> {
    let (pool, mut job) = authorized_job(&state, &headers, &job_id).await?;
    if job.status.is_terminal() {
        return Err(ApiError::BadRequest(format!(
            "job {job_id} is already finished"
        )));
    }
    if job.status != JobStatus::Running {
        job.status = JobStatus::Running;
        job.updated_at_unix_ms = now_unix_ms();
        energon_db::training::update_job(&pool, &job).await?;
    }
    let config = energon_db::training::get_config(&pool, &job.org_id, &job.agent_id)
        .await?
        .unwrap_or_else(|| TrainingConfig::default_for(&job.org_id, &job.agent_id));
    let live_version =
        energon_db::training::live_version(&pool, &job.org_id, &job.agent_id).await?;
    let runs =
        energon_db::training::list_runs(&pool, &job.org_id, &job.agent_id, DATASET_RUN_LIMIT)
            .await?;
    Ok(Json(Dataset {
        job,
        config,
        live_version,
        runs,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Heartbeat {
    #[serde(default)]
    pub message: Option<String>,
}

/// `POST /v1/trainer/jobs/{job_id}/heartbeat`
pub async fn heartbeat(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<Heartbeat>,
) -> Result<Json<TrainingJob>, ApiError> {
    let (pool, mut job) = authorized_job(&state, &headers, &job_id).await?;
    if job.status.is_terminal() {
        return Err(ApiError::BadRequest(format!(
            "job {job_id} is already finished"
        )));
    }
    job.status = JobStatus::Running;
    job.updated_at_unix_ms = now_unix_ms();
    if let Some(message) = input.message {
        tracing::info!(job_id = %job.job_id, message = %truncate(&message, 200), "trainer heartbeat");
    }
    energon_db::training::update_job(&pool, &job).await?;
    Ok(Json(job))
}

#[derive(Debug, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TrainerOutcome {
    Succeeded { result: TrainingResult },
    Failed { error: String },
}

#[derive(Debug, Serialize)]
pub struct ResultReceipt {
    pub job: TrainingJob,
    pub version: Option<TrainingVersion>,
}

/// `POST /v1/trainer/jobs/{job_id}/result`
pub async fn result(
    State(state): State<AppState>,
    Path(job_id): Path<String>,
    headers: HeaderMap,
    Json(outcome): Json<TrainerOutcome>,
) -> Result<Json<ResultReceipt>, ApiError> {
    let (pool, mut job) = authorized_job(&state, &headers, &job_id).await?;
    if job.status.is_terminal() {
        return Err(ApiError::BadRequest(format!(
            "job {job_id} is already finished"
        )));
    }
    let now = now_unix_ms();
    job.updated_at_unix_ms = now;

    match outcome {
        TrainerOutcome::Failed { error } => {
            job.status = JobStatus::Failed;
            job.error = Some(truncate(&error, MAX_ERROR_CHARS));
            energon_db::training::update_job(&pool, &job).await?;
            Ok(Json(ResultReceipt { job, version: None }))
        }
        TrainerOutcome::Succeeded { result } => {
            let config = energon_db::training::get_config(&pool, &job.org_id, &job.agent_id)
                .await?
                .unwrap_or_else(|| TrainingConfig::default_for(&job.org_id, &job.agent_id));
            let number =
                energon_db::training::next_version_number(&pool, &job.org_id, &job.agent_id)
                    .await?;
            let version = TrainingVersion::from_result(
                state.next_version_id(),
                number,
                &job,
                result,
                config.min_lift_pts,
                now,
            )
            .map_err(|error| ApiError::BadRequest(error.to_string()))?;
            job.status = match version.status {
                VersionStatus::Live => JobStatus::Succeeded,
                _ => JobStatus::Rejected,
            };
            job.version_id = Some(version.version_id.clone());
            job.error = None;
            energon_db::training::record_version(&pool, &version, &job).await?;
            Ok(Json(ResultReceipt {
                job,
                version: Some(version),
            }))
        }
    }
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[tokio::test]
    async fn rejects_missing_wrong_and_unconfigured_tokens() {
        let mut state = AppState::for_dream_tests();
        let mut headers = HeaderMap::new();

        state.trainer_secret = None;
        let error = authorized_job(&state, &headers, "job_1").await.unwrap_err();
        assert!(matches!(error, ApiError::Unauthorized(_)));

        state.trainer_secret = Some("x".repeat(32));
        let error = authorized_job(&state, &headers, "job_1").await.unwrap_err();
        assert!(matches!(error, ApiError::Unauthorized(_)));

        let token = job_token::issue(&"x".repeat(32), "job_2", u64::MAX);
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        let error = authorized_job(&state, &headers, "job_1").await.unwrap_err();
        assert!(matches!(error, ApiError::Forbidden(_)));
    }

    #[test]
    fn trainer_outcomes_parse_both_shapes() {
        let failed: TrainerOutcome = serde_json::from_value(serde_json::json!({
            "status": "failed", "error": "CUDA out of memory"
        }))
        .unwrap();
        assert!(matches!(failed, TrainerOutcome::Failed { .. }));
        let succeeded: TrainerOutcome = serde_json::from_value(serde_json::json!({
            "status": "succeeded",
            "result": {
                "instructions": "Check the changelog first.",
                "adapter": null,
                "trained_on_runs": 40,
                "eval": {
                    "suite": "linux_operator", "held_out_tasks": 20, "runs_per_task": 5,
                    "base_success": 0.5, "previous_success": null,
                    "candidate_success": 0.62, "candidate_spread": 0.03
                }
            }
        }))
        .unwrap();
        assert!(matches!(succeeded, TrainerOutcome::Succeeded { .. }));
    }
}
