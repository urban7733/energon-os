use sqlx::{PgPool, Row};

use crate::DbError;

#[derive(Debug, Clone)]
pub struct CheckoutIntent {
    pub intent_id: String,
    pub org_id: String,
    pub operator_user_id: String,
    pub plan_id: String,
    pub amount_usdc_micro: i64,
    pub network: String,
    pub asset: String,
    pub pay_to: String,
    pub expires_at_unix_ms: i64,
}

#[derive(Debug, Clone)]
pub struct OrganizationEntitlement {
    pub plan_id: String,
    pub included_operations: i64,
    pub used_operations: i64,
    pub active_from_unix_ms: i64,
    pub expires_at_unix_ms: i64,
}

pub async fn create_checkout_intent(pool: &PgPool, intent: &CheckoutIntent) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO billing_checkout_intents (
            intent_id, org_id, operator_user_id, plan_id, amount_usdc_micro,
            network, asset, pay_to, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))
        "#,
    )
    .bind(&intent.intent_id)
    .bind(&intent.org_id)
    .bind(&intent.operator_user_id)
    .bind(&intent.plan_id)
    .bind(intent.amount_usdc_micro)
    .bind(&intent.network)
    .bind(&intent.asset)
    .bind(&intent.pay_to)
    .bind(intent.expires_at_unix_ms)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn pending_checkout_intent(
    pool: &PgPool,
    intent_id: &str,
    org_id: &str,
    operator_user_id: &str,
) -> Result<Option<CheckoutIntent>, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            intent_id,
            org_id,
            operator_user_id,
            plan_id,
            amount_usdc_micro,
            network,
            asset,
            pay_to,
            floor(extract(epoch from expires_at) * 1000)::bigint AS expires_at_unix_ms
        FROM billing_checkout_intents
        WHERE intent_id = $1
          AND org_id = $2
          AND operator_user_id = $3
          AND completed_at IS NULL
          AND expires_at > now()
        "#,
    )
    .bind(intent_id)
    .bind(org_id)
    .bind(operator_user_id)
    .fetch_optional(pool)
    .await?;

    row.as_ref().map(row_to_intent).transpose()
}

pub async fn complete_checkout_intent(
    pool: &PgPool,
    intent_id: &str,
    org_id: &str,
    operator_user_id: &str,
    payer: &str,
    tx_hash: &str,
    included_operations: i64,
) -> Result<OrganizationEntitlement, DbError> {
    let mut tx = pool.begin().await?;
    let intent = sqlx::query(
        r#"
        SELECT plan_id, amount_usdc_micro
        FROM billing_checkout_intents
        WHERE intent_id = $1
          AND org_id = $2
          AND operator_user_id = $3
          AND completed_at IS NULL
          AND expires_at > now()
        FOR UPDATE
        "#,
    )
    .bind(intent_id)
    .bind(org_id)
    .bind(operator_user_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(intent) = intent else {
        return Err(DbError::Sqlx(sqlx::Error::RowNotFound));
    };
    let plan_id: String = intent.try_get("plan_id")?;

    sqlx::query(
        r#"
        UPDATE billing_checkout_intents
        SET completed_at = now(), payer = $2, tx_hash = $3
        WHERE intent_id = $1
        "#,
    )
    .bind(intent_id)
    .bind(payer)
    .bind(tx_hash)
    .execute(&mut *tx)
    .await?;

    let row = sqlx::query(
        r#"
        INSERT INTO org_entitlements (
            org_id, plan_id, included_operations, used_operations,
            active_from, expires_at, source_intent_id, updated_at
        )
        VALUES ($1, $2, $3, 0, now(), now() + interval '30 days', $4, now())
        ON CONFLICT (org_id) DO UPDATE
        SET
            plan_id = EXCLUDED.plan_id,
            included_operations = EXCLUDED.included_operations,
            used_operations = 0,
            active_from = CASE
                WHEN org_entitlements.expires_at > now() THEN org_entitlements.active_from
                ELSE now()
            END,
            expires_at = CASE
                WHEN org_entitlements.expires_at > now()
                    THEN org_entitlements.expires_at + interval '30 days'
                ELSE now() + interval '30 days'
            END,
            source_intent_id = EXCLUDED.source_intent_id,
            updated_at = now()
        RETURNING
            plan_id,
            included_operations,
            used_operations,
            floor(extract(epoch from active_from) * 1000)::bigint AS active_from_unix_ms,
            floor(extract(epoch from expires_at) * 1000)::bigint AS expires_at_unix_ms
        "#,
    )
    .bind(org_id)
    .bind(plan_id)
    .bind(included_operations)
    .bind(intent_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    row_to_entitlement(&row)
}

pub async fn active_entitlement(
    pool: &PgPool,
    org_id: &str,
) -> Result<Option<OrganizationEntitlement>, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            plan_id,
            included_operations,
            used_operations,
            floor(extract(epoch from active_from) * 1000)::bigint AS active_from_unix_ms,
            floor(extract(epoch from expires_at) * 1000)::bigint AS expires_at_unix_ms
        FROM org_entitlements
        WHERE org_id = $1 AND expires_at > now()
        "#,
    )
    .bind(org_id)
    .fetch_optional(pool)
    .await?;

    row.as_ref().map(row_to_entitlement).transpose()
}

/// Atomically reserve one included operation. Returns false after the plan's
/// allowance is exhausted or when the plan is inactive.
pub async fn consume_included_operation(pool: &PgPool, org_id: &str) -> Result<bool, DbError> {
    let result = sqlx::query(
        r#"
        UPDATE org_entitlements
        SET used_operations = used_operations + 1, updated_at = now()
        WHERE org_id = $1
          AND expires_at > now()
          AND used_operations < included_operations
        "#,
    )
    .bind(org_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

fn row_to_entitlement(row: &sqlx::postgres::PgRow) -> Result<OrganizationEntitlement, DbError> {
    Ok(OrganizationEntitlement {
        plan_id: row.try_get("plan_id")?,
        included_operations: row.try_get("included_operations")?,
        used_operations: row.try_get("used_operations")?,
        active_from_unix_ms: row.try_get("active_from_unix_ms")?,
        expires_at_unix_ms: row.try_get("expires_at_unix_ms")?,
    })
}

fn row_to_intent(row: &sqlx::postgres::PgRow) -> Result<CheckoutIntent, DbError> {
    Ok(CheckoutIntent {
        intent_id: row.try_get("intent_id")?,
        org_id: row.try_get("org_id")?,
        operator_user_id: row.try_get("operator_user_id")?,
        plan_id: row.try_get("plan_id")?,
        amount_usdc_micro: row.try_get("amount_usdc_micro")?,
        network: row.try_get("network")?,
        asset: row.try_get("asset")?,
        pay_to: row.try_get("pay_to")?,
        expires_at_unix_ms: row.try_get("expires_at_unix_ms")?,
    })
}
