use axum::{Json, extract::State, http::HeaderMap};
use energon_core::AgentIdentity;
use serde::Serialize;

use crate::{errors::ApiError, middleware::auth::identity_from_request, state::AppState};

/// Authenticated SDK handshake. Identity is resolved exclusively from the
/// agent credential, making this the safe source of runtime topology for SDKs.
pub async fn swarm_runtime(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SwarmRuntimeResponse>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    Ok(Json(SwarmRuntimeResponse::from(agent)))
}

#[derive(Debug, Serialize)]
pub struct SwarmRuntimeResponse {
    pub contract_version: &'static str,
    pub swarm_id: String,
    pub agent: RuntimeAgent,
    pub guarantees: RuntimeGuarantees,
    pub capabilities: [&'static str; 5],
}

#[derive(Debug, Serialize)]
pub struct RuntimeAgent {
    pub agent_id: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RuntimeGuarantees {
    pub permission_filter_before_retrieval: bool,
    pub private_memory_by_default: bool,
    pub explicit_shared_promotion: bool,
    pub context_audit: bool,
}

impl From<AgentIdentity> for SwarmRuntimeResponse {
    fn from(agent: AgentIdentity) -> Self {
        Self {
            contract_version: "v1",
            swarm_id: agent.org_id,
            agent: RuntimeAgent {
                agent_id: agent.agent_id,
                role_id: agent.role_id,
                project_id: agent.project_id,
            },
            guarantees: RuntimeGuarantees {
                permission_filter_before_retrieval: true,
                private_memory_by_default: true,
                explicit_shared_promotion: true,
                context_audit: true,
            },
            capabilities: [
                "memory.private.write",
                "memory.shared.promote",
                "context.permissioned.build",
                "audit.context.read",
                "audit.promotion.read",
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use energon_core::AgentIdentity;

    use super::SwarmRuntimeResponse;

    #[test]
    fn runtime_is_derived_from_authenticated_identity() {
        let response = SwarmRuntimeResponse::from(AgentIdentity::new(
            "agent_1",
            "swarm_1",
            Some("research".to_owned()),
            Some("project_1".to_owned()),
        ));

        assert_eq!(response.swarm_id, "swarm_1");
        assert_eq!(response.agent.agent_id, "agent_1");
        assert!(response.guarantees.permission_filter_before_retrieval);
    }
}
