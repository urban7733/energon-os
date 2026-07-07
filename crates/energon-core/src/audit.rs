use serde::{Deserialize, Serialize};

use crate::memory::MemoryScope;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PromotionAuditRecord {
    pub promotion_id: String,
    pub source_memory_id: String,
    pub promoted_memory_id: String,
    pub agent_id: String,
    pub org_id: String,
    pub target_scope: MemoryScope,
    pub reason: String,
    pub created_at_unix_ms: u128,
}
