use axum::{Json, extract::State, http::HeaderMap, response::Response};
use energon_core::AgentIdentity;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    errors::ApiError,
    payments::record_usage,
    secrets::{generate_api_key, hash_api_key},
    state::{AppState, StorageBackend, now_unix_ms},
    x402::{PaidRoute, attach_payment_response},
};

const DEFAULT_AGENT_NAME: &str = "Autonomous agent";
const MAX_AGENT_NAME_CHARS: usize = 120;

#[derive(Debug, Deserialize)]
pub struct RegisterAgentRequest {
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterAgentResponse {
    pub agent_id: String,
    pub org_id: String,
    pub api_key_id: String,
    /// Returned exactly once; only the peppered hash is stored.
    pub api_key: String,
    pub authentication: &'static str,
    pub verify_at: &'static str,
}

/// Machine-readable entrypoint for autonomous clients.
pub async fn agent_discovery(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "service": "Energon OS",
        "audiences": ["human_operator", "autonomous_agent"],
        "selfRegistration": {
            "enabled": state.agent_self_registration,
            "method": "POST",
            "endpoint": "/v1/agents/register",
            "payment": if state.x402.enabled { "x402" } else { "disabled" }
        },
        "authentication": {
            "scheme": "Bearer",
            "credential": "api_key",
            "verifyAt": "/v1/swarm/runtime"
        },
        "x402Status": "/v1/billing/x402"
    }))
}

/// Register an autonomous agent into a server-generated isolated workspace.
/// In production, enabling this route requires verified x402 configuration.
pub async fn register_agent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RegisterAgentRequest>,
) -> Result<Response, ApiError> {
    if !state.agent_self_registration {
        return Err(ApiError::Forbidden(
            "autonomous agent registration is not enabled".to_owned(),
        ));
    }

    let StorageBackend::Postgres(pool) = &state.storage else {
        return Err(ApiError::BadRequest(
            "autonomous agent registration requires Postgres storage".to_owned(),
        ));
    };
    let pepper =
        state.auth.api_key_pepper.as_deref().ok_or_else(|| {
            ApiError::Internal("ENERGON_API_KEY_PEPPER is not configured".to_owned())
        })?;
    let name = clean_agent_name(request.name)?;
    let payment = state
        .x402
        .require_payment(&headers, PaidRoute::AgentRegister)
        .await?;

    let api_key = generate_api_key();
    let registration_token = api_key
        .strip_prefix("eos_live_")
        .unwrap_or(&api_key)
        .chars()
        .take(20)
        .collect::<String>();
    let agent_id = format!("agent_auto_{registration_token}");
    let org_id = format!("org_auto_{registration_token}");
    let api_key_id = format!("key_{}_{}", now_unix_ms(), agent_id);
    let key_hash = hash_api_key(&api_key, pepper);
    let agent = AgentIdentity::new(agent_id.clone(), org_id.clone(), None, None);

    energon_db::identity::create_agent_with_api_key(pool, &agent, &name, &api_key_id, &key_hash)
        .await?;
    record_usage(&state, &agent, PaidRoute::AgentRegister, &payment).await;

    let response = Json(RegisterAgentResponse {
        agent_id,
        org_id,
        api_key_id,
        api_key,
        authentication: "Bearer",
        verify_at: "/v1/swarm/runtime",
    });

    Ok(attach_payment_response(response, payment.response_header))
}

fn clean_agent_name(name: Option<String>) -> Result<String, ApiError> {
    let name = name
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_AGENT_NAME.to_owned());

    if name.chars().count() > MAX_AGENT_NAME_CHARS {
        return Err(ApiError::BadRequest(format!(
            "name must be at most {MAX_AGENT_NAME_CHARS} characters"
        )));
    }

    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registration_name_defaults_and_trims() {
        assert_eq!(clean_agent_name(None).unwrap(), DEFAULT_AGENT_NAME);
        assert_eq!(
            clean_agent_name(Some("  research agent  ".to_owned())).unwrap(),
            "research agent"
        );
    }

    #[test]
    fn registration_name_is_bounded() {
        let error = clean_agent_name(Some("a".repeat(MAX_AGENT_NAME_CHARS + 1))).unwrap_err();
        assert!(matches!(error, ApiError::BadRequest(_)));
    }
}
