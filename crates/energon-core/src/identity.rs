use serde::{Deserialize, Serialize};

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
}
