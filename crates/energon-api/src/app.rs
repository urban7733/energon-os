use axum::{Router, routing::get};

use crate::{routes, state::AppState};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(routes::health::health))
        .nest("/v1", routes::router())
        .with_state(state)
}
