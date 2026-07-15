use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
    response::Response,
};

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    payments::record_usage,
    state::{AppState, StorageBackend},
    x402::{PaidRoute, attach_payment_response},
};

pub async fn get_context_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
) -> Result<Response, ApiError> {
    let payment = state
        .x402
        .require_payment(&headers, PaidRoute::ContextAuditRead)
        .await?;
    let agent = identity_from_request(&state, &headers).await?;
    record_usage(&state, &agent, PaidRoute::ContextAuditRead, &payment).await;
    let audit = match &state.storage {
        StorageBackend::Memory(storage) => storage.audits.read().unwrap().get(&request_id).cloned(),
        StorageBackend::Postgres(pool) => {
            energon_db::audit::get_context_audit(pool, &request_id).await?
        }
    }
    .ok_or_else(|| ApiError::NotFound(format!("audit record not found: {request_id}")))?;

    if audit.agent_id != agent.agent_id || audit.org_id != agent.org_id {
        return Err(ApiError::Forbidden(
            "agent cannot read this audit record".to_owned(),
        ));
    }

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
    let payment = state
        .x402
        .require_payment(&headers, PaidRoute::PromotionAuditRead)
        .await?;
    let agent = identity_from_request(&state, &headers).await?;
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
    .ok_or_else(|| {
        ApiError::NotFound(format!(
            "promotion audit record not found for memory: {promoted_memory_id}"
        ))
    })?;

    if audit.agent_id != agent.agent_id || audit.org_id != agent.org_id {
        return Err(ApiError::Forbidden(
            "agent cannot read this promotion audit record".to_owned(),
        ));
    }

    Ok(attach_payment_response(
        Json(audit),
        payment.response_header,
    ))
}
