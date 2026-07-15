use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use energon_core::AgentIdentity;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::{
    errors::ApiError,
    jwt::{VerifiedOperator, operator_from_request},
    secrets::{generate_api_key, hash_api_key},
    state::{AppState, StorageBackend, now_unix_ms},
};

const MAX_PAGE_LIMIT: i64 = 200;
const DEFAULT_PAGE_LIMIT: i64 = 50;
const RECENT_RECEIPT_LIMIT: i64 = 25;

async fn authorize_operator(
    state: &AppState,
    headers: &HeaderMap,
    org_id: &str,
) -> Result<VerifiedOperator, ApiError> {
    let operator = operator_from_request(state.jwt.as_ref(), headers).await?;
    operator.require_org(org_id)?;
    Ok(operator)
}

fn postgres_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    match &state.storage {
        StorageBackend::Postgres(pool) => Ok(pool),
        StorageBackend::Memory(_) => Err(ApiError::BadRequest(
            "org management requires Postgres storage (set DATABASE_URL)".to_owned(),
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateOrgAgentRequest {
    pub agent_id: String,
    #[serde(default)]
    pub role_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentKeyGrant {
    pub agent_id: String,
    pub org_id: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
    pub api_key_id: String,
    /// Returned exactly once; only the hash is stored.
    pub api_key: String,
}

/// `POST /v1/orgs/{org_id}/agents` — create an agent plus its first API key.
pub async fn create_org_agent(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CreateOrgAgentRequest>,
) -> Result<Json<AgentKeyGrant>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;

    let agent = AgentIdentity::new(
        required_text(request.agent_id, "agent_id")?,
        org_id,
        clean_optional(request.role_id),
        clean_optional(request.project_id),
    );
    let name = clean_optional(request.name).unwrap_or_else(|| agent.agent_id.clone());
    let pepper = api_key_pepper(&state)?;
    let api_key = generate_api_key();
    let key_hash = hash_api_key(&api_key, &pepper);
    let api_key_id = format!("key_{}_{}", now_unix_ms(), agent.agent_id);

    energon_db::identity::create_agent_with_api_key(pool, &agent, &name, &api_key_id, &key_hash)
        .await?;

    Ok(Json(AgentKeyGrant {
        agent_id: agent.agent_id,
        org_id: agent.org_id,
        role_id: agent.role_id,
        project_id: agent.project_id,
        api_key_id,
        api_key,
    }))
}

#[derive(Debug, Serialize)]
pub struct ApiKeyMetadataResponse {
    pub api_key_id: String,
    pub created_at_unix_ms: i64,
    pub revoked_at_unix_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct OrgAgentResponse {
    pub agent_id: String,
    pub name: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
    pub created_at_unix_ms: i64,
    pub keys: Vec<ApiKeyMetadataResponse>,
}

#[derive(Debug, Serialize)]
pub struct ListOrgAgentsResponse {
    pub org_id: String,
    pub agents: Vec<OrgAgentResponse>,
}

/// `GET /v1/orgs/{org_id}/agents` — agents with API key metadata (no hashes).
pub async fn list_org_agents(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ListOrgAgentsResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;

    let agents = energon_db::identity::list_org_agents(pool, &org_id)
        .await?
        .into_iter()
        .map(|agent| OrgAgentResponse {
            agent_id: agent.agent_id,
            name: agent.name,
            role_id: agent.role_id,
            project_id: agent.project_id,
            created_at_unix_ms: agent.created_at_unix_ms,
            keys: agent
                .keys
                .into_iter()
                .map(|key| ApiKeyMetadataResponse {
                    api_key_id: key.api_key_id,
                    created_at_unix_ms: key.created_at_unix_ms,
                    revoked_at_unix_ms: key.revoked_at_unix_ms,
                })
                .collect(),
        })
        .collect();

    Ok(Json(ListOrgAgentsResponse { org_id, agents }))
}

/// `POST /v1/orgs/{org_id}/agents/{agent_id}/keys` — rotate: mint a new key.
/// The previous key stays valid until explicitly revoked so agents can switch
/// over without downtime.
pub async fn rotate_agent_key(
    State(state): State<AppState>,
    Path((org_id, agent_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<AgentKeyGrant>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;

    let pepper = api_key_pepper(&state)?;
    let api_key = generate_api_key();
    let key_hash = hash_api_key(&api_key, &pepper);
    let api_key_id = format!("key_{}_{}", now_unix_ms(), agent_id);

    let inserted = energon_db::identity::insert_agent_api_key(
        pool,
        &org_id,
        &agent_id,
        &api_key_id,
        &key_hash,
    )
    .await?;

    if !inserted {
        return Err(ApiError::NotFound(format!(
            "agent not found in org: {agent_id}"
        )));
    }

    Ok(Json(AgentKeyGrant {
        agent_id,
        org_id,
        role_id: None,
        project_id: None,
        api_key_id,
        api_key,
    }))
}

#[derive(Debug, Serialize)]
pub struct RevokeKeyResponse {
    pub api_key_id: String,
    pub revoked: bool,
}

/// `DELETE /v1/orgs/{org_id}/keys/{api_key_id}` — set `revoked_at`.
pub async fn revoke_api_key(
    State(state): State<AppState>,
    Path((org_id, api_key_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<RevokeKeyResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;

    let revoked = energon_db::identity::revoke_agent_api_key(pool, &org_id, &api_key_id).await?;

    if !revoked {
        return Err(ApiError::NotFound(format!(
            "active API key not found in org: {api_key_id}"
        )));
    }

    Ok(Json(RevokeKeyResponse {
        api_key_id,
        revoked: true,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ListMemoriesQuery {
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct OrgMemoryResponse {
    pub memory_id: String,
    pub scope: energon_core::MemoryScope,
    pub content_preview: String,
    pub tags: Vec<String>,
    pub project_id: Option<String>,
    pub role_id: Option<String>,
    pub owner_agent_id: Option<String>,
    pub created_at_unix_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct ListOrgMemoriesResponse {
    pub org_id: String,
    pub limit: i64,
    pub offset: i64,
    pub memories: Vec<OrgMemoryResponse>,
}

/// `GET /v1/orgs/{org_id}/memories?scope=&limit=&offset=` — metadata plus a
/// truncated content preview.
pub async fn list_org_memories(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Query(query): Query<ListMemoriesQuery>,
) -> Result<Json<ListOrgMemoriesResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;

    let scope = match query
        .scope
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(scope) => Some(
            energon_db::memory::scope_from_str(scope)
                .map_err(|_| ApiError::BadRequest(format!("invalid scope filter: {scope}")))?,
        ),
        None => None,
    };
    let limit = query
        .limit
        .unwrap_or(DEFAULT_PAGE_LIMIT)
        .clamp(1, MAX_PAGE_LIMIT);
    let offset = query.offset.unwrap_or(0).max(0);

    let memories =
        energon_db::memory::list_org_memories_page(pool, &org_id, scope.as_ref(), limit, offset)
            .await?
            .into_iter()
            .map(|memory| OrgMemoryResponse {
                memory_id: memory.memory_id,
                scope: memory.scope,
                content_preview: memory.content_preview,
                tags: memory.tags,
                project_id: memory.project_id,
                role_id: memory.role_id,
                owner_agent_id: memory.owner_agent_id,
                created_at_unix_ms: memory.created_at_unix_ms,
            })
            .collect();

    Ok(Json(ListOrgMemoriesResponse {
        org_id,
        limit,
        offset,
        memories,
    }))
}

#[derive(Debug, Serialize)]
pub struct DeleteMemoryResponse {
    pub memory_id: String,
    pub deleted: bool,
}

/// `DELETE /v1/orgs/{org_id}/memories/{memory_id}` — delete a memory and its
/// chunks (cascade).
pub async fn delete_org_memory(
    State(state): State<AppState>,
    Path((org_id, memory_id)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Json<DeleteMemoryResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;

    let deleted = energon_db::memory::delete_org_memory(pool, &org_id, &memory_id).await?;

    if !deleted {
        return Err(ApiError::NotFound(format!(
            "memory not found in org: {memory_id}"
        )));
    }

    Ok(Json(DeleteMemoryResponse {
        memory_id,
        deleted: true,
    }))
}

#[derive(Debug, Serialize)]
pub struct RouteUsageResponse {
    pub route: String,
    pub calls: i64,
    pub paid_calls: i64,
    pub amount_usdc_micro: i64,
}

#[derive(Debug, Serialize)]
pub struct ReceiptResponse {
    pub receipt_id: String,
    pub agent_id: Option<String>,
    pub route: String,
    pub amount_usdc_micro: i64,
    pub network: String,
    pub payer: Option<String>,
    pub tx_hash: Option<String>,
    pub created_at_unix_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct UsageSummaryResponse {
    pub org_id: String,
    pub storage: &'static str,
    pub totals: Vec<RouteUsageResponse>,
    pub recent_receipts: Vec<ReceiptResponse>,
}

/// `GET /v1/orgs/{org_id}/usage` — per-route totals plus recent receipts.
pub async fn org_usage(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<UsageSummaryResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;

    match &state.storage {
        StorageBackend::Memory(storage) => {
            let usage = storage.usage.read().unwrap();
            let mut totals = usage
                .iter()
                .filter(|((usage_org, _), _)| usage_org == &org_id)
                .map(|((_, route), counter)| RouteUsageResponse {
                    route: route.clone(),
                    calls: i64::try_from(counter.calls).unwrap_or(i64::MAX),
                    paid_calls: i64::try_from(counter.paid_calls).unwrap_or(i64::MAX),
                    amount_usdc_micro: i64::try_from(counter.amount_usdc_micro).unwrap_or(i64::MAX),
                })
                .collect::<Vec<_>>();
            totals.sort_by(|left, right| left.route.cmp(&right.route));

            Ok(Json(UsageSummaryResponse {
                org_id,
                storage: "memory",
                totals,
                recent_receipts: Vec::new(),
            }))
        }
        StorageBackend::Postgres(pool) => {
            let totals = energon_db::payments::usage_totals(pool, &org_id)
                .await?
                .into_iter()
                .map(|total| RouteUsageResponse {
                    route: total.route,
                    calls: total.calls,
                    paid_calls: total.paid_calls,
                    amount_usdc_micro: total.amount_usdc_micro,
                })
                .collect();
            let recent_receipts =
                energon_db::payments::recent_receipts(pool, &org_id, RECENT_RECEIPT_LIMIT)
                    .await?
                    .into_iter()
                    .map(|receipt| ReceiptResponse {
                        receipt_id: receipt.receipt_id,
                        agent_id: receipt.agent_id,
                        route: receipt.route,
                        amount_usdc_micro: receipt.amount_usdc_micro,
                        network: receipt.network,
                        payer: receipt.payer,
                        tx_hash: receipt.tx_hash,
                        created_at_unix_ms: receipt.created_at_unix_ms,
                    })
                    .collect();

            Ok(Json(UsageSummaryResponse {
                org_id,
                storage: "postgres",
                totals,
                recent_receipts,
            }))
        }
    }
}

fn api_key_pepper(state: &AppState) -> Result<String, ApiError> {
    state
        .auth
        .api_key_pepper
        .clone()
        .ok_or_else(|| ApiError::Internal("ENERGON_API_KEY_PEPPER is not configured".to_owned()))
}

fn required_text(value: String, field: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_owned();

    if value.is_empty() {
        return Err(ApiError::BadRequest(format!("{field} cannot be empty")));
    }

    Ok(value)
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
