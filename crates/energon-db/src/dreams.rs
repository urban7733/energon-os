use crate::DbError;
use energon_core::{AgentIdentity, dreams::DreamRecord};
use sqlx::{PgPool, types::Json};

pub async fn insert(pool: &PgPool, dream: &DreamRecord) -> Result<(), DbError> {
    let m = &dream.memory;
    sqlx::query("INSERT INTO agent_dreams (dream_id, org_id, owner_agent_id, scope, project_id, role_id, created_at_unix_ms, document) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(&m.memory_id).bind(&m.org_id).bind(&m.owner_agent_id)
        .bind(match m.scope { energon_core::MemoryScope::AgentPrivate => "agent_private", energon_core::MemoryScope::Open => "open", energon_core::MemoryScope::Org => "org", energon_core::MemoryScope::Project => "project", energon_core::MemoryScope::Role => "role", _ => unreachable!("dream scope is validated") })
        .bind(&m.project_id).bind(&m.role_id).bind(i64::try_from(m.created_at_unix_ms).map_err(|_| DbError::IntegerOutOfRange("created_at_unix_ms"))?).bind(Json(dream)).execute(pool).await?;
    Ok(())
}

pub async fn list(pool: &PgPool, agent: &AgentIdentity) -> Result<Vec<DreamRecord>, DbError> {
    let rows: Vec<(Json<DreamRecord>,)> = sqlx::query_as("SELECT document FROM agent_dreams WHERE org_id = $1 AND ((scope = 'agent_private' AND owner_agent_id = $2) OR scope IN ('open','org') OR (scope = 'project' AND project_id = $3) OR (scope = 'role' AND role_id = $4)) ORDER BY created_at_unix_ms DESC, dream_id DESC LIMIT 100")
        .bind(&agent.org_id).bind(&agent.agent_id).bind(&agent.project_id).bind(&agent.role_id).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(Json(dream),)| dream).collect())
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
