//! Nightly training: reported runs, per-agent training configuration, jobs,
//! versions and the release gate. Pure domain logic, no I/O.
//!
//! Runs are always private to the agent that reported them. Secrets are
//! redacted before a run is stored, so nothing downstream (database, trainer,
//! adapters) ever sees them.

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

use crate::AgentIdentity;

pub const MAX_TASK_BYTES: usize = 4 * 1024;
pub const MAX_STEPS_BYTES: usize = 256 * 1024;
pub const MAX_METADATA_BYTES: usize = 8 * 1024;
pub const MAX_INSTRUCTIONS_BYTES: usize = 32 * 1024;
pub const DEFAULT_BASE_MODEL: &str = "Qwen/Qwen2.5-Coder-7B-Instruct";

#[derive(Debug, Error, PartialEq)]
pub enum TrainingError {
    #[error("{0}")]
    Invalid(String),
}

fn invalid(message: impl Into<String>) -> TrainingError {
    TrainingError::Invalid(message.into())
}

/* ───────────────────────── Runs ───────────────────────── */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunOutcome {
    Success,
    Failure,
    Unknown,
}

/// What an agent reports after finishing a task.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportRunRequest {
    pub task: String,
    /// The trajectory: messages, tool calls and observations, in any JSON shape.
    pub steps: Value,
    pub outcome: RunOutcome,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunRecord {
    pub run_id: String,
    pub org_id: String,
    pub agent_id: String,
    pub task: String,
    pub steps: Value,
    pub outcome: RunOutcome,
    pub metadata: Value,
    pub redactions_applied: u32,
    pub created_at_unix_ms: u128,
}

impl RunRecord {
    /// Validates sizes and redacts secrets before the run is persisted.
    pub fn new(
        run_id: String,
        agent: &AgentIdentity,
        request: ReportRunRequest,
        timestamp: u128,
    ) -> Result<Self, TrainingError> {
        let task = request.task.trim();
        if task.is_empty() || task.len() > MAX_TASK_BYTES {
            return Err(invalid(format!(
                "task must contain 1–{MAX_TASK_BYTES} bytes"
            )));
        }
        if request.steps.is_null() {
            return Err(invalid("steps are required"));
        }
        if serialized_len(&request.steps) > MAX_STEPS_BYTES {
            return Err(invalid(format!("steps exceed {MAX_STEPS_BYTES} bytes")));
        }
        let metadata = match request.metadata {
            None | Some(Value::Null) => Value::Object(Map::new()),
            Some(Value::Object(map)) => Value::Object(map),
            Some(_) => return Err(invalid("metadata must be a JSON object")),
        };
        if serialized_len(&metadata) > MAX_METADATA_BYTES {
            return Err(invalid(format!(
                "metadata exceeds {MAX_METADATA_BYTES} bytes"
            )));
        }

        let (task, task_hits) = redact_secrets(task);
        let (steps, step_hits) = redact_json(request.steps);
        let (metadata, metadata_hits) = redact_json(metadata);

        Ok(Self {
            run_id,
            org_id: agent.org_id.clone(),
            agent_id: agent.agent_id.clone(),
            task,
            steps,
            outcome: request.outcome,
            metadata,
            redactions_applied: (task_hits + step_hits + metadata_hits) as u32,
            created_at_unix_ms: timestamp,
        })
    }
}

fn serialized_len(value: &Value) -> usize {
    serde_json::to_vec(value)
        .map(|bytes| bytes.len())
        .unwrap_or(usize::MAX)
}

/* ───────────────────────── Redaction ───────────────────────── */

struct SecretRule {
    kind: &'static str,
    pattern: Regex,
    /// Capture group that stays visible (e.g. the variable name), if any.
    keep_prefix_group: Option<usize>,
}

