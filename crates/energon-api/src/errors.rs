use axum::{
    Json,
    http::{HeaderName, HeaderValue, StatusCode, header::RETRY_AFTER},
    response::{IntoResponse, Response},
};
use energon_core::EnergonError;
use serde_json::json;

use crate::x402::{
    PAYMENT_REQUIRED_HEADER, PaymentRequiredResponse, payment_required_header_value,
};

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    PaymentRequired(Box<PaymentRequiredResponse>),
    PaymentUnavailable(String),
    TooManyRequests(String),
    Internal(String),
}

impl From<energon_db::DbError> for ApiError {
    fn from(error: energon_db::DbError) -> Self {
        match error {
            energon_db::DbError::AgentIdAlreadyInUse(agent_id) => {
                ApiError::BadRequest(format!("agent id is already registered: {agent_id}"))
            }
            energon_db::DbError::ClaimConflictNotFound(conflict_id) => {
                ApiError::NotFound(format!("claim conflict not found: {conflict_id}"))
            }
            energon_db::DbError::InvalidConflictResolution(message) => {
                ApiError::BadRequest(message)
            }
            energon_db::DbError::InvalidClaimEvidence(message) => ApiError::BadRequest(message),
            energon_db::DbError::SkillAssignmentAgentNotFound => ApiError::BadRequest(
                "one or more assigned agents do not belong to this organization".to_owned(),
            ),
            energon_db::DbError::SkillProfileNotFound(skill_id) => {
                ApiError::NotFound(format!("skill profile not found: {skill_id}"))
            }
            energon_db::DbError::PaymentTransactionAlreadyUsed => ApiError::BadRequest(
                "payment transaction was already used for another checkout".to_owned(),
            ),
            error => ApiError::Internal(format!("database error: {error}")),
        }
    }
}

impl From<EnergonError> for ApiError {
    fn from(error: EnergonError) -> Self {
        match error {
            EnergonError::EmptyMemory
            | EnergonError::EmptyPromotionReason
            | EnergonError::MissingProjectId
            | EnergonError::MissingRoleId
            | EnergonError::MissingUserId
            | EnergonError::MissingSessionId
            | EnergonError::InvalidPromotionSource
            | EnergonError::InvalidPromotionTarget
            | EnergonError::DirectSharedMemoryWriteNotAllowed
            | EnergonError::UntrustedAccessContext
            | EnergonError::InvalidIdentifier(_)
            | EnergonError::InputTooLarge { .. } => ApiError::BadRequest(error.to_string()),
            EnergonError::MemoryNotFound(_) => ApiError::NotFound(error.to_string()),
            EnergonError::PermissionDenied { .. } => ApiError::Forbidden(error.to_string()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if let ApiError::PaymentRequired(challenge) = self {
            let mut response = (StatusCode::PAYMENT_REQUIRED, Json(&challenge)).into_response();
            if let Ok(value) = payment_required_header_value(&challenge) {
                response
                    .headers_mut()
                    .insert(HeaderName::from_static(PAYMENT_REQUIRED_HEADER), value);
            }
            return response;
        }

        let (status, message) = match self {
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            ApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message),
            ApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            ApiError::PaymentRequired(_) => unreachable!("handled above"),
            ApiError::PaymentUnavailable(message) => (StatusCode::SERVICE_UNAVAILABLE, message),
            ApiError::TooManyRequests(message) => (StatusCode::TOO_MANY_REQUESTS, message),
            ApiError::Internal(message) => {
                // Internal details (SQL errors, upstream URLs, config names) stay in
                // server logs; clients only learn that the request failed.
                tracing::error!(error = %message, "internal API error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_owned(),
                )
            }
        };

        let mut response = (status, Json(json!({ "error": message }))).into_response();
        if status == StatusCode::TOO_MANY_REQUESTS {
            response
                .headers_mut()
                .insert(RETRY_AFTER, HeaderValue::from_static("1"));
        }
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn internal_errors_do_not_leak_details_to_clients() {
        let response =
            ApiError::Internal("database error: relation \"secret\" does not exist".to_owned())
                .into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("readable body");
        let body = String::from_utf8(body.to_vec()).expect("utf-8 body");
        assert!(!body.contains("secret"));
        assert!(body.contains("internal server error"));
    }

    #[test]
    fn rate_limited_responses_tell_clients_when_to_retry() {
        let response = ApiError::TooManyRequests("slow down".to_owned()).into_response();
        assert_eq!(response.headers()[RETRY_AFTER], "1");
    }
}
