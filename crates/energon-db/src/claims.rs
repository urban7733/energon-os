use energon_core::{AgentIdentity, ClaimResolution, ControlPlaneEvent, compare_claims};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::{DbError, event_outbox, identity};

const DEFAULT_AUTHORITY_BPS: i32 = 5_000;

#[derive(Debug, Clone)]
pub struct RolePolicy {
    pub role_id: String,
    pub authority_bps: i32,
    pub can_resolve_conflicts: bool,
    pub policy_version: i32,
    pub updated_at_unix_ms: i64,
}

#[derive(Debug, Clone)]
pub struct ClaimInput {
    pub claim_id: String,
    pub conflict_id: String,
    pub subject: String,
    pub predicate: String,
    pub value: Value,
    pub confidence_bps: i32,
    pub evidence_memory_ids: Vec<String>,
    pub created_at_unix_ms: u128,
}

#[derive(Debug, Clone)]
pub struct ClaimRecord {
    pub claim_id: String,
    pub org_id: String,
    pub subject: String,
    pub predicate: String,
    pub value: Value,
    pub confidence_bps: i32,
    pub authority_bps: i32,
    pub score: i64,
    pub asserted_by_agent_id: String,
    pub evidence_memory_ids: Vec<String>,
    pub state: String,
    pub conflict_id: Option<String>,
    pub created_at_unix_ms: i64,
}

