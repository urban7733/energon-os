use axum::{
    Router,
    routing::{get, post},
};

use crate::state::AppState;

pub mod admin;
pub mod audit;
pub mod context;
pub mod health;
pub mod memory;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/agents", post(admin::create_agent))
        .route("/memory/write", post(memory::write_memory))
        .route("/memory/promote", post(memory::promote_memory))
        .route("/context/build", post(context::build_context))
        .route("/audit/context/{request_id}", get(audit::get_context_audit))
}
