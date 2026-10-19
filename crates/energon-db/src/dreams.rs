use crate::DbError;
use energon_core::{
    AgentIdentity, MemoryScope,
    dreams::{DreamQuery, DreamRecord, DreamView},
};
use serde::Serialize;
use sqlx::{PgPool, Row, types::Json};

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

// ─── Operator views ─────────────────────────────────────────────────────────
// Operators manage the organization but do not read agents' private
// reflections. Every query below is restricted to shared dreams, except the
// aggregate counts in `org_stats`, which never select content.

const SHARED_IN_ORG: &str = "org_id = $1 AND scope <> 'agent_private'";

/// One newest-first page of the organization's shared dreams, optionally
/// filtered by tag or by the agent that shared them.
pub async fn list_shared_in_org(
    pool: &PgPool,
    org_id: &str,
    query: &DreamQuery,
    shared_by: Option<&str>,
) -> Result<Vec<DreamRecord>, DbError> {
    let cursor_created = query
        .cursor
        .as_ref()
        .map(|cursor| unix_ms(cursor.created_at_unix_ms, "cursor"))
        .transpose()?;
    let cursor_id = query.cursor.as_ref().map(|cursor| cursor.dream_id.as_str());
    let limit = i64::try_from(query.limit).map_err(|_| DbError::IntegerOutOfRange("limit"))?;

    // Only the constant scope clause is interpolated; every value is bound.
    let sql = format!(
        "SELECT document FROM agent_dreams WHERE {SHARED_IN_ORG} \
         AND ($2::text IS NULL OR document->'tags' @> jsonb_build_array($2::text)) \
         AND ($3::text IS NULL OR document->'sharing'->>'agent_id' = $3) \
         AND ($4::bigint IS NULL OR created_at_unix_ms < $4 OR (created_at_unix_ms = $4 AND dream_id < $5)) \
         ORDER BY created_at_unix_ms DESC, dream_id DESC LIMIT $6"
    );
    let rows: Vec<(Json<DreamRecord>,)> = sqlx::query_as(&sql)
        .bind(org_id)
        .bind(&query.tag)
        .bind(shared_by)
        .bind(cursor_created)
        .bind(cursor_id)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|(Json(dream),)| dream).collect())
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentDreamActivity {
    pub agent_id: String,
    pub private_dreams: i64,
    pub shared_dreams: i64,
    pub last_dream_at_unix_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DreamTagCount {
    pub tag: String,
    pub dreams: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrgDreamStats {
    pub private_dreams: i64,
    pub shared_dreams: i64,
    pub agents: Vec<AgentDreamActivity>,
    /// Most used tags on shared dreams. Private tags are never aggregated.
    pub shared_tags: Vec<DreamTagCount>,
}

pub async fn org_stats(pool: &PgPool, org_id: &str) -> Result<OrgDreamStats, DbError> {
    let agent_rows = sqlx::query(
        "SELECT COALESCE(owner_agent_id, document->'sharing'->>'agent_id', 'unknown') AS agent_id, \
                COUNT(*) FILTER (WHERE scope = 'agent_private') AS private_dreams, \
                COUNT(*) FILTER (WHERE scope <> 'agent_private') AS shared_dreams, \
                MAX(created_at_unix_ms) AS last_dream_at_unix_ms \
         FROM agent_dreams WHERE org_id = $1 \
         GROUP BY 1 ORDER BY last_dream_at_unix_ms DESC LIMIT 200",
    )
    .bind(org_id)
    .fetch_all(pool)
    .await?;
    let tag_rows = sqlx::query(
        "SELECT tag, COUNT(*) AS dreams \
         FROM agent_dreams, jsonb_array_elements_text(document->'tags') AS tag \
         WHERE org_id = $1 AND scope <> 'agent_private' \
         GROUP BY tag ORDER BY dreams DESC, tag LIMIT 20",
    )
    .bind(org_id)
    .fetch_all(pool)
    .await?;

    let agents = agent_rows
        .into_iter()
        .map(|row| {
            Ok(AgentDreamActivity {
                agent_id: row.try_get("agent_id")?,
                private_dreams: row.try_get("private_dreams")?,
                shared_dreams: row.try_get("shared_dreams")?,
                last_dream_at_unix_ms: row.try_get("last_dream_at_unix_ms")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    let shared_tags = tag_rows
        .into_iter()
        .map(|row| {
            Ok(DreamTagCount {
                tag: row.try_get("tag")?,
                dreams: row.try_get("dreams")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    Ok(OrgDreamStats {
        private_dreams: agents.iter().map(|agent| agent.private_dreams).sum(),
        shared_dreams: agents.iter().map(|agent| agent.shared_dreams).sum(),
        agents,
        shared_tags,
    })
}

/// Operator moderation: remove a shared dream. Private dreams cannot be
/// targeted, so an operator can never delete (or confirm) a private one.
pub async fn remove_shared_in_org(
    pool: &PgPool,
    org_id: &str,
    dream_id: &str,
) -> Result<bool, DbError> {
    let sql = format!("DELETE FROM agent_dreams WHERE {SHARED_IN_ORG} AND dream_id = $2");
    let result = sqlx::query(&sql)
        .bind(org_id)
        .bind(dream_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use energon_core::dreams::{DreamDraft, DreamShare};

    use super::*;

    #[tokio::test]
    #[ignore = "requires DATABASE_URL pointing at a migrated Postgres"]
    async fn operator_views_never_expose_or_delete_private_dreams() {
        let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let pool = crate::pool::connect(&database_url).await.expect("connect");
        crate::pool::run_migrations(&pool).await.expect("migrate");
        let suffix = std::process::id();
        let org = format!("org_dream_ops_{suffix}");
        let author = AgentIdentity::new("author", org.clone(), None, None);
        let draft = DreamDraft {
            content: "private reflection".into(),
            tags: vec!["secret-tag".into()],
            inspired_by: vec![],
        };
        let private = DreamRecord::private(format!("d_priv_{suffix}"), &author, draft, 1)
            .expect("private dream");
        let shared = private
            .share(
                format!("d_shared_{suffix}"),
                &author,
                DreamShare {
                    dream_id: private.memory.memory_id.clone(),
                    content: "shared excerpt".into(),
                    target_scope: MemoryScope::Org,
                    reason: "discuss".into(),
                    tags: vec!["public-tag".into()],
                },
                2,
            )
            .expect("shared dream");
        insert(&pool, &private).await.expect("insert private");
        insert(&pool, &shared).await.expect("insert shared");

        let page = list_shared_in_org(
            &pool,
            &org,
            &DreamQuery {
                limit: 50,
                ..Default::default()
            },
            None,
        )
        .await
        .expect("list");
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].memory.content, "shared excerpt");

        let stats = org_stats(&pool, &org).await.expect("stats");
        assert_eq!((stats.private_dreams, stats.shared_dreams), (1, 1));
        assert_eq!(stats.agents.len(), 1);
        let tags: Vec<_> = stats.shared_tags.iter().map(|t| t.tag.as_str()).collect();
        assert_eq!(
            tags,
            vec!["public-tag"],
            "private tags are never aggregated"
        );

        assert!(
            !remove_shared_in_org(&pool, &org, &private.memory.memory_id)
                .await
                .expect("remove private")
        );
        assert!(
            remove_shared_in_org(&pool, &org, &shared.memory.memory_id)
                .await
                .expect("remove shared")
        );
        assert!(
            own(&pool, &author, &private.memory.memory_id)
                .await
                .expect("own")
                .is_some(),
            "the private original survives moderation"
        );
        forget(&pool, &author, &private.memory.memory_id)
            .await
            .expect("cleanup");
    }
}
