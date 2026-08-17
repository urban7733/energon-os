//! Agent-facing operational telemetry. This deliberately mirrors the useful
//! dashboard facts without turning an agent API key into an operator key.

use std::collections::BTreeMap;

use axum::{Json, extract::State, http::HeaderMap};
use serde::Serialize;

use crate::{
    errors::ApiError,
    middleware::auth::identity_from_request,
    routes::health::{HealthResponse, health},
    state::{AppState, StorageBackend, now_unix_ms},
};

/// `GET /v1/agent/overview` — operational data that an authenticated agent can
/// use to coordinate within its own organization. It never returns API keys,
/// memory content/previews, payment payer details, or unassigned skill
/// profiles.
pub async fn agent_operational_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AgentOperationalOverviewResponse>, ApiError> {
    let agent = identity_from_request(&state, &headers).await?;
    let health = health(State(state.clone())).await.0;
    let generated_at_unix_ms = i64::try_from(now_unix_ms()).unwrap_or(i64::MAX);

    let (directory, memory, usage, event_delivery, role_policies, conflicts, skills, billing) =
        match &state.storage {
            StorageBackend::Memory(storage) => {
                let memories = storage.memories.read().unwrap();
                let mut counts = BTreeMap::new();
                for memory in memories
                    .iter()
                    .filter(|memory| memory.org_id == agent.org_id)
                {
                    *counts
                        .entry(scope_name(&memory.scope).to_owned())
                        .or_insert(0) += 1;
                }
                let total_memories = counts.values().sum();
                let memory = MemoryStatsResponse {
                    total_memories,
                    scopes: counts
                        .into_iter()
                        .map(|(scope, count)| ScopeCountResponse { scope, count })
                        .collect(),
                };

                let usage = storage.usage.read().unwrap();
                let mut totals = usage
                    .iter()
                    .filter(|((org_id, _), _)| org_id == &agent.org_id)
                    .map(|((_, route), counter)| RouteUsageResponse {
                        route: route.clone(),
                        calls: i64::try_from(counter.calls).unwrap_or(i64::MAX),
                        paid_calls: i64::try_from(counter.paid_calls).unwrap_or(i64::MAX),
                        amount_usdc_micro: i64::try_from(counter.amount_usdc_micro)
                            .unwrap_or(i64::MAX),
                    })
                    .collect::<Vec<_>>();
                totals.sort_by(|left, right| left.route.cmp(&right.route));

                (
                    vec![AgentDirectoryEntry::from_authenticated(&agent)],
                    memory,
                    UsageResponse {
                        storage: "memory",
                        totals,
                    },
                    EventDeliveryResponse::empty("memory"),
                    Vec::new(),
                    Vec::new(),
                    Vec::new(),
                    BillingSnapshot {
                        configured: state.billing.is_some(),
                        entitlement: None,
                    },
                )
            }
            StorageBackend::Postgres(pool) => {
                let directory = energon_db::identity::list_org_agents(pool, &agent.org_id)
                    .await?
                    .into_iter()
                    .map(AgentDirectoryEntry::from_org_agent)
                    .collect();

                let scopes = energon_db::memory::count_org_memories_by_scope(pool, &agent.org_id)
                    .await?
                    .into_iter()
                    .map(|count| ScopeCountResponse {
                        scope: scope_name(&count.scope).to_owned(),
                        count: count.count,
                    })
                    .collect::<Vec<_>>();
                let total_memories = scopes.iter().map(|count| count.count).sum();

                let totals = energon_db::payments::usage_totals(pool, &agent.org_id)
                    .await?
                    .into_iter()
                    .map(|total| RouteUsageResponse {
                        route: total.route,
                        calls: total.calls,
                        paid_calls: total.paid_calls,
                        amount_usdc_micro: total.amount_usdc_micro,
                    })
                    .collect();

                let outbox = energon_db::event_outbox::summary(pool, &agent.org_id).await?;
                let role_policies = energon_db::claims::list_role_policies(pool, &agent.org_id)
                    .await?
                    .into_iter()
                    .map(RolePolicyResponse::from)
                    .collect();
                let conflicts = energon_db::claims::list_conflicts(pool, &agent.org_id, true)
                    .await?
                    .into_iter()
                    .map(ConflictResponse::from)
                    .collect();
                let skills = energon_db::skills::list_agent_skill_profiles(
                    pool,
                    &agent.org_id,
                    &agent.agent_id,
                )
                .await?
                .into_iter()
                .map(AssignedSkillResponse::from)
                .collect();
                let entitlement = if state.billing.is_some() {
                    energon_db::billing::active_entitlement(pool, &agent.org_id)
                        .await?
                        .map(EntitlementResponse::from)
                } else {
                    None
                };

                (
                    directory,
                    MemoryStatsResponse {
                        total_memories,
                        scopes,
                    },
                    UsageResponse {
                        storage: "postgres",
                        totals,
                    },
                    EventDeliveryResponse {
                        storage: "postgres",
                        pending: outbox.pending,
                        leased: outbox.leased,
                        published: outbox.published,
                        retrying: outbox.retrying,
                    },
                    role_policies,
                    conflicts,
                    skills,
                    BillingSnapshot {
                        configured: state.billing.is_some(),
                        entitlement,
                    },
                )
            }
        };

    Ok(Json(AgentOperationalOverviewResponse {
        contract_version: "v1",
        generated_at_unix_ms,
        org_id: agent.org_id,
        agent: AgentRuntimeResponse {
            agent_id: agent.agent_id,
            role_id: agent.role_id,
            project_id: agent.project_id,
        },
        system: SystemResponse {
            health,
            x402: state.x402.public_status(),
        },
        directory,
        stats: DashboardStatsResponse {
            memory,
            usage,
            event_delivery,
            conflict_summary: ConflictSummaryResponse::from_conflicts(&conflicts),
        },
        role_policies,
        conflicts,
        assigned_skills: skills,
        billing,
        redactions: [
            "agent API keys and their hashes",
            "memory content and previews outside permission-filtered context",
            "payment payer addresses and transaction hashes",
            "skill profiles not assigned to this agent",
        ],
    }))
}

