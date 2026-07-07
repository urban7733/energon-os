use axum::{
    Router,
    http::{
        HeaderName, HeaderValue, Method,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    routing::get,
};
use tower_http::cors::CorsLayer;

use crate::{
    routes,
    state::AppState,
    x402::{PAYMENT_REQUIRED_HEADER, PAYMENT_RESPONSE_HEADER, PAYMENT_SIGNATURE_HEADER},
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(routes::health::health))
        .nest("/v1", routes::router())
        .layer(cors_layer())
        .with_state(state)
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:3000"),
            HeaderValue::from_static("http://127.0.0.1:3000"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            axum::http::HeaderName::from_static("x-energon-admin-token"),
            axum::http::HeaderName::from_static("x-energon-agent-id"),
            axum::http::HeaderName::from_static("x-energon-org-id"),
            axum::http::HeaderName::from_static("x-energon-role-id"),
            axum::http::HeaderName::from_static("x-energon-project-id"),
            HeaderName::from_static(PAYMENT_SIGNATURE_HEADER),
        ])
        .expose_headers([
            HeaderName::from_static(PAYMENT_REQUIRED_HEADER),
            HeaderName::from_static(PAYMENT_RESPONSE_HEADER),
        ])
}
