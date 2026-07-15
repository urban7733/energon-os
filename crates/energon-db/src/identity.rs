use energon_core::{AgentIdentity, MemoryRecord};
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::DbError;

pub async fn ensure_agent_identity(pool: &PgPool, agent: &AgentIdentity) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;
    ensure_org(&mut tx, &agent.org_id).await?;

    if let Some(project_id) = agent.project_id.as_deref() {
        ensure_project(&mut tx, &agent.org_id, project_id).await?;
    }

    if let Some(role_id) = agent.role_id.as_deref() {
        ensure_role(&mut tx, &agent.org_id, role_id).await?;
    }

    ensure_agent(
        &mut tx,
        &agent.agent_id,
        &agent.org_id,
        agent.project_id.as_deref(),
        agent.role_id.as_deref(),
    )
    .await?;

    tx.commit().await?;
    Ok(())
}

pub async fn ensure_memory_record_refs(
    pool: &PgPool,
    record: &MemoryRecord,
) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;
    ensure_org(&mut tx, &record.org_id).await?;

    if let Some(project_id) = record.project_id.as_deref() {
        ensure_project(&mut tx, &record.org_id, project_id).await?;
    }

    if let Some(role_id) = record.role_id.as_deref() {
        ensure_role(&mut tx, &record.org_id, role_id).await?;
    }

    if let Some(agent_id) = record.owner_agent_id.as_deref() {
        ensure_agent(
            &mut tx,
            agent_id,
            &record.org_id,
            record.project_id.as_deref(),
            record.role_id.as_deref(),
        )
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn create_agent_with_api_key(
    pool: &PgPool,
    agent: &AgentIdentity,
    name: &str,
    api_key_id: &str,
    key_hash: &str,
) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;
    ensure_org(&mut tx, &agent.org_id).await?;

    if let Some(project_id) = agent.project_id.as_deref() {
        ensure_project(&mut tx, &agent.org_id, project_id).await?;
    }

    if let Some(role_id) = agent.role_id.as_deref() {
        ensure_role(&mut tx, &agent.org_id, role_id).await?;
    }

    upsert_agent(
        &mut tx,
        &agent.agent_id,
        &agent.org_id,
        agent.project_id.as_deref(),
        agent.role_id.as_deref(),
        name,
    )
    .await?;

    sqlx::query(
        r#"
        INSERT INTO agent_api_keys (api_key_id, agent_id, key_hash)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(api_key_id)
    .bind(&agent.agent_id)
    .bind(key_hash)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}

/// Create the org row if it does not exist yet. Used to link Better Auth
/// organization ids to the Energon `orgs` table on first use.
pub async fn ensure_org_exists(pool: &PgPool, org_id: &str) -> Result<(), DbError> {
    let mut tx = pool.begin().await?;
    ensure_org(&mut tx, org_id).await?;
    tx.commit().await?;

    Ok(())
}

#[derive(Debug, Clone)]
pub struct ApiKeyMetadata {
    pub api_key_id: String,
    pub agent_id: String,
    pub created_at_unix_ms: i64,
    pub revoked_at_unix_ms: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct OrgAgent {
    pub agent_id: String,
    pub name: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
    pub created_at_unix_ms: i64,
    pub keys: Vec<ApiKeyMetadata>,
}

/// List all agents in an org with API key metadata (never hashes).
pub async fn list_org_agents(pool: &PgPool, org_id: &str) -> Result<Vec<OrgAgent>, DbError> {
    let agent_rows = sqlx::query(
        r#"
        SELECT
            agent_id,
            name,
            role_id,
            project_id,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM agents
        WHERE org_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(org_id)
    .fetch_all(pool)
    .await?;

    let key_rows = sqlx::query(
        r#"
        SELECT
            agent_api_keys.api_key_id,
            agent_api_keys.agent_id,
            floor(extract(epoch from agent_api_keys.created_at) * 1000)::bigint
                AS created_at_unix_ms,
            floor(extract(epoch from agent_api_keys.revoked_at) * 1000)::bigint
                AS revoked_at_unix_ms
        FROM agent_api_keys
        INNER JOIN agents ON agents.agent_id = agent_api_keys.agent_id
        WHERE agents.org_id = $1
        ORDER BY agent_api_keys.created_at DESC
        "#,
    )
    .bind(org_id)
    .fetch_all(pool)
    .await?;

    let mut keys_by_agent: std::collections::HashMap<String, Vec<ApiKeyMetadata>> =
        std::collections::HashMap::new();
    for row in key_rows {
        let metadata = ApiKeyMetadata {
            api_key_id: row.try_get("api_key_id")?,
            agent_id: row.try_get("agent_id")?,
            created_at_unix_ms: row.try_get("created_at_unix_ms")?,
            revoked_at_unix_ms: row.try_get("revoked_at_unix_ms")?,
        };
        keys_by_agent
            .entry(metadata.agent_id.clone())
            .or_default()
            .push(metadata);
    }

    agent_rows
        .into_iter()
        .map(|row| {
            let agent_id: String = row.try_get("agent_id")?;
            let keys = keys_by_agent.remove(&agent_id).unwrap_or_default();

            Ok(OrgAgent {
                agent_id,
                name: row.try_get("name")?,
                role_id: row.try_get("role_id")?,
                project_id: row.try_get("project_id")?,
                created_at_unix_ms: row.try_get("created_at_unix_ms")?,
                keys,
            })
        })
        .collect()
}

/// Insert a fresh API key for an existing agent, enforcing org membership.
/// Returns `false` when the agent does not belong to the org.
pub async fn insert_agent_api_key(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
    api_key_id: &str,
    key_hash: &str,
) -> Result<bool, DbError> {
    let result = sqlx::query(
        r#"
        INSERT INTO agent_api_keys (api_key_id, agent_id, key_hash)
        SELECT $1, agents.agent_id, $3
        FROM agents
        WHERE agents.agent_id = $2
          AND agents.org_id = $4
        "#,
    )
    .bind(api_key_id)
    .bind(agent_id)
    .bind(key_hash)
    .bind(org_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

/// Revoke an API key, enforcing org membership through the owning agent.
/// Returns `false` when no active key matched inside the org.
pub async fn revoke_agent_api_key(
    pool: &PgPool,
    org_id: &str,
    api_key_id: &str,
) -> Result<bool, DbError> {
    let result = sqlx::query(
        r#"
        UPDATE agent_api_keys
        SET revoked_at = now()
        FROM agents
        WHERE agent_api_keys.api_key_id = $1
          AND agent_api_keys.revoked_at IS NULL
          AND agents.agent_id = agent_api_keys.agent_id
          AND agents.org_id = $2
        "#,
    )
    .bind(api_key_id)
    .bind(org_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

pub async fn agent_for_api_key_hash(
    pool: &PgPool,
    key_hash: &str,
) -> Result<Option<AgentIdentity>, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            agents.agent_id,
            agents.org_id,
            agents.role_id,
            agents.project_id
        FROM agent_api_keys
        INNER JOIN agents ON agents.agent_id = agent_api_keys.agent_id
        WHERE agent_api_keys.key_hash = $1
          AND agent_api_keys.revoked_at IS NULL
        "#,
    )
    .bind(key_hash)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(AgentIdentity {
        agent_id: row.try_get("agent_id")?,
        org_id: row.try_get("org_id")?,
        role_id: row.try_get("role_id")?,
        project_id: row.try_get("project_id")?,
    }))
}

async fn ensure_org(tx: &mut Transaction<'_, Postgres>, org_id: &str) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO orgs (org_id, name)
        VALUES ($1, $1)
        ON CONFLICT (org_id) DO NOTHING
        "#,
    )
    .bind(org_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn ensure_project(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    project_id: &str,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO projects (project_id, org_id, name)
        VALUES ($1, $2, $1)
        ON CONFLICT (project_id) DO NOTHING
        "#,
    )
    .bind(project_id)
    .bind(org_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn ensure_role(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    role_id: &str,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO roles (role_id, org_id, name)
        VALUES ($1, $2, $1)
        ON CONFLICT (role_id) DO NOTHING
        "#,
    )
    .bind(role_id)
    .bind(org_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn ensure_agent(
    tx: &mut Transaction<'_, Postgres>,
    agent_id: &str,
    org_id: &str,
    project_id: Option<&str>,
    role_id: Option<&str>,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO agents (agent_id, org_id, project_id, role_id, name)
        VALUES ($1, $2, $3, $4, $1)
        ON CONFLICT (agent_id) DO UPDATE SET
            org_id = EXCLUDED.org_id,
            project_id = EXCLUDED.project_id,
            role_id = EXCLUDED.role_id
        "#,
    )
    .bind(agent_id)
    .bind(org_id)
    .bind(project_id)
    .bind(role_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_agent(
    tx: &mut Transaction<'_, Postgres>,
    agent_id: &str,
    org_id: &str,
    project_id: Option<&str>,
    role_id: Option<&str>,
    name: &str,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO agents (agent_id, org_id, project_id, role_id, name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (agent_id) DO UPDATE SET
            org_id = EXCLUDED.org_id,
            project_id = EXCLUDED.project_id,
            role_id = EXCLUDED.role_id,
            name = EXCLUDED.name
        "#,
    )
    .bind(agent_id)
    .bind(org_id)
    .bind(project_id)
    .bind(role_id)
    .bind(name)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
