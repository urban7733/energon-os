//! Server-side Rust client for the Energon OS control plane.
//!
//! The client authenticates one agent with its API key. Identity and policy
//! boundaries are derived by the control plane, never accepted from SDK input.

use std::{error::Error, fmt, time::Duration};

use reqwest::{StatusCode, Url, blocking::Client};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

pub const SDK_VERSION: &str = "0.1.0";

#[derive(Debug)]
pub enum EnergonError {
    InvalidInput(String),
    Request(reqwest::Error),
    Api { status: StatusCode, message: String },
    InvalidResponse(reqwest::Error),
}

impl fmt::Display for EnergonError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(message) => write!(formatter, "{message}"),
            Self::Request(error) => write!(
                formatter,
                "unable to reach the Energon control plane: {error}"
            ),
            Self::Api { status, message } => write!(
                formatter,
                "Energon request failed with status {status}: {message}"
            ),
            Self::InvalidResponse(error) => write!(
                formatter,
                "Energon returned an invalid JSON response: {error}"
            ),
        }
    }
}

impl Error for EnergonError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Request(error) | Self::InvalidResponse(error) => Some(error),
            Self::InvalidInput(_) | Self::Api { .. } => None,
        }
    }
}

pub type Result<T> = std::result::Result<T, EnergonError>;