static SECRET_RULES: LazyLock<Vec<SecretRule>> = LazyLock::new(|| {
    let rule = |kind, pattern: &str, keep_prefix_group| SecretRule {
        kind,
        pattern: Regex::new(pattern).expect("secret pattern compiles"),
        keep_prefix_group,
    };
    vec![
        rule(
            "private_key",
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
            None,
        ),
        rule("energon_key", r"\beos_(?:live|test)_[A-Za-z0-9]{16,}", None),
        rule("llm_key", r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{16,}", None),
        rule(
            "stripe_key",
            r"\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}",
            None,
        ),
        rule(
            "github_token",
            r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})",
            None,
        ),
        rule("slack_token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}", None),
        rule("aws_access_key", r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b", None),
        rule(
            "jwt",
            r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
            None,
        ),
        rule(
            "bearer_token",
            r"(?i)(\bbearer\s+)[A-Za-z0-9._~+/=-]{16,}",
            Some(1),
        ),
        rule(
            "url_password",
            r"([a-zA-Z][a-zA-Z0-9+.-]*://[^\s:/@]+:)[^\s@/]+(@)",
            Some(1),
        ),
        rule(
            "assignment",
            r#"(?i)(\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*\s*[=:]\s*["']?)[^\s"']{6,}"#,
            Some(1),
        ),
    ]
});

const SENSITIVE_KEYS: [&str; 9] = [
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "private_key",
    "access_key",
];

/// Replaces known secret formats with `[REDACTED:<kind>]`. Returns the
/// redacted text and the number of replacements.
pub fn redact_secrets(input: &str) -> (String, usize) {
    let mut text = input.to_owned();
    let mut hits = 0;
    for rule in SECRET_RULES.iter() {
        let mut count = 0;
        let replaced = rule
            .pattern
            .replace_all(&text, |captures: &regex::Captures| {
                count += 1;
                let marker = format!("[REDACTED:{}]", rule.kind);
                match rule.keep_prefix_group {
                    Some(group) => {
                        let prefix = captures.get(group).map_or("", |m| m.as_str());
                        // URL credentials keep the `@` so the host stays readable.
                        let suffix = if rule.kind == "url_password" { "@" } else { "" };
                        format!("{prefix}{marker}{suffix}")
                    }
                    None => marker,
                }
            });
        if count > 0 {
            text = replaced.into_owned();
            hits += count;
        }
    }
    (text, hits)
}

