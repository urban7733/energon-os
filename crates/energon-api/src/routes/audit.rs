use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
    response::Response,
};

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    payments::{authorize_paid_usage, record_usage},
    state::{AppState, StorageBackend},
    x402::{PaidRoute, attach_payment_response},
};

pub async fn get_context_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let payment =
        authorize_paid_usage(&state, &headers, &agent, PaidRoute::ContextAuditRead).await?;
    record_usage(&state, &agent, PaidRoute::ContextAuditRead, &payment).await;
    let audit = match &state.storage {
        StorageBackend::Memory(storage) => storage.audits.read().unwrap().get(&request_id).cloned(),
        StorageBackend::Postgres(pool) => {
            energon_db::audit::get_context_audit(pool, &request_id).await?
        }
    }
    // Another agent's record answers exactly like a missing one, so audit ids
    // cannot be probed across agents or tenants.
    .filter(|audit| audit.agent_id == agent.agent_id && audit.org_id == agent.org_id)
    .ok_or_else(|| ApiError::NotFound(format!("audit record not found: {request_id}")))?;

    Ok(attach_payment_response(
        Json(audit),
        payment.response_header,
    ))
}

pub async fn get_promotion_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(promoted_memory_id): Path<String>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let payment =
        authorize_paid_usage(&state, &headers, &agent, PaidRoute::PromotionAuditRead).await?;
    record_usage(&state, &agent, PaidRoute::PromotionAuditRead, &payment).await;
    let audit = match &state.storage {
        StorageBackend::Memory(storage) => storage
            .promotion_audits
            .read()
            .unwrap()
            .get(&promoted_memory_id)
            .cloned(),
        StorageBackend::Postgres(pool) => {
            energon_db::audit::get_promotion_audit(pool, &promoted_memory_id).await?
        }
    }
    .filter(|audit| audit.agent_id == agent.agent_id && audit.org_id == agent.org_id)
    .ok_or_else(|| {
        ApiError::NotFound(format!(
            "promotion audit record not found for memory: {promoted_memory_id}"
        ))
    })?;

    Ok(attach_payment_response(
        Json(audit),
        payment.response_header,
    ))
}
