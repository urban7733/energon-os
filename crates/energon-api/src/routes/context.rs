use axum::{Json, extract::State, http::HeaderMap, response::Response};
use energon_core::{AgentIdentity, ContextBuildRequest, MemoryRecord, context_broker};
use sqlx::PgPool;

use crate::{
    embedding::{EmbeddingClient, vector_literal},
    errors::ApiError,
    middleware::auth::identity_from_request,
    payments::record_usage,
    state::{AppState, StorageBackend, now_unix_ms},
    x402::{PaidRoute, attach_payment_response},
};

pub async fn build_context(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ContextBuildRequest>,
) -> Result<Response, ApiError> {
    let payment = state
        .x402
        .require_payment(&headers, PaidRoute::ContextBuild)
        .await?;
    let agent = identity_from_request(&state, &headers).await?;
    record_usage(&state, &agent, PaidRoute::ContextBuild, &payment).await;

    if let StorageBackend::Postgres(pool) = &state.storage {
        energon_db::identity::ensure_agent_identity(pool, &agent).await?;
    }

    let memories = match &state.storage {
        StorageBackend::Memory(storage) => storage.memories.read().unwrap().clone(),
        StorageBackend::Postgres(pool) => {
            retrieve_candidates(&state, pool, &agent, &request).await?
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

    Ok(attach_payment_response(
        Json(outcome.pack),
        payment.response_header,
    ))
}

/// Fetch retrieval candidates with permission filtering inside SQL.
///
/// Semantic path: when an embedding client is configured, embed the task and
/// order candidates by pgvector cosine distance (unembedded memories are
/// unioned in by recency). Any embedding failure falls back to the
/// recency-ordered query — retrieval degradation must never fail the request.
async fn retrieve_candidates(
    state: &AppState,
    pool: &PgPool,
    agent: &AgentIdentity,
    request: &ContextBuildRequest,
) -> Result<Vec<MemoryRecord>, ApiError> {
    let project_id = request
        .project_id
        .as_deref()
        .or(agent.project_id.as_deref());
    let user_id = request.user_id.as_deref();
    let session_id = request.session_id.as_deref();

    if let Some(embedding_client) = &state.embedding {
        match embed_task(embedding_client, &request.task).await {
            Some(embedding) => {
                return Ok(energon_db::memory::list_candidate_memories_semantic(
                    pool,
                    agent,
                    project_id,
                    user_id,
                    session_id,
                    &embedding,
                    state.retrieval_candidate_limit,
                )
                .await?);
            }
            None => {
                tracing::warn!("task embedding failed; falling back to recency-based retrieval");
            }
        }
    }

    Ok(energon_db::memory::list_candidate_memories(
        pool,
        agent,
        project_id,
        user_id,
        session_id,
        state.retrieval_candidate_limit,
    )
    .await?)
}

async fn embed_task(client: &EmbeddingClient, task: &str) -> Option<String> {
    match client.embed(task).await {
        Ok(embedding) => Some(vector_literal(&embedding)),
        Err(error) => {
            tracing::warn!(%error, "OpenAI embedding request failed");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::embed_task;
    use crate::embedding::EmbeddingClient;

    /// An embedding failure must degrade to recency retrieval (`None` steers
    /// `retrieve_candidates` onto the fallback query) instead of failing the
    /// context build.
    #[tokio::test]
    async fn embedding_failure_returns_none_so_retrieval_falls_back() {
        let client = EmbeddingClient::unreachable_for_tests();

        assert!(
            embed_task(&client, "prepare investor outreach")
                .await
                .is_none()
        );
    }
}
