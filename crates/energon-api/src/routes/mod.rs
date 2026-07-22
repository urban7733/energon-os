use axum::{
    Router,
    routing::{delete, get, post},
};

use crate::state::AppState;

pub mod admin;
pub mod audit;
pub mod billing;
pub mod context;
pub mod health;
pub mod memory;
pub mod orgs;
pub mod runtime;
pub mod vault;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/agents", post(admin::create_agent))
        .route("/billing/x402", get(billing::get_x402_status))
        .route("/swarm/runtime", get(runtime::swarm_runtime))
        .route("/memory/write", post(memory::write_memory))
        .route("/memory/promote", post(memory::promote_memory))
        .route("/context/build", post(context::build_context))
        .route("/vault/obsidian.zip", get(vault::export_obsidian_vault))
        .route("/audit/context/{request_id}", get(audit::get_context_audit))
        .route(
            "/audit/promotion/{promoted_memory_id}",
            get(audit::get_promotion_audit),
        )
        .route(
            "/orgs/{org_id}/agents",
            post(orgs::create_org_agent).get(orgs::list_org_agents),
        )
        .route(
            "/orgs/{org_id}/agents/{agent_id}/keys",
            post(orgs::rotate_agent_key),
        )
        .route(
            "/orgs/{org_id}/keys/{api_key_id}",
            delete(orgs::revoke_api_key),
        )
        .route("/orgs/{org_id}/memories", get(orgs::list_org_memories))
        .route("/orgs/{org_id}/memory-stats", get(orgs::org_memory_stats))
        .route(
            "/orgs/{org_id}/memories/{memory_id}",
            delete(orgs::delete_org_memory),
        )
        .route("/orgs/{org_id}/usage", get(orgs::org_usage))
        .route("/orgs/{org_id}/billing", get(billing::get_billing_status))
        .route(
            "/orgs/{org_id}/billing/checkout",
            post(billing::create_checkout_intent),
        )
        .route(
            "/orgs/{org_id}/billing/complete",
            post(billing::complete_checkout),
        )
}
