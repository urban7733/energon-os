use axum::{
    Json,
    http::{HeaderName, StatusCode},
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
            | EnergonError::UntrustedAccessContext => ApiError::BadRequest(error.to_string()),
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
            ApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}
