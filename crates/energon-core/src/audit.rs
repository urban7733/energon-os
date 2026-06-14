use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuditRecord {
    pub request_id: String,
    pub agent_id: String,
    pub org_id: String,
    pub task: String,
    pub allowed_memory_ids: Vec<String>,
    pub denied_memory_count: usize,
    pub token_budget: usize,
    pub estimated_tokens: usize,
    pub created_at_unix_ms: u128,
}
