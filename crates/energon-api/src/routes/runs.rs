//! Agents report what they did. Runs stay private to the reporting agent and
//! are redacted before they are stored; they feed that agent's nightly training.
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use energon_core::training::{ReportRunRequest, RunOutcome, RunRecord};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    payments::{authorize_paid_usage, record_usage},
    state::{AppState, StorageBackend, now_unix_ms},
    x402::{PaidRoute, attach_payment_response},
};

const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 200;

#[derive(Debug, Serialize)]
pub struct RunReceipt {
    pub run_id: String,
    pub outcome: RunOutcome,
    pub redactions_applied: u32,
    pub created_at_unix_ms: u128,
}

#[derive(Debug, Deserialize)]
pub struct ListRunsQuery {
    pub limit: Option<usize>,
}

/// `POST /v1/runs`
pub async fn report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ReportRunRequest>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let run = RunRecord::new(state.next_run_id(), &agent, input, now_unix_ms())
        .map_err(|error| ApiError::BadRequest(error.to_string()))?;
    let payment = authorize_paid_usage(&state, &headers, &agent, PaidRoute::RunReport).await?;
    match &state.storage {
        StorageBackend::Memory(store) => store.runs.write().unwrap().push(run.clone()),
        StorageBackend::Postgres(pool) => energon_db::training::insert_run(pool, &run).await?,
    }
    record_usage(&state, &agent, PaidRoute::RunReport, &payment).await;

    let receipt = RunReceipt {
        run_id: run.run_id,
        outcome: run.outcome,
        redactions_applied: run.redactions_applied,
        created_at_unix_ms: run.created_at_unix_ms,
    };
    Ok(attach_payment_response(
        (StatusCode::CREATED, Json(receipt)).into_response(),
        payment.response_header,
    ))
}

/// `GET /v1/runs` — the calling agent's own runs, newest first.
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListRunsQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let runs = match &state.storage {
        StorageBackend::Memory(store) => {
            let mut runs: Vec<_> = store
                .runs
                .read()
                .unwrap()
                .iter()
                .filter(|run| run.org_id == agent.org_id && run.agent_id == agent.agent_id)
                .cloned()
                .collect();
            runs.sort_by(|a, b| {
                b.created_at_unix_ms
                    .cmp(&a.created_at_unix_ms)
                    .then_with(|| b.run_id.cmp(&a.run_id))
            });
            runs.truncate(limit);
            runs
        }
        StorageBackend::Postgres(pool) => {
            energon_db::training::list_runs(pool, &agent.org_id, &agent.agent_id, limit as i64)
                .await?
        }
    };
    Ok(Json(json!({ "runs": runs, "limit": limit })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::to_bytes, http::HeaderValue};

    fn headers(agent: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("x-energon-agent-id", HeaderValue::from_str(agent).unwrap());
        headers.insert("x-energon-org-id", HeaderValue::from_static("org_1"));
        headers
    }

    fn request(task: &str) -> ReportRunRequest {
        serde_json::from_value(json!({
            "task": task,
            "steps": [{ "cmd": "systemctl restart nginx", "env": { "API_TOKEN": "abc123456789" } }],
            "outcome": "success"
        }))
        .unwrap()
    }

    #[tokio::test]
    async fn runs_are_redacted_and_private_to_the_reporting_agent() {
        let state = AppState::for_dream_tests();
        let response = report(
            State(state.clone()),
            headers("agent_a"),
            Json(request("restart nginx")),
        )
        .await
        .unwrap();
        assert_eq!(response.status(), StatusCode::CREATED);
        let body: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                .unwrap();
        assert_eq!(body["redactions_applied"], 1);

        report(
            State(state.clone()),
            headers("agent_b"),
            Json(request("other agent")),
        )
        .await
        .unwrap();

        let Json(own) = list(
            State(state.clone()),
            headers("agent_a"),
            Query(ListRunsQuery { limit: None }),
        )
        .await
        .unwrap();
        let runs = own["runs"].as_array().unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0]["task"], "restart nginx");
        assert_eq!(runs[0]["steps"][0]["env"]["API_TOKEN"], "[REDACTED:field]");
    }

    #[tokio::test]
    async fn rejects_invalid_runs() {
        let state = AppState::for_dream_tests();
        let error = report(State(state), headers("agent_a"), Json(request("   ")))
            .await
            .unwrap_err();
        assert!(matches!(error, ApiError::BadRequest(_)));
    }
}
