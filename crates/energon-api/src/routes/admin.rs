use axum::{Json, extract::State, http::HeaderMap};
use energon_core::AgentIdentity;
use serde::{Deserialize, Serialize};

use crate::{
    errors::ApiError,
    middleware::auth::require_admin,
    secrets::{generate_api_key, hash_api_key},
    state::{AppState, StorageBackend, now_unix_ms},
};

#[derive(Debug, Deserialize)]
pub struct CreateAgentRequest {
    pub agent_id: String,
    pub org_id: String,
    #[serde(default)]
    pub role_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateAgentResponse {
    pub agent_id: String,
    pub org_id: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
    pub api_key_id: String,
    pub api_key: String,
}

pub async fn create_agent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateAgentRequest>,
) -> Result<Json<CreateAgentResponse>, ApiError> {
    require_admin(&state, &headers)?;

    let StorageBackend::Postgres(pool) = &state.storage else {
        return Err(ApiError::BadRequest(
            "agent API key creation requires Postgres storage".to_owned(),
        ));
    };

    let agent = AgentIdentity::new(
        required_text(request.agent_id, "agent_id")?,
        required_text(request.org_id, "org_id")?,
        request.role_id.filter(|value| !value.trim().is_empty()),
        request.project_id.filter(|value| !value.trim().is_empty()),
    );
    let name = request
        .name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| agent.agent_id.clone());
    let pepper =
        state.auth.api_key_pepper.as_deref().ok_or_else(|| {
            ApiError::Internal("ENERGON_API_KEY_PEPPER is not configured".to_owned())
        })?;
    let api_key = generate_api_key();
    let key_hash = hash_api_key(&api_key, pepper);
    let api_key_id = format!("key_{}_{}", now_unix_ms(), agent.agent_id);

    energon_db::identity::create_agent_with_api_key(pool, &agent, &name, &api_key_id, &key_hash)
        .await?;

    Ok(Json(CreateAgentResponse {
        agent_id: agent.agent_id,
        org_id: agent.org_id,
        role_id: agent.role_id,
        project_id: agent.project_id,
        api_key_id,
        api_key,
    }))
}

fn required_text(value: String, field: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_owned();

    if value.is_empty() {
        return Err(ApiError::BadRequest(format!("{field} cannot be empty")));
    }

    Ok(value)
}