#[derive(Debug, Clone, Serialize)]
pub struct RememberInput {
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BuildContextInput {
    pub task: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_budget: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateSkillInput {
    pub name: String,
    pub instructions: String,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub requires_approval_for: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentMemory {
    pub memory_id: String,
    pub scope: String,
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContextPack {
    pub request_id: String,
    pub agent_id: String,
    pub task: String,
    pub token_budget: u32,
    pub estimated_tokens: u32,
    pub context_pack: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SkillProfile {
    pub skill_id: String,
    pub scope: String,
    pub name: String,
    /// Declarative, untrusted profile data. It is not executable code.
    pub instructions: String,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub requires_approval_for: Vec<String>,
    pub version: i32,
    pub created_by_kind: String,
    pub created_by_id: String,
    pub created_at_unix_ms: i64,
    #[serde(default)]
    pub assigned_agent_ids: Vec<String>,
    pub executable: bool,
}

/// Read-only operational state mirrored from the agent-safe dashboard view.
/// It deliberately omits API keys, unpermitted memory text, payment identities,
/// and skill profiles not assigned to the authenticated agent.
#[derive(Debug, Clone, Deserialize)]
pub struct OperationalOverview {
    pub contract_version: String,
    pub generated_at_unix_ms: i64,
    pub org_id: String,
    pub agent: OperationalAgent,
    pub system: OperationalSystem,
    pub directory: Vec<OperationalAgentDirectoryEntry>,
    pub stats: OperationalStats,
    #[serde(default)]
    pub role_policies: Vec<OperationalRolePolicy>,
    #[serde(default)]
    pub conflicts: Vec<OperationalConflict>,
    #[serde(default)]
    pub assigned_skills: Vec<OperationalSkillProfile>,
    pub billing: OperationalBilling,
    #[serde(default)]
    pub redactions: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalAgent {
    pub agent_id: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalSystem {
    pub health: OperationalHealth,
    pub x402: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalHealth {
    pub status: String,
    pub service: String,
    pub version: String,
    pub storage: String,
    pub database: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalAgentDirectoryEntry {
    pub agent_id: String,
    pub name: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
    pub created_at_unix_ms: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalStats {
    pub memory: OperationalMemoryStats,
    pub usage: OperationalUsage,
    pub event_delivery: OperationalEventDelivery,
    pub conflict_summary: OperationalConflictSummary,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalMemoryStats {
    pub total_memories: i64,
    #[serde(default)]
    pub scopes: Vec<OperationalScopeCount>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalScopeCount {
    pub scope: String,
    pub count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalUsage {
    pub storage: String,
    #[serde(default)]
    pub totals: Vec<OperationalRouteUsage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalRouteUsage {
    pub route: String,
    pub calls: i64,
    pub paid_calls: i64,
    pub amount_usdc_micro: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalEventDelivery {
    pub storage: String,
    pub pending: i64,
    pub leased: i64,
    pub published: i64,
    pub retrying: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalConflictSummary {
    pub contested: i64,
    pub resolved: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalRolePolicy {
    pub role_id: String,
    pub authority_bps: i32,
    pub can_resolve_conflicts: bool,
    pub policy_version: i32,
    pub updated_at_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalConflict {
    pub conflict_id: String,
    pub subject: String,
    pub predicate: String,
    pub incumbent_claim_id: String,
    pub challenger_claim_id: String,
    pub status: String,
    pub resolved_claim_id: Option<String>,
    pub resolution_reason: Option<String>,
    pub created_at_unix_ms: i64,
    pub resolved_at_unix_ms: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalSkillProfile {
    pub skill_id: String,
    pub scope: String,
    pub name: String,
    pub instructions: String,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub requires_approval_for: Vec<String>,
    pub version: i32,
    pub created_by_kind: String,
    pub created_by_id: String,
    pub created_at_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalBilling {
    pub configured: bool,
    pub entitlement: Option<OperationalEntitlement>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OperationalEntitlement {
    pub plan_id: String,
    pub included_operations: i64,
    pub used_operations: i64,
    pub remaining_operations: i64,
    pub active_from_unix_ms: i64,
    pub expires_at_unix_ms: i64,
}

/// How a reported run ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunOutcome {
    Success,
    Failure,
    Unknown,
}

/// A finished run. Prefer chat messages (`[{"role": "...", "content": "..."}]`) as steps;
/// any JSON is accepted and secrets are redacted before storage.
#[derive(Debug, Clone, Serialize)]
pub struct ReportRunInput {
    pub task: String,
    pub steps: serde_json::Value,
    pub outcome: RunOutcome,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RunReceipt {
    pub run_id: String,
    pub outcome: RunOutcome,
    pub redactions_applied: u32,
    pub created_at_unix_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EvalReport {
    pub suite: String,
    pub held_out_tasks: u32,
    pub runs_per_task: u32,
    pub base_success: f64,
    pub previous_success: Option<f64>,
    pub candidate_success: f64,
    pub candidate_spread: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AdapterArtifact {
    pub uri: String,
    pub sha256: String,
    pub bytes: u64,
}

/// A version learned overnight from this agent's runs.
#[derive(Debug, Clone, Deserialize)]
pub struct TrainingVersion {
    pub version_id: String,
    pub number: u32,
    /// `adapter` or `compiled`.
    pub kind: String,
    pub base_model: String,
    pub instructions: Option<String>,
    pub adapter: Option<AdapterArtifact>,
    pub eval: EvalReport,
    pub lift_pts: f64,
    /// `live`, `shipped` or `rejected`.
    pub status: String,
    pub decision: String,
    #[serde(default)]
    pub adapter_download_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LatestTrainingResponse {
    version: Option<TrainingVersion>,
}

#[derive(Debug, Deserialize)]
struct TrainingVersionsResponse {
    versions: Vec<TrainingVersion>,
}

#[derive(Debug, Deserialize)]
struct SkillsResponse {
    skills: Vec<SkillProfile>,
}

#[derive(Debug, Deserialize)]
struct ErrorResponse {
    error: String,
}

/// A synchronous, server-side client authenticated as one Energon agent.
#[derive(Clone)]
pub struct Energon {
    base_url: String,
    api_key: String,
    client: Client,
}

impl Energon {
    pub fn new(base_url: &str, api_key: &str) -> Result<Self> {
        let base_url = normalise_base_url(base_url)?;
        let api_key = required_text(api_key, "api_key")?;
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(EnergonError::Request)?;
        Ok(Self {
            base_url,
            api_key,
            client,
        })
    }

    pub fn remember(&self, input: RememberInput) -> Result<AgentMemory> {
        let body = RememberInput {
            content: required_text(&input.content, "content")?,
            tags: normalise_list(input.tags, "tags")?,
            source: input
                .source
                .map(|value| required_text(&value, "source"))
                .transpose()?,
        };
        #[derive(Serialize)]
        struct MemoryRequest {
            scope: &'static str,
            #[serde(flatten)]
            input: RememberInput,
        }
        self.send(
            "POST",
            "/v1/memory/write",
            Some(&MemoryRequest {
                scope: "agent_private",
                input: body,
            }),
        )
    }

    pub fn build_context(&self, input: BuildContextInput) -> Result<ContextPack> {
        if let Some(token_budget) = input.token_budget
            && token_budget == 0
        {
            return Err(EnergonError::InvalidInput(
                "token_budget must be a positive integer when provided".to_owned(),
            ));
        }
        let body = BuildContextInput {
            task: required_text(&input.task, "task")?,
            project_id: input
                .project_id
                .map(|value| required_text(&value, "project_id"))
                .transpose()?,
            token_budget: input.token_budget,
        };
        self.send("POST", "/v1/context/build", Some(&body))
    }

    /// Returns agent-safe organization telemetry and dashboard metrics.
    pub fn operational_overview(&self) -> Result<OperationalOverview> {
        self.send::<(), _>("GET", "/v1/agent/overview", None)
    }

    /// Lists only profiles explicitly assigned to this authenticated agent.
    /// Reports a finished run for nightly training. It stays private to this agent.
    pub fn report_run(&self, input: ReportRunInput) -> Result<RunReceipt> {
        if input.steps.is_null() {
            return Err(EnergonError::InvalidInput("steps are required".to_owned()));
        }
        let body = ReportRunInput {
            task: required_text(&input.task, "task")?,
            ..input
        };
        self.send("POST", "/v1/runs", Some(&body))
    }

    /// The live training version for this agent, if one has been released.
    pub fn latest_training(&self) -> Result<Option<TrainingVersion>> {
        let response: LatestTrainingResponse =
            self.send::<(), _>("GET", "/v1/training/latest", None)?;
        Ok(response.version)
    }

    pub fn training_versions(&self) -> Result<Vec<TrainingVersion>> {
        let response: TrainingVersionsResponse =
            self.send::<(), _>("GET", "/v1/training/versions", None)?;
        Ok(response.versions)
    }

    /// `base` plus the live compiled rules, if any.
    pub fn system_prompt(&self, base: &str) -> Result<String> {
        Ok(match self.latest_training()? {
            Some(TrainingVersion {
                kind,
                instructions: Some(rules),
                ..
            }) if kind == "compiled" => {
                format!("{base}\n\n{rules}")
            }
            _ => base.to_owned(),
        })
    }

    pub fn list_skills(&self) -> Result<Vec<SkillProfile>> {
        let response: SkillsResponse = self.send::<(), _>("GET", "/v1/skills", None)?;
        Ok(response.skills)
    }

    /// Creates a private skill profile for this authenticated agent only.
    pub fn create_skill(&self, input: CreateSkillInput) -> Result<SkillProfile> {
        let body = CreateSkillInput {
            name: required_text(&input.name, "name")?,
            instructions: required_text(&input.instructions, "instructions")?,
            allowed_tools: normalise_list(input.allowed_tools, "allowed_tools")?,
            requires_approval_for: normalise_list(
                input.requires_approval_for,
                "requires_approval_for",
            )?,
        };
        self.send("POST", "/v1/skills", Some(&body))
    }

    fn send<Body: Serialize, Response: DeserializeOwned>(
        &self,
        method: &str,
        path: &str,
        body: Option<&Body>,
    ) -> Result<Response> {
        let url = format!("{}{}", self.base_url, path);
        let request = self
            .client
            .request(
                method
                    .parse()
                    .expect("SDK methods are fixed valid HTTP methods"),
                url,
            )
            .bearer_auth(&self.api_key)
            .header("x-energon-sdk", format!("rust/{SDK_VERSION}"));
        let request = if let Some(body) = body {
            request.json(body)
        } else {
            request
        };
        let response = request.send().map_err(EnergonError::Request)?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            let message = serde_json::from_str::<ErrorResponse>(&text)
                .map(|body| body.error)
                .unwrap_or_else(|_| format!("Energon request failed with status {status}"));
            return Err(EnergonError::Api { status, message });
        }
        response.json().map_err(EnergonError::InvalidResponse)
    }
}

fn normalise_base_url(value: &str) -> Result<String> {
    let value = required_text(value, "base_url")?;
    let url = Url::parse(&value).map_err(|_| {
        EnergonError::InvalidInput("base_url must be an absolute http or https URL".to_owned())
    })?;
    if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
        return Err(EnergonError::InvalidInput(
            "base_url must be an absolute http or https URL".to_owned(),
        ));
    }
    Ok(value.trim_end_matches('/').to_owned())
}

fn required_text(value: &str, field: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(EnergonError::InvalidInput(format!(
            "{field} cannot be empty"
        )));
    }
    Ok(value.to_owned())
}

fn normalise_list(values: Vec<String>, field: &str) -> Result<Vec<String>> {
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .map(|value| required_text(&value, field))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        io::{BufRead, BufReader, Read, Write},
        net::TcpListener,
        thread,
    };

    use super::{Energon, RememberInput, ReportRunInput, RunOutcome};

    /// Serves one request and returns (request line, body).
    fn serve_once(response_body: &'static str) -> (String, thread::JoinHandle<(String, String)>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local server");
        let address = listener.local_addr().expect("local address");
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut reader = BufReader::new(stream.try_clone().expect("clone stream"));
            let mut request_line = String::new();
            reader
                .read_line(&mut request_line)
                .expect("read request line");
            let mut content_length = 0;
            loop {
                let mut header = String::new();
                reader.read_line(&mut header).expect("read header");
                if header == "\r\n" {
                    break;
                }
                if let Some(value) = header.to_ascii_lowercase().strip_prefix("content-length:") {
                    content_length = value.trim().parse().expect("content length");
                }
            }
            let mut body = vec![0; content_length];
            reader.read_exact(&mut body).expect("read body");
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            )
            .expect("write response");
            (request_line, String::from_utf8(body).expect("utf8 body"))
        });
        (format!("http://{address}"), handle)
    }

    #[test]
    fn report_run_posts_the_trajectory() {
        let (url, server) = serve_once(
            r#"{"run_id":"run_1","outcome":"success","redactions_applied":0,"created_at_unix_ms":1}"#,
        );
        let client = Energon::new(&url, "eos_live_test").expect("client");
        let receipt = client
            .report_run(ReportRunInput {
                task: " restart nginx ".to_owned(),
                steps: serde_json::json!([{ "role": "assistant", "content": "systemctl restart nginx" }]),
                outcome: RunOutcome::Success,
                metadata: None,
            })
            .expect("report run");
        let (request_line, body) = server.join().expect("server");
        assert_eq!(receipt.run_id, "run_1");
        assert_eq!(request_line, "POST /v1/runs HTTP/1.1\r\n");
        let body: serde_json::Value = serde_json::from_str(&body).expect("json body");
        assert_eq!(body["task"], "restart nginx");
        assert_eq!(body["outcome"], "success");
        assert!(body.get("metadata").is_none());
    }

    #[test]
    fn system_prompt_appends_live_compiled_rules() {
        let (url, server) = serve_once(
            r###"{"version":{"version_id":"v","number":2,"kind":"compiled","base_model":"q","instructions":"## Learned rules\n- Verify first.","adapter":null,"lift_pts":4.0,"status":"live","decision":"released","eval":{"suite":"s","held_out_tasks":16,"runs_per_task":5,"base_success":0.5,"previous_success":null,"candidate_success":0.54,"candidate_spread":0.01}}}"###,
        );
        let client = Energon::new(&url, "eos_live_test").expect("client");
        let prompt = client
            .system_prompt("You are an operator.")
            .expect("prompt");
        server.join().expect("server");
        assert_eq!(
            prompt,
            "You are an operator.\n\n## Learned rules\n- Verify first."
        );
    }

    #[test]
    fn remember_sends_private_memory_with_agent_authorization() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local server");
        let address = listener.local_addr().expect("local address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let reader_stream = stream.try_clone().expect("clone stream");
            let mut reader = BufReader::new(reader_stream);
            let mut request_line = String::new();
            reader
                .read_line(&mut request_line)
                .expect("read request line");
            assert_eq!(request_line, "POST /v1/memory/write HTTP/1.1\r\n");

            let mut content_length = 0;
            let mut authorization = String::new();
            loop {
                let mut header = String::new();
                reader.read_line(&mut header).expect("read header");
                if header == "\r\n" {
                    break;
                }
                let header_lower = header.to_ascii_lowercase();
                if let Some(value) = header_lower.strip_prefix("content-length: ") {
                    content_length = value.trim().parse::<usize>().expect("content length");
                }
                if let Some(value) = header_lower.strip_prefix("authorization: ") {
                    authorization = value.trim().to_owned();
                }
            }
            assert_eq!(authorization, "bearer eos_live_test");
            let mut body = vec![0; content_length];
            reader.read_exact(&mut body).expect("read body");
            let body = String::from_utf8(body).expect("utf8 body");
            assert!(body.contains("\"scope\":\"agent_private\""));
            assert!(body.contains("\"content\":\"Private note\""));

            let response = r#"{"memory_id":"mem_1","scope":"agent_private","content":"Private note","tags":["priority"],"created_at_unix_ms":1}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                response.len(),
                response
            ).expect("write response");
        });

        let client = Energon::new(&format!("http://{address}"), "eos_live_test").expect("client");
        let memory = client
            .remember(RememberInput {
                content: " Private note ".to_owned(),
                tags: vec![" priority ".to_owned()],
                source: None,
            })
            .expect("memory response");
        server.join().expect("server thread");
        assert_eq!(memory.memory_id, "mem_1");
        assert_eq!(memory.tags, vec!["priority"]);
    }

    #[test]
    fn rejects_invalid_agent_configuration() {
        assert!(Energon::new("ftp://api.energon.test", "eos_live_test").is_err());
        assert!(Energon::new("https://api.energon.test", " ").is_err());
    }
}
