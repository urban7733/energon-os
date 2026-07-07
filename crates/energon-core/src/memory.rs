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

impl PromoteMemoryRequest {
    pub fn validate(&self) -> Result<(), EnergonError> {
        if self.reason.trim().is_empty() {
            return Err(EnergonError::EmptyPromotionReason);
        }

        if !self.target_scope.is_shared_promotion_target() {
            return Err(EnergonError::InvalidPromotionTarget);
        }

        Ok(())
    }
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

        let record = Self {
            memory_id: memory_id.into(),
            org_id: agent.org_id.clone(),
            scope: request.scope,
            content: request.content.trim().to_owned(),
            tags: clean_tags(request.tags),
            project_id: clean_optional(request.project_id).or_else(|| agent.project_id.clone()),
            role_id: clean_optional(request.role_id).or_else(|| agent.role_id.clone()),
            owner_agent_id: Some(agent.agent_id.clone()),
            user_id: clean_optional(request.user_id),
            session_id: clean_optional(request.session_id),
            source: clean_optional(request.source),
            promoted_from: None,
            created_at_unix_ms,
        };

        record.validate_scope_metadata()?;

        Ok(record)
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

        if self.scope != MemoryScope::AgentPrivate {
            return Err(EnergonError::InvalidPromotionSource);
        }

        let (project_id, role_id) = shared_metadata_for_target(&target_scope, self);
        let promoted = Self {
            memory_id: memory_id.into(),
            scope: target_scope,
            project_id,
            role_id,
            owner_agent_id: None,
            user_id: None,
            session_id: None,
            promoted_from: Some(self.memory_id.clone()),
            created_at_unix_ms,
            ..self.clone()
        };

        promoted.validate_scope_metadata()?;

        Ok(promoted)
    }

    fn validate_scope_metadata(&self) -> Result<(), EnergonError> {
        match self.scope {
            MemoryScope::Project if missing(&self.project_id) => {
                Err(EnergonError::MissingProjectId)
            }
            MemoryScope::Role if missing(&self.role_id) => Err(EnergonError::MissingRoleId),
            MemoryScope::UserPrivate if missing(&self.user_id) => Err(EnergonError::MissingUserId),
            MemoryScope::Session if missing(&self.session_id) => {
                Err(EnergonError::MissingSessionId)
            }
            _ => Ok(()),
        }
    }
}

fn shared_metadata_for_target(
    target_scope: &MemoryScope,
    source: &MemoryRecord,
) -> (Option<String>, Option<String>) {
    match target_scope {
        MemoryScope::Project => (source.project_id.clone(), None),
        MemoryScope::Role => (None, source.role_id.clone()),
        _ => (None, None),
    }
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn clean_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn missing(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(|value| value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use crate::{
        AgentIdentity, EnergonError,
        memory::{MemoryRecord, MemoryScope, PromoteMemoryRequest, WriteMemoryRequest},
    };

    fn agent() -> AgentIdentity {
        AgentIdentity::new(
            "agent_777",
            "org_1",
            Some("strategist".to_owned()),
            Some("apex_verify".to_owned()),
        )
    }

    fn write_request(scope: MemoryScope) -> WriteMemoryRequest {
        WriteMemoryRequest {
            scope,
            content: "Investor positioning memory".to_owned(),
            tags: vec![" investor ".to_owned(), "".to_owned()],
            project_id: None,
            role_id: None,
            user_id: None,
            session_id: None,
            source: None,
        }
    }

    #[test]
    fn write_trims_tags_and_defaults_agent_scope_metadata() {
        let record =
            MemoryRecord::from_write("mem_1", &agent(), write_request(MemoryScope::Project), 1)
                .expect("project memory should use the agent project");

        assert_eq!(record.project_id.as_deref(), Some("apex_verify"));
        assert_eq!(record.tags, vec!["investor"]);
    }

    #[test]
    fn user_private_memory_requires_user_id() {
        let error = MemoryRecord::from_write(
            "mem_1",
            &agent(),
            write_request(MemoryScope::UserPrivate),
            1,
        )
        .expect_err("user_private memory must name a user");

        assert_eq!(error, EnergonError::MissingUserId);
    }

    #[test]
    fn promotion_requires_non_empty_reason() {
        let request = PromoteMemoryRequest {
            memory_id: "mem_1".to_owned(),
            target_scope: MemoryScope::Project,
            reason: " ".to_owned(),
        };

        assert_eq!(request.validate(), Err(EnergonError::EmptyPromotionReason));
    }

    #[test]
    fn promoted_copy_only_allows_agent_private_sources() {
        let source =
            MemoryRecord::from_write("mem_1", &agent(), write_request(MemoryScope::Org), 1)
                .expect("org memory should be valid");

        let error = source
            .promoted_copy("mem_2", MemoryScope::Project, 2)
            .expect_err("shared memory cannot be promoted again");

        assert_eq!(error, EnergonError::InvalidPromotionSource);
    }

    #[test]
    fn promoted_copy_clears_private_metadata() {
        let mut request = write_request(MemoryScope::AgentPrivate);
        request.user_id = Some("user_1".to_owned());
        request.session_id = Some("session_1".to_owned());
        let source = MemoryRecord::from_write("mem_1", &agent(), request, 1)
            .expect("agent private source should be valid");

        let promoted = source
            .promoted_copy("mem_2", MemoryScope::Project, 2)
            .expect("agent private source can promote to project");

        assert_eq!(promoted.scope, MemoryScope::Project);
        assert_eq!(promoted.project_id.as_deref(), Some("apex_verify"));
        assert_eq!(promoted.owner_agent_id, None);
        assert_eq!(promoted.user_id, None);
        assert_eq!(promoted.session_id, None);
        assert_eq!(promoted.promoted_from.as_deref(), Some("mem_1"));
    }
}
