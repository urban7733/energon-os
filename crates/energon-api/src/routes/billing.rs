use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde::{Deserialize, Serialize};

use crate::{
    chain::{checkout_authorization_message, verify_wallet_signature},
    errors::ApiError,
    jwt::{VerifiedOperator, operator_from_request},
    state::{AppState, StorageBackend, now_unix_ms},
};

const CHECKOUT_INTENT_LIFETIME_MS: i64 = 15 * 60 * 1000;

#[derive(Clone, Copy)]
struct Plan {
    id: &'static str,
    amount_usdc_micro: i64,
    included_operations: i64,
}

const DEVELOPER_PLAN: Plan = Plan {
    id: "developer",
    amount_usdc_micro: 99_000_000,
    included_operations: 100_000,
};
const TEAM_PLAN: Plan = Plan {
    id: "team",
    amount_usdc_micro: 499_000_000,
    included_operations: 1_000_000,
};

fn plan(plan_id: &str) -> Result<Plan, ApiError> {
    match plan_id {
        "developer" => Ok(DEVELOPER_PLAN),
        "team" => Ok(TEAM_PLAN),
        _ => Err(ApiError::BadRequest(
            "plan must be developer or team".to_owned(),
        )),
    }
}

async fn authorize_operator(
    state: &AppState,
    headers: &HeaderMap,
    org_id: &str,
) -> Result<VerifiedOperator, ApiError> {
    let operator = operator_from_request(state.jwt.as_ref(), headers).await?;
    operator.require_org(org_id)?;
    Ok(operator)
}

fn postgres_pool(state: &AppState) -> Result<&sqlx::PgPool, ApiError> {
    match &state.storage {
        StorageBackend::Postgres(pool) => Ok(pool),
        StorageBackend::Memory(_) => Err(ApiError::BadRequest(
            "billing requires Postgres storage (set DATABASE_URL)".to_owned(),
        )),
    }
}

pub async fn get_x402_status(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(state.x402.public_status())
}

#[derive(Debug, Serialize)]
pub struct BillingStatusResponse {
    pub configured: bool,
    pub entitlement: Option<EntitlementResponse>,
}

#[derive(Debug, Serialize)]
pub struct EntitlementResponse {
    pub plan_id: String,
    pub included_operations: i64,
    pub used_operations: i64,
    pub remaining_operations: i64,
    pub active_from_unix_ms: i64,
    pub expires_at_unix_ms: i64,
}

