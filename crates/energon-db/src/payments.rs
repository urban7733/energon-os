use sqlx::{PgPool, Row};

use crate::DbError;

/// A settled x402 payment to persist.
#[derive(Debug, Clone)]
pub struct NewPaymentReceipt<'a> {
    pub receipt_id: &'a str,
    pub org_id: &'a str,
    pub agent_id: Option<&'a str>,
    pub route: &'a str,
    pub amount_usdc_micro: i64,
    pub network: &'a str,
    pub asset: &'a str,
    pub pay_to: &'a str,
    pub payer: Option<&'a str>,
    pub tx_hash: Option<&'a str>,
    pub facilitator_raw: &'a serde_json::Value,
}

pub async fn insert_payment_receipt(
    pool: &PgPool,
    receipt: &NewPaymentReceipt<'_>,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO payment_receipts (
            receipt_id,
            org_id,
            agent_id,
            route,
            amount_usdc_micro,
            network,
            asset,
            pay_to,
            payer,
            tx_hash,
            facilitator_raw
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        "#,
    )
    .bind(receipt.receipt_id)
    .bind(receipt.org_id)
    .bind(receipt.agent_id)
    .bind(receipt.route)
    .bind(receipt.amount_usdc_micro)
    .bind(receipt.network)
    .bind(receipt.asset)
    .bind(receipt.pay_to)
    .bind(receipt.payer)
    .bind(receipt.tx_hash)
    .bind(receipt.facilitator_raw)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn insert_usage_event(
    pool: &PgPool,
    event_id: &str,
    org_id: &str,
    agent_id: &str,
    route: &str,
    paid: bool,
    receipt_id: Option<&str>,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO usage_events (event_id, org_id, agent_id, route, paid, receipt_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(event_id)
    .bind(org_id)
    .bind(agent_id)
    .bind(route)
    .bind(paid)
    .bind(receipt_id)
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Debug, Clone)]
pub struct RouteUsageTotal {
    pub route: String,
    pub calls: i64,
    pub paid_calls: i64,
    pub amount_usdc_micro: i64,
}

#[derive(Debug, Clone)]
pub struct ReceiptSummary {
    pub receipt_id: String,
    pub agent_id: Option<String>,
    pub route: String,
    pub amount_usdc_micro: i64,
    pub network: String,
    pub payer: Option<String>,
    pub tx_hash: Option<String>,
    pub created_at_unix_ms: i64,
}

/// Per-route usage totals: call counts from usage_events joined with settled
/// USDC amounts from payment_receipts.
pub async fn usage_totals(pool: &PgPool, org_id: &str) -> Result<Vec<RouteUsageTotal>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            events.route,
            events.calls,
            events.paid_calls,
            COALESCE(receipts.amount_usdc_micro, 0) AS amount_usdc_micro
        FROM (
            SELECT
                route,
                count(*)::bigint AS calls,
                (count(*) FILTER (WHERE paid))::bigint AS paid_calls
            FROM usage_events
            WHERE org_id = $1
            GROUP BY route
        ) AS events
        LEFT JOIN (
            SELECT route, sum(amount_usdc_micro)::bigint AS amount_usdc_micro
            FROM payment_receipts
            WHERE org_id = $1
            GROUP BY route
        ) AS receipts ON receipts.route = events.route
        ORDER BY events.route
        "#,
    )
    .bind(org_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(RouteUsageTotal {
                route: row.try_get("route")?,
                calls: row.try_get("calls")?,
                paid_calls: row.try_get("paid_calls")?,
                amount_usdc_micro: row.try_get("amount_usdc_micro")?,
            })
        })
        .collect()
}

pub async fn recent_receipts(
    pool: &PgPool,
    org_id: &str,
    limit: i64,
) -> Result<Vec<ReceiptSummary>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            receipt_id,
            agent_id,
            route,
            amount_usdc_micro,
            network,
            payer,
            tx_hash,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM payment_receipts
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        "#,
    )
    .bind(org_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(ReceiptSummary {
                receipt_id: row.try_get("receipt_id")?,
                agent_id: row.try_get("agent_id")?,
                route: row.try_get("route")?,
                amount_usdc_micro: row.try_get("amount_usdc_micro")?,
                network: row.try_get("network")?,
                payer: row.try_get("payer")?,
                tx_hash: row.try_get("tx_hash")?,
                created_at_unix_ms: row.try_get("created_at_unix_ms")?,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end SQL test for receipt + usage-event persistence.
    ///
    /// Ignored by default because it needs a migrated Postgres. Run with:
    /// `DATABASE_URL=postgres://... cargo test -p energon-db -- --ignored`
    #[tokio::test]
    #[ignore = "requires DATABASE_URL pointing at a migrated Postgres"]
    async fn persists_receipts_and_usage_events() {
        let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let pool = crate::pool::connect(&database_url).await.expect("connect");
        crate::pool::run_migrations(&pool).await.expect("migrate");

        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let org_id = format!("org_test_{suffix}");
        let receipt_id = format!("rcpt_test_{suffix}");
        let event_id = format!("usage_test_{suffix}");
        let raw = serde_json::json!({
            "success": true,
            "transaction": "0xabc",
            "payer": "0xpayer"
        });

        insert_payment_receipt(
            &pool,
            &NewPaymentReceipt {
                receipt_id: &receipt_id,
                org_id: &org_id,
                agent_id: Some("agent_test"),
                route: "context_build",
                amount_usdc_micro: 3_000,
                network: "eip155:84532",
                asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                pay_to: "0x0000000000000000000000000000000000000001",
                payer: Some("0xpayer"),
                tx_hash: Some("0xabc"),
                facilitator_raw: &raw,
            },
        )
        .await
        .expect("insert receipt");

        insert_usage_event(
            &pool,
            &event_id,
            &org_id,
            "agent_test",
            "context_build",
            true,
            Some(&receipt_id),
        )
        .await
        .expect("insert usage event");

        let totals = usage_totals(&pool, &org_id).await.expect("usage totals");
        assert_eq!(totals.len(), 1);
        assert_eq!(totals[0].route, "context_build");
        assert_eq!(totals[0].calls, 1);
        assert_eq!(totals[0].paid_calls, 1);
        assert_eq!(totals[0].amount_usdc_micro, 3_000);

        let receipts = recent_receipts(&pool, &org_id, 10).await.expect("receipts");
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receipt_id, receipt_id);
        assert_eq!(receipts[0].tx_hash.as_deref(), Some("0xabc"));
        assert_eq!(receipts[0].payer.as_deref(), Some("0xpayer"));

        // Clean up test rows.
        sqlx::query("DELETE FROM usage_events WHERE org_id = $1")
            .bind(&org_id)
            .execute(&pool)
            .await
            .expect("cleanup usage events");
        sqlx::query("DELETE FROM payment_receipts WHERE org_id = $1")
            .bind(&org_id)
            .execute(&pool)
            .await
            .expect("cleanup receipts");
    }
}
