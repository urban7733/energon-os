use energon_core::{AgentIdentity, MemoryRecord, MemoryScope, PromotionAuditRecord};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};

use crate::{DbError, audit, errors::i64_to_u128, identity};

pub async fn insert_memory(pool: &PgPool, record: &MemoryRecord) -> Result<(), DbError> {
    identity::ensure_memory_record_refs(pool, record).await?;

    let mut tx = pool.begin().await?;
    insert_memory_in_tx(&mut tx, record).await?;
    tx.commit().await?;

    Ok(())
}

pub async fn insert_promoted_memory(
    pool: &PgPool,
    record: &MemoryRecord,
    promotion: &PromotionAuditRecord,
) -> Result<(), DbError> {
    identity::ensure_memory_record_refs(pool, record).await?;

    let mut tx = pool.begin().await?;
    insert_memory_in_tx(&mut tx, record).await?;
    audit::insert_promotion_audit_in_tx(&mut tx, promotion).await?;
    tx.commit().await?;

    Ok(())
}

async fn insert_memory_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    record: &MemoryRecord,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO memory_entries (
            memory_id,
            org_id,
            scope,
            content,
            tags,
            project_id,
            role_id,
            owner_agent_id,
            user_id,
            session_id,
            source,
            promoted_from,
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
            $8,
            $9,
            $10,
            $11,
            $12,
            to_timestamp($13::double precision / 1000.0)
        )
        "#,
    )
    .bind(&record.memory_id)
    .bind(&record.org_id)
    .bind(scope_to_str(&record.scope))
    .bind(&record.content)
    .bind(&record.tags)
    .bind(&record.project_id)
    .bind(&record.role_id)
    .bind(&record.owner_agent_id)
    .bind(&record.user_id)
    .bind(&record.session_id)
    .bind(&record.source)
    .bind(&record.promoted_from)
    .bind(record.created_at_unix_ms as f64)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO memory_chunks (
            chunk_id,
            memory_id,
            chunk_index,
            content,
            created_at
        )
        VALUES ($1, $2, 0, $3, to_timestamp($4::double precision / 1000.0))
        ON CONFLICT (memory_id, chunk_index) DO NOTHING
        "#,
    )
    .bind(format!("chunk_{}_0", record.memory_id))
    .bind(&record.memory_id)
    .bind(&record.content)
    .bind(record.created_at_unix_ms as f64)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn get_memory(pool: &PgPool, memory_id: &str) -> Result<Option<MemoryRecord>, DbError> {
    let row = sqlx::query(memory_select_sql("WHERE memory_id = $1").as_str())
        .bind(memory_id)
        .fetch_optional(pool)
        .await?;

    row.map(row_to_memory).transpose()
}

pub async fn list_org_memories(pool: &PgPool, org_id: &str) -> Result<Vec<MemoryRecord>, DbError> {
    let rows = sqlx::query(memory_select_sql("WHERE org_id = $1").as_str())
        .bind(org_id)
        .fetch_all(pool)
        .await?;

    rows.into_iter().map(row_to_memory).collect()
}

pub async fn list_candidate_memories(
    pool: &PgPool,
    agent: &AgentIdentity,
    project_id: Option<&str>,
    user_id: Option<&str>,
    session_id: Option<&str>,
    limit: i64,
) -> Result<Vec<MemoryRecord>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            memory_id,
            org_id,
            scope,
            content,
            tags,
            project_id,
            role_id,
            owner_agent_id,
            user_id,
            session_id,
            source,
            promoted_from,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM memory_entries
        WHERE org_id = $1
          AND (
            scope IN ('open', 'org')
            OR (scope = 'project' AND project_id = $2)
            OR (scope = 'role' AND role_id = $3)
            OR (scope = 'agent_private' AND owner_agent_id = $4)
            OR (scope = 'user_private' AND user_id = $5)
            OR (scope = 'session' AND session_id = $6)
          )
        ORDER BY created_at DESC
        LIMIT $7
        "#,
    )
    .bind(&agent.org_id)
    .bind(project_id)
    .bind(agent.role_id.as_deref())
    .bind(&agent.agent_id)
    .bind(user_id)
    .bind(session_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(row_to_memory).collect()
}

fn memory_select_sql(predicate: &str) -> String {
    format!(
        r#"
        SELECT
            memory_id,
            org_id,
            scope,
            content,
            tags,
            project_id,
            role_id,
            owner_agent_id,
            user_id,
            session_id,
            source,
            promoted_from,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM memory_entries
        {predicate}
        ORDER BY created_at DESC
        "#
    )
}

fn row_to_memory(row: PgRow) -> Result<MemoryRecord, DbError> {
    let scope: String = row.try_get("scope")?;
    let created_at_unix_ms: i64 = row.try_get("created_at_unix_ms")?;

    Ok(MemoryRecord {
        memory_id: row.try_get("memory_id")?,
        org_id: row.try_get("org_id")?,
        scope: scope_from_str(&scope)?,
        content: row.try_get("content")?,
        tags: row.try_get("tags")?,
        project_id: row.try_get("project_id")?,
        role_id: row.try_get("role_id")?,
        owner_agent_id: row.try_get("owner_agent_id")?,
        user_id: row.try_get("user_id")?,
        session_id: row.try_get("session_id")?,
        source: row.try_get("source")?,
        promoted_from: row.try_get("promoted_from")?,
        created_at_unix_ms: i64_to_u128(created_at_unix_ms, "created_at_unix_ms")?,
    })
}

pub fn scope_to_str(scope: &MemoryScope) -> &'static str {
    match scope {
        MemoryScope::Open => "open",
        MemoryScope::Org => "org",
        MemoryScope::Project => "project",
        MemoryScope::Role => "role",
        MemoryScope::AgentPrivate => "agent_private",
        MemoryScope::UserPrivate => "user_private",
        MemoryScope::Session => "session",
    }
}

pub fn scope_from_str(scope: &str) -> Result<MemoryScope, DbError> {
    match scope {
        "open" => Ok(MemoryScope::Open),
        "org" => Ok(MemoryScope::Org),
        "project" => Ok(MemoryScope::Project),
        "role" => Ok(MemoryScope::Role),
        "agent_private" => Ok(MemoryScope::AgentPrivate),
        "user_private" => Ok(MemoryScope::UserPrivate),
        "session" => Ok(MemoryScope::Session),
        _ => Err(DbError::InvalidMemoryScope(scope.to_owned())),
    }
}
