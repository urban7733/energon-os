use axum::{Json, extract::State, http::HeaderMap};
use energon_core::{ContextBuildRequest, ContextPack, context_broker};

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    state::{AppState, StorageBackend, now_unix_ms},
};

pub async fn build_context(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ContextBuildRequest>,
) -> Result<Json<ContextPack>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;

    if let StorageBackend::Postgres(pool) = &state.storage {
        energon_db::identity::ensure_agent_identity(pool, &agent).await?;
    }

    let memories = match &state.storage {
        StorageBackend::Memory(storage) => storage.memories.read().unwrap().clone(),
        StorageBackend::Postgres(pool) => {
            energon_db::memory::list_candidate_memories(
                pool,
                &agent,
                request
                    .project_id
                    .as_deref()
                    .or(agent.project_id.as_deref()),
                request.user_id.as_deref(),
                request.session_id.as_deref(),
                state.retrieval_candidate_limit,
            )
            .await?
        }
    };

    let outcome = context_broker::build_context(
        &agent,
        state.next_request_id(),
        request,
        &memories,
        now_unix_ms(),
    );

    match &state.storage {
        StorageBackend::Memory(storage) => {
            storage
                .audits
                .write()
                .unwrap()
                .insert(outcome.audit.request_id.clone(), outcome.audit.clone());
        }
        StorageBackend::Postgres(pool) => {
            energon_db::audit::insert_context_audit(pool, &outcome.audit, &outcome.pack.items)
                .await?;
        }
    }

    Ok(Json(outcome.pack))
}
