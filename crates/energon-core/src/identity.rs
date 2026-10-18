use serde::{Deserialize, Serialize};

use crate::EnergonError;

pub const MAX_IDENTIFIER_CHARS: usize = 128;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentIdentity {
    pub agent_id: String,
    pub org_id: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
}

impl AgentIdentity {
    pub fn new(
        agent_id: impl Into<String>,
        org_id: impl Into<String>,
        role_id: Option<String>,
        project_id: Option<String>,
    ) -> Self {
        Self {
            agent_id: agent_id.into(),
            org_id: org_id.into(),
            role_id,
            project_id,
        }
    }

    /// Validate identifiers supplied by a client before they are persisted.
    /// Ids end up in URLs, log lines, vault file names, and SQL parameters,
    /// so they are restricted to a small, inert character set.
    pub fn validate(&self) -> Result<(), EnergonError> {
        validate_identifier("agent_id", &self.agent_id)?;
        validate_identifier("org_id", &self.org_id)?;
        if let Some(role_id) = &self.role_id {
            validate_identifier("role_id", role_id)?;
        }
        if let Some(project_id) = &self.project_id {
            validate_identifier("project_id", project_id)?;
        }
        Ok(())
    }
}

pub fn validate_identifier(field: &'static str, value: &str) -> Result<(), EnergonError> {
    let valid = !value.is_empty()
        && value.len() <= MAX_IDENTIFIER_CHARS
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.' | b':' | b'@')
        });

    if valid {
        Ok(())
    } else {
        Err(EnergonError::InvalidIdentifier(field))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiers_accept_common_id_shapes() {
        for value in ["agent_777", "org-1", "team.research", "svc:planner", "a@b"] {
            assert!(validate_identifier("agent_id", value).is_ok(), "{value}");
        }
    }

    #[test]
    fn identifiers_reject_injection_and_oversized_values() {
        for value in [
            "",
            "agent 1",
            "../../etc/passwd",
            "<script>",
            "agent\r\nx-energon-org-id: other",
            "agent'; DROP TABLE agents;--",
            "ägent",
        ] {
            assert_eq!(
                validate_identifier("agent_id", value),
                Err(EnergonError::InvalidIdentifier("agent_id")),
                "{value:?}"
            );
        }
        assert!(validate_identifier("agent_id", &"a".repeat(MAX_IDENTIFIER_CHARS)).is_ok());
        assert!(validate_identifier("agent_id", &"a".repeat(MAX_IDENTIFIER_CHARS + 1)).is_err());
    }

    #[test]
    fn identity_validation_covers_optional_scopes() {
        let mut agent = AgentIdentity::new("agent_1", "org_1", None, Some("launch".into()));
        assert!(agent.validate().is_ok());
        agent.role_id = Some("bad role".into());
        assert_eq!(
            agent.validate(),
            Err(EnergonError::InvalidIdentifier("role_id"))
        );
    }
}
