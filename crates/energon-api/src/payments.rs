use energon_core::AgentIdentity;
use energon_db::payments::NewPaymentReceipt;

use crate::{
    state::{AppState, StorageBackend},
    x402::{PaidRoute, PaymentOutcome},
};

/// Persist the payment receipt (when a payment settled) and a usage event for
/// a paid-route call.
///
/// Postgres mode: both receipt and usage event are stored. In-memory mode:
/// only in-process counters are kept (no persistence — documented behavior).
///
/// Recording failures are logged but never fail the request: for settled
/// payments the money already moved, so serving the response is the correct
/// behavior even if bookkeeping fails.
pub async fn record_usage(
    state: &AppState,
    agent: &AgentIdentity,
    route: PaidRoute,
    outcome: &PaymentOutcome,
) {
    match &state.storage {
        StorageBackend::Memory(storage) => {
            let mut usage = storage.usage.write().unwrap();
            let counter = usage
                .entry((agent.org_id.clone(), route.key().to_owned()))
                .or_default();
            counter.calls += 1;
            if outcome.paid() {
                counter.paid_calls += 1;
            }
            if let Some(settled) = &outcome.settled {
                counter.amount_usdc_micro += settled.amount_usdc_micro;
            }
        }
        StorageBackend::Postgres(pool) => {
            let mut receipt_id: Option<String> = None;

            if let Some(settled) = &outcome.settled {
                let id = state.next_receipt_id();
                let receipt = NewPaymentReceipt {
                    receipt_id: &id,
                    org_id: &agent.org_id,
                    agent_id: Some(&agent.agent_id),
                    route: route.key(),
                    amount_usdc_micro: i64::try_from(settled.amount_usdc_micro).unwrap_or(i64::MAX),
                    network: &settled.network,
                    asset: &settled.asset,
                    pay_to: &settled.pay_to,
                    payer: settled.payer.as_deref(),
                    tx_hash: settled.tx_hash.as_deref(),
                    facilitator_raw: &settled.raw,
                };

                match energon_db::payments::insert_payment_receipt(pool, &receipt).await {
                    Ok(()) => receipt_id = Some(id),
                    Err(error) => {
                        tracing::error!(%error, route = route.key(), "failed to persist x402 receipt");
                    }
                }
            }

            let event_id = state.next_usage_event_id();
            if let Err(error) = energon_db::payments::insert_usage_event(
                pool,
                &event_id,
                &agent.org_id,
                &agent.agent_id,
                route.key(),
                outcome.paid(),
                receipt_id.as_deref(),
            )
            .await
            {
                tracing::error!(%error, route = route.key(), "failed to persist usage event");
            }
        }
    }
}
