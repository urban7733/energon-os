use std::collections::HashSet;

use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::{
    errors::ApiError,
    jwt::operator_from_request,
    middleware::auth::identity_from_request,
    state::{AppState, StorageBackend},
};

const MAX_NAME_CHARS: usize = 120;
const MAX_INSTRUCTION_CHARS: usize = 12_000;
const MAX_LIST_ITEMS: usize = 32;
const MAX_LIST_ITEM_CHARS: usize = 80;

#[derive(Debug, Deserialize)]
pub struct CreateOrgSkillProfileRequest {
    pub scope: String,
    pub name: String,
    pub instructions: String,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub requires_approval_for: Vec<String>,
    pub assigned_agent_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOwnSkillProfileRequest {
    pub name: String,
    pub instructions: String,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub requires_approval_for: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct SkillProfileResponse {
    pub skill_id: String,
    pub scope: String,
    pub name: String,
    /// User- or agent-authored data. Consumers must not treat this as a
    /// trusted system instruction and it never executes code in Energon.
    pub instructions: String,
    pub allowed_tools: Vec<String>,
    pub requires_approval_for: Vec<String>,
    pub version: i32,
    pub created_by_kind: String,
    pub created_by_id: String,
    pub created_at_unix_ms: i64,
    pub assigned_agent_ids: Vec<String>,
    pub executable: bool,
}

#[derive(Debug, Serialize)]
pub struct ListSkillProfilesResponse {
    pub org_id: String,
    pub skills: Vec<SkillProfileResponse>,
}

/// `POST /v1/orgs/{org_id}/skills` — an operator creates and assigns a
/// declarative skill profile. An `org` skill can be assigned to several
/// agents; an `agent_private` skill must be assigned to exactly one.
pub async fn create_org_skill_profile(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CreateOrgSkillProfileRequest>,
) -> Result<Json<SkillProfileResponse>, ApiError> {
    let operator = operator_from_request(state.jwt.as_ref(), &headers).await?;
    operator.require_org(&org_id)?;
    let pool = postgres_pool(&state)?;

    let scope = skill_scope(request.scope)?;
    let assigned_agent_ids = unique_text_list(request.assigned_agent_ids, "assigned_agent_ids")?;
    if assigned_agent_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "assign a skill profile to at least one agent".to_owned(),
        ));
    }
    if scope == "agent_private" && assigned_agent_ids.len() != 1 {
        return Err(ApiError::BadRequest(
            "agent_private skill profiles must be assigned to exactly one agent".to_owned(),
        ));
    }

    let profile = energon_db::skills::NewSkillProfile {
        skill_id: state.next_skill_id(),
        org_id,
        scope,
        name: required_text(request.name, "name", MAX_NAME_CHARS)?,
        instructions: required_text(request.instructions, "instructions", MAX_INSTRUCTION_CHARS)?,
        allowed_tools: unique_text_list(request.allowed_tools, "allowed_tools")?,
        requires_approval_for: unique_text_list(
            request.requires_approval_for,
            "requires_approval_for",
        )?,
        created_by_kind: "operator".to_owned(),
        created_by_id: operator.user_id,
        assigned_agent_ids,
    };

    let saved = energon_db::skills::create_skill_profile(pool, &profile).await?;
    Ok(Json(skill_profile_response(saved)))
}

/// `GET /v1/orgs/{org_id}/skills` — operator view of all profiles and their
/// assignments. It is intentionally separate from memory management.
pub async fn list_org_skill_profiles(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ListSkillProfilesResponse>, ApiError> {
    let operator = operator_from_request(state.jwt.as_ref(), &headers).await?;
    operator.require_org(&org_id)?;
    let pool = postgres_pool(&state)?;
    let skills = energon_db::skills::list_org_skill_profiles(pool, &org_id)
        .await?
        .into_iter()
        .map(skill_profile_response)
        .collect();

    Ok(Json(ListSkillProfilesResponse { org_id, skills }))
}

/// `POST /v1/skills` — an agent may give itself a private skill profile for
/// personalization. It cannot assign skills to another agent or publish an
/// org-wide profile; those are operator actions.
pub async fn create_own_skill_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateOwnSkillProfileRequest>,
) -> Result<Json<SkillProfileResponse>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let pool = postgres_pool(&state)?;
    let profile = energon_db::skills::NewSkillProfile {
        skill_id: state.next_skill_id(),
        org_id: agent.org_id,
        scope: "agent_private".to_owned(),
        name: required_text(request.name, "name", MAX_NAME_CHARS)?,
        instructions: required_text(request.instructions, "instructions", MAX_INSTRUCTION_CHARS)?,
        allowed_tools: unique_text_list(request.allowed_tools, "allowed_tools")?,
        requires_approval_for: unique_text_list(
            request.requires_approval_for,
            "requires_approval_for",
        )?,
        created_by_kind: "agent".to_owned(),
        created_by_id: agent.agent_id.clone(),
        assigned_agent_ids: vec![agent.agent_id],
    };

    let saved = energon_db::skills::create_skill_profile(pool, &profile).await?;
    Ok(Json(skill_profile_response(saved)))
}

