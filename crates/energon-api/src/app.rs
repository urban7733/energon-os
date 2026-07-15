use std::env;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{
        HeaderName, HeaderValue, Method,
        header::{AUTHORIZATION, CONTENT_TYPE},
    },
    middleware as axum_middleware,
    routing::get,
};
use tower_http::cors::CorsLayer;

use crate::{
    middleware::rate_limit,
    routes,
    state::AppState,
    x402::{PAYMENT_REQUIRED_HEADER, PAYMENT_RESPONSE_HEADER, PAYMENT_SIGNATURE_HEADER},
};

const DEFAULT_MAX_BODY_BYTES: usize = 1024 * 1024; // 1 MiB

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(routes::health::health))
        .nest("/v1", routes::router())
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            rate_limit::rate_limit,
        ))
        .layer(DefaultBodyLimit::max(max_body_bytes()))
        .layer(cors_layer())
        .with_state(state)
}

fn max_body_bytes() -> usize {
    env::var("ENERGON_MAX_BODY_BYTES")
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_MAX_BODY_BYTES)
}

/// Browser CORS for the operator dashboard. `ENERGON_WEB_ORIGIN` accepts a
/// comma-separated origin list; localhost dev origins are always allowed.
/// Agent (server-to-server) traffic does not need CORS.
fn cors_layer() -> CorsLayer {
    let mut origins = vec![
        HeaderValue::from_static("http://localhost:3000"),
        HeaderValue::from_static("http://127.0.0.1:3000"),
        HeaderValue::from_static("http://localhost:3002"),
        HeaderValue::from_static("http://127.0.0.1:3002"),
    ];

    if let Ok(configured) = env::var("ENERGON_WEB_ORIGIN") {
        for origin in configured.split(',') {
            let origin = origin.trim();
            if origin.is_empty() {
                continue;
            }

            match HeaderValue::from_str(origin) {
                Ok(value) => {
                    if !origins.contains(&value) {
                        origins.push(value);
                    }
                }
                Err(_) => tracing::warn!(%origin, "ignoring invalid ENERGON_WEB_ORIGIN entry"),
            }
        }
    }

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            HeaderName::from_static("x-energon-admin-token"),
            HeaderName::from_static("x-energon-agent-id"),
            HeaderName::from_static("x-energon-org-id"),
            HeaderName::from_static("x-energon-role-id"),
            HeaderName::from_static("x-energon-project-id"),
            HeaderName::from_static(PAYMENT_SIGNATURE_HEADER),
        ])
        .expose_headers([
            HeaderName::from_static(PAYMENT_REQUIRED_HEADER),
            HeaderName::from_static(PAYMENT_RESPONSE_HEADER),
        ])
}
