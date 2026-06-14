use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use energon_core::AuditRecord;

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    state::{AppState, StorageBackend},
};

pub async fn get_context_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
) -> Result<Json<AuditRecord>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
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

    Ok(Json(audit))
}
