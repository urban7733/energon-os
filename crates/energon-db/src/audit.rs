use energon_core::{AgentIdentity, AuditRecord, ContextItem, PromotionAuditRecord};
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::{
    DbError,
    errors::{i64_to_u128, usize_to_i32},
    memory::{scope_from_str, scope_to_str},
};

pub async fn insert_context_audit(
    pool: &PgPool,
    audit: &AuditRecord,
    items: &[ContextItem],
) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO context_requests (
            request_id,
            agent_id,
            org_id,
            task,
            token_budget,
            estimated_tokens,
            denied_memory_count,
            created_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            to_timestamp($8::double precision / 1000.0)
        )
        "#,
    )
    .bind(&audit.request_id)
    .bind(&audit.agent_id)
    .bind(&audit.org_id)
    .bind(&audit.task)
    .bind(usize_to_i32(audit.token_budget, "token_budget")?)
    .bind(usize_to_i32(audit.estimated_tokens, "estimated_tokens")?)
    .bind(usize_to_i32(
        audit.denied_memory_count,
        "denied_memory_count",
    )?)
    .bind(audit.created_at_unix_ms as f64)
    .execute(&mut *tx)
    .await?;

    for item in items {
        sqlx::query(
            r#"
            INSERT INTO context_request_items (
                request_id,
                memory_id,
                scope,
                estimated_tokens,
                reason
            )
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(&audit.request_id)
        .bind(&item.memory_id)
        .bind(scope_to_str(&item.scope))
        .bind(usize_to_i32(item.estimated_tokens, "estimated_tokens")?)
        .bind(&item.reason)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

pub async fn get_context_audit(
    pool: &PgPool,
    request_id: &str,
) -> Result<Option<AuditRecord>, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            request_id,
            agent_id,
            org_id,
            task,
            token_budget,
            estimated_tokens,
            denied_memory_count,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM context_requests
        WHERE request_id = $1
        "#,
    )
    .bind(request_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let allowed_memory_ids = sqlx::query(
        r#"
        SELECT memory_id
        FROM context_request_items
        WHERE request_id = $1
        ORDER BY memory_id
        "#,
    )
    .bind(request_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| row.try_get("memory_id"))
    .collect::<Result<Vec<String>, sqlx::Error>>()?;

    let created_at_unix_ms: i64 = row.try_get("created_at_unix_ms")?;
    let token_budget: i32 = row.try_get("token_budget")?;
    let estimated_tokens: i32 = row.try_get("estimated_tokens")?;
    let denied_memory_count: i32 = row.try_get("denied_memory_count")?;

    Ok(Some(AuditRecord {
        request_id: row.try_get("request_id")?,
        agent_id: row.try_get("agent_id")?,
        org_id: row.try_get("org_id")?,
        task: row.try_get("task")?,
        allowed_memory_ids,
        denied_memory_count: i64_to_u128(denied_memory_count.into(), "denied_memory_count")?
            as usize,
        token_budget: i64_to_u128(token_budget.into(), "token_budget")? as usize,
        estimated_tokens: i64_to_u128(estimated_tokens.into(), "estimated_tokens")? as usize,
        created_at_unix_ms: i64_to_u128(created_at_unix_ms, "created_at_unix_ms")?,
    }))
}

pub async fn list_context_audits_for_agent(
    pool: &PgPool,
    agent: &AgentIdentity,
    limit: i64,
) -> Result<Vec<AuditRecord>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT request_id
        FROM context_requests
        WHERE agent_id = $1 AND org_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        "#,
    )
    .bind(&agent.agent_id)
    .bind(&agent.org_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    let mut audits = Vec::with_capacity(rows.len());
    for row in rows {
        let request_id: String = row.try_get("request_id")?;
        if let Some(audit) = get_context_audit(pool, &request_id).await? {
            audits.push(audit);
        }
    }

    Ok(audits)
}

pub async fn insert_promotion_audit_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    audit: &PromotionAuditRecord,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO memory_promotions (
            promotion_id,
            source_memory_id,
            promoted_memory_id,
            agent_id,
            org_id,
            target_scope,
            reason,
            created_at
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            to_timestamp($8::double precision / 1000.0)
        )
        "#,
    )
    .bind(&audit.promotion_id)
    .bind(&audit.source_memory_id)
    .bind(&audit.promoted_memory_id)
    .bind(&audit.agent_id)
    .bind(&audit.org_id)
    .bind(scope_to_str(&audit.target_scope))
    .bind(&audit.reason)
    .bind(audit.created_at_unix_ms as f64)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn get_promotion_audit(
    pool: &PgPool,
    promoted_memory_id: &str,
) -> Result<Option<PromotionAuditRecord>, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            promotion_id,
            source_memory_id,
            promoted_memory_id,
            agent_id,
            org_id,
            target_scope,
            reason,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM memory_promotions
        WHERE promoted_memory_id = $1
        "#,
    )
    .bind(promoted_memory_id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let target_scope: String = row.try_get("target_scope")?;
    let created_at_unix_ms: i64 = row.try_get("created_at_unix_ms")?;

    Ok(Some(PromotionAuditRecord {
        promotion_id: row.try_get("promotion_id")?,
        source_memory_id: row.try_get("source_memory_id")?,
        promoted_memory_id: row.try_get("promoted_memory_id")?,
        agent_id: row.try_get("agent_id")?,
        org_id: row.try_get("org_id")?,
        target_scope: scope_from_str(&target_scope)?,
        reason: row.try_get("reason")?,
        created_at_unix_ms: i64_to_u128(created_at_unix_ms, "created_at_unix_ms")?,
    }))
}

pub async fn list_promotion_audits_for_agent(
    pool: &PgPool,
    agent: &AgentIdentity,
    limit: i64,
) -> Result<Vec<PromotionAuditRecord>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            promotion_id,
            source_memory_id,
            promoted_memory_id,
            agent_id,
            org_id,
            target_scope,
            reason,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM memory_promotions
        WHERE agent_id = $1 AND org_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        "#,
    )
    .bind(&agent.agent_id)
    .bind(&agent.org_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(row_to_promotion_audit).collect()
}

fn row_to_promotion_audit(row: sqlx::postgres::PgRow) -> Result<PromotionAuditRecord, DbError> {
    let target_scope: String = row.try_get("target_scope")?;
    let created_at_unix_ms: i64 = row.try_get("created_at_unix_ms")?;

    Ok(PromotionAuditRecord {
        promotion_id: row.try_get("promotion_id")?,
        source_memory_id: row.try_get("source_memory_id")?,
        promoted_memory_id: row.try_get("promoted_memory_id")?,
        agent_id: row.try_get("agent_id")?,
        org_id: row.try_get("org_id")?,
        target_scope: scope_from_str(&target_scope)?,
        reason: row.try_get("reason")?,
        created_at_unix_ms: i64_to_u128(created_at_unix_ms, "created_at_unix_ms")?,
    })
}
