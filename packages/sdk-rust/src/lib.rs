//! Server-side Rust client for the Energon OS control plane.
//!
//! The client authenticates one agent with its API key. Identity and policy
//! boundaries are derived by the control plane, never accepted from SDK input.

use std::{error::Error, fmt, time::Duration};

use reqwest::{StatusCode, Url, blocking::Client, redirect::Policy};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

pub const SDK_VERSION: &str = "0.1.0";
const MAX_DREAM_INSPIRATIONS: usize = 16;

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

/// A speculative reflection. Dreams never enter factual context retrieval.
#[derive(Debug, Clone, Deserialize)]
pub struct AgentDream {
    #[serde(flatten)]
    pub memory: AgentMemory,
    pub speculative: bool,
    /// Present on shared excerpts: who shared it, where, and why.
    #[serde(default)]
    pub sharing: Option<serde_json::Value>,
    /// Memories or dreams this reflection builds on (private originals only).
    #[serde(default)]
    pub inspired_by: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct RecordDreamInput {
    pub content: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub inspired_by: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShareDreamInput {
    pub dream_id: String,
    /// The explicit excerpt to publish. The private body is never copied.
    pub content: String,
    /// One of `open`, `org`, `project`, or `role`.
    pub target_scope: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

/// Filters for one newest-first journal page.
#[derive(Debug, Clone, Default)]
pub struct DreamQuery {
    /// 1 to 100; the server defaults to 100.
    pub limit: Option<u32>,
    /// `next_cursor` from a previous page.
    pub cursor: Option<String>,
    /// `all`, `private`, or `shared`.
    pub view: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DreamPage {
    pub dreams: Vec<AgentDream>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ForgottenDream {
    pub dream_id: String,
    pub forgotten: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContextItem {
    pub memory_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContextPack {
    pub request_id: String,
    pub agent_id: String,
    pub task: String,
    pub token_budget: u32,
    pub estimated_tokens: u32,
    pub context_pack: Vec<String>,
    #[serde(default)]
    pub items: Vec<ContextItem>,
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
    /// Connects over HTTPS (plain HTTP is accepted only for loopback hosts).
    pub fn new(base_url: &str, api_key: &str) -> Result<Self> {
        Self::build(base_url, api_key, false)
    }

    /// Like [`Energon::new`], but also accepts plain HTTP to non-loopback
    /// hosts. The API key then travels unencrypted: use this only inside a
    /// trusted private network, such as a Docker network.
    pub fn new_allowing_insecure_http(base_url: &str, api_key: &str) -> Result<Self> {
        Self::build(base_url, api_key, true)
    }

    fn build(base_url: &str, api_key: &str, allow_insecure_http: bool) -> Result<Self> {
        let base_url = normalise_base_url(base_url, allow_insecure_http)?;
        let api_key = required_text(api_key, "api_key")?;
        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            // The control plane never redirects; never carry the key elsewhere.
            .redirect(Policy::none())
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

    /// Stores a private, speculative dream generated by your runtime.
    pub fn record_dream(&self, input: RecordDreamInput) -> Result<AgentDream> {
        let mut inspired_by = Vec::new();
        for id in normalise_list(input.inspired_by, "inspired_by")? {
            if !inspired_by.contains(&id) {
                inspired_by.push(id);
            }
        }
        let body = RecordDreamInput {
            content: required_text(&input.content, "content")?,
            tags: normalise_list(input.tags, "tags")?,
            inspired_by,
        };
        self.send("POST", "/v1/dreams", Some(&body))
    }

    /// Builds permitted context, lets `generate` dream on it, and stores the
    /// result privately, citing the context items. `None` keeps no dream.
    /// Never shares.
    pub fn reflect<F>(&self, input: BuildContextInput, generate: F) -> Result<Option<AgentDream>>
    where
        F: FnOnce(&ContextPack) -> Option<String>,
    {
        let context = self.build_context(input)?;
        let Some(content) = generate(&context) else {
            return Ok(None);
        };
        let inspired_by = context
            .items
            .iter()
            .take(MAX_DREAM_INSPIRATIONS)
            .map(|item| item.memory_id.clone())
            .collect();
        self.record_dream(RecordDreamInput {
            content,
            tags: Vec::new(),
            inspired_by,
        })
        .map(Some)
    }

    /// One newest-first page of the dreams this agent may read.
    pub fn list_dreams(&self, query: DreamQuery) -> Result<DreamPage> {
        let mut url = Url::parse(&format!("{}/v1/dreams", self.base_url))
            .map_err(|_| EnergonError::InvalidInput("invalid base_url".to_owned()))?;
        {
            let mut params = url.query_pairs_mut();
            if let Some(limit) = query.limit {
                if !(1..=100).contains(&limit) {
                    return Err(EnergonError::InvalidInput(
                        "limit must be from 1 to 100".to_owned(),
                    ));
                }
                params.append_pair("limit", &limit.to_string());
            }
            if let Some(cursor) = query.cursor.as_deref() {
                params.append_pair("cursor", cursor);
            }
            if let Some(view) = query.view.as_deref() {
                if !matches!(view, "all" | "private" | "shared") {
                    return Err(EnergonError::InvalidInput(
                        "view must be all, private, or shared".to_owned(),
                    ));
                }
                params.append_pair("view", view);
            }
            if let Some(tag) = query.tag.as_deref().map(str::trim)
                && !tag.is_empty()
            {
                params.append_pair("tag", tag);
            }
        }
        let path = match url.query() {
            Some(query) if !query.is_empty() => format!("/v1/dreams?{query}"),
            _ => "/v1/dreams".to_owned(),
        };
        self.send::<(), _>("GET", &path, None)
    }

    pub fn get_dream(&self, dream_id: &str) -> Result<AgentDream> {
        let path = format!("/v1/dreams/{}", path_segment(dream_id, "dream_id")?);
        self.send::<(), _>("GET", &path, None)
    }

    /// Publishes an explicit excerpt of an own private dream.
    pub fn share_dream(&self, input: ShareDreamInput) -> Result<AgentDream> {
        if !matches!(
            input.target_scope.as_str(),
            "open" | "org" | "project" | "role"
        ) {
            return Err(EnergonError::InvalidInput(
                "target_scope must be open, org, project, or role".to_owned(),
            ));
        }
        let body = ShareDreamInput {
            dream_id: required_text(&input.dream_id, "dream_id")?,
            content: required_text(&input.content, "content")?,
            target_scope: input.target_scope,
            reason: required_text(&input.reason, "reason")?,
            tags: normalise_list(input.tags, "tags")?,
        };
        self.send("POST", "/v1/dreams/share", Some(&body))
    }

    /// Hard-deletes an own private dream, or retracts an excerpt this agent shared.
    pub fn forget_dream(&self, dream_id: &str) -> Result<ForgottenDream> {
        let path = format!("/v1/dreams/{}", path_segment(dream_id, "dream_id")?);
        self.send::<(), _>("DELETE", &path, None)
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

fn normalise_base_url(value: &str, allow_insecure_http: bool) -> Result<String> {
    let value = required_text(value, "base_url")?;
    let url = Url::parse(&value).map_err(|_| {
        EnergonError::InvalidInput("base_url must be an absolute http or https URL".to_owned())
    })?;
    if !matches!(url.scheme(), "http" | "https") || url.host().is_none() {
        return Err(EnergonError::InvalidInput(
            "base_url must be an absolute http or https URL".to_owned(),
        ));
    }
    if url.scheme() == "http" && !allow_insecure_http && !is_loopback(&url) {
        return Err(EnergonError::InvalidInput(
            "base_url must use https; plain http would expose the API key".to_owned(),
        ));
    }
    Ok(value.trim_end_matches('/').to_owned())
}

fn is_loopback(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_start_matches('[').trim_end_matches(']');
    host == "localhost"
        || host.ends_with(".localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

/// Percent-encodes an id so it stays one path segment.
fn path_segment(value: &str, field: &str) -> Result<String> {
    let value = required_text(value, field)?;
    let mut url = Url::parse("https://energon.invalid/")
        .map_err(|_| EnergonError::InvalidInput("invalid path".to_owned()))?;
    url.path_segments_mut()
        .map_err(|_| EnergonError::InvalidInput("invalid path".to_owned()))?
        .push(&value);
    Ok(url.path().trim_start_matches('/').to_owned())
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

    use super::{Energon, RememberInput};

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

    #[test]
    fn plain_http_is_only_for_loopback_or_explicit_opt_in() {
        assert!(Energon::new("http://api.energon.test", "eos_live_test").is_err());
        assert!(Energon::new("http://127.0.0.1:3001", "eos_live_test").is_ok());
        assert!(Energon::new("http://localhost:3001", "eos_live_test").is_ok());
        assert!(Energon::new("http://[::1]:3001", "eos_live_test").is_ok());
        assert!(
            Energon::new_allowing_insecure_http("http://energon-api:3000", "eos_live_test").is_ok()
        );
    }

    #[test]
    fn dream_ids_stay_a_single_path_segment() {
        assert_eq!(
            super::path_segment("dream 1/../x", "dream_id").unwrap(),
            "dream%201%2F..%2Fx"
        );
    }

    #[test]
    fn dream_journal_pages_and_forgets_over_http() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local server");
        let address = listener.local_addr().expect("local address");
        let server = thread::spawn(move || {
            let mut request_lines = Vec::new();
            let responses = [
                r#"{"dreams":[{"memory_id":"dream_1","scope":"agent_private","content":"idea","tags":["growth"],"created_at_unix_ms":5,"speculative":true,"sharing":null,"inspired_by":["mem_1"]}],"next_cursor":"5:dream_1"}"#,
                r#"{"dream_id":"dream_1","forgotten":true}"#,
            ];
            for response in responses {
                let (mut stream, _) = listener.accept().expect("accept request");
                let mut reader = BufReader::new(stream.try_clone().expect("clone stream"));
                let mut request_line = String::new();
                reader.read_line(&mut request_line).expect("read line");
                loop {
                    let mut header = String::new();
                    reader.read_line(&mut header).expect("read header");
                    if header == "\r\n" {
                        break;
                    }
                }
                request_lines.push(request_line);
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    response.len(),
                    response
                )
                .expect("write response");
            }
            request_lines
        });

        let client = Energon::new(&format!("http://{address}"), "eos_live_test").expect("client");
        let page = client
            .list_dreams(super::DreamQuery {
                limit: Some(1),
                view: Some("private".to_owned()),
                tag: Some("growth".to_owned()),
                ..Default::default()
            })
            .expect("page");
        let forgotten = client.forget_dream("dream_1").expect("forget");
        let request_lines = server.join().expect("server thread");

        assert_eq!(page.dreams[0].memory.memory_id, "dream_1");
        assert_eq!(page.dreams[0].inspired_by, vec!["mem_1"]);
        assert_eq!(page.next_cursor.as_deref(), Some("5:dream_1"));
        assert!(forgotten.forgotten);
        assert_eq!(
            request_lines[0],
            "GET /v1/dreams?limit=1&view=private&tag=growth HTTP/1.1\r\n"
        );
        assert_eq!(request_lines[1], "DELETE /v1/dreams/dream_1 HTTP/1.1\r\n");
    }
}
