use axum::{
    Router,
    routing::{get, post},
};

use crate::state::AppState;

pub mod admin;
pub mod audit;
pub mod billing;
pub mod context;
pub mod health;
pub mod memory;
pub mod vault;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/agents", post(admin::create_agent))
        .route("/billing/x402", get(billing::get_x402_status))
        .route("/memory/write", post(memory::write_memory))
        .route("/memory/promote", post(memory::promote_memory))
        .route("/context/build", post(context::build_context))
        .route("/vault/obsidian.zip", get(vault::export_obsidian_vault))
        .route("/audit/context/{request_id}", get(audit::get_context_audit))
        .route(
            "/audit/promotion/{promoted_memory_id}",
            get(audit::get_promotion_audit),
        )
}
