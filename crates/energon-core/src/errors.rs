use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EnergonError {
    #[error("memory content cannot be empty")]
    EmptyMemory,
    #[error("promotion reason cannot be empty")]
    EmptyPromotionReason,
    #[error("memory not found: {0}")]
    MemoryNotFound(String),
    #[error("agent {agent_id} cannot access memory {memory_id}")]
    PermissionDenied { agent_id: String, memory_id: String },
    #[error("project memory requires a project_id")]
    MissingProjectId,
    #[error("role memory requires a role_id")]
    MissingRoleId,
    #[error("user_private memory requires a user_id")]
    MissingUserId,
    #[error("session memory requires a session_id")]
    MissingSessionId,
    #[error("only agent_private memory can be promoted")]
    InvalidPromotionSource,
    #[error("promotion target must be a shared scope")]
    InvalidPromotionTarget,
}
