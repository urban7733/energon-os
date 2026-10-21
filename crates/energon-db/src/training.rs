//! Postgres storage for runs, training configs, jobs and versions.
use energon_core::training::{
    JobStatus, RunRecord, TrainingConfig, TrainingJob, TrainingVersion, VersionStatus,
};
use serde::Serialize;
use sqlx::{PgPool, Postgres, Transaction, types::Json};

use crate::DbError;

fn to_i64(value: u128, field: &'static str) -> Result<i64, DbError> {
    i64::try_from(value).map_err(|_| DbError::IntegerOutOfRange(field))
}

/// The snake_case wire name of a serde enum, e.g. `JobStatus::Queued` → `queued`.
fn wire<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn documents<T>(rows: Vec<(Json<T>,)>) -> Vec<T> {
    rows.into_iter().map(|(Json(document),)| document).collect()
}

/* ───────────────────────── Runs ───────────────────────── */

pub async fn insert_run(pool: &PgPool, run: &RunRecord) -> Result<(), DbError> {
    sqlx::query(
        "INSERT INTO agent_runs (run_id, org_id, agent_id, outcome, created_at_unix_ms, document) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&run.run_id)
    .bind(&run.org_id)
    .bind(&run.agent_id)
    .bind(wire(&run.outcome))
    .bind(to_i64(run.created_at_unix_ms, "created_at_unix_ms")?)
    .bind(Json(run))
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_runs(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
    limit: i64,
) -> Result<Vec<RunRecord>, DbError> {
    let rows = sqlx::query_as(
        "SELECT document FROM agent_runs WHERE org_id = $1 AND agent_id = $2 ORDER BY created_at_unix_ms DESC, run_id DESC LIMIT $3",
    )
    .bind(org_id)
    .bind(agent_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(documents(rows))
}

pub async fn count_successful_runs_since(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
    since_unix_ms: u128,
) -> Result<i64, DbError> {
    let (count,): (i64,) = sqlx::query_as(
        "SELECT count(*) FROM agent_runs WHERE org_id = $1 AND agent_id = $2 AND outcome = 'success' AND created_at_unix_ms > $3",
    )
    .bind(org_id)
    .bind(agent_id)
    .bind(to_i64(since_unix_ms, "since_unix_ms")?)
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// `(total, successful)` runs reported by an agent.
pub async fn run_counts(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
) -> Result<(i64, i64), DbError> {
    let counts: (i64, i64) = sqlx::query_as(
        "SELECT count(*), count(*) FILTER (WHERE outcome = 'success') FROM agent_runs WHERE org_id = $1 AND agent_id = $2",
    )
    .bind(org_id)
    .bind(agent_id)
    .fetch_one(pool)
    .await?;
    Ok(counts)
}

pub async fn agent_in_org(pool: &PgPool, org_id: &str, agent_id: &str) -> Result<bool, DbError> {
    let row: Option<(i32,)> =
        sqlx::query_as("SELECT 1 FROM agents WHERE org_id = $1 AND agent_id = $2")
            .bind(org_id)
            .bind(agent_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.is_some())
}

/* ───────────────────────── Configs ───────────────────────── */

pub async fn get_config(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
) -> Result<Option<TrainingConfig>, DbError> {
    let row: Option<(Json<TrainingConfig>,)> =
        sqlx::query_as("SELECT document FROM training_configs WHERE org_id = $1 AND agent_id = $2")
            .bind(org_id)
            .bind(agent_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(Json(config),)| config))
}

pub async fn upsert_config(pool: &PgPool, config: &TrainingConfig) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO training_configs (org_id, agent_id, enabled, schedule_hour_utc, updated_at_unix_ms, document)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (org_id, agent_id) DO UPDATE
        SET enabled = EXCLUDED.enabled,
            schedule_hour_utc = EXCLUDED.schedule_hour_utc,
            updated_at_unix_ms = EXCLUDED.updated_at_unix_ms,
            document = EXCLUDED.document
        "#,
    )
    .bind(&config.org_id)
    .bind(&config.agent_id)
    .bind(config.enabled)
    .bind(i16::from(config.schedule_hour_utc))
    .bind(to_i64(config.updated_at_unix_ms, "updated_at_unix_ms")?)
    .bind(Json(config))
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_enabled_configs(pool: &PgPool) -> Result<Vec<TrainingConfig>, DbError> {
    let rows = sqlx::query_as(
        "SELECT document FROM training_configs WHERE enabled ORDER BY org_id, agent_id",
    )
    .fetch_all(pool)
    .await?;
    Ok(documents(rows))
}

/* ───────────────────────── Jobs ───────────────────────── */

/// Inserts a queued job. Returns `false` when the agent already has an active job.
pub async fn create_job(pool: &PgPool, job: &TrainingJob) -> Result<bool, DbError> {
    let result = sqlx::query(
        r#"
        INSERT INTO training_jobs (job_id, org_id, agent_id, status, created_at_unix_ms, updated_at_unix_ms, document)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(&job.job_id)
    .bind(&job.org_id)
    .bind(&job.agent_id)
    .bind(wire(&job.status))
    .bind(to_i64(job.created_at_unix_ms, "created_at_unix_ms")?)
    .bind(to_i64(job.updated_at_unix_ms, "updated_at_unix_ms")?)
    .bind(Json(job))
    .execute(pool)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn get_job(pool: &PgPool, job_id: &str) -> Result<Option<TrainingJob>, DbError> {
    let row: Option<(Json<TrainingJob>,)> =
        sqlx::query_as("SELECT document FROM training_jobs WHERE job_id = $1")
            .bind(job_id)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(Json(job),)| job))
}

pub async fn list_jobs(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
    limit: i64,
) -> Result<Vec<TrainingJob>, DbError> {
    let rows = sqlx::query_as(
        "SELECT document FROM training_jobs WHERE org_id = $1 AND agent_id = $2 ORDER BY created_at_unix_ms DESC, job_id DESC LIMIT $3",
    )
    .bind(org_id)
    .bind(agent_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(documents(rows))
}

/// Creation time of the agent's latest job, used as the "new runs since" mark.
pub async fn last_job_created_at(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
) -> Result<Option<u128>, DbError> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT created_at_unix_ms FROM training_jobs WHERE org_id = $1 AND agent_id = $2 ORDER BY created_at_unix_ms DESC LIMIT 1",
    )
    .bind(org_id)
    .bind(agent_id)
    .fetch_optional(pool)
    .await?;
    row.map(|(value,)| crate::errors::i64_to_u128(value, "created_at_unix_ms"))
        .transpose()
}

pub async fn update_job(pool: &PgPool, job: &TrainingJob) -> Result<(), DbError> {
    update_job_in(pool, job).await
}

async fn update_job_in<'e, E>(executor: E, job: &TrainingJob) -> Result<(), DbError>
where
    E: sqlx::Executor<'e, Database = Postgres>,
{
    sqlx::query(
        "UPDATE training_jobs SET status = $2, updated_at_unix_ms = $3, lease_owner = NULL, lease_expires_at = NULL, document = $4 WHERE job_id = $1",
    )
    .bind(&job.job_id)
    .bind(wire(&job.status))
    .bind(to_i64(job.updated_at_unix_ms, "updated_at_unix_ms")?)
    .bind(Json(job))
    .execute(executor)
    .await?;
    Ok(())
}

/// Leases queued jobs with `SKIP LOCKED` so several workers never dispatch the same job.
pub async fn claim_queued_jobs(
    pool: &PgPool,
    worker_id: &str,
    limit: i64,
    lease_seconds: i64,
) -> Result<Vec<TrainingJob>, DbError> {
    let rows = sqlx::query_as(
        r#"
        WITH candidates AS (
            SELECT job_id FROM training_jobs
            WHERE status = 'queued'
              AND (lease_expires_at IS NULL OR lease_expires_at <= now())
            ORDER BY created_at_unix_ms ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
        )
        UPDATE training_jobs AS jobs
        SET lease_owner = $1,
            lease_expires_at = now() + make_interval(secs => $3)
        FROM candidates
        WHERE jobs.job_id = candidates.job_id
        RETURNING jobs.document
        "#,
    )
    .bind(worker_id)
    .bind(limit)
    .bind(lease_seconds as f64)
    .fetch_all(pool)
    .await?;
    Ok(documents(rows))
}

pub async fn list_active_jobs(pool: &PgPool, limit: i64) -> Result<Vec<TrainingJob>, DbError> {
    let rows = sqlx::query_as(
        "SELECT document FROM training_jobs WHERE status IN ('dispatched', 'running') ORDER BY updated_at_unix_ms ASC LIMIT $1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(documents(rows))
}

/* ───────────────────────── Versions ───────────────────────── */

pub async fn next_version_number(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
) -> Result<u32, DbError> {
    let (max,): (Option<i32>,) = sqlx::query_as(
        "SELECT max(number) FROM training_versions WHERE org_id = $1 AND agent_id = $2",
    )
    .bind(org_id)
    .bind(agent_id)
    .fetch_one(pool)
    .await?;
    u32::try_from(max.unwrap_or(0) + 1).map_err(|_| DbError::IntegerOutOfRange("number"))
}

/// Stores a finished job's version atomically. A live version demotes the
/// previous live version to `shipped` in the same transaction.
pub async fn record_version(
    pool: &PgPool,
    version: &TrainingVersion,
    job: &TrainingJob,
) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;
    if version.status == VersionStatus::Live {
        demote_live(&mut tx, &version.org_id, &version.agent_id).await?;
    }
    sqlx::query(
        r#"
        INSERT INTO training_versions (version_id, org_id, agent_id, number, status, job_id, created_at_unix_ms, document)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(&version.version_id)
    .bind(&version.org_id)
    .bind(&version.agent_id)
    .bind(i32::try_from(version.number).map_err(|_| DbError::IntegerOutOfRange("number"))?)
    .bind(wire(&version.status))
    .bind(&version.job_id)
    .bind(to_i64(version.created_at_unix_ms, "created_at_unix_ms")?)
    .bind(Json(version))
    .execute(&mut *tx)
    .await?;
    update_job_in(&mut *tx, job).await?;
    tx.commit().await?;
    Ok(())
}

async fn demote_live(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    agent_id: &str,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        UPDATE training_versions
        SET status = 'shipped', document = jsonb_set(document, '{status}', '"shipped"')
        WHERE org_id = $1 AND agent_id = $2 AND status = 'live'
        "#,
    )
    .bind(org_id)
    .bind(agent_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn list_versions(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
    limit: i64,
) -> Result<Vec<TrainingVersion>, DbError> {
    let rows = sqlx::query_as(
        "SELECT document FROM training_versions WHERE org_id = $1 AND agent_id = $2 ORDER BY number DESC LIMIT $3",
    )
    .bind(org_id)
    .bind(agent_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(documents(rows))
}

pub async fn live_version(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
) -> Result<Option<TrainingVersion>, DbError> {
    let row: Option<(Json<TrainingVersion>,)> = sqlx::query_as(
        "SELECT document FROM training_versions WHERE org_id = $1 AND agent_id = $2 AND status = 'live'",
    )
    .bind(org_id)
    .bind(agent_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(Json(version),)| version))
}

/// Makes a previously shipped version live again. Rejected versions never go live.
pub async fn rollback_to(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
    version_id: &str,
) -> Result<Option<TrainingVersion>, DbError> {
    let mut tx = pool.begin().await?;
    let target: Option<(String,)> = sqlx::query_as(
        "SELECT status FROM training_versions WHERE org_id = $1 AND agent_id = $2 AND version_id = $3 FOR UPDATE",
    )
    .bind(org_id)
    .bind(agent_id)
    .bind(version_id)
    .fetch_optional(&mut *tx)
    .await?;
    match target.as_ref().map(|(status,)| status.as_str()) {
        None => return Ok(None),
        Some("rejected") => {
            return Err(DbError::InvalidTrainingTransition(
                "rejected versions cannot go live".to_owned(),
            ));
        }
        Some("live") => {}
        Some(_) => {
            demote_live(&mut tx, org_id, agent_id).await?;
            sqlx::query(
                r#"
                UPDATE training_versions
                SET status = 'live', document = jsonb_set(document, '{status}', '"live"')
                WHERE version_id = $1
                "#,
            )
            .bind(version_id)
            .execute(&mut *tx)
            .await?;
        }
    }
    let (Json(version),): (Json<TrainingVersion>,) =
        sqlx::query_as("SELECT document FROM training_versions WHERE version_id = $1")
            .bind(version_id)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(Some(version))
}

/// Kept so status columns and documents can be compared in tests.
pub fn job_status_text(status: JobStatus) -> String {
    wire(&status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_names_match_the_sql_check_constraints() {
        assert_eq!(job_status_text(JobStatus::Queued), "queued");
        assert_eq!(job_status_text(JobStatus::Dispatched), "dispatched");
        assert_eq!(wire(&VersionStatus::Shipped), "shipped");
        assert_eq!(
            wire(&energon_core::training::RunOutcome::Unknown),
            "unknown"
        );
    }
}
