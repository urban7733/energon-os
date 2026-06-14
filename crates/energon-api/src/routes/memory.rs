use axum::{Json, extract::State, http::HeaderMap};
use energon_core::{
    EnergonError, MemoryRecord, PromoteMemoryRequest, WriteMemoryRequest,
    permissions::{AccessContext, can_read_memory},
};

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    state::{AppState, StorageBackend, now_unix_ms},
};

pub async fn write_memory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<WriteMemoryRequest>,
) -> Result<Json<MemoryRecord>, ApiError> {
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

    Ok(Json(record))
}

pub async fn promote_memory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PromoteMemoryRequest>,
) -> Result<Json<MemoryRecord>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;

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

    let promoted =
        source.promoted_copy(state.next_memory_id(), request.target_scope, now_unix_ms())?;

    match &state.storage {
        StorageBackend::Memory(storage) => {
            storage.memories.write().unwrap().push(promoted.clone());
        }
        StorageBackend::Postgres(pool) => {
            energon_db::memory::insert_memory(pool, &promoted).await?;
        }
    }

    Ok(Json(promoted))
}
