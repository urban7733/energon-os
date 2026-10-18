//! External runtimes generate dreams. Energon only stores and gates access to them.
use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    payments::{authorize_paid_usage, record_usage},
    state::{AppState, StorageBackend, now_unix_ms},
    x402::{PaidRoute, attach_payment_response},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
};
use energon_core::{
    AgentIdentity, can_read_memory,
    dreams::{
        DEFAULT_DREAM_PAGE, DreamCursor, DreamDraft, DreamQuery, DreamRecord, DreamShare,
        DreamView, MAX_DREAM_PAGE,
    },
    identity::validate_identifier,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListDreams {
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub view: Option<DreamView>,
    #[serde(default)]
    pub tag: Option<String>,
}

impl ListDreams {
    fn into_query(self) -> Result<DreamQuery, ApiError> {
        let limit = self.limit.unwrap_or(DEFAULT_DREAM_PAGE);
        if !(1..=MAX_DREAM_PAGE).contains(&limit) {
            return Err(ApiError::BadRequest(format!(
                "limit must be between 1 and {MAX_DREAM_PAGE}"
            )));
        }
        let cursor = self
            .cursor
            .map(|cursor| {
                DreamCursor::decode(&cursor)
                    .ok_or_else(|| ApiError::BadRequest("invalid dream cursor".into()))
            })
            .transpose()?;
        let tag = self
            .tag
            .map(|tag| tag.trim().to_owned())
            .filter(|tag| !tag.is_empty());
        energon_core::memory::validate_tags(tag.as_slice())?;

        Ok(DreamQuery {
            view: self.view.unwrap_or_default(),
            tag,
            cursor,
            limit,
        })
    }
}

async fn persist(state: &AppState, dream: &DreamRecord) -> Result<(), ApiError> {
    match &state.storage {
        StorageBackend::Memory(store) => store.dreams.write().unwrap().push(dream.clone()),
        StorageBackend::Postgres(pool) => energon_db::dreams::insert(pool, dream).await?,
    }
    Ok(())
}

async fn find_visible(
    state: &AppState,
    agent: &AgentIdentity,
    dream_id: &str,
) -> Result<Option<DreamRecord>, ApiError> {
    Ok(match &state.storage {
        StorageBackend::Memory(store) => store
            .dreams
            .read()
            .unwrap()
            .iter()
            .find(|dream| dream.memory.memory_id == dream_id && dream.visible_to(agent))
            .cloned(),
        StorageBackend::Postgres(pool) => {
            energon_db::dreams::visible(pool, agent, dream_id).await?
        }
    })
}

/// A dream may only cite memories or dreams its author can already read, so
/// `inspired_by` can never be used to probe or link other agents' records.
async fn ensure_inspirations_readable(
    state: &AppState,
    agent: &AgentIdentity,
    references: &[String],
) -> Result<(), ApiError> {
    for reference in references {
        let memory = match &state.storage {
            StorageBackend::Memory(store) => store
                .memories
                .read()
                .unwrap()
                .iter()
                .find(|memory| &memory.memory_id == reference)
                .cloned(),
            StorageBackend::Postgres(pool) => {
                energon_db::memory::get_memory(pool, reference).await?
            }
        };
        let readable = match memory {
            Some(memory) => can_read_memory(agent, &memory, &Default::default()),
            None => find_visible(state, agent, reference).await?.is_some(),
        };
        if !readable {
            return Err(ApiError::BadRequest(format!(
                "inspired_by references an unknown or unreadable record: {reference}"
            )));
        }
    }
    Ok(())
}

pub async fn write(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<DreamDraft>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let dream = DreamRecord::private(
        format!("dream_{}", state.next_memory_id()),
        &agent,
        input,
        now_unix_ms(),
    )?;
    ensure_inspirations_readable(&state, &agent, &dream.inspired_by).await?;
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
    Query(params): Query<ListDreams>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let query = params.into_query()?;
    let dreams = match &state.storage {
        StorageBackend::Memory(store) => {
            let mut dreams: Vec<_> = store
                .dreams
                .read()
                .unwrap()
                .iter()
                .filter(|dream| dream.visible_to(&agent) && query.matches(dream))
                .cloned()
                .collect();
            dreams.sort_by(|a, b| {
                b.memory
                    .created_at_unix_ms
                    .cmp(&a.memory.created_at_unix_ms)
                    .then_with(|| b.memory.memory_id.cmp(&a.memory.memory_id))
            });
            dreams.truncate(query.limit);
            dreams
        }
        StorageBackend::Postgres(pool) => energon_db::dreams::list(pool, &agent, &query).await?,
    };
    let next_cursor = (dreams.len() == query.limit)
        .then(|| {
            dreams
                .last()
                .map(|dream| DreamCursor::after(dream).encode())
        })
        .flatten();
    Ok(Json(json!({
        "dreams": dreams,
        "limit": query.limit,
        "next_cursor": next_cursor,
    })))
}

pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(dream_id): Path<String>,
) -> Result<Json<DreamRecord>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    validate_identifier("dream_id", &dream_id)?;
    find_visible(&state, &agent, &dream_id)
        .await?
        .map(Json)
        .ok_or_else(|| ApiError::NotFound("dream not found".into()))
}

