use axum::{Json, extract::State, http::HeaderMap, response::Response};
use energon_core::{
    EnergonError, MemoryRecord, PromoteMemoryRequest, PromotionAuditRecord, WriteMemoryRequest,
    permissions::{AccessContext, can_read_memory},
};

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    state::{AppState, StorageBackend, now_unix_ms},
    x402::{PaidRoute, attach_payment_response},
};

pub async fn write_memory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<WriteMemoryRequest>,
) -> Result<Response, ApiError> {
    let payment_response = state
        .x402
        .require_payment(&headers, PaidRoute::MemoryWrite)
        .await?;
    let agent = identity_from_request(&state, &headers).await?;
    let record = MemoryRecord::from_write(state.next_memory_id(), &agent, request, now_unix_ms())?;

    match &state.storage {
        StorageBackend::Memory(storage) => {
            storage.memories.write().unwrap().push(record.clone());
        }
        StorageBackend::Postgres(pool) => {
            energon_db::memory::insert_memory(pool, &record).await?;
        }
    }

    Ok(attach_payment_response(Json(record), payment_response))
}

pub async fn promote_memory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PromoteMemoryRequest>,
) -> Result<Response, ApiError> {
    let payment_response = state
        .x402
        .require_payment(&headers, PaidRoute::MemoryPromote)
        .await?;
    let agent = identity_from_request(&state, &headers).await?;
    request.validate()?;
    let reason = request.reason.trim().to_owned();

    let source = match &state.storage {
        StorageBackend::Memory(storage) => storage
            .memories
            .read()
            .unwrap()
            .iter()
            .find(|memory| memory.memory_id == request.memory_id)
            .cloned(),
        StorageBackend::Postgres(pool) => {
            energon_db::memory::get_memory(pool, &request.memory_id).await?
        }
    }
    .ok_or_else(|| EnergonError::MemoryNotFound(request.memory_id.clone()))?;

    let access_context = AccessContext {
        project_id: source.project_id.clone(),
        user_id: source.user_id.clone(),
        session_id: source.session_id.clone(),
    };

    if !can_read_memory(&agent, &source, &access_context) {
        return Err(EnergonError::PermissionDenied {
            agent_id: agent.agent_id,
            memory_id: source.memory_id,
        }
        .into());
    }

    let created_at_unix_ms = now_unix_ms();
    let promoted = source.promoted_copy(
        state.next_memory_id(),
        request.target_scope,
        created_at_unix_ms,
    )?;
    let promotion_audit = PromotionAuditRecord {
        promotion_id: state.next_promotion_id(),
        source_memory_id: source.memory_id,
        promoted_memory_id: promoted.memory_id.clone(),
        agent_id: agent.agent_id,
        org_id: agent.org_id,
        target_scope: promoted.scope.clone(),
        reason,
        created_at_unix_ms,
    };

    match &state.storage {
        StorageBackend::Memory(storage) => {
            storage.memories.write().unwrap().push(promoted.clone());
            storage
                .promotion_audits
                .write()
                .unwrap()
                .insert(promoted.memory_id.clone(), promotion_audit);
        }
        StorageBackend::Postgres(pool) => {
            energon_db::memory::insert_promoted_memory(pool, &promoted, &promotion_audit).await?;
        }
    }

    Ok(attach_payment_response(Json(promoted), payment_response))
}
