use axum::{Json, extract::State};

use crate::state::AppState;

pub async fn get_x402_status(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(state.x402.public_status())
}