#[derive(Debug, Serialize)]
pub struct AgentOperationalOverviewResponse {
    pub contract_version: &'static str,
    pub generated_at_unix_ms: i64,
    pub org_id: String,
    pub agent: AgentRuntimeResponse,
    pub system: SystemResponse,
    /// The organization directory deliberately omits all API-key metadata.
    pub directory: Vec<AgentDirectoryEntry>,
    pub stats: DashboardStatsResponse,
    /// Read-only policy visibility; only operators can change these values.
    pub role_policies: Vec<RolePolicyResponse>,
    /// Conflict metadata mirrors the dashboard but never contains claim values.
    pub conflicts: Vec<ConflictResponse>,
    /// Full text is returned only for profiles assigned to this agent.
    pub assigned_skills: Vec<AssignedSkillResponse>,
    pub billing: BillingSnapshot,
    pub redactions: [&'static str; 4],
}

#[derive(Debug, Serialize)]
pub struct AgentRuntimeResponse {
    pub agent_id: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SystemResponse {
    pub health: HealthResponse,
    pub x402: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct AgentDirectoryEntry {
    pub agent_id: String,
    pub name: String,
    pub role_id: Option<String>,
    pub project_id: Option<String>,
    pub created_at_unix_ms: Option<i64>,
}

impl AgentDirectoryEntry {
    fn from_authenticated(agent: &energon_core::AgentIdentity) -> Self {
        Self {
            agent_id: agent.agent_id.clone(),
            name: agent.agent_id.clone(),
            role_id: agent.role_id.clone(),
            project_id: agent.project_id.clone(),
            created_at_unix_ms: None,
        }
    }

    fn from_org_agent(agent: energon_db::identity::OrgAgent) -> Self {
        Self {
            agent_id: agent.agent_id,
            name: agent.name,
            role_id: agent.role_id,
            project_id: agent.project_id,
            created_at_unix_ms: Some(agent.created_at_unix_ms),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DashboardStatsResponse {
    pub memory: MemoryStatsResponse,
    pub usage: UsageResponse,
    pub event_delivery: EventDeliveryResponse,
    pub conflict_summary: ConflictSummaryResponse,
}

#[derive(Debug, Serialize)]
pub struct MemoryStatsResponse {
    pub total_memories: i64,
    pub scopes: Vec<ScopeCountResponse>,
}

#[derive(Debug, Serialize)]
pub struct ScopeCountResponse {
    pub scope: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct UsageResponse {
    pub storage: &'static str,
    pub totals: Vec<RouteUsageResponse>,
}

#[derive(Debug, Serialize)]
pub struct RouteUsageResponse {
    pub route: String,
    pub calls: i64,
    pub paid_calls: i64,
    pub amount_usdc_micro: i64,
}

#[derive(Debug, Serialize)]
pub struct EventDeliveryResponse {
    pub storage: &'static str,
    pub pending: i64,
    pub leased: i64,
    pub published: i64,
    pub retrying: i64,
}

impl EventDeliveryResponse {
    fn empty(storage: &'static str) -> Self {
        Self {
            storage,
            pending: 0,
            leased: 0,
            published: 0,
            retrying: 0,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ConflictSummaryResponse {
    pub contested: i64,
    pub resolved: i64,
}

impl ConflictSummaryResponse {
    fn from_conflicts(conflicts: &[ConflictResponse]) -> Self {
        Self {
            contested: conflicts
                .iter()
                .filter(|conflict| conflict.status == "contested")
                .count()
                .try_into()
                .unwrap_or(i64::MAX),
            resolved: conflicts
                .iter()
                .filter(|conflict| conflict.status == "resolved")
                .count()
                .try_into()
                .unwrap_or(i64::MAX),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct RolePolicyResponse {
    pub role_id: String,
    pub authority_bps: i32,
    pub can_resolve_conflicts: bool,
    pub policy_version: i32,
    pub updated_at_unix_ms: i64,
}

impl From<energon_db::claims::RolePolicy> for RolePolicyResponse {
    fn from(policy: energon_db::claims::RolePolicy) -> Self {
        Self {
            role_id: policy.role_id,
            authority_bps: policy.authority_bps,
            can_resolve_conflicts: policy.can_resolve_conflicts,
            policy_version: policy.policy_version,
            updated_at_unix_ms: policy.updated_at_unix_ms,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ConflictResponse {
    pub conflict_id: String,
    pub subject: String,
    pub predicate: String,
    pub incumbent_claim_id: String,
    pub challenger_claim_id: String,
    pub status: String,
    pub resolved_claim_id: Option<String>,
    pub resolution_reason: Option<String>,
    pub created_at_unix_ms: i64,
    pub resolved_at_unix_ms: Option<i64>,
}

impl From<energon_db::claims::ClaimConflict> for ConflictResponse {
    fn from(conflict: energon_db::claims::ClaimConflict) -> Self {
        Self {
            conflict_id: conflict.conflict_id,
            subject: conflict.subject,
            predicate: conflict.predicate,
            incumbent_claim_id: conflict.incumbent_claim_id,
            challenger_claim_id: conflict.challenger_claim_id,
            status: conflict.status,
            resolved_claim_id: conflict.resolved_claim_id,
            resolution_reason: conflict.resolution_reason,
            created_at_unix_ms: conflict.created_at_unix_ms,
            resolved_at_unix_ms: conflict.resolved_at_unix_ms,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AssignedSkillResponse {
    pub skill_id: String,
    pub scope: String,
    pub name: String,
    /// User- and agent-authored data. This is never executable code.
    pub instructions: String,
    pub allowed_tools: Vec<String>,
    pub requires_approval_for: Vec<String>,
    pub version: i32,
    pub created_by_kind: String,
    pub created_by_id: String,
    pub created_at_unix_ms: i64,
}

impl From<energon_db::skills::SkillProfile> for AssignedSkillResponse {
    fn from(skill: energon_db::skills::SkillProfile) -> Self {
        Self {
            skill_id: skill.skill_id,
            scope: skill.scope,
            name: skill.name,
            instructions: skill.instructions,
            allowed_tools: skill.allowed_tools,
            requires_approval_for: skill.requires_approval_for,
            version: skill.version,
            created_by_kind: skill.created_by_kind,
            created_by_id: skill.created_by_id,
            created_at_unix_ms: skill.created_at_unix_ms,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct BillingSnapshot {
    pub configured: bool,
    pub entitlement: Option<EntitlementResponse>,
}

#[derive(Debug, Serialize)]
pub struct EntitlementResponse {
    pub plan_id: String,
    pub included_operations: i64,
    pub used_operations: i64,
    pub remaining_operations: i64,
    pub active_from_unix_ms: i64,
    pub expires_at_unix_ms: i64,
}

impl From<energon_db::billing::OrganizationEntitlement> for EntitlementResponse {
    fn from(entitlement: energon_db::billing::OrganizationEntitlement) -> Self {
        Self {
            plan_id: entitlement.plan_id,
            included_operations: entitlement.included_operations,
            used_operations: entitlement.used_operations,
            remaining_operations: (entitlement.included_operations - entitlement.used_operations)
                .max(0),
            active_from_unix_ms: entitlement.active_from_unix_ms,
            expires_at_unix_ms: entitlement.expires_at_unix_ms,
        }
    }
}

fn scope_name(scope: &energon_core::MemoryScope) -> &'static str {
    match scope {
        energon_core::MemoryScope::Open => "open",
        energon_core::MemoryScope::Org => "org",
        energon_core::MemoryScope::Project => "project",
        energon_core::MemoryScope::Role => "role",
        energon_core::MemoryScope::AgentPrivate => "agent_private",
        energon_core::MemoryScope::UserPrivate => "user_private",
        energon_core::MemoryScope::Session => "session",
    }
}

#[cfg(test)]
mod tests {
    use super::AgentDirectoryEntry;

    #[test]
    fn directory_entry_never_serializes_api_key_metadata() {
        let entry = AgentDirectoryEntry {
            agent_id: "agent_1".to_owned(),
            name: "Research agent".to_owned(),
            role_id: Some("research".to_owned()),
            project_id: None,
            created_at_unix_ms: Some(1),
        };

        let value = serde_json::to_value(entry).expect("directory serializes");
        assert!(value.get("keys").is_none());
        assert!(value.get("api_key").is_none());
    }
}