#[derive(Debug, Clone)]
pub struct ClaimConflict {
    pub conflict_id: String,
    pub org_id: String,
    pub subject: String,
    pub predicate: String,
    pub incumbent_claim_id: String,
    pub challenger_claim_id: String,
    pub status: String,
    pub resolved_claim_id: Option<String>,
    pub resolution_reason: Option<String>,
    pub resolved_by_user_id: Option<String>,
    pub created_at_unix_ms: i64,
    pub resolved_at_unix_ms: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ClaimAssertion {
    pub claim: ClaimRecord,
    pub resolution: ClaimResolution,
    pub conflict: Option<ClaimConflict>,
}

#[derive(Debug, Clone)]
pub struct AuditChainEvent {
    pub sequence: i64,
    pub event_id: String,
    pub event_type: String,
    pub actor_agent_id: Option<String>,
    pub payload: Value,
    pub previous_hash: Option<String>,
    pub event_hash: String,
    pub created_at_unix_ms: i64,
}

pub async fn set_role_policy(
    pool: &PgPool,
    org_id: &str,
    role_id: &str,
    authority_bps: i32,
    can_resolve_conflicts: bool,
) -> Result<RolePolicy, DbError> {
    let row = sqlx::query(
        r#"
        INSERT INTO swarm_role_policies (
            org_id, role_id, authority_bps, can_resolve_conflicts
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (org_id, role_id) DO UPDATE SET
            authority_bps = EXCLUDED.authority_bps,
            can_resolve_conflicts = EXCLUDED.can_resolve_conflicts,
            policy_version = swarm_role_policies.policy_version + 1,
            updated_at = now()
        RETURNING
            role_id,
            authority_bps,
            can_resolve_conflicts,
            policy_version,
            floor(extract(epoch from updated_at) * 1000)::bigint AS updated_at_unix_ms
        "#,
    )
    .bind(org_id)
    .bind(role_id)
    .bind(authority_bps)
    .bind(can_resolve_conflicts)
    .fetch_one(pool)
    .await?;

    role_policy_from_row(row)
}

pub async fn list_role_policies(pool: &PgPool, org_id: &str) -> Result<Vec<RolePolicy>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            role_id,
            authority_bps,
            can_resolve_conflicts,
            policy_version,
            floor(extract(epoch from updated_at) * 1000)::bigint AS updated_at_unix_ms
        FROM swarm_role_policies
        WHERE org_id = $1
        ORDER BY role_id
        "#,
    )
    .bind(org_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(role_policy_from_row).collect()
}

pub async fn assert_claim(
    pool: &PgPool,
    agent: &AgentIdentity,
    input: ClaimInput,
) -> Result<ClaimAssertion, DbError> {
    // The foreign key on claims is intentional: claim writes are only valid
    // for an identified organization-scoped agent.
    identity::ensure_agent_identity(pool, agent).await?;

    let evidence_memory_ids = unique_evidence(&input.evidence_memory_ids);

    let mut tx = pool.begin().await?;
    lock_claim_key(&mut tx, &agent.org_id, &input.subject, &input.predicate).await?;

    let authority_bps = role_authority_in_tx(&mut tx, agent).await?;
    let score = i64::from(input.confidence_bps) * i64::from(authority_bps);
    let incumbent =
        active_claim_in_tx(&mut tx, &agent.org_id, &input.subject, &input.predicate).await?;
    let had_incumbent = incumbent.is_some();
    let resolution = compare_claims(
        incumbent
            .as_ref()
            .is_some_and(|existing| existing.value == input.value),
        incumbent.as_ref().map(|existing| existing.score),
        score,
    );
    let state = match resolution {
        ClaimResolution::SameValue | ClaimResolution::NewClaimWins => "accepted",
        ClaimResolution::Contested => "contested",
    };
    let conflict_id =
        matches!(resolution, ClaimResolution::Contested).then(|| input.conflict_id.clone());

    if matches!(resolution, ClaimResolution::NewClaimWins) {
        if let Some(existing) = incumbent.as_ref() {
            sqlx::query(
                r#"
                UPDATE memory_claims
                SET state = 'superseded', resolved_at = now()
                WHERE claim_id = $1
                "#,
            )
            .bind(&existing.claim_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        r#"
        INSERT INTO memory_claims (
            claim_id, org_id, subject, predicate, value, confidence_bps,
            authority_bps, score, asserted_by_agent_id, evidence_memory_ids,
            state, conflict_id, created_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            to_timestamp($13::double precision / 1000.0)
        )
        "#,
    )
    .bind(&input.claim_id)
    .bind(&agent.org_id)
    .bind(&input.subject)
    .bind(&input.predicate)
    .bind(&input.value)
    .bind(input.confidence_bps)
    .bind(authority_bps)
    .bind(score)
    .bind(&agent.agent_id)
    .bind(&evidence_memory_ids)
    .bind(state)
    .bind(&conflict_id)
    .bind(input.created_at_unix_ms as f64)
    .execute(&mut *tx)
    .await?;

    insert_claim_evidence_in_tx(&mut tx, &input.claim_id, agent, &evidence_memory_ids).await?;

    let claim = ClaimRecord {
        claim_id: input.claim_id.clone(),
        org_id: agent.org_id.clone(),
        subject: input.subject.clone(),
        predicate: input.predicate.clone(),
        value: input.value.clone(),
        confidence_bps: input.confidence_bps,
        authority_bps,
        score,
        asserted_by_agent_id: agent.agent_id.clone(),
        evidence_memory_ids,
        state: state.to_owned(),
        conflict_id: conflict_id.clone(),
        created_at_unix_ms: i64::try_from(input.created_at_unix_ms).unwrap_or(i64::MAX),
    };

    let conflict = if let (ClaimResolution::Contested, Some(existing)) = (resolution, incumbent) {
        let conflict = ClaimConflict {
            conflict_id: input.conflict_id,
            org_id: agent.org_id.clone(),
            subject: input.subject,
            predicate: input.predicate,
            incumbent_claim_id: existing.claim_id,
            challenger_claim_id: claim.claim_id.clone(),
            status: "contested".to_owned(),
            resolved_claim_id: None,
            resolution_reason: None,
            resolved_by_user_id: None,
            created_at_unix_ms: claim.created_at_unix_ms,
            resolved_at_unix_ms: None,
        };
        insert_conflict_in_tx(&mut tx, &conflict).await?;
        Some(conflict)
    } else {
        None
    };

    event_outbox::enqueue_in_tx(
        &mut tx,
        &ControlPlaneEvent::claim_asserted(
            claim.claim_id.clone(),
            claim.org_id.clone(),
            claim.asserted_by_agent_id.clone(),
            claim.subject.clone(),
            claim.predicate.clone(),
            claim.state.clone(),
            claim.score,
            claim.conflict_id.clone(),
            input.created_at_unix_ms,
        ),
    )
    .await?;

    let event_type = match resolution {
        ClaimResolution::SameValue => "claim.confirmed",
        ClaimResolution::NewClaimWins if had_incumbent => "claim.superseded",
        ClaimResolution::NewClaimWins => "claim.accepted",
        ClaimResolution::Contested => "claim.contested",
    };
    append_audit_event_in_tx(
        &mut tx,
        &agent.org_id,
        format!("audit_claim_{}", claim.claim_id),
        event_type,
        Some(&agent.agent_id),
        json!({
            "claim_id": claim.claim_id,
            "subject": claim.subject,
            "predicate": claim.predicate,
            "state": claim.state,
            "score": claim.score,
            "conflict_id": claim.conflict_id,
        }),
        input.created_at_unix_ms,
    )
    .await?;

    tx.commit().await?;
    Ok(ClaimAssertion {
        claim,
        resolution,
        conflict,
    })
}

pub async fn list_conflicts(
    pool: &PgPool,
    org_id: &str,
    include_resolved: bool,
) -> Result<Vec<ClaimConflict>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            conflict_id,
            org_id,
            subject,
            predicate,
            incumbent_claim_id,
            challenger_claim_id,
            status,
            resolved_claim_id,
            resolution_reason,
            resolved_by_user_id,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms,
            CASE
                WHEN resolved_at IS NULL THEN NULL
                ELSE floor(extract(epoch from resolved_at) * 1000)::bigint
            END AS resolved_at_unix_ms
        FROM claim_conflicts
        WHERE org_id = $1
          AND ($2 OR status = 'contested')
        ORDER BY created_at DESC
        LIMIT 100
        "#,
    )
    .bind(org_id)
    .bind(include_resolved)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(conflict_from_row).collect()
}

/// The operator vault includes the recorded claim candidates, including
/// superseded branches, so an offline graph can explain a later decision.
pub async fn list_claims_for_org(
    pool: &PgPool,
    org_id: &str,
    limit: i64,
) -> Result<Vec<ClaimRecord>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            claim_id, org_id, subject, predicate, value, confidence_bps,
            authority_bps, score, asserted_by_agent_id, evidence_memory_ids,
            state, conflict_id,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM memory_claims
        WHERE org_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        "#,
    )
    .bind(org_id)
    .bind(limit.clamp(1, 5_000))
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(claim_from_row).collect()
}