/// Forgetting is a hard delete: private reflections are the author's to keep
/// or discard, and a sharer may retract an excerpt it published. Shared
/// excerpts are separate records, so forgetting a private original never
/// removes what was already shared (and vice versa).
pub async fn forget(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(dream_id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    validate_identifier("dream_id", &dream_id)?;
    let forgotten = match &state.storage {
        StorageBackend::Memory(store) => {
            let mut dreams = store.dreams.write().unwrap();
            let before = dreams.len();
            dreams.retain(|dream| {
                dream.memory.memory_id != dream_id || !dream.forgettable_by(&agent)
            });
            dreams.len() < before
        }
        StorageBackend::Postgres(pool) => {
            energon_db::dreams::forget(pool, &agent, &dream_id).await?
        }
    };
    if !forgotten {
        return Err(ApiError::NotFound("dream not found".into()));
    }
    Ok(Json(json!({ "dream_id": dream_id, "forgotten": true })))
}

pub async fn share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<DreamShare>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    input.validate()?;
    let source = match &state.storage {
        StorageBackend::Memory(store) => store
            .dreams
            .read()
            .unwrap()
            .iter()
            .find(|d| d.memory.memory_id == input.dream_id && d.owned_privately_by(&agent))
            .cloned(),
        StorageBackend::Postgres(pool) => {
            energon_db::dreams::own(pool, &agent, &input.dream_id).await?
        }
    }
    .ok_or_else(|| ApiError::NotFound("private dream not found".into()))?;
    let dream = source.share(
        format!("dream_{}", state.next_memory_id()),
        &agent,
        input,
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
    use energon_core::MemoryScope;

    fn headers(id: &str, org: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("x-energon-agent-id", HeaderValue::from_str(id).unwrap());
        headers.insert("x-energon-org-id", HeaderValue::from_str(org).unwrap());
        headers
    }
    fn draft(content: &str) -> DreamDraft {
        DreamDraft {
            content: content.into(),
            tags: vec![],
            inspired_by: vec![],
        }
    }
    fn share_input(id: &str, content: &str) -> DreamShare {
        DreamShare {
            dream_id: id.into(),
            content: content.into(),
            target_scope: MemoryScope::Org,
            reason: "Discuss".into(),
            tags: vec![],
        }
    }
    async fn journal(
        state: &AppState,
        agent: &str,
        org: &str,
        params: ListDreams,
    ) -> serde_json::Value {
        let Json(page) = list(State(state.clone()), headers(agent, org), Query(params))
            .await
            .unwrap();
        page
    }

    #[tokio::test]
    async fn dreams_are_private_isolated_and_only_explicitly_shared() {
        let state = AppState::for_dream_tests();
        write(
            State(state.clone()),
            headers("author", "org"),
            Json(draft("Private reflection")),
        )
        .await
        .unwrap();
        let own = journal(&state, "author", "org", ListDreams::default()).await;
        let id = own["dreams"][0]["memory_id"].as_str().unwrap().to_owned();
        assert_eq!(own["dreams"].as_array().unwrap().len(), 1);
        let other = journal(&state, "other", "org", ListDreams::default()).await;
        assert!(other["dreams"].as_array().unwrap().is_empty());
        let error = share(
            State(state.clone()),
            headers("other", "org"),
            Json(share_input(&id, "Excerpt")),
        )
        .await;
        assert!(matches!(error, Err(ApiError::NotFound(_))));
        share(
            State(state.clone()),
            headers("author", "org"),
            Json(share_input(&id, "Chosen excerpt")),
        )
        .await
        .unwrap();
        let shared = journal(&state, "other", "org", ListDreams::default()).await;
        assert_eq!(shared["dreams"].as_array().unwrap().len(), 1);
        assert_eq!(shared["dreams"][0]["content"], "Chosen excerpt");
        assert_eq!(shared["dreams"][0]["speculative"], true);
        let outsider = journal(&state, "author", "elsewhere", ListDreams::default()).await;
        assert!(outsider["dreams"].as_array().unwrap().is_empty());
        if let StorageBackend::Memory(store) = &state.storage {
            assert!(
                store.memories.read().unwrap().is_empty(),
                "dreams cannot become context candidates"
            );
            assert_eq!(store.dreams.read().unwrap().len(), 2);
        }
    }

    #[tokio::test]
    async fn journal_pages_filters_and_reads_single_dreams() {
        let state = AppState::for_dream_tests();
        for (content, tag) in [("first", "growth"), ("second", "ops"), ("third", "growth")] {
            let mut input = draft(content);
            input.tags = vec![tag.into()];
            write(State(state.clone()), headers("author", "org"), Json(input))
                .await
                .unwrap();
        }

        let first_page = journal(
            &state,
            "author",
            "org",
            ListDreams {
                limit: Some(2),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(first_page["dreams"].as_array().unwrap().len(), 2);
        let cursor = first_page["next_cursor"].as_str().unwrap().to_owned();
        let second_page = journal(
            &state,
            "author",
            "org",
            ListDreams {
                limit: Some(2),
                cursor: Some(cursor),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(second_page["dreams"].as_array().unwrap().len(), 1);
        assert!(second_page["next_cursor"].is_null());

        let tagged = journal(
            &state,
            "author",
            "org",
            ListDreams {
                tag: Some("growth".into()),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(tagged["dreams"].as_array().unwrap().len(), 2);

        let id = tagged["dreams"][0]["memory_id"]
            .as_str()
            .unwrap()
            .to_owned();
        let Json(dream) = get(
            State(state.clone()),
            headers("author", "org"),
            Path(id.clone()),
        )
        .await
        .unwrap();
        assert_eq!(dream.memory.memory_id, id);
        assert!(matches!(
            get(State(state.clone()), headers("other", "org"), Path(id)).await,
            Err(ApiError::NotFound(_))
        ));

        assert!(matches!(
            ListDreams {
                limit: Some(0),
                ..Default::default()
            }
            .into_query(),
            Err(ApiError::BadRequest(_))
        ));
        assert!(matches!(
            ListDreams {
                cursor: Some("garbage".into()),
                ..Default::default()
            }
            .into_query(),
            Err(ApiError::BadRequest(_))
        ));
    }

    #[tokio::test]
    async fn only_the_author_can_forget_and_sharers_can_retract() {
        let state = AppState::for_dream_tests();
        let created = write_as(&state, "author", draft("Keep or forget")).await;
        let id = created.memory.memory_id.clone();
        let shared = share(
            State(state.clone()),
            headers("author", "org"),
            Json(share_input(&id, "Excerpt")),
        )
        .await
        .unwrap();
        let shared = record_from(shared).await;

        for target in [&id, &shared.memory.memory_id] {
            assert!(matches!(
                forget(
                    State(state.clone()),
                    headers("other", "org"),
                    Path(target.clone())
                )
                .await,
                Err(ApiError::NotFound(_))
            ));
        }
        let Json(forgotten) = forget(State(state.clone()), headers("author", "org"), Path(id))
            .await
            .unwrap();
        assert_eq!(forgotten["forgotten"], true);
        let reader = journal(&state, "other", "org", ListDreams::default()).await;
        assert_eq!(
            reader["dreams"].as_array().unwrap().len(),
            1,
            "forgetting the private original keeps the shared excerpt"
        );
        let Json(retracted) = forget(
            State(state.clone()),
            headers("author", "org"),
            Path(shared.memory.memory_id),
        )
        .await
        .unwrap();
        assert_eq!(retracted["forgotten"], true);
        let reader = journal(&state, "other", "org", ListDreams::default()).await;
        assert!(reader["dreams"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn inspirations_must_be_readable_by_the_author() {
        let state = AppState::for_dream_tests();
        let foreign = write_as(&state, "other", draft("Someone else's private dream")).await;
        let mut probing = draft("Builds on a private dream");
        probing.inspired_by = vec![foreign.memory.memory_id.clone()];
        assert!(matches!(
            write(
                State(state.clone()),
                headers("author", "org"),
                Json(probing)
            )
            .await,
            Err(ApiError::BadRequest(_))
        ));

        let own = write_as(&state, "author", draft("My earlier dream")).await;
        let mut chained = draft("A dream about my earlier dream");
        chained.inspired_by = vec![own.memory.memory_id.clone()];
        let chain = write_as(&state, "author", chained).await;
        assert_eq!(chain.inspired_by, vec![own.memory.memory_id]);
    }

    async fn write_as(state: &AppState, agent: &str, input: DreamDraft) -> DreamRecord {
        let response = write(State(state.clone()), headers(agent, "org"), Json(input))
            .await
            .unwrap();
        record_from(response).await
    }

    async fn record_from(response: Response) -> DreamRecord {
        let body = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[test]
    fn request_cannot_supply_ownership_or_verified_status() {
        assert!(
            serde_json::from_value::<DreamDraft>(json!({"content":"idea", "speculative": false}))
                .is_err()
        );
        assert!(
            serde_json::from_value::<DreamDraft>(json!({"content":"idea", "org_id": "another"}))
                .is_err()
        );
    }
}
