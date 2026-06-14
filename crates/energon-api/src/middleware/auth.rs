use axum::http::HeaderMap;
use energon_core::AgentIdentity;

use crate::{
    errors::ApiError,
    secrets::hash_api_key,
    state::{AppState, StorageBackend},
};

pub async fn identity_from_request(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AgentIdentity, ApiError> {
    if let Some(api_key) = bearer_token(headers) {
        return identity_from_api_key(state, &api_key).await;
    }

    if state.auth.dev_identity_headers {
        return identity_from_headers(headers);
    }

    Err(ApiError::Unauthorized(
        "missing bearer API key in Authorization header".to_owned(),
    ))
}

pub fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let configured_token = state.auth.admin_token.as_deref().ok_or_else(|| {
        ApiError::Unauthorized("ENERGON_ADMIN_TOKEN is not configured".to_owned())
    })?;

    let provided_token = required_header(headers, "x-energon-admin-token")?;

    if provided_token != configured_token {
        return Err(ApiError::Unauthorized("invalid admin token".to_owned()));
    }

    Ok(())
}

fn identity_from_headers(headers: &HeaderMap) -> Result<AgentIdentity, ApiError> {
    let agent_id = required_header(headers, "x-energon-agent-id")?;
    let org_id = required_header(headers, "x-energon-org-id")?;
    let role_id = optional_header(headers, "x-energon-role-id");
    let project_id = optional_header(headers, "x-energon-project-id");

    Ok(AgentIdentity::new(agent_id, org_id, role_id, project_id))
}

async fn identity_from_api_key(state: &AppState, api_key: &str) -> Result<AgentIdentity, ApiError> {
    let StorageBackend::Postgres(pool) = &state.storage else {
        return Err(ApiError::Unauthorized(
            "bearer API keys require Postgres storage".to_owned(),
        ));
    };

    let pepper = state.auth.api_key_pepper.as_deref().ok_or_else(|| {
        ApiError::Unauthorized("ENERGON_API_KEY_PEPPER is not configured".to_owned())
    })?;
    let key_hash = hash_api_key(api_key, pepper);

    energon_db::identity::agent_for_api_key_hash(pool, &key_hash)
        .await?
        .ok_or_else(|| ApiError::Unauthorized("invalid or revoked API key".to_owned()))
}

fn required_header(headers: &HeaderMap, name: &str) -> Result<String, ApiError> {
    optional_header(headers, name)
        .ok_or_else(|| ApiError::Unauthorized(format!("missing required identity header: {name}")))
}

fn optional_header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let header = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .trim();

    header
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
