use crate::DbError;
use energon_core::{
    AgentIdentity, MemoryScope,
    dreams::{DreamQuery, DreamRecord, DreamView},
};
use sqlx::{PgPool, types::Json};

/// Rows an agent may read: its own private dreams plus shared dreams in
/// scopes it belongs to. Mirrors `energon_core::can_read_memory`.
const VISIBLE_TO_AGENT: &str = "org_id = $1 AND ((scope = 'agent_private' AND owner_agent_id = $2) OR scope IN ('open','org') OR (scope = 'project' AND project_id = $3) OR (scope = 'role' AND role_id = $4))";

pub async fn insert(pool: &PgPool, dream: &DreamRecord) -> Result<(), DbError> {
    let m = &dream.memory;
    let scope = match m.scope {
        MemoryScope::AgentPrivate => "agent_private",
        MemoryScope::Open => "open",
        MemoryScope::Org => "org",
        MemoryScope::Project => "project",
        MemoryScope::Role => "role",
        MemoryScope::UserPrivate | MemoryScope::Session => {
            return Err(DbError::InvalidMemoryScope(format!("{:?}", m.scope)));
        }
    };
    sqlx::query("INSERT INTO agent_dreams (dream_id, org_id, owner_agent_id, scope, project_id, role_id, created_at_unix_ms, document) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(&m.memory_id)
        .bind(&m.org_id)
        .bind(&m.owner_agent_id)
        .bind(scope)
        .bind(&m.project_id)
        .bind(&m.role_id)
        .bind(unix_ms(m.created_at_unix_ms, "created_at_unix_ms")?)
        .bind(Json(dream))
        .execute(pool)
        .await?;
    Ok(())
}

/// One newest-first journal page of dreams the agent may read.
pub async fn list(
    pool: &PgPool,
    agent: &AgentIdentity,
    query: &DreamQuery,
) -> Result<Vec<DreamRecord>, DbError> {
    let view = match query.view {
        DreamView::All => None,
        DreamView::Private => Some("private"),
        DreamView::Shared => Some("shared"),
    };
    let cursor_created = query
        .cursor
        .as_ref()
        .map(|cursor| unix_ms(cursor.created_at_unix_ms, "cursor"))
        .transpose()?;
    let cursor_id = query.cursor.as_ref().map(|cursor| cursor.dream_id.as_str());
    let limit = i64::try_from(query.limit).map_err(|_| DbError::IntegerOutOfRange("limit"))?;

    // Only the constant visibility clause is interpolated; every value is bound.
    let sql = format!(
        "SELECT document FROM agent_dreams WHERE {VISIBLE_TO_AGENT} \
         AND ($5::text IS NULL OR ($5 = 'private' AND scope = 'agent_private') OR ($5 = 'shared' AND scope <> 'agent_private')) \
         AND ($6::text IS NULL OR document->'tags' @> jsonb_build_array($6::text)) \
         AND ($7::bigint IS NULL OR created_at_unix_ms < $7 OR (created_at_unix_ms = $7 AND dream_id < $8)) \
         ORDER BY created_at_unix_ms DESC, dream_id DESC LIMIT $9"
    );
    let rows: Vec<(Json<DreamRecord>,)> = sqlx::query_as(&sql)
        .bind(&agent.org_id)
        .bind(&agent.agent_id)
        .bind(&agent.project_id)
        .bind(&agent.role_id)
        .bind(view)
        .bind(&query.tag)
        .bind(cursor_created)
        .bind(cursor_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|(Json(dream),)| dream).collect())
}

/// A single dream, if the agent may read it.
pub async fn visible(
    pool: &PgPool,
    agent: &AgentIdentity,
    id: &str,
) -> Result<Option<DreamRecord>, DbError> {
    let sql =
        format!("SELECT document FROM agent_dreams WHERE {VISIBLE_TO_AGENT} AND dream_id = $5");
    let row: Option<(Json<DreamRecord>,)> = sqlx::query_as(&sql)
        .bind(&agent.org_id)
        .bind(&agent.agent_id)
        .bind(&agent.project_id)
        .bind(&agent.role_id)
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(Json(dream),)| dream))
}

pub async fn own(
    pool: &PgPool,
    agent: &AgentIdentity,
    id: &str,
) -> Result<Option<DreamRecord>, DbError> {
    let row: Option<(Json<DreamRecord>,)> = sqlx::query_as("SELECT document FROM agent_dreams WHERE dream_id = $1 AND org_id = $2 AND owner_agent_id = $3 AND scope = 'agent_private'")
        .bind(id).bind(&agent.org_id).bind(&agent.agent_id).fetch_optional(pool).await?;
    Ok(row.map(|(Json(dream),)| dream))
}

/// Delete a private dream owned by the agent, or a shared excerpt the agent
/// published. Returns whether a row was removed.
pub async fn forget(pool: &PgPool, agent: &AgentIdentity, id: &str) -> Result<bool, DbError> {
    let result = sqlx::query(
        "DELETE FROM agent_dreams WHERE dream_id = $1 AND org_id = $2 \
         AND ((scope = 'agent_private' AND owner_agent_id = $3) \
           OR (scope <> 'agent_private' AND document->'sharing'->>'agent_id' = $3))",
    )
    .bind(id)
    .bind(&agent.org_id)
    .bind(&agent.agent_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

fn unix_ms(value: u128, field: &'static str) -> Result<i64, DbError> {
    i64::try_from(value).map_err(|_| DbError::IntegerOutOfRange(field))
}
