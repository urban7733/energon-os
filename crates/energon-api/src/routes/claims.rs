use axum::{Json, extract::State, http::HeaderMap, response::Response};
use serde::{Deserialize, Serialize};

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    payments::{authorize_paid_usage, record_usage},
    state::{AppState, StorageBackend, now_unix_ms},
    x402::{PaidRoute, attach_payment_response},
};

#[derive(Debug, Deserialize)]
pub struct AssertClaimRequest {
    pub subject: String,
    pub predicate: String,
    pub value: serde_json::Value,
    pub confidence_bps: i32,
    #[serde(default)]
    pub evidence_memory_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ClaimResponse {
    pub claim_id: String,
    pub subject: String,
    pub predicate: String,
    pub value: serde_json::Value,
    pub confidence_bps: i32,
    pub authority_bps: i32,
    pub score: i64,
    pub state: String,
    pub conflict_id: Option<String>,
    pub created_at_unix_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct AssertClaimResponse {
    pub claim: ClaimResponse,
    pub resolution: &'static str,
    pub conflict_id: Option<String>,
}

/// `POST /v1/claims/assert` — agent-authenticated structured fact assertion.
/// Authority always comes from the organization policy, never this request.
pub async fn assert_claim(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<AssertClaimRequest>,
) -> Result<Response, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let StorageBackend::Postgres(pool) = &state.storage else {
        return Err(ApiError::BadRequest(
            "claims require Postgres storage (set DATABASE_URL)".to_owned(),
        ));
    };

    let subject = required_text(request.subject, "subject")?;
    let predicate = required_text(request.predicate, "predicate")?;
    if !(0..=10_000).contains(&request.confidence_bps) {
        return Err(ApiError::BadRequest(
            "confidence_bps must be between 0 and 10000".to_owned(),
        ));
    }
    if request.evidence_memory_ids.len() > 100 {
        return Err(ApiError::BadRequest(
            "evidence_memory_ids cannot contain more than 100 entries".to_owned(),
        ));
    }
    let value_size = serde_json::to_vec(&request.value)
        .map_err(|error| ApiError::BadRequest(format!("claim value is invalid JSON: {error}")))?
        .len();
    if value_size > 65_536 {
        return Err(ApiError::BadRequest(
            "claim value must not exceed 65536 bytes".to_owned(),
        ));
    }

    let payment = authorize_paid_usage(&state, &headers, &agent, PaidRoute::ClaimAssert).await?;
    record_usage(&state, &agent, PaidRoute::ClaimAssert, &payment).await;

    let asserted = energon_db::claims::assert_claim(
        pool,
        &agent,
        energon_db::claims::ClaimInput {
            claim_id: state.next_claim_id(),
            conflict_id: state.next_conflict_id(),
            subject,
            predicate,
            value: request.value,
            confidence_bps: request.confidence_bps,
            evidence_memory_ids: request
                .evidence_memory_ids
                .into_iter()
                .map(|id| id.trim().to_owned())
                .filter(|id| !id.is_empty())
                .collect(),
            created_at_unix_ms: now_unix_ms(),
        },
    )
    .await?;

    let resolution = match asserted.resolution {
        energon_core::ClaimResolution::SameValue => "same_value",
        energon_core::ClaimResolution::NewClaimWins => "accepted",
        energon_core::ClaimResolution::Contested => "contested",
    };
    let conflict_id = asserted
        .conflict
        .as_ref()
        .map(|conflict| conflict.conflict_id.clone());

    Ok(attach_payment_response(
        Json(AssertClaimResponse {
            claim: ClaimResponse {
                claim_id: asserted.claim.claim_id,
                subject: asserted.claim.subject,
                predicate: asserted.claim.predicate,
                value: asserted.claim.value,
                confidence_bps: asserted.claim.confidence_bps,
                authority_bps: asserted.claim.authority_bps,
                score: asserted.claim.score,
                state: asserted.claim.state,
                conflict_id: asserted.claim.conflict_id,
                created_at_unix_ms: asserted.claim.created_at_unix_ms,
            },
            resolution,
            conflict_id,
        }),
        payment.response_header,
    ))
}

fn required_text(value: String, field: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(ApiError::BadRequest(format!("{field} cannot be empty")));
    }
    if value.len() > 512 {
        return Err(ApiError::BadRequest(format!("{field} is too long")));
    }
    Ok(value)
}
