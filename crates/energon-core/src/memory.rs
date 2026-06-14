use serde::{Deserialize, Serialize};

use crate::{EnergonError, identity::AgentIdentity};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MemoryScope {
    Open,
    Org,
    Project,
    Role,
    AgentPrivate,
    UserPrivate,
    Session,
}

impl MemoryScope {
    pub fn is_shared_promotion_target(&self) -> bool {
        matches!(
            self,
            MemoryScope::Open | MemoryScope::Org | MemoryScope::Project | MemoryScope::Role
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WriteMemoryRequest {
    pub scope: MemoryScope,
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub role_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

impl WriteMemoryRequest {
    pub fn validate(&self) -> Result<(), EnergonError> {
        if self.content.trim().is_empty() {
            return Err(EnergonError::EmptyMemory);
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PromoteMemoryRequest {
    pub memory_id: String,
    pub target_scope: MemoryScope,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MemoryRecord {
    pub memory_id: String,
    pub org_id: String,
    pub scope: MemoryScope,
    pub content: String,
    pub tags: Vec<String>,
    pub project_id: Option<String>,
    pub role_id: Option<String>,
    pub owner_agent_id: Option<String>,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub source: Option<String>,
    pub promoted_from: Option<String>,
    pub created_at_unix_ms: u128,
}

impl MemoryRecord {
    pub fn from_write(
        memory_id: impl Into<String>,
        agent: &AgentIdentity,
        request: WriteMemoryRequest,
        created_at_unix_ms: u128,
    ) -> Result<Self, EnergonError> {
        request.validate()?;

        Ok(Self {
            memory_id: memory_id.into(),
            org_id: agent.org_id.clone(),
            scope: request.scope,
            content: request.content.trim().to_owned(),
            tags: request.tags,
            project_id: request.project_id.or_else(|| agent.project_id.clone()),
            role_id: request.role_id.or_else(|| agent.role_id.clone()),
            owner_agent_id: Some(agent.agent_id.clone()),
            user_id: request.user_id,
            session_id: request.session_id,
            source: request.source,
            promoted_from: None,
            created_at_unix_ms,
        })
    }

    pub fn promoted_copy(
        &self,
        memory_id: impl Into<String>,
        target_scope: MemoryScope,
        created_at_unix_ms: u128,
    ) -> Result<Self, EnergonError> {
        if !target_scope.is_shared_promotion_target() {
            return Err(EnergonError::InvalidPromotionTarget);
        }

        Ok(Self {
            memory_id: memory_id.into(),
            scope: target_scope,
            promoted_from: Some(self.memory_id.clone()),
            created_at_unix_ms,
            ..self.clone()
        })
    }
}
