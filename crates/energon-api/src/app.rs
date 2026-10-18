use std::{env, time::Duration};

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{
        HeaderName, HeaderValue, Method, StatusCode,
        header::{
            AUTHORIZATION, CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, REFERRER_POLICY,
            STRICT_TRANSPORT_SECURITY, X_CONTENT_TYPE_OPTIONS, X_FRAME_OPTIONS,
        },
    },
    middleware as axum_middleware,
    response::Response,
    routing::get,
};
use tower_http::{cors::CorsLayer, timeout::TimeoutLayer};

use crate::{
    middleware::rate_limit,
    routes,
    state::{AppState, is_production},
    x402::{PAYMENT_REQUIRED_HEADER, PAYMENT_RESPONSE_HEADER, PAYMENT_SIGNATURE_HEADER},
};

const DEFAULT_MAX_BODY_BYTES: usize = 1024 * 1024; // 1 MiB
const DEFAULT_REQUEST_TIMEOUT_SECONDS: u64 = 60;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(routes::health::health))
        .nest("/v1", routes::router())
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            rate_limit::rate_limit,
        ))
        .layer(DefaultBodyLimit::max(max_body_bytes()))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            request_timeout(),
        ))
        .layer(cors_layer())
        .layer(axum_middleware::map_response(security_headers))
        .with_state(state)
}

/// Every API response carries agent memory, credentials, or audit data, so
/// none of it may be cached, sniffed into another content type, framed, or
/// rendered as an active document by a browser.
async fn security_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert(
        CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'"),
    );
    headers
        .entry(CACHE_CONTROL)
        .or_insert(HeaderValue::from_static("no-store"));

    if is_production() {
        headers.insert(
            STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=63072000; includeSubDomains"),
        );
    }

    response
}

fn request_timeout() -> Duration {
    let seconds = env::var("ENERGON_REQUEST_TIMEOUT_SECONDS")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_REQUEST_TIMEOUT_SECONDS);

    Duration::from_secs(seconds)
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
    let mut origins = Vec::new();

    if !is_production() {
        origins.extend([
            HeaderValue::from_static("http://localhost:3000"),
            HeaderValue::from_static("http://127.0.0.1:3000"),
            HeaderValue::from_static("http://localhost:3002"),
            HeaderValue::from_static("http://127.0.0.1:3002"),
        ]);
    }

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
            HeaderName::from_static("x-energon-sdk"),
            HeaderName::from_static(PAYMENT_SIGNATURE_HEADER),
        ])
        .expose_headers([
            HeaderName::from_static(PAYMENT_REQUIRED_HEADER),
            HeaderName::from_static(PAYMENT_RESPONSE_HEADER),
        ])
}