/// `GET /v1/skills` — returns only profiles explicitly assigned to the
/// authenticated agent. This is the retrieval surface an agent runtime uses
/// for personalization; the returned instructions remain untrusted data.
pub async fn list_own_skill_profiles(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ListSkillProfilesResponse>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let pool = postgres_pool(&state)?;
    let skills =
        energon_db::skills::list_agent_skill_profiles(pool, &agent.org_id, &agent.agent_id)
            .await?
            .into_iter()
            .map(skill_profile_response)
            .collect();

    Ok(Json(ListSkillProfilesResponse {
        org_id: agent.org_id,
        skills,
    }))
}

fn postgres_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    match &state.storage {
        StorageBackend::Postgres(pool) => Ok(pool),
        StorageBackend::Memory(_) => Err(ApiError::BadRequest(
            "skill profiles require Postgres storage (set DATABASE_URL)".to_owned(),
        )),
    }
}

fn skill_scope(value: String) -> Result<String, ApiError> {
    match value.trim() {
        "agent_private" | "org" => Ok(value.trim().to_owned()),
        _ => Err(ApiError::BadRequest(
            "scope must be either agent_private or org".to_owned(),
        )),
    }
}

fn required_text(value: String, field: &str, max_chars: usize) -> Result<String, ApiError> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(ApiError::BadRequest(format!("{field} cannot be empty")));
    }
    if value.chars().count() > max_chars {
        return Err(ApiError::BadRequest(format!(
            "{field} must be at most {max_chars} characters"
        )));
    }
    Ok(value)
}

fn unique_text_list(values: Vec<String>, field: &str) -> Result<Vec<String>, ApiError> {
    if values.len() > MAX_LIST_ITEMS {
        return Err(ApiError::BadRequest(format!(
            "{field} may contain at most {MAX_LIST_ITEMS} entries"
        )));
    }

    let mut unique = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let value = value.trim().to_owned();
        if value.is_empty() || value.chars().count() > MAX_LIST_ITEM_CHARS {
            return Err(ApiError::BadRequest(format!(
                "each {field} entry must be 1 to {MAX_LIST_ITEM_CHARS} characters"
            )));
        }
        if unique.insert(value.clone()) {
            result.push(value);
        }
    }
    Ok(result)
}

fn skill_profile_response(profile: energon_db::skills::SkillProfile) -> SkillProfileResponse {
    SkillProfileResponse {
        skill_id: profile.skill_id,
        scope: profile.scope,
        name: profile.name,
        instructions: profile.instructions,
        allowed_tools: profile.allowed_tools,
        requires_approval_for: profile.requires_approval_for,
        version: profile.version,
        created_by_kind: profile.created_by_kind,
        created_by_id: profile.created_by_id,
        created_at_unix_ms: profile.created_at_unix_ms,
        assigned_agent_ids: profile.assigned_agent_ids,
        executable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::{MAX_INSTRUCTION_CHARS, required_text, skill_scope, unique_text_list};

    #[test]
    fn rejects_executable_skill_scope_and_oversized_instructions() {
        assert!(skill_scope("global".to_owned()).is_err());
        assert!(required_text(" ".to_owned(), "instructions", MAX_INSTRUCTION_CHARS).is_err());
        assert!(
            required_text(
                "x".repeat(MAX_INSTRUCTION_CHARS + 1),
                "instructions",
                MAX_INSTRUCTION_CHARS,
            )
            .is_err()
        );
    }

    #[test]
    fn deduplicates_declarative_tool_names() {
        assert_eq!(
            unique_text_list(
                vec![
                    "read_memory".to_owned(),
                    "read_memory".to_owned(),
                    "write_report".to_owned()
                ],
                "allowed_tools",
            )
            .unwrap(),
            vec!["read_memory", "write_report"]
        );
    }
}
