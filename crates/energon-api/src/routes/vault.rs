use axum::{
    extract::{Path, Query, State},
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{CONTENT_DISPOSITION, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};
use energon_core::{
    AccessContext, AgentIdentity, AuditRecord, MemoryRecord, MemoryScope, PromotionAuditRecord,
    can_read_memory,
};
use serde::Deserialize;

use crate::{
    errors::ApiError,
    jwt::operator_from_request,
    middleware::auth::identity_from_request,
    obsidian_vault::{build_obsidian_vault, build_operator_obsidian_vault},
    payments::{authorize_paid_usage, record_usage},
    state::{AppState, StorageBackend},
    x402::{PaidRoute, attach_payment_response},
};

const OPERATOR_VAULT_DEFAULT_LIMIT: i64 = 500;
const OPERATOR_VAULT_MAX_LIMIT: i64 = 1_000;
const OPERATOR_VAULT_TEXT_LIMIT_CHARS: i32 = 65_536;

#[derive(Debug, Default, Deserialize)]
pub struct VaultExportQuery {
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
pub struct OperatorVaultExportQuery {
    #[serde(default)]
    pub limit: Option<i64>,
}

pub async fn export_obsidian_vault(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<VaultExportQuery>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    if query.user_id.is_some() || query.session_id.is_some() {
        return Err(energon_core::EnergonError::UntrustedAccessContext.into());
    }
    let payment =
        authorize_paid_usage(&state, &headers, &agent, PaidRoute::ObsidianVaultExport).await?;
    record_usage(&state, &agent, PaidRoute::ObsidianVaultExport, &payment).await;
    let limit = query.limit.unwrap_or(500).clamp(1, 5_000);
    let project_id = clean_optional(query.project_id).or_else(|| agent.project_id.clone());
    let user_id = clean_optional(query.user_id);
    let session_id = clean_optional(query.session_id);

    let (memories, context_audits, promotion_audits) =
        vault_data(&state, &agent, project_id, user_id, session_id, limit).await?;
    let archive = build_obsidian_vault(&agent, &memories, &context_audits, &promotion_audits);

    let mut response = (StatusCode::OK, archive.bytes).into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("application/zip"));
    response.headers_mut().insert(
        CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", archive.filename)).map_err(
            |error| ApiError::Internal(format!("failed to encode vault filename header: {error}")),
        )?,
    );

    Ok(attach_payment_response(response, payment.response_header))
}

/// `GET /v1/orgs/{org_id}/vault/obsidian.zip` — a read-only organization graph
/// for a human operator. It contains claims, conflicts, and hash-chain events;
/// private memory nodes are retained but their content is redacted.
pub async fn export_org_obsidian_vault(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Query(query): Query<OperatorVaultExportQuery>,
) -> Result<Response, ApiError> {
    let operator = operator_from_request(state.jwt.as_ref(), &headers).await?;
    operator.require_org(&org_id)?;
    let StorageBackend::Postgres(pool) = &state.storage else {
        return Err(ApiError::BadRequest(
            "operator vault exports require Postgres storage (set DATABASE_URL)".to_owned(),
        ));
    };
    let limit = query
        .limit
        .unwrap_or(OPERATOR_VAULT_DEFAULT_LIMIT)
        .clamp(1, OPERATOR_VAULT_MAX_LIMIT);

    let memories = energon_db::memory::list_org_memories_for_export(
        pool,
        &org_id,
        limit,
        OPERATOR_VAULT_TEXT_LIMIT_CHARS,
    )
    .await?
    .into_iter()
    .map(redact_private_memory_for_operator)
    .collect::<Vec<_>>();
    let context_audits = energon_db::audit::list_context_audits_for_org(
        pool,
        &org_id,
        limit,
        OPERATOR_VAULT_TEXT_LIMIT_CHARS,
    )
    .await?;
    let promotion_audits = energon_db::audit::list_promotion_audits_for_org(
        pool,
        &org_id,
        limit,
        OPERATOR_VAULT_TEXT_LIMIT_CHARS,
    )
    .await?;
    let claims = energon_db::claims::list_claims_for_org(pool, &org_id, limit).await?;
    let conflicts = energon_db::claims::list_conflicts(pool, &org_id, true).await?;
    let audit_events = energon_db::claims::list_audit_chain_events(pool, &org_id, limit).await?;
    let archive = build_operator_obsidian_vault(
        &org_id,
        &memories,
        &context_audits,
        &promotion_audits,
        &claims,
        &conflicts,
        &audit_events,
    );

    let mut response = (StatusCode::OK, archive.bytes).into_response();
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("application/zip"));
    response.headers_mut().insert(
        CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", archive.filename)).map_err(
            |error| ApiError::Internal(format!("failed to encode vault filename header: {error}")),
        )?,
    );
    Ok(response)
}

async fn vault_data(
    state: &AppState,
    agent: &AgentIdentity,
    project_id: Option<String>,
    user_id: Option<String>,
    session_id: Option<String>,
    limit: i64,
) -> Result<
    (
        Vec<MemoryRecord>,
        Vec<AuditRecord>,
        Vec<PromotionAuditRecord>,
    ),
    ApiError,
> {
    let access_context = AccessContext {
        project_id,
        user_id,
        session_id,
    };

    match &state.storage {
        StorageBackend::Memory(storage) => {
            let memories = storage
                .memories
                .read()
                .unwrap()
                .iter()
                .filter(|memory| can_read_memory(agent, memory, &access_context))
                .take(limit as usize)
                .cloned()
                .collect::<Vec<_>>();
            let context_audits = storage
                .audits
                .read()
                .unwrap()
                .values()
                .filter(|audit| audit.agent_id == agent.agent_id && audit.org_id == agent.org_id)
                .take(limit as usize)
                .cloned()
                .collect::<Vec<_>>();
            let promotion_audits = storage
                .promotion_audits
                .read()
                .unwrap()
                .values()
                .filter(|audit| audit.agent_id == agent.agent_id && audit.org_id == agent.org_id)
                .take(limit as usize)
                .cloned()
                .collect::<Vec<_>>();

            Ok((memories, context_audits, promotion_audits))
        }
        StorageBackend::Postgres(pool) => {
            let memories = energon_db::memory::list_candidate_memories(
                pool,
                agent,
                access_context.project_id.as_deref(),
                access_context.user_id.as_deref(),
                access_context.session_id.as_deref(),
                limit,
            )
            .await?
            .into_iter()
            .filter(|memory| can_read_memory(agent, memory, &access_context))
            .take(limit as usize)
            .collect::<Vec<_>>();
            let context_audits =
                energon_db::audit::list_context_audits_for_agent(pool, agent, limit).await?;
            let promotion_audits =
                energon_db::audit::list_promotion_audits_for_agent(pool, agent, limit).await?;

            Ok((memories, context_audits, promotion_audits))
        }
    }
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn redact_private_memory_for_operator(mut memory: MemoryRecord) -> MemoryRecord {
    if matches!(
        memory.scope,
        MemoryScope::AgentPrivate | MemoryScope::UserPrivate | MemoryScope::Session
    ) {
        memory.content = "[Private memory content redacted in operator vault export.]".to_owned();
    }
    memory
}
