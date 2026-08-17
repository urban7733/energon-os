use sqlx::{PgPool, Row};

use crate::DbError;

#[derive(Debug, Clone)]
pub struct NewSkillProfile {
    pub skill_id: String,
    pub org_id: String,
    pub scope: String,
    pub name: String,
    pub instructions: String,
    pub allowed_tools: Vec<String>,
    pub requires_approval_for: Vec<String>,
    pub created_by_kind: String,
    pub created_by_id: String,
    pub assigned_agent_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct SkillProfile {
    pub skill_id: String,
    pub org_id: String,
    pub scope: String,
    pub name: String,
    pub instructions: String,
    pub allowed_tools: Vec<String>,
    pub requires_approval_for: Vec<String>,
    pub version: i32,
    pub created_by_kind: String,
    pub created_by_id: String,
    pub created_at_unix_ms: i64,
    pub assigned_agent_ids: Vec<String>,
}

pub async fn create_skill_profile(
    pool: &PgPool,
    profile: &NewSkillProfile,
) -> Result<SkillProfile, DbError> {
    let mut tx = pool.begin().await?;

    let row = sqlx::query(
        "SELECT count(*)::bigint AS count FROM agents WHERE org_id = $1 AND agent_id = ANY($2)",
    )
    .bind(&profile.org_id)
    .bind(&profile.assigned_agent_ids)
    .fetch_one(&mut *tx)
    .await?;
    let found: i64 = row.try_get("count")?;
    if found != profile.assigned_agent_ids.len() as i64 {
        return Err(DbError::SkillAssignmentAgentNotFound);
    }

    sqlx::query(
        r#"
        INSERT INTO agent_skill_profiles (
            skill_id, org_id, scope, name, instructions, allowed_tools,
            requires_approval_for, created_by_kind, created_by_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(&profile.skill_id)
    .bind(&profile.org_id)
    .bind(&profile.scope)
    .bind(&profile.name)
    .bind(&profile.instructions)
    .bind(&profile.allowed_tools)
    .bind(&profile.requires_approval_for)
    .bind(&profile.created_by_kind)
    .bind(&profile.created_by_id)
    .execute(&mut *tx)
    .await?;

    for agent_id in &profile.assigned_agent_ids {
        sqlx::query("INSERT INTO agent_skill_assignments (skill_id, agent_id) VALUES ($1, $2)")
            .bind(&profile.skill_id)
            .bind(agent_id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    get_skill_profile(pool, &profile.org_id, &profile.skill_id)
        .await?
        .ok_or_else(|| DbError::SkillProfileNotFound(profile.skill_id.clone()))
}

pub async fn list_org_skill_profiles(
    pool: &PgPool,
    org_id: &str,
) -> Result<Vec<SkillProfile>, DbError> {
    query_skill_profiles(
        pool,
        r#"
        SELECT
            profiles.skill_id,
            profiles.org_id,
            profiles.scope,
            profiles.name,
            profiles.instructions,
            profiles.allowed_tools,
            profiles.requires_approval_for,
            profiles.version,
            profiles.created_by_kind,
            profiles.created_by_id,
            floor(extract(epoch from profiles.created_at) * 1000)::bigint AS created_at_unix_ms,
            coalesce(array_agg(assignments.agent_id ORDER BY assignments.agent_id)
                FILTER (WHERE assignments.agent_id IS NOT NULL), '{}') AS assigned_agent_ids
        FROM agent_skill_profiles AS profiles
        LEFT JOIN agent_skill_assignments AS assignments ON assignments.skill_id = profiles.skill_id
        WHERE profiles.org_id = $1
        GROUP BY profiles.skill_id
        ORDER BY profiles.created_at DESC
        "#,
        org_id,
        None,
    )
    .await
}

pub async fn list_agent_skill_profiles(
    pool: &PgPool,
    org_id: &str,
    agent_id: &str,
) -> Result<Vec<SkillProfile>, DbError> {
    query_skill_profiles(
        pool,
        r#"
        SELECT
            profiles.skill_id,
            profiles.org_id,
            profiles.scope,
            profiles.name,
            profiles.instructions,
            profiles.allowed_tools,
            profiles.requires_approval_for,
            profiles.version,
            profiles.created_by_kind,
            profiles.created_by_id,
            floor(extract(epoch from profiles.created_at) * 1000)::bigint AS created_at_unix_ms,
            ARRAY[$2]::text[] AS assigned_agent_ids
        FROM agent_skill_profiles AS profiles
        INNER JOIN agent_skill_assignments AS assignments ON assignments.skill_id = profiles.skill_id
        WHERE profiles.org_id = $1
          AND assignments.agent_id = $2
        ORDER BY profiles.created_at DESC
        "#,
        org_id,
        Some(agent_id),
    )
    .await
}

async fn get_skill_profile(
    pool: &PgPool,
    org_id: &str,
    skill_id: &str,
) -> Result<Option<SkillProfile>, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            profiles.skill_id,
            profiles.org_id,
            profiles.scope,
            profiles.name,
            profiles.instructions,
            profiles.allowed_tools,
            profiles.requires_approval_for,
            profiles.version,
            profiles.created_by_kind,
            profiles.created_by_id,
            floor(extract(epoch from profiles.created_at) * 1000)::bigint AS created_at_unix_ms,
            coalesce(array_agg(assignments.agent_id ORDER BY assignments.agent_id)
                FILTER (WHERE assignments.agent_id IS NOT NULL), '{}') AS assigned_agent_ids
        FROM agent_skill_profiles AS profiles
        LEFT JOIN agent_skill_assignments AS assignments ON assignments.skill_id = profiles.skill_id
        WHERE profiles.org_id = $1
          AND profiles.skill_id = $2
        GROUP BY profiles.skill_id
        "#,
    )
    .bind(org_id)
    .bind(skill_id)
    .fetch_optional(pool)
    .await?;

    row.map(skill_profile_from_row).transpose()
}

async fn query_skill_profiles(
    pool: &PgPool,
    sql: &str,
    org_id: &str,
    agent_id: Option<&str>,
) -> Result<Vec<SkillProfile>, DbError> {
    let rows = if let Some(agent_id) = agent_id {
        sqlx::query(sql)
            .bind(org_id)
            .bind(agent_id)
            .fetch_all(pool)
            .await?
    } else {
        sqlx::query(sql).bind(org_id).fetch_all(pool).await?
    };

    rows.into_iter().map(skill_profile_from_row).collect()
}

fn skill_profile_from_row(row: sqlx::postgres::PgRow) -> Result<SkillProfile, DbError> {
    Ok(SkillProfile {
        skill_id: row.try_get("skill_id")?,
        org_id: row.try_get("org_id")?,
        scope: row.try_get("scope")?,
        name: row.try_get("name")?,
        instructions: row.try_get("instructions")?,
        allowed_tools: row.try_get("allowed_tools")?,
        requires_approval_for: row.try_get("requires_approval_for")?,
        version: row.try_get("version")?,
        created_by_kind: row.try_get("created_by_kind")?,
        created_by_id: row.try_get("created_by_id")?,
        created_at_unix_ms: row.try_get("created_at_unix_ms")?,
        assigned_agent_ids: row.try_get("assigned_agent_ids")?,
    })
}
