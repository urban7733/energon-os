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

#[derive(Debug, Serialize)]
pub struct MemoryScopeCountResponse {
    pub scope: energon_core::MemoryScope,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct OrgMemoryStatsResponse {
    pub org_id: String,
    pub total_memories: i64,
    pub scopes: Vec<MemoryScopeCountResponse>,
}

/// `GET /v1/orgs/{org_id}/memory-stats` — exact memory counts by scope for
/// an operator dashboard, without paging through the underlying records.
pub async fn org_memory_stats(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<OrgMemoryStatsResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;
    let scopes = energon_db::memory::count_org_memories_by_scope(pool, &org_id)
        .await?
        .into_iter()
        .map(|count| MemoryScopeCountResponse {
            scope: count.scope,
            count: count.count,
        })
        .collect::<Vec<_>>();
    let total_memories = scopes.iter().map(|count| count.count).sum();

    Ok(Json(OrgMemoryStatsResponse {
        org_id,
        total_memories,
        scopes,
    }))
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

#[derive(Debug, Serialize)]
pub struct OutboxStatusResponse {
    pub storage: &'static str,
    pub pending: i64,
    pub leased: i64,
    pub published: i64,
    pub retrying: i64,
}

#[derive(Debug, Deserialize)]
pub struct SetRolePolicyRequest {
    pub authority_bps: i32,
    #[serde(default)]
    pub can_resolve_conflicts: bool,
}

#[derive(Debug, Serialize)]
pub struct RolePolicyResponse {
    pub role_id: String,
    pub authority_bps: i32,
    pub can_resolve_conflicts: bool,
    pub policy_version: i32,
    pub updated_at_unix_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct ListRolePoliciesResponse {
    pub org_id: String,
    pub policies: Vec<RolePolicyResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ListConflictsQuery {
    #[serde(default)]
    pub include_resolved: bool,
}

#[derive(Debug, Serialize)]
pub struct ClaimConflictResponse {
    pub conflict_id: String,
    pub subject: String,
    pub predicate: String,
    pub incumbent_claim_id: String,
    pub challenger_claim_id: String,
    pub status: String,
    pub resolved_claim_id: Option<String>,
    pub resolution_reason: Option<String>,
    pub resolved_by_user_id: Option<String>,
    pub created_at_unix_ms: i64,
    pub resolved_at_unix_ms: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ListConflictsResponse {
    pub org_id: String,
    pub conflicts: Vec<ClaimConflictResponse>,
}

#[derive(Debug, Deserialize)]
pub struct ResolveConflictRequest {
    pub accepted_claim_id: String,
    pub reason: String,
}

/// `GET /v1/orgs/{org_id}/role-policies` — explicit, operator-owned role
/// authority values. Agents cannot read or modify this through their key.
pub async fn list_role_policies(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<ListRolePoliciesResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;
    let policies = energon_db::claims::list_role_policies(pool, &org_id)
        .await?
        .into_iter()
        .map(role_policy_response)
        .collect();

    Ok(Json(ListRolePoliciesResponse { org_id, policies }))
}

/// `PUT /v1/orgs/{org_id}/role-policies/{role_id}` — policy management for
/// a role, including whether the role may later be delegated resolution work.
pub async fn set_role_policy(
    State(state): State<AppState>,
    Path((org_id, role_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(request): Json<SetRolePolicyRequest>,
) -> Result<Json<RolePolicyResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;
    let role_id = required_text(role_id, "role_id")?;
    if !(0..=10_000).contains(&request.authority_bps) {
        return Err(ApiError::BadRequest(
            "authority_bps must be between 0 and 10000".to_owned(),
        ));
    }

    energon_db::identity::ensure_role_exists(pool, &org_id, &role_id).await?;
    let policy = energon_db::claims::set_role_policy(
        pool,
        &org_id,
        &role_id,
        request.authority_bps,
        request.can_resolve_conflicts,
    )
    .await?;
    Ok(Json(role_policy_response(policy)))
}

/// `GET /v1/orgs/{org_id}/conflicts` — conflict branches that were created
/// by actual competing assertions, not dashboard-only status data.
pub async fn list_conflicts(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Query(query): Query<ListConflictsQuery>,
) -> Result<Json<ListConflictsResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;
    let conflicts = energon_db::claims::list_conflicts(pool, &org_id, query.include_resolved)
        .await?
        .into_iter()
        .map(conflict_response)
        .collect();

    Ok(Json(ListConflictsResponse { org_id, conflicts }))
}

/// `POST /v1/orgs/{org_id}/conflicts/{conflict_id}/resolve` — an operator
/// picks one existing branch. The decision and its reason enter the audit hash
/// chain within the same database transaction.
pub async fn resolve_conflict(
    State(state): State<AppState>,
    Path((org_id, conflict_id)): Path<(String, String)>,
    headers: HeaderMap,
    Json(request): Json<ResolveConflictRequest>,
) -> Result<Json<ClaimConflictResponse>, ApiError> {
    let operator = authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;
    let accepted_claim_id = required_text(request.accepted_claim_id, "accepted_claim_id")?;
    let reason = required_text(request.reason, "reason")?;
    let conflict = energon_db::claims::resolve_conflict(
        pool,
        &org_id,
        &conflict_id,
        &accepted_claim_id,
        &operator.user_id,
        &reason,
        now_unix_ms(),
    )
    .await?;
    Ok(Json(conflict_response(conflict)))
}

/// `GET /v1/orgs/{org_id}/events/outbox` — delivery state for the durable
/// control-plane event stream. This contains no event payloads or memory text.
pub async fn org_outbox_status(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<OutboxStatusResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;

    match &state.storage {
        StorageBackend::Memory(_) => Ok(Json(OutboxStatusResponse {
            storage: "memory",
            pending: 0,
            leased: 0,
            published: 0,
            retrying: 0,
        })),
        StorageBackend::Postgres(pool) => {
            let summary = energon_db::event_outbox::summary(pool, &org_id).await?;
            Ok(Json(OutboxStatusResponse {
                storage: "postgres",
                pending: summary.pending,
                leased: summary.leased,
                published: summary.published,
                retrying: summary.retrying,
            }))
        }
    }
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

fn role_policy_response(policy: energon_db::claims::RolePolicy) -> RolePolicyResponse {
    RolePolicyResponse {
        role_id: policy.role_id,
        authority_bps: policy.authority_bps,
        can_resolve_conflicts: policy.can_resolve_conflicts,
        policy_version: policy.policy_version,
        updated_at_unix_ms: policy.updated_at_unix_ms,
    }
}

fn conflict_response(conflict: energon_db::claims::ClaimConflict) -> ClaimConflictResponse {
    ClaimConflictResponse {
        conflict_id: conflict.conflict_id,
        subject: conflict.subject,
        predicate: conflict.predicate,
        incumbent_claim_id: conflict.incumbent_claim_id,
        challenger_claim_id: conflict.challenger_claim_id,
        status: conflict.status,
        resolved_claim_id: conflict.resolved_claim_id,
        resolution_reason: conflict.resolution_reason,
        resolved_by_user_id: conflict.resolved_by_user_id,
        created_at_unix_ms: conflict.created_at_unix_ms,
        resolved_at_unix_ms: conflict.resolved_at_unix_ms,
    }
}
