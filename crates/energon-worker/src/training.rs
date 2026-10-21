//! Nightly training: schedule jobs, dispatch them to RunPod Serverless, and
//! watch them until the trainer reports back or the job times out.
use std::{env, time::Duration};

use energon_core::training::{JobStatus, JobTrigger, TrainingConfig, TrainingJob, job_token};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::PgPool;

type BoxError = Box<dyn std::error::Error + Send + Sync>;

/// One job per agent per night: a new schedule needs this much distance to the last job.
const MIN_HOURS_BETWEEN_SCHEDULED_JOBS: u128 = 20;
const JOB_TOKEN_TTL_SECONDS: u64 = 24 * 60 * 60;
const DISPATCH_BATCH: i64 = 5;
const POLL_BATCH: i64 = 50;

#[derive(Clone)]
pub struct TrainingRuntime {
    client: reqwest::Client,
    trainer_secret: String,
    public_api_url: String,
    runpod_api_url: String,
    runpod_api_key: String,
    runpod_endpoint_id: String,
    job_timeout_ms: u128,
    worker_id: String,
}

impl TrainingRuntime {
    /// Training is enabled when the trainer secret, public API URL and RunPod
    /// endpoint are configured; otherwise the worker skips it.
    pub fn from_env() -> Result<Option<Self>, BoxError> {
        let value = |name: &str| {
            env::var(name)
                .ok()
                .map(|v| v.trim().to_owned())
                .filter(|v| !v.is_empty())
        };
        let (Some(secret), Some(api_key), Some(endpoint_id)) = (
            value("ENERGON_TRAINER_SECRET"),
            value("RUNPOD_API_KEY"),
            value("ENERGON_RUNPOD_ENDPOINT_ID"),
        ) else {
            return Ok(None);
        };
        if secret.len() < 32 {
            return Err("ENERGON_TRAINER_SECRET must be at least 32 characters".into());
        }
        let public_api_url = value("ENERGON_PUBLIC_API_URL")
            .ok_or("ENERGON_PUBLIC_API_URL must be set so the trainer can reach the API")?;
        let timeout_minutes: u128 = value("ENERGON_TRAINING_JOB_TIMEOUT_MINUTES")
            .and_then(|v| v.parse().ok())
            .filter(|minutes| *minutes > 0)
            .unwrap_or(360);
        Ok(Some(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .build()?,
            trainer_secret: secret,
            public_api_url: public_api_url.trim_end_matches('/').to_owned(),
            runpod_api_url: value("ENERGON_RUNPOD_API_URL")
                .unwrap_or_else(|| "https://api.runpod.ai/v2".to_owned())
                .trim_end_matches('/')
                .to_owned(),
            runpod_api_key: api_key,
            runpod_endpoint_id: endpoint_id,
            job_timeout_ms: timeout_minutes * 60_000,
            worker_id: format!("trainer-dispatch-{}", std::process::id()),
        }))
    }

    /// Schedule, dispatch and poll once. Returns how many jobs changed.
    pub async fn tick(&self, pool: &PgPool, now_ms: u128) -> Result<usize, BoxError> {
        let scheduled = schedule(pool, now_ms).await?;
        let dispatched = self.dispatch(pool, now_ms).await?;
        let finished = self.poll(pool, now_ms).await?;
        if scheduled + dispatched + finished > 0 {
            tracing::info!(scheduled, dispatched, finished, "training tick");
        }
        Ok(scheduled + dispatched + finished)
    }

    async fn dispatch(&self, pool: &PgPool, now_ms: u128) -> Result<usize, BoxError> {
        let jobs =
            energon_db::training::claim_queued_jobs(pool, &self.worker_id, DISPATCH_BATCH, 300)
                .await?;
        let mut count = 0;
        for mut job in jobs {
            let token = job_token::issue(
                &self.trainer_secret,
                &job.job_id,
                (now_ms / 1000) as u64 + JOB_TOKEN_TTL_SECONDS,
            );
            let response = self
                .client
                .post(format!(
                    "{}/{}/run",
                    self.runpod_api_url, self.runpod_endpoint_id
                ))
                .bearer_auth(&self.runpod_api_key)
                .json(&runpod_input(&job, &self.public_api_url, &token))
                .send()
                .await;
            job.updated_at_unix_ms = now_ms;
            match response {
                Ok(response) if response.status().is_success() => {
                    let body: RunPodJob = response.json().await?;
                    job.status = JobStatus::Dispatched;
                    job.provider_job_id = Some(body.id);
                }
                Ok(response) => {
                    let status = response.status();
                    let text = response.text().await.unwrap_or_default();
                    job.status = JobStatus::Failed;
                    job.error = Some(format!(
                        "RunPod rejected the job ({status}): {}",
                        truncate(&text, 400)
                    ));
                }
                Err(error) => {
                    job.status = JobStatus::Failed;
                    job.error = Some(format!("RunPod is unreachable: {error}"));
                }
            }
            energon_db::training::update_job(pool, &job).await?;
            count += 1;
        }
        Ok(count)
    }

    async fn poll(&self, pool: &PgPool, now_ms: u128) -> Result<usize, BoxError> {
        let mut changed = 0;
        for job in energon_db::training::list_active_jobs(pool, POLL_BATCH).await? {
            let Some(provider_id) = job.provider_job_id.clone() else {
                continue;
            };
            let base = format!("{}/{}", self.runpod_api_url, self.runpod_endpoint_id);

            if now_ms.saturating_sub(job.updated_at_unix_ms) > self.job_timeout_ms {
                let _ = self
                    .client
                    .post(format!("{base}/cancel/{provider_id}"))
                    .bearer_auth(&self.runpod_api_key)
                    .send()
                    .await;
                if fail_if_active(pool, &job.job_id, "timed out without a heartbeat", now_ms)
                    .await?
                {
                    changed += 1;
                }
                continue;
            }

            let Ok(response) = self
                .client
                .get(format!("{base}/status/{provider_id}"))
                .bearer_auth(&self.runpod_api_key)
                .send()
                .await
            else {
                continue;
            };
            let Ok(status) = response.json::<RunPodJob>().await else {
                continue;
            };
            if let Some(reason) = provider_failure(&status) {
                if fail_if_active(pool, &job.job_id, &reason, now_ms).await? {
                    changed += 1;
                }
            }
        }
        Ok(changed)
    }
}

