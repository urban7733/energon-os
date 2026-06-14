use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EnergonError {
    #[error("memory content cannot be empty")]
    EmptyMemory,
    #[error("memory not found: {0}")]
    MemoryNotFound(String),
    #[error("agent {agent_id} cannot access memory {memory_id}")]
    PermissionDenied { agent_id: String, memory_id: String },
    #[error("promotion target must be a shared scope")]
    InvalidPromotionTarget,
}