pub async fn get_billing_status(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<BillingStatusResponse>, ApiError> {
    authorize_operator(&state, &headers, &org_id).await?;
    let Some(_) = state.billing.as_ref() else {
        return Ok(Json(BillingStatusResponse {
            configured: false,
            entitlement: None,
        }));
    };
    let pool = postgres_pool(&state)?;
    let entitlement = energon_db::billing::active_entitlement(pool, &org_id)
        .await?
        .map(|entitlement| EntitlementResponse {
            remaining_operations: (entitlement.included_operations - entitlement.used_operations)
                .max(0),
            plan_id: entitlement.plan_id,
            included_operations: entitlement.included_operations,
            used_operations: entitlement.used_operations,
            active_from_unix_ms: entitlement.active_from_unix_ms,
            expires_at_unix_ms: entitlement.expires_at_unix_ms,
        });

    Ok(Json(BillingStatusResponse {
        configured: true,
        entitlement,
    }))
}

#[derive(Debug, Deserialize)]
pub struct CreateCheckoutIntentRequest {
    pub plan_id: String,
}

#[derive(Debug, Serialize)]
pub struct CheckoutIntentResponse {
    pub intent_id: String,
    pub plan_id: String,
    pub amount_usdc_micro: i64,
    pub network: String,
    pub chain_id: u64,
    pub asset: String,
    pub pay_to: String,
    pub expires_at_unix_ms: i64,
    pub explorer_base_url: String,
}

pub async fn create_checkout_intent(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CreateCheckoutIntentRequest>,
) -> Result<Json<CheckoutIntentResponse>, ApiError> {
    let operator = authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;
    let config = state.billing.as_ref().ok_or_else(|| {
        ApiError::PaymentUnavailable(
            "Base billing is not configured (set receiving wallet and ENERGON_BASE_RPC_URL)"
                .to_owned(),
        )
    })?;
    let plan = plan(request.plan_id.trim())?;
    energon_db::identity::ensure_org_exists(pool, &org_id).await?;

    let now: i64 = now_unix_ms()
        .try_into()
        .map_err(|_| ApiError::Internal("system clock exceeds billing range".to_owned()))?;
    let intent = energon_db::billing::CheckoutIntent {
        intent_id: state.next_checkout_intent_id(),
        org_id: org_id.clone(),
        operator_user_id: operator.user_id,
        plan_id: plan.id.to_owned(),
        amount_usdc_micro: plan.amount_usdc_micro,
        network: config.network.clone(),
        asset: config.asset.clone(),
        pay_to: config.pay_to.clone(),
        expires_at_unix_ms: now + CHECKOUT_INTENT_LIFETIME_MS,
    };
    energon_db::billing::create_checkout_intent(pool, &intent).await?;

    Ok(Json(CheckoutIntentResponse {
        intent_id: intent.intent_id,
        plan_id: intent.plan_id,
        amount_usdc_micro: intent.amount_usdc_micro,
        network: intent.network,
        chain_id: config.chain_id,
        asset: intent.asset,
        pay_to: intent.pay_to,
        expires_at_unix_ms: intent.expires_at_unix_ms,
        explorer_base_url: config.explorer_base_url.clone(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct CompleteCheckoutRequest {
    pub intent_id: String,
    pub transaction_hash: String,
    pub payer_address: String,
    pub signature: String,
}

pub async fn complete_checkout(
    State(state): State<AppState>,
    Path(org_id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<CompleteCheckoutRequest>,
) -> Result<Json<EntitlementResponse>, ApiError> {
    let operator = authorize_operator(&state, &headers, &org_id).await?;
    let pool = postgres_pool(&state)?;
    let config = state
        .billing
        .as_ref()
        .ok_or_else(|| ApiError::PaymentUnavailable("Base billing is not configured".to_owned()))?;
    let intent = energon_db::billing::pending_checkout_intent(
        pool,
        request.intent_id.trim(),
        &org_id,
        &operator.user_id,
    )
    .await?
    .ok_or_else(|| ApiError::NotFound("checkout intent is missing or expired".to_owned()))?;
    let plan = plan(&intent.plan_id)?;
    if intent.network != config.network
        || intent.asset != config.asset
        || intent.pay_to != config.pay_to
    {
        return Err(ApiError::PaymentUnavailable(
            "billing configuration changed; create a new checkout intent".to_owned(),
        ));
    }

    let message = checkout_authorization_message(
        &intent.intent_id,
        &intent.org_id,
        &intent.plan_id,
        intent.amount_usdc_micro,
        request.transaction_hash.trim(),
    );
    verify_wallet_signature(
        &message,
        request.signature.trim(),
        request.payer_address.trim(),
    )?;
    let transfer = config
        .verify_usdc_transfer(
            request.transaction_hash.trim(),
            request.payer_address.trim(),
            intent.amount_usdc_micro,
        )
        .await?;
    let entitlement = energon_db::billing::complete_checkout_intent(
        pool,
        &intent.intent_id,
        &org_id,
        &operator.user_id,
        &transfer.payer,
        request.transaction_hash.trim(),
        plan.included_operations,
    )
    .await?;

    Ok(Json(EntitlementResponse {
        remaining_operations: (entitlement.included_operations - entitlement.used_operations)
            .max(0),
        plan_id: entitlement.plan_id,
        included_operations: entitlement.included_operations,
        used_operations: entitlement.used_operations,
        active_from_unix_ms: entitlement.active_from_unix_ms,
        expires_at_unix_ms: entitlement.expires_at_unix_ms,
    }))
}
