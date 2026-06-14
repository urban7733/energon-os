use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use energon_core::EnergonError;
use serde_json::json;

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Internal(String),
}

impl From<energon_db::DbError> for ApiError {
    fn from(error: energon_db::DbError) -> Self {
        ApiError::Internal(format!("database error: {error}"))
    }
}

impl From<EnergonError> for ApiError {
    fn from(error: EnergonError) -> Self {
        match error {
            EnergonError::EmptyMemory | EnergonError::InvalidPromotionTarget => {
                ApiError::BadRequest(error.to_string())
            }
            EnergonError::MemoryNotFound(_) => ApiError::NotFound(error.to_string()),
            EnergonError::PermissionDenied { .. } => ApiError::Forbidden(error.to_string()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            ApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message),
            ApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            ApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}