/// Redacts every string in a JSON value. Values stored under sensitive keys
/// (password, token, …) are replaced entirely.
pub fn redact_json(value: Value) -> (Value, usize) {
    match value {
        Value::String(text) => {
            let (text, hits) = redact_secrets(&text);
            (Value::String(text), hits)
        }
        Value::Array(items) => {
            let mut hits = 0;
            let items = items
                .into_iter()
                .map(|item| {
                    let (item, count) = redact_json(item);
                    hits += count;
                    item
                })
                .collect();
            (Value::Array(items), hits)
        }
        Value::Object(map) => {
            let mut hits = 0;
            let map = map
                .into_iter()
                .map(|(key, item)| {
                    if is_sensitive_key(&key)
                        && matches!(item, Value::String(ref s) if !s.is_empty())
                    {
                        hits += 1;
                        return (key, Value::String("[REDACTED:field]".to_owned()));
                    }
                    let (item, count) = redact_json(item);
                    hits += count;
                    (key, item)
                })
                .collect();
            (Value::Object(map), hits)
        }
        other => (other, 0),
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase().replace('-', "_");
    SENSITIVE_KEYS
        .iter()
        .any(|sensitive| key == *sensitive || key.ends_with(&format!("_{sensitive}")))
}

/* ───────────────────────── Configuration ───────────────────────── */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrainingKind {
    /// A LoRA adapter on top of an open-weight base model.
    Adapter,
    /// Optimised instructions for any model, including closed ones.
    Compiled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrainingConfig {
    pub org_id: String,
    pub agent_id: String,
    pub enabled: bool,
    pub kind: TrainingKind,
    pub base_model: String,
    /// Eval suite used for the held-out gate.
    pub suite: String,
    /// New successful runs required before a scheduled night runs.
    pub min_new_runs: u32,
    pub schedule_hour_utc: u8,
    /// Minimum improvement in percentage points before a version ships.
    pub min_lift_pts: f64,
    pub updated_at_unix_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateTrainingConfig {
    pub enabled: bool,
    pub kind: TrainingKind,
    pub base_model: String,
    pub suite: String,
    pub min_new_runs: u32,
    pub schedule_hour_utc: u8,
    pub min_lift_pts: f64,
}

impl TrainingConfig {
    pub fn default_for(org_id: &str, agent_id: &str) -> Self {
        Self {
            org_id: org_id.to_owned(),
            agent_id: agent_id.to_owned(),
            enabled: false,
            kind: TrainingKind::Compiled,
            base_model: DEFAULT_BASE_MODEL.to_owned(),
            suite: "linux_operator".to_owned(),
            min_new_runs: 50,
            schedule_hour_utc: 2,
            min_lift_pts: 2.0,
            updated_at_unix_ms: 0,
        }
    }

    pub fn apply(
        org_id: &str,
        agent_id: &str,
        update: UpdateTrainingConfig,
        timestamp: u128,
    ) -> Result<Self, TrainingError> {
        validate_identifier("base_model", &update.base_model, 200)?;
        validate_identifier("suite", &update.suite, 80)?;
        if update.schedule_hour_utc > 23 {
            return Err(invalid("schedule_hour_utc must be 0–23"));
        }
        if !(1..=100_000).contains(&update.min_new_runs) {
            return Err(invalid("min_new_runs must be 1–100000"));
        }
        if !update.min_lift_pts.is_finite() || !(0.0..=100.0).contains(&update.min_lift_pts) {
            return Err(invalid("min_lift_pts must be 0–100"));
        }
        Ok(Self {
            org_id: org_id.to_owned(),
            agent_id: agent_id.to_owned(),
            enabled: update.enabled,
            kind: update.kind,
            base_model: update.base_model.trim().to_owned(),
            suite: update.suite.trim().to_owned(),
            min_new_runs: update.min_new_runs,
            schedule_hour_utc: update.schedule_hour_utc,
            min_lift_pts: update.min_lift_pts,
            updated_at_unix_ms: timestamp,
        })
    }
}

fn validate_identifier(field: &str, value: &str, max: usize) -> Result<(), TrainingError> {
    let value = value.trim();
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/' | ':');
    if value.is_empty() || value.len() > max || !value.chars().all(allowed) {
        return Err(invalid(format!(
            "{field} must be 1–{max} characters of letters, digits, . _ - / :"
        )));
    }
    Ok(())
}

/* ───────────────────────── Jobs ───────────────────────── */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Queued,
    Dispatched,
    Running,
    Succeeded,
    Failed,
    Rejected,
}

impl JobStatus {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Rejected)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobTrigger {
    Schedule,
    Operator,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrainingJob {
    pub job_id: String,
    pub org_id: String,
    pub agent_id: String,
    pub kind: TrainingKind,
    pub base_model: String,
    pub suite: String,
    pub status: JobStatus,
    pub trigger: JobTrigger,
    pub provider_job_id: Option<String>,
    pub run_count: u32,
    pub version_id: Option<String>,
    pub error: Option<String>,
    pub created_at_unix_ms: u128,
    pub updated_at_unix_ms: u128,
}

impl TrainingJob {
    pub fn queued(
        job_id: String,
        config: &TrainingConfig,
        trigger: JobTrigger,
        run_count: u32,
        timestamp: u128,
    ) -> Self {
        Self {
            job_id,
            org_id: config.org_id.clone(),
            agent_id: config.agent_id.clone(),
            kind: config.kind,
            base_model: config.base_model.clone(),
            suite: config.suite.clone(),
            status: JobStatus::Queued,
            trigger,
            provider_job_id: None,
            run_count,
            version_id: None,
            error: None,
            created_at_unix_ms: timestamp,
            updated_at_unix_ms: timestamp,
        }
    }
}

/* ───────────────────────── Versions & evals ───────────────────────── */

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EvalReport {
    pub suite: String,
    pub held_out_tasks: u32,
    pub runs_per_task: u32,
    /// Success rates as fractions 0–1.
    pub base_success: f64,
    pub previous_success: Option<f64>,
    pub candidate_success: f64,
    /// Standard deviation of the candidate's success rate across runs.
    pub candidate_spread: f64,
}

impl EvalReport {
    fn validate(&self) -> Result<(), TrainingError> {
        validate_identifier("eval.suite", &self.suite, 80)?;
        if self.held_out_tasks == 0 || self.runs_per_task == 0 {
            return Err(invalid("eval needs at least one held-out task and one run"));
        }
        let fractions = [
            Some(self.base_success),
            self.previous_success,
            Some(self.candidate_success),
            Some(self.candidate_spread),
        ];
        if fractions
            .into_iter()
            .flatten()
            .any(|value| !value.is_finite() || !(0.0..=1.0).contains(&value))
        {
            return Err(invalid("eval rates must be fractions between 0 and 1"));
        }
        Ok(())
    }

    /// The bar a candidate has to beat: yesterday's live version, or the base model.
    pub fn reference_success(&self) -> f64 {
        self.previous_success.unwrap_or(self.base_success)
    }

    pub fn lift_pts(&self) -> f64 {
        round2((self.candidate_success - self.reference_success()) * 100.0)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AdapterArtifact {
    /// `s3://bucket/key` or `https://…`
    pub uri: String,
    pub sha256: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VersionStatus {
    /// Currently served to the agent.
    Live,
    /// Was live before; kept for comparison and rollback.
    Shipped,
    /// Did not beat the reference on held-out tasks.
    Rejected,
}

/// What the trainer reports back for a job.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrainingResult {
    pub instructions: Option<String>,
    pub adapter: Option<AdapterArtifact>,
    pub eval: EvalReport,
    pub trained_on_runs: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrainingVersion {
    pub version_id: String,
    pub org_id: String,
    pub agent_id: String,
    pub number: u32,
    pub kind: TrainingKind,
    pub job_id: String,
    pub base_model: String,
    pub instructions: Option<String>,
    pub adapter: Option<AdapterArtifact>,
    pub eval: EvalReport,
    pub lift_pts: f64,
    pub status: VersionStatus,
    pub trained_on_runs: u32,
    pub decision: String,
    pub created_at_unix_ms: u128,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReleaseDecision {
    Release,
    Reject(String),
}

/// A candidate ships only if it beats the reference by at least `min_lift_pts`
/// and by more than its own run-to-run spread, and is never worse than the base model.
pub fn release_decision(eval: &EvalReport, min_lift_pts: f64) -> ReleaseDecision {
    let lift = eval.lift_pts();
    let noise = round2(eval.candidate_spread * 100.0);
    let required = min_lift_pts.max(noise);
    if eval.candidate_success < eval.base_success {
        return ReleaseDecision::Reject(format!(
            "candidate {:.1}% is below the base model {:.1}%",
            eval.candidate_success * 100.0,
            eval.base_success * 100.0
        ));
    }
    if lift < required {
        return ReleaseDecision::Reject(format!(
            "lift {lift:+.1} pts is below the required {required:.1} pts"
        ));
    }
    ReleaseDecision::Release
}

impl TrainingVersion {
    /// Turns a trainer result into a version and applies the release gate.
    pub fn from_result(
        version_id: String,
        number: u32,
        job: &TrainingJob,
        result: TrainingResult,
        min_lift_pts: f64,
        timestamp: u128,
    ) -> Result<Self, TrainingError> {
        result.eval.validate()?;
        match job.kind {
            TrainingKind::Compiled => {
                let instructions = result.instructions.as_deref().map(str::trim).unwrap_or("");
                if instructions.is_empty() || instructions.len() > MAX_INSTRUCTIONS_BYTES {
                    return Err(invalid(format!(
                        "compiled results need instructions of 1–{MAX_INSTRUCTIONS_BYTES} bytes"
                    )));
                }
                if result.adapter.is_some() {
                    return Err(invalid("compiled results must not contain an adapter"));
                }
            }
            TrainingKind::Adapter => {
                let adapter = result
                    .adapter
                    .as_ref()
                    .ok_or_else(|| invalid("adapter results need an adapter artifact"))?;
                validate_artifact(adapter)?;
                if result.instructions.is_some() {
                    return Err(invalid("adapter results must not contain instructions"));
                }
            }
        }

        let decision = release_decision(&result.eval, min_lift_pts);
        let (status, decision_text) = match decision {
            ReleaseDecision::Release => (
                VersionStatus::Live,
                "released: beat the reference on held-out tasks".to_owned(),
            ),
            ReleaseDecision::Reject(reason) => {
                (VersionStatus::Rejected, format!("rejected: {reason}"))
            }
        };
        let instructions = result.instructions.map(|text| text.trim().to_owned());
        let instructions = instructions.map(|text| redact_secrets(&text).0);

        Ok(Self {
            version_id,
            org_id: job.org_id.clone(),
            agent_id: job.agent_id.clone(),
            number,
            kind: job.kind,
            job_id: job.job_id.clone(),
            base_model: job.base_model.clone(),
            instructions,
            adapter: result.adapter,
            lift_pts: result.eval.lift_pts(),
            eval: result.eval,
            status,
            trained_on_runs: result.trained_on_runs,
            decision: decision_text,
            created_at_unix_ms: timestamp,
        })
    }
}

fn validate_artifact(artifact: &AdapterArtifact) -> Result<(), TrainingError> {
    let uri_ok = (artifact.uri.starts_with("s3://") || artifact.uri.starts_with("https://"))
        && artifact.uri.len() <= 1024
        && !artifact.uri.chars().any(char::is_whitespace);
    if !uri_ok {
        return Err(invalid("adapter uri must be an s3:// or https:// location"));
    }
    if artifact.sha256.len() != 64 || !artifact.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(invalid("adapter sha256 must be 64 hex characters"));
    }
    if artifact.bytes == 0 {
        return Err(invalid("adapter must not be empty"));
    }
    Ok(())
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn agent() -> AgentIdentity {
        AgentIdentity::new(
            "research-01",
            "org_1",
            Some("researcher".to_owned()),
            Some("launch".to_owned()),
        )
    }

    fn report(task: &str, steps: Value) -> ReportRunRequest {
        ReportRunRequest {
            task: task.to_owned(),
            steps,
            outcome: RunOutcome::Success,
            metadata: None,
        }
    }

    #[test]
    fn redacts_common_secret_formats() {
        let cases = [
            ("key sk-ant-abcdefghijklmnopqrstu end", "[REDACTED:llm_key]"),
            (
                "export OPENAI_API_KEY=sk-proj-1234567890abcdefXYZ",
                "OPENAI_API_KEY=[REDACTED",
            ),
            (
                "token ghp_abcdefghijklmnopqrstuvwxyz0123",
                "[REDACTED:github_token]",
            ),
            (
                "AKIAABCDEFGHIJKLMNOP is the id",
                "[REDACTED:aws_access_key]",
            ),
            (
                "curl -H 'Authorization: Bearer abcdefghijklmnop1234'",
                "Bearer [REDACTED:bearer_token]",
            ),
            (
                "postgres://energon:hunter2secret@db:5432/energon",
                "postgres://energon:[REDACTED:url_password]@db",
            ),
            (
                "DB_PASSWORD=correcthorse",
                "DB_PASSWORD=[REDACTED:assignment]",
            ),
            (
                "use eos_live_0123456789abcdef0123",
                "[REDACTED:energon_key]",
            ),
            ("xoxb-1234567890-abcdefghij", "[REDACTED:slack_token]"),
        ];
        for (input, expected) in cases {
            let (output, hits) = redact_secrets(input);
            assert!(hits >= 1, "no hit for {input}");
            assert!(output.contains(expected), "{input} -> {output}");
        }
    }

    #[test]
    fn redacts_private_key_blocks() {
        let input =
            "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\ndef\n-----END OPENSSH PRIVATE KEY-----";
        let (output, hits) = redact_secrets(input);
        assert_eq!(hits, 1);
        assert_eq!(output, "[REDACTED:private_key]");
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        let input = "Restarted nginx with systemctl restart nginx; tokens used: 1200";
        assert_eq!(redact_secrets(input), (input.to_owned(), 0));
    }

    #[test]
    fn redacts_nested_json_and_sensitive_keys() {
        let (value, hits) = redact_json(json!({
            "env": { "password": "plain", "GITHUB_TOKEN": "x" },
            "steps": ["ran curl with Bearer abcdefghijklmnopqrstuv", 3]
        }));
        assert_eq!(value["env"]["password"], "[REDACTED:field]");
        assert_eq!(value["env"]["GITHUB_TOKEN"], "[REDACTED:field]");
        assert!(
            value["steps"][0]
                .as_str()
                .unwrap()
                .contains("[REDACTED:bearer_token]")
        );
        assert_eq!(value["steps"][1], 3);
        assert_eq!(hits, 3);
    }

    #[test]
    fn run_records_are_redacted_and_validated() {
        let run = RunRecord::new(
            "run_1".into(),
            &agent(),
            report(
                "deploy with DEPLOY_TOKEN=abcdef123456",
                json!([{"cmd": "ls"}]),
            ),
            7,
        )
        .unwrap();
        assert_eq!(run.agent_id, "research-01");
        assert_eq!(run.redactions_applied, 1);
        assert!(run.task.contains("[REDACTED:assignment]"));
        assert_eq!(run.metadata, json!({}));

        assert!(RunRecord::new("r".into(), &agent(), report("  ", json!([])), 0).is_err());
        assert!(RunRecord::new("r".into(), &agent(), report("t", Value::Null), 0).is_err());
        let huge = Value::String("x".repeat(MAX_STEPS_BYTES + 1));
        assert!(RunRecord::new("r".into(), &agent(), report("t", huge), 0).is_err());
        let mut bad_meta = report("t", json!([]));
        bad_meta.metadata = Some(json!([1, 2]));
        assert!(RunRecord::new("r".into(), &agent(), bad_meta, 0).is_err());
    }

    fn eval(base: f64, previous: Option<f64>, candidate: f64, spread: f64) -> EvalReport {
        EvalReport {
            suite: "linux_operator".into(),
            held_out_tasks: 20,
            runs_per_task: 5,
            base_success: base,
            previous_success: previous,
            candidate_success: candidate,
            candidate_spread: spread,
        }
    }

    #[test]
    fn release_gate_requires_real_lift() {
        assert_eq!(
            release_decision(&eval(0.52, None, 0.61, 0.02), 2.0),
            ReleaseDecision::Release
        );
        assert!(matches!(
            release_decision(&eval(0.52, None, 0.53, 0.0), 2.0),
            ReleaseDecision::Reject(_)
        ));
        // Beats yesterday by 3 pts but the spread is 5 pts: still noise.
        assert!(matches!(
            release_decision(&eval(0.5, Some(0.7), 0.73, 0.05), 2.0),
            ReleaseDecision::Reject(_)
        ));
        // Never ship something worse than the base model.
        assert!(matches!(
            release_decision(&eval(0.6, Some(0.4), 0.5, 0.0), 2.0),
            ReleaseDecision::Reject(_)
        ));
        assert_eq!(eval(0.52, Some(0.61), 0.74, 0.01).lift_pts(), 13.0);
    }

    fn job(kind: TrainingKind) -> TrainingJob {
        let mut config = TrainingConfig::default_for("org_1", "research-01");
        config.kind = kind;
        TrainingJob::queued("job_1".into(), &config, JobTrigger::Operator, 120, 1)
    }

    #[test]
    fn versions_validate_kind_specific_payloads() {
        let compiled = TrainingResult {
            instructions: Some("Check the changelog first.".into()),
            adapter: None,
            eval: eval(0.5, None, 0.6, 0.01),
            trained_on_runs: 120,
        };
        let version = TrainingVersion::from_result(
            "v1".into(),
            1,
            &job(TrainingKind::Compiled),
            compiled,
            2.0,
            9,
        )
        .unwrap();
        assert_eq!(version.status, VersionStatus::Live);
        assert_eq!(version.lift_pts, 10.0);

        let missing = TrainingResult {
            instructions: None,
            adapter: None,
            eval: eval(0.5, None, 0.6, 0.0),
            trained_on_runs: 1,
        };
        assert!(
            TrainingVersion::from_result(
                "v".into(),
                1,
                &job(TrainingKind::Compiled),
                missing,
                2.0,
                0
            )
            .is_err()
        );

        let adapter = TrainingResult {
            instructions: None,
            adapter: Some(AdapterArtifact {
                uri: "s3://energon-adapters/org_1/research-01/v2".into(),
                sha256: "a".repeat(64),
                bytes: 38_000_000,
            }),
            eval: eval(0.5, Some(0.6), 0.6, 0.0),
            trained_on_runs: 300,
        };
        let version = TrainingVersion::from_result(
            "v2".into(),
            2,
            &job(TrainingKind::Adapter),
            adapter,
            2.0,
            0,
        )
        .unwrap();
        assert_eq!(version.status, VersionStatus::Rejected);
        assert!(version.decision.starts_with("rejected"));

        let bad_hash = TrainingResult {
            instructions: None,
            adapter: Some(AdapterArtifact {
                uri: "s3://b/k".into(),
                sha256: "xyz".into(),
                bytes: 1,
            }),
            eval: eval(0.5, None, 0.6, 0.0),
            trained_on_runs: 1,
        };
        assert!(
            TrainingVersion::from_result(
                "v".into(),
                1,
                &job(TrainingKind::Adapter),
                bad_hash,
                2.0,
                0
            )
            .is_err()
        );
    }

    #[test]
    fn config_updates_are_validated() {
        let update = |hour, runs, lift: f64, model: &str| UpdateTrainingConfig {
            enabled: true,
            kind: TrainingKind::Adapter,
            base_model: model.into(),
            suite: "linux_operator".into(),
            min_new_runs: runs,
            schedule_hour_utc: hour,
            min_lift_pts: lift,
        };
        assert!(TrainingConfig::apply("o", "a", update(2, 50, 2.0, DEFAULT_BASE_MODEL), 1).is_ok());
        assert!(
            TrainingConfig::apply("o", "a", update(24, 50, 2.0, DEFAULT_BASE_MODEL), 1).is_err()
        );
        assert!(TrainingConfig::apply("o", "a", update(2, 0, 2.0, DEFAULT_BASE_MODEL), 1).is_err());
        assert!(
            TrainingConfig::apply("o", "a", update(2, 50, f64::NAN, DEFAULT_BASE_MODEL), 1)
                .is_err()
        );
        assert!(TrainingConfig::apply("o", "a", update(2, 50, 2.0, "model; rm -rf /"), 1).is_err());
    }
}

/* ───────────────────────── Job tokens ───────────────────────── */

/// Short-lived credentials for the trainer: `<job_id>.<expires_unix_s>.<hmac>`.
/// The trainer never receives an agent API key; a token unlocks exactly one job.
pub mod job_token {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    pub fn issue(secret: &str, job_id: &str, expires_unix_s: u64) -> String {
        let payload = format!("{job_id}.{expires_unix_s}");
        format!("{payload}.{}", hex(&sign(secret, &payload)))
    }

    /// Returns the job id when the token is authentic and not expired.
    pub fn verify(secret: &str, token: &str, now_unix_s: u64) -> Option<String> {
        let (payload, signature) = token.rsplit_once('.')?;
        let (job_id, expires) = payload.rsplit_once('.')?;
        let expires: u64 = expires.parse().ok()?;
        if job_id.is_empty() || expires < now_unix_s {
            return None;
        }
        let signature = unhex(signature)?;
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
        mac.update(payload.as_bytes());
        mac.verify_slice(&signature).ok()?;
        Some(job_id.to_owned())
    }

    fn sign(secret: &str, payload: &str) -> Vec<u8> {
        let mut mac =
            HmacSha256::new_from_slice(secret.as_bytes()).expect("hmac accepts any key length");
        mac.update(payload.as_bytes());
        mac.finalize().into_bytes().to_vec()
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn unhex(text: &str) -> Option<Vec<u8>> {
        if text.len() % 2 != 0 {
            return None;
        }
        (0..text.len())
            .step_by(2)
            .map(|index| u8::from_str_radix(text.get(index..index + 2)?, 16).ok())
            .collect()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn tokens_verify_only_for_the_right_secret_job_and_time() {
            let token = issue("s3cret", "job_1_1", 1_000);
            assert_eq!(verify("s3cret", &token, 999).as_deref(), Some("job_1_1"));
            assert_eq!(verify("s3cret", &token, 1_001), None, "expired");
            assert_eq!(verify("other", &token, 999), None, "wrong secret");
            let forged = token.replacen("job_1_1", "job_9_9", 1);
            assert_eq!(verify("s3cret", &forged, 999), None, "tampered job id");
            assert_eq!(verify("s3cret", "garbage", 0), None);
        }
    }
}