/// Hash-linked audit events, ordered from the first event to the latest so an
/// exported Obsidian vault can reproduce the visible decision path.
pub async fn list_audit_chain_events(
    pool: &PgPool,
    org_id: &str,
    limit: i64,
) -> Result<Vec<AuditChainEvent>, DbError> {
    let rows = sqlx::query(
        r#"
        SELECT
            sequence,
            event_id,
            event_type,
            actor_agent_id,
            payload,
            previous_hash,
            event_hash,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM (
            SELECT
                sequence,
                event_id,
                event_type,
                actor_agent_id,
                payload,
                previous_hash,
                event_hash,
                created_at
            FROM audit_chain_events
            WHERE org_id = $1
            ORDER BY sequence DESC
            LIMIT $2
        ) AS recent_events
        ORDER BY sequence ASC
        "#,
    )
    .bind(org_id)
    .bind(limit.clamp(1, 5_000))
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(audit_chain_event_from_row).collect()
}

pub async fn resolve_conflict(
    pool: &PgPool,
    org_id: &str,
    conflict_id: &str,
    accepted_claim_id: &str,
    resolved_by_user_id: &str,
    reason: &str,
    resolved_at_unix_ms: u128,
) -> Result<ClaimConflict, DbError> {
    let mut tx = pool.begin().await?;
    lock_org(&mut tx, org_id).await?;

    let Some(row) = sqlx::query(
        r#"
        SELECT
            conflict_id,
            org_id,
            subject,
            predicate,
            incumbent_claim_id,
            challenger_claim_id,
            status,
            resolved_claim_id,
            resolution_reason,
            resolved_by_user_id,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms,
            CASE
                WHEN resolved_at IS NULL THEN NULL
                ELSE floor(extract(epoch from resolved_at) * 1000)::bigint
            END AS resolved_at_unix_ms
        FROM claim_conflicts
        WHERE org_id = $1 AND conflict_id = $2
        FOR UPDATE
        "#,
    )
    .bind(org_id)
    .bind(conflict_id)
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Err(DbError::ClaimConflictNotFound(conflict_id.to_owned()));
    };
    let conflict = conflict_from_row(row)?;

    if conflict.status != "contested" {
        return Err(DbError::InvalidConflictResolution(
            "a resolved conflict cannot be resolved again".to_owned(),
        ));
    }
    if accepted_claim_id != conflict.incumbent_claim_id
        && accepted_claim_id != conflict.challenger_claim_id
    {
        return Err(DbError::InvalidConflictResolution(
            "accepted_claim_id must be one of the conflict branches".to_owned(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE memory_claims
        SET
            state = CASE WHEN claim_id = $1 THEN 'accepted' ELSE 'rejected' END,
            resolved_at = to_timestamp($2::double precision / 1000.0)
        WHERE claim_id = $3 OR claim_id = $4
        "#,
    )
    .bind(accepted_claim_id)
    .bind(resolved_at_unix_ms as f64)
    .bind(&conflict.incumbent_claim_id)
    .bind(&conflict.challenger_claim_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE claim_conflicts
        SET
            status = 'resolved',
            resolved_claim_id = $1,
            resolution_reason = $2,
            resolved_by_user_id = $3,
            resolved_at = to_timestamp($4::double precision / 1000.0)
        WHERE conflict_id = $5
        "#,
    )
    .bind(accepted_claim_id)
    .bind(reason)
    .bind(resolved_by_user_id)
    .bind(resolved_at_unix_ms as f64)
    .bind(conflict_id)
    .execute(&mut *tx)
    .await?;

    append_audit_event_in_tx(
        &mut tx,
        org_id,
        format!("audit_conflict_{conflict_id}"),
        "conflict.resolved",
        None,
        json!({
            "conflict_id": conflict_id,
            "accepted_claim_id": accepted_claim_id,
            "resolved_by_user_id": resolved_by_user_id,
            "reason": reason,
        }),
        resolved_at_unix_ms,
    )
    .await?;

    event_outbox::enqueue_in_tx(
        &mut tx,
        &ControlPlaneEvent::conflict_resolved(
            conflict_id.to_owned(),
            org_id.to_owned(),
            accepted_claim_id.to_owned(),
            resolved_at_unix_ms,
        ),
    )
    .await?;

    tx.commit().await?;
    Ok(ClaimConflict {
        status: "resolved".to_owned(),
        resolved_claim_id: Some(accepted_claim_id.to_owned()),
        resolution_reason: Some(reason.to_owned()),
        resolved_by_user_id: Some(resolved_by_user_id.to_owned()),
        resolved_at_unix_ms: Some(i64::try_from(resolved_at_unix_ms).unwrap_or(i64::MAX)),
        ..conflict
    })
}

async fn active_claim_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    subject: &str,
    predicate: &str,
) -> Result<Option<ClaimRecord>, DbError> {
    let row = sqlx::query(
        r#"
        SELECT
            claim_id, org_id, subject, predicate, value, confidence_bps,
            authority_bps, score, asserted_by_agent_id, evidence_memory_ids,
            state, conflict_id,
            floor(extract(epoch from created_at) * 1000)::bigint AS created_at_unix_ms
        FROM memory_claims
        WHERE org_id = $1 AND subject = $2 AND predicate = $3 AND state = 'accepted'
        ORDER BY score DESC, created_at DESC
        LIMIT 1
        FOR UPDATE
        "#,
    )
    .bind(org_id)
    .bind(subject)
    .bind(predicate)
    .fetch_optional(&mut **tx)
    .await?;

    row.map(claim_from_row).transpose()
}

async fn role_authority_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    agent: &AgentIdentity,
) -> Result<i32, DbError> {
    let Some(role_id) = agent.role_id.as_deref() else {
        return Ok(DEFAULT_AUTHORITY_BPS);
    };

    let authority_bps = sqlx::query_scalar::<_, i32>(
        r#"
        SELECT authority_bps
        FROM swarm_role_policies
        WHERE org_id = $1 AND role_id = $2
        "#,
    )
    .bind(&agent.org_id)
    .bind(role_id)
    .fetch_optional(&mut **tx)
    .await?;

    Ok(authority_bps.unwrap_or(DEFAULT_AUTHORITY_BPS))
}