/// Creates scheduled jobs for agents whose night has come and who have enough new runs.
pub async fn schedule(pool: &PgPool, now_ms: u128) -> Result<usize, BoxError> {
    let mut created = 0;
    for config in energon_db::training::list_enabled_configs(pool).await? {
        let last_job =
            energon_db::training::last_job_created_at(pool, &config.org_id, &config.agent_id)
                .await?;
        if !in_window(&config, now_ms, last_job) {
            continue;
        }
        let new_runs = energon_db::training::count_successful_runs_since(
            pool,
            &config.org_id,
            &config.agent_id,
            last_job.unwrap_or(0),
        )
        .await?;
        if new_runs < i64::from(config.min_new_runs) {
            continue;
        }
        let job = TrainingJob::queued(
            format!("job_{now_ms}_{}_{}", config.org_id, config.agent_id),
            &config,
            JobTrigger::Schedule,
            u32::try_from(new_runs).unwrap_or(u32::MAX),
            now_ms,
        );
        if energon_db::training::create_job(pool, &job).await? {
            created += 1;
        }
    }
    Ok(created)
}

/// True during the configured UTC hour if the last job is long enough ago.
fn in_window(config: &TrainingConfig, now_ms: u128, last_job_ms: Option<u128>) -> bool {
    let hour = ((now_ms / 3_600_000) % 24) as u8;
    let rested = last_job_ms.is_none_or(|last| {
        now_ms.saturating_sub(last) >= MIN_HOURS_BETWEEN_SCHEDULED_JOBS * 3_600_000
    });
    config.enabled && hour == config.schedule_hour_utc && rested
}

