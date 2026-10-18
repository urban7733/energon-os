//! External runtimes generate dreams. Energon only stores and gates access to them.
use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    payments::{authorize_paid_usage, record_usage},
    state::{AppState, StorageBackend, now_unix_ms},
    x402::{PaidRoute, attach_payment_response},
};
use axum::{Json, extract::State, http::HeaderMap, response::Response};
use energon_core::{AgentIdentity, MemoryScope, can_read_memory, dreams::DreamRecord};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WriteDream {
    pub content: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShareDream {
    pub dream_id: String,
    pub content: String,
    pub target_scope: MemoryScope,
    pub reason: String,
}

fn validate_content(content: &str) -> Result<(), ApiError> {
    if content.trim().is_empty() || content.len() > 32_000 {
        return Err(ApiError::BadRequest(
            "dream content must contain 1–32000 bytes".into(),
        ));
    }
    Ok(())
}
async fn persist(state: &AppState, dream: &DreamRecord) -> Result<(), ApiError> {
    match &state.storage {
        StorageBackend::Memory(store) => store.dreams.write().unwrap().push(dream.clone()),
        StorageBackend::Postgres(pool) => energon_db::dreams::insert(pool, dream).await?,
    }
    Ok(())
}
fn visible(agent: &AgentIdentity, dream: &DreamRecord) -> bool {
    can_read_memory(agent, &dream.memory, &Default::default())
}

pub async fn write(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<WriteDream>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    validate_content(&input.content)?;
    let dream = DreamRecord::private(
        format!("dream_{}", state.next_memory_id()),
        &agent,
        input.content,
        now_unix_ms(),
    )?;
    let payment = authorize_paid_usage(&state, &headers, &agent, PaidRoute::MemoryWrite).await?;
    persist(&state, &dream).await?;
    record_usage(&state, &agent, PaidRoute::MemoryWrite, &payment).await;
    Ok(attach_payment_response(
        Json(dream),
        payment.response_header,
    ))
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let dreams = match &state.storage {
        StorageBackend::Memory(store) => {
            let mut dreams: Vec<_> = store
                .dreams
                .read()
                .unwrap()
                .iter()
                .filter(|dream| visible(&agent, dream))
                .cloned()
                .collect();
            dreams.sort_by(|a, b| {
                b.memory
                    .created_at_unix_ms
                    .cmp(&a.memory.created_at_unix_ms)
                    .then_with(|| b.memory.memory_id.cmp(&a.memory.memory_id))
            });
            dreams.truncate(100);
            dreams
        }
        StorageBackend::Postgres(pool) => energon_db::dreams::list(pool, &agent).await?,
    };
    Ok(Json(json!({ "dreams": dreams, "limit": 100 })))
}

pub async fn share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ShareDream>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    validate_content(&input.content)?;
    if input.reason.len() > 2000 {
        return Err(ApiError::BadRequest(
            "sharing reason exceeds 2000 bytes".into(),
        ));
    }
    let source = match &state.storage {
        StorageBackend::Memory(store) => store
            .dreams
            .read()
            .unwrap()
            .iter()
            .find(|d| {
                d.memory.memory_id == input.dream_id
                    && d.memory.org_id == agent.org_id
                    && d.memory.owner_agent_id.as_ref() == Some(&agent.agent_id)
            })
            .cloned(),
        StorageBackend::Postgres(pool) => {
            energon_db::dreams::own(pool, &agent, &input.dream_id).await?
        }
    }
    .ok_or_else(|| ApiError::NotFound("private dream not found".into()))?;
    let dream = source.share(
        format!("dream_{}", state.next_memory_id()),
        &agent,
        input.content,
        input.target_scope,
        input.reason,
        now_unix_ms(),
    )?;
    let payment = authorize_paid_usage(&state, &headers, &agent, PaidRoute::MemoryPromote).await?;
    persist(&state, &dream).await?;
    record_usage(&state, &agent, PaidRoute::MemoryPromote, &payment).await;
    Ok(attach_payment_response(
        Json(dream),
        payment.response_header,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;
    fn headers(id: &str, org: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("x-energon-agent-id", HeaderValue::from_str(id).unwrap());
        headers.insert("x-energon-org-id", HeaderValue::from_str(org).unwrap());
        headers
    }
    #[tokio::test]
    async fn dreams_are_private_isolated_and_only_explicitly_shared() {
        let state = AppState::for_dream_tests();
        write(
            State(state.clone()),
            headers("author", "org"),
            Json(WriteDream {
                content: "Private reflection".into(),
            }),
        )
        .await
        .unwrap();
        let Json(own) = list(State(state.clone()), headers("author", "org"))
            .await
            .unwrap();
        let id = own["dreams"][0]["memory_id"].as_str().unwrap().to_owned();
        assert_eq!(own["dreams"].as_array().unwrap().len(), 1);
        let Json(other) = list(State(state.clone()), headers("other", "org"))
            .await
            .unwrap();
        assert!(other["dreams"].as_array().unwrap().is_empty());
        let error = share(
            State(state.clone()),
            headers("other", "org"),
            Json(ShareDream {
                dream_id: id.clone(),
                content: "Excerpt".into(),
                target_scope: MemoryScope::Org,
                reason: "Discuss".into(),
            }),
        )
        .await;
        assert!(matches!(error, Err(ApiError::NotFound(_))));
        share(
            State(state.clone()),
            headers("author", "org"),
            Json(ShareDream {
                dream_id: id,
                content: "Chosen excerpt".into(),
                target_scope: MemoryScope::Org,
                reason: "Discuss".into(),
            }),
        )
        .await
        .unwrap();
        let Json(shared) = list(State(state.clone()), headers("other", "org"))
            .await
            .unwrap();
        assert_eq!(shared["dreams"].as_array().unwrap().len(), 1);
        assert_eq!(shared["dreams"][0]["content"], "Chosen excerpt");
        assert_eq!(shared["dreams"][0]["speculative"], true);
        let Json(outsider) = list(State(state.clone()), headers("author", "elsewhere"))
            .await
            .unwrap();
        assert!(outsider["dreams"].as_array().unwrap().is_empty());
        if let StorageBackend::Memory(store) = &state.storage {
            assert!(
                store.memories.read().unwrap().is_empty(),
                "dreams cannot become context candidates"
            );
            assert_eq!(store.dreams.read().unwrap().len(), 2);
        }
    }
    #[test]
    fn request_cannot_supply_ownership_or_verified_status() {
        assert!(
            serde_json::from_value::<WriteDream>(json!({"content":"idea", "speculative": false}))
                .is_err()
        );
        assert!(
            serde_json::from_value::<WriteDream>(json!({"content":"idea", "org_id": "another"}))
                .is_err()
        );
    }
}