async fn insert_conflict_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    conflict: &ClaimConflict,
) -> Result<(), DbError> {
    sqlx::query(
        r#"
        INSERT INTO claim_conflicts (
            conflict_id, org_id, subject, predicate, incumbent_claim_id,
            challenger_claim_id, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8::double precision / 1000.0))
        "#,
    )
    .bind(&conflict.conflict_id)
    .bind(&conflict.org_id)
    .bind(&conflict.subject)
    .bind(&conflict.predicate)
    .bind(&conflict.incumbent_claim_id)
    .bind(&conflict.challenger_claim_id)
    .bind(&conflict.status)
    .bind(conflict.created_at_unix_ms as f64)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_claim_evidence_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    claim_id: &str,
    agent: &AgentIdentity,
    evidence_memory_ids: &[String],
) -> Result<(), DbError> {
    if evidence_memory_ids.is_empty() {
        return Ok(());
    }

    // Evidence must be stored in this org and be readable by the asserting
    // agent. This mirrors the core access rule for the shareable scopes.
    let inserted = sqlx::query(
        r#"
        INSERT INTO claim_evidence (claim_id, memory_id)
        SELECT $1, memory_id
        FROM memory_entries
        WHERE org_id = $2
          AND memory_id = ANY($3)
          AND (
              scope IN ('open', 'org')
              OR (scope = 'project' AND project_id = $4)
              OR (scope = 'role' AND role_id = $5)
              OR (scope = 'agent_private' AND owner_agent_id = $6)
          )
        "#,
    )
    .bind(claim_id)
    .bind(&agent.org_id)
    .bind(evidence_memory_ids)
    .bind(&agent.project_id)
    .bind(&agent.role_id)
    .bind(&agent.agent_id)
    .execute(&mut **tx)
    .await?
    .rows_affected();

    if inserted != evidence_memory_ids.len() as u64 {
        return Err(DbError::InvalidClaimEvidence(
            "each evidence_memory_id must exist in the org and be readable by the asserting agent"
                .to_owned(),
        ));
    }
    Ok(())
}