fn runpod_input(job: &TrainingJob, public_api_url: &str, token: &str) -> Value {
    json!({
        "input": {
            "job_id": job.job_id,
            "api_url": public_api_url,
            "job_token": token,
            "kind": job.kind,
            "base_model": job.base_model,
            "suite": job.suite,
        }
    })
}

#[derive(Debug, Deserialize)]
struct RunPodJob {
    id: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    error: Option<Value>,
}

/// RunPod terminal states that mean the trainer never delivered a result.
fn provider_failure(job: &RunPodJob) -> Option<String> {
    let detail = job
        .error
        .as_ref()
        .map(|error| {
            error
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| error.to_string())
        })
        .unwrap_or_default();
    match job.status.as_str() {
        "FAILED" => Some(format!(
            "trainer failed on RunPod: {}",
            truncate(&detail, 400)
        )),
        "CANCELLED" => Some("trainer was cancelled on RunPod".to_owned()),
        "TIMED_OUT" => Some("trainer timed out on RunPod".to_owned()),
        // The handler posts its result before returning; a completed job
        // that is still active here never reported back.
        "COMPLETED" => Some("trainer finished without reporting a result".to_owned()),
        _ => None,
    }
}

/// Re-reads the job so a result that arrived meanwhile is never overwritten.
async fn fail_if_active(
    pool: &PgPool,
    job_id: &str,
    reason: &str,
    now_ms: u128,
) -> Result<bool, BoxError> {
    let Some(mut job) = energon_db::training::get_job(pool, job_id).await? else {
        return Ok(false);
    };
    if job.status.is_terminal() {
        return Ok(false);
    }
    job.status = JobStatus::Failed;
    job.error = Some(reason.to_owned());
    job.updated_at_unix_ms = now_ms;
    energon_db::training::update_job(pool, &job).await?;
    Ok(true)
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOUR: u128 = 3_600_000;

    fn config(hour: u8) -> TrainingConfig {
        let mut config = TrainingConfig::default_for("org_1", "agent_a");
        config.enabled = true;
        config.schedule_hour_utc = hour;
        config
    }

    #[test]
    fn schedules_once_per_night_in_the_configured_hour() {
        let day = 20_000 * 24 * HOUR;
        assert!(in_window(&config(2), day + 2 * HOUR + 5, None));
        assert!(
            !in_window(&config(2), day + 3 * HOUR, None),
            "outside the hour"
        );
        assert!(
            !in_window(&config(2), day + 2 * HOUR + 60_000, Some(day + 2 * HOUR)),
            "already ran tonight"
        );
        assert!(
            in_window(&config(2), day + 26 * HOUR, Some(day + 2 * HOUR)),
            "next night"
        );
        let mut disabled = config(2);
        disabled.enabled = false;
        assert!(!in_window(&disabled, day + 2 * HOUR, None));
    }

    #[test]
    fn maps_runpod_terminal_states() {
        let job = |status: &str| RunPodJob {
            id: "x".into(),
            status: status.into(),
            error: Some(json!("OOM")),
        };
        assert!(provider_failure(&job("IN_QUEUE")).is_none());
        assert!(provider_failure(&job("IN_PROGRESS")).is_none());
        assert!(provider_failure(&job("FAILED")).unwrap().contains("OOM"));
        assert!(provider_failure(&job("COMPLETED")).is_some());
        assert!(provider_failure(&job("TIMED_OUT")).is_some());
    }

    #[test]
    fn runpod_input_carries_only_job_scoped_credentials() {
        let job = TrainingJob::queued("job_1".into(), &config(2), JobTrigger::Operator, 10, 1);
        let input = runpod_input(&job, "https://api.energon.dev", "tok");
        assert_eq!(input["input"]["job_token"], "tok");
        assert_eq!(input["input"]["kind"], "compiled");
        assert_eq!(input["input"]["api_url"], "https://api.energon.dev");
        assert!(input["input"].get("api_key").is_none());
    }
}
