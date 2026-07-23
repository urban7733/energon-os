use energon_core::ControlPlaneEvent;
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::DbError;

#[derive(Debug, Clone)]
pub struct PendingOutboxEvent {
    pub event_id: String,
    pub subject: String,
    pub payload: Vec<u8>,
    pub attempts: i32,
}

#[derive(Debug, Clone, Default)]
pub struct OutboxSummary {
    pub pending: i64,
    pub leased: i64,
    pub published: i64,
    pub retrying: i64,
}

pub async fn enqueue_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    event: &ControlPlaneEvent,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO event_outbox (
            event_id,
            org_id,
            subject,
            schema_version,
            payload,
            occurred_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            to_timestamp($6::double precision / 1000.0)
        )
        ON CONFLICT (event_id) DO NOTHING
        "#,
    )
    .bind(&event.event_id)
    .bind(&event.org_id)
    .bind(event.subject())
    .bind(i32::try_from(event.schema_version).unwrap_or(i32::MAX))
    .bind(event.encode())
    .bind(event.occurred_at_unix_ms as f64)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Lease ready events with `SKIP LOCKED` so multiple publisher workers can run
/// safely without handing the same event to NATS concurrently.
pub async fn claim_batch(
    pool: &PgPool,
    worker_id: &str,
    limit: i64,
    lease_seconds: i64,
) -> Result<Vec<PendingOutboxEvent>, DbError> {
    let rows = sqlx::query(
        r#"
        WITH candidates AS (
            SELECT event_id
            FROM event_outbox
            WHERE published_at IS NULL
              AND available_at <= now()
              AND (lease_expires_at IS NULL OR lease_expires_at <= now())
            ORDER BY created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE event_outbox AS outbox
        SET attempts = attempts + 1,
            lease_owner = $2,
            lease_expires_at = now() + make_interval(secs => $3::double precision),
            last_error = NULL
        FROM candidates
        WHERE outbox.event_id = candidates.event_id
        RETURNING outbox.event_id, outbox.subject, outbox.payload, outbox.attempts
        "#,
    )
    .bind(limit.clamp(1, 500))
    .bind(worker_id)
    .bind(lease_seconds.clamp(5, 3_600))
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(PendingOutboxEvent {
                event_id: row.try_get("event_id")?,
                subject: row.try_get("subject")?,
                payload: row.try_get("payload")?,
                attempts: row.try_get("attempts")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(Into::into)
}

pub async fn mark_published(
    pool: &PgPool,
    event_id: &str,
    worker_id: &str,
) -> Result<bool, DbError> {
    let result = sqlx::query(
        r#"
        UPDATE event_outbox
        SET published_at = now(),
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error = NULL
        WHERE event_id = $1
          AND lease_owner = $2
          AND published_at IS NULL
        "#,
    )
    .bind(event_id)
    .bind(worker_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

pub async fn release_after_failure(
    pool: &PgPool,
    event_id: &str,
    worker_id: &str,
    retry_after_seconds: i64,
    error: &str,
) -> Result<bool, DbError> {
    let result = sqlx::query(
        r#"
        UPDATE event_outbox
        SET available_at = now() + make_interval(secs => $3::double precision),
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error = left($4, 2_000)
        WHERE event_id = $1
          AND lease_owner = $2
          AND published_at IS NULL
        "#,
    )
    .bind(event_id)
    .bind(worker_id)
    .bind(retry_after_seconds.clamp(1, 3_600))
    .bind(error)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

pub async fn summary(pool: &PgPool, org_id: &str) -> Result<OutboxSummary, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            count(*) FILTER (WHERE published_at IS NULL AND lease_expires_at IS NULL)::bigint AS pending,
            count(*) FILTER (WHERE published_at IS NULL AND lease_expires_at > now())::bigint AS leased,
            count(*) FILTER (WHERE published_at IS NOT NULL)::bigint AS published,
            count(*) FILTER (WHERE published_at IS NULL AND attempts > 1)::bigint AS retrying
        FROM event_outbox
        WHERE org_id = $1
        "#,
    )
    .bind(org_id)
    .fetch_one(pool)
    .await?;

    Ok(OutboxSummary {
        pending: row.try_get("pending")?,
        leased: row.try_get("leased")?,
        published: row.try_get("published")?,
        retrying: row.try_get("retrying")?,
    })
}
