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