async fn append_audit_event_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    event_id: String,
    event_type: &str,
    actor_agent_id: Option<&str>,
    payload: Value,
    created_at_unix_ms: u128,
) -> Result<(), DbError> {
    lock_org(tx, org_id).await?;
    let previous_hash = sqlx::query_scalar::<_, String>(
        r#"
        SELECT event_hash
        FROM audit_chain_events
        WHERE org_id = $1
        ORDER BY sequence DESC
        LIMIT 1
        FOR UPDATE
        "#,
    )
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?;
    let canonical_payload = serde_json::to_string(&payload).expect("JSON values are serializable");
    let event_hash = event_hash(
        previous_hash.as_deref(),
        &event_id,
        event_type,
        actor_agent_id,
        &canonical_payload,
        created_at_unix_ms,
    );

    sqlx::query(
        r#"
        INSERT INTO audit_chain_events (
            event_id, org_id, event_type, actor_agent_id, payload,
            previous_hash, event_hash, created_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            to_timestamp($8::double precision / 1000.0)
        )
        "#,
    )
    .bind(event_id)
    .bind(org_id)
    .bind(event_type)
    .bind(actor_agent_id)
    .bind(payload)
    .bind(previous_hash)
    .bind(event_hash)
    .bind(created_at_unix_ms as f64)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn lock_claim_key(
    tx: &mut Transaction<'_, Postgres>,
    org_id: &str,
    subject: &str,
    predicate: &str,
) -> Result<(), DbError> {
    lock_key(tx, &format!("claim:{org_id}:{subject}:{predicate}")).await
}

async fn lock_org(tx: &mut Transaction<'_, Postgres>, org_id: &str) -> Result<(), DbError> {
    lock_key(tx, &format!("audit:{org_id}")).await
}

async fn lock_key(tx: &mut Transaction<'_, Postgres>, key: &str) -> Result<(), DbError> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
        .bind(key)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

fn event_hash(
    previous_hash: Option<&str>,
    event_id: &str,
    event_type: &str,
    actor_agent_id: Option<&str>,
    canonical_payload: &str,
    created_at_unix_ms: u128,
) -> String {
    let input = format!(
        "{}|{event_id}|{event_type}|{}|{canonical_payload}|{created_at_unix_ms}",
        previous_hash.unwrap_or(""),
        actor_agent_id.unwrap_or("")
    );
    format!("{:x}", Sha256::digest(input.as_bytes()))
}

fn role_policy_from_row(row: sqlx::postgres::PgRow) -> Result<RolePolicy, DbError> {
    Ok(RolePolicy {
        role_id: row.try_get("role_id")?,
        authority_bps: row.try_get("authority_bps")?,
        can_resolve_conflicts: row.try_get("can_resolve_conflicts")?,
        policy_version: row.try_get("policy_version")?,
        updated_at_unix_ms: row.try_get("updated_at_unix_ms")?,
    })
}

fn claim_from_row(row: sqlx::postgres::PgRow) -> Result<ClaimRecord, DbError> {
    Ok(ClaimRecord {
        claim_id: row.try_get("claim_id")?,
        org_id: row.try_get("org_id")?,
        subject: row.try_get("subject")?,
        predicate: row.try_get("predicate")?,
        value: row.try_get("value")?,
        confidence_bps: row.try_get("confidence_bps")?,
        authority_bps: row.try_get("authority_bps")?,
        score: row.try_get("score")?,
        asserted_by_agent_id: row.try_get("asserted_by_agent_id")?,
        evidence_memory_ids: row.try_get("evidence_memory_ids")?,
        state: row.try_get("state")?,
        conflict_id: row.try_get("conflict_id")?,
        created_at_unix_ms: row.try_get("created_at_unix_ms")?,
    })
}

fn conflict_from_row(row: sqlx::postgres::PgRow) -> Result<ClaimConflict, DbError> {
    Ok(ClaimConflict {
        conflict_id: row.try_get("conflict_id")?,
        org_id: row.try_get("org_id")?,
        subject: row.try_get("subject")?,
        predicate: row.try_get("predicate")?,
        incumbent_claim_id: row.try_get("incumbent_claim_id")?,
        challenger_claim_id: row.try_get("challenger_claim_id")?,
        status: row.try_get("status")?,
        resolved_claim_id: row.try_get("resolved_claim_id")?,
        resolution_reason: row.try_get("resolution_reason")?,
        resolved_by_user_id: row.try_get("resolved_by_user_id")?,
        created_at_unix_ms: row.try_get("created_at_unix_ms")?,
        resolved_at_unix_ms: row.try_get("resolved_at_unix_ms")?,
    })
}

fn audit_chain_event_from_row(row: sqlx::postgres::PgRow) -> Result<AuditChainEvent, DbError> {
    Ok(AuditChainEvent {
        sequence: row.try_get("sequence")?,
        event_id: row.try_get("event_id")?,
        event_type: row.try_get("event_type")?,
        actor_agent_id: row.try_get("actor_agent_id")?,
        payload: row.try_get("payload")?,
        previous_hash: row.try_get("previous_hash")?,
        event_hash: row.try_get("event_hash")?,
        created_at_unix_ms: row.try_get("created_at_unix_ms")?,
    })
}

fn unique_evidence(evidence_memory_ids: &[String]) -> Vec<String> {
    let mut ids = evidence_memory_ids
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    ids
}

#[cfg(test)]
mod tests {
    use super::event_hash;

    #[test]
    fn audit_hash_includes_the_previous_event() {
        let first = event_hash(None, "event_a", "claim.accepted", Some("agent"), "{}", 1);
        let second = event_hash(
            Some(&first),
            "event_b",
            "claim.contested",
            Some("agent"),
            "{}",
            2,
        );
        assert_ne!(first, second);
    }

    #[test]
    fn evidence_ids_are_trimmed_and_deduplicated() {
        assert_eq!(
            super::unique_evidence(&[" mem_a ".to_owned(), "mem_a".to_owned(), "".to_owned()]),
            vec!["mem_a"]
        );
    }
}
