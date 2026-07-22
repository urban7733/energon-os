use prost::Message;

use crate::{AuditRecord, MemoryRecord, PromotionAuditRecord};

pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Versioned binary event envelope used by the transactional outbox and the
/// internal event bus. It is intentionally independent from the JSON SDK edge.
#[derive(Clone, PartialEq, Message)]
pub struct ControlPlaneEvent {
    #[prost(string, tag = "1")]
    pub event_id: String,
    #[prost(uint32, tag = "2")]
    pub schema_version: u32,
    #[prost(string, tag = "3")]
    pub org_id: String,
    #[prost(uint64, tag = "4")]
    pub occurred_at_unix_ms: u64,
    #[prost(oneof = "control_plane_event::Payload", tags = "10, 11, 12, 13, 14")]
    pub payload: Option<control_plane_event::Payload>,
}

pub mod control_plane_event {
    use prost::Oneof;

    use super::{ClaimAsserted, ConflictResolved, ContextBuilt, MemoryPromoted, MemoryWritten};

    #[derive(Clone, PartialEq, Oneof)]
    pub enum Payload {
        #[prost(message, tag = "10")]
        MemoryWritten(MemoryWritten),
        #[prost(message, tag = "11")]
        MemoryPromoted(MemoryPromoted),
        #[prost(message, tag = "12")]
        ContextBuilt(ContextBuilt),
        #[prost(message, tag = "13")]
        ClaimAsserted(ClaimAsserted),
        #[prost(message, tag = "14")]
        ConflictResolved(ConflictResolved),
    }
}

#[derive(Clone, PartialEq, Message)]
pub struct MemoryWritten {
    #[prost(string, tag = "1")]
    pub memory_id: String,
    #[prost(string, tag = "2")]
    pub agent_id: String,
    #[prost(string, tag = "3")]
    pub scope: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct MemoryPromoted {
    #[prost(string, tag = "1")]
    pub promotion_id: String,
    #[prost(string, tag = "2")]
    pub source_memory_id: String,
    #[prost(string, tag = "3")]
    pub promoted_memory_id: String,
    #[prost(string, tag = "4")]
    pub target_scope: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct ContextBuilt {
    #[prost(string, tag = "1")]
    pub request_id: String,
    #[prost(string, tag = "2")]
    pub agent_id: String,
    #[prost(uint64, tag = "3")]
    pub estimated_tokens: u64,
    #[prost(uint64, tag = "4")]
    pub denied_memory_count: u64,
}

#[derive(Clone, PartialEq, Message)]
pub struct ClaimAsserted {
    #[prost(string, tag = "1")]
    pub claim_id: String,
    #[prost(string, tag = "2")]
    pub agent_id: String,
    #[prost(string, tag = "3")]
    pub subject: String,
    #[prost(string, tag = "4")]
    pub predicate: String,
    #[prost(string, tag = "5")]
    pub state: String,
    #[prost(int64, tag = "6")]
    pub score: i64,
    #[prost(string, optional, tag = "7")]
    pub conflict_id: Option<String>,
}

#[derive(Clone, PartialEq, Message)]
pub struct ConflictResolved {
    #[prost(string, tag = "1")]
    pub conflict_id: String,
    #[prost(string, tag = "2")]
    pub accepted_claim_id: String,
}

impl ControlPlaneEvent {
    pub fn memory_written(record: &MemoryRecord) -> Self {
        Self {
            event_id: format!("evt_memory_written_{}", record.memory_id),
            schema_version: EVENT_SCHEMA_VERSION,
            org_id: record.org_id.clone(),
            occurred_at_unix_ms: saturating_u64(record.created_at_unix_ms),
            payload: Some(control_plane_event::Payload::MemoryWritten(MemoryWritten {
                memory_id: record.memory_id.clone(),
                agent_id: record.owner_agent_id.clone().unwrap_or_default(),
                scope: scope_name(&record.scope).to_owned(),
            })),
        }
    }

    pub fn memory_promoted(audit: &PromotionAuditRecord) -> Self {
        Self {
            event_id: format!("evt_memory_promoted_{}", audit.promotion_id),
            schema_version: EVENT_SCHEMA_VERSION,
            org_id: audit.org_id.clone(),
            occurred_at_unix_ms: saturating_u64(audit.created_at_unix_ms),
            payload: Some(control_plane_event::Payload::MemoryPromoted(
                MemoryPromoted {
                    promotion_id: audit.promotion_id.clone(),
                    source_memory_id: audit.source_memory_id.clone(),
                    promoted_memory_id: audit.promoted_memory_id.clone(),
                    target_scope: scope_name(&audit.target_scope).to_owned(),
                },
            )),
        }
    }

    pub fn context_built(audit: &AuditRecord) -> Self {
        Self {
            event_id: format!("evt_context_built_{}", audit.request_id),
            schema_version: EVENT_SCHEMA_VERSION,
            org_id: audit.org_id.clone(),
            occurred_at_unix_ms: saturating_u64(audit.created_at_unix_ms),
            payload: Some(control_plane_event::Payload::ContextBuilt(ContextBuilt {
                request_id: audit.request_id.clone(),
                agent_id: audit.agent_id.clone(),
                estimated_tokens: audit.estimated_tokens as u64,
                denied_memory_count: audit.denied_memory_count as u64,
            })),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn claim_asserted(
        claim_id: String,
        org_id: String,
        agent_id: String,
        subject: String,
        predicate: String,
        state: String,
        score: i64,
        conflict_id: Option<String>,
        occurred_at_unix_ms: u128,
    ) -> Self {
        Self {
            event_id: format!("evt_claim_asserted_{claim_id}"),
            schema_version: EVENT_SCHEMA_VERSION,
            org_id,
            occurred_at_unix_ms: saturating_u64(occurred_at_unix_ms),
            payload: Some(control_plane_event::Payload::ClaimAsserted(ClaimAsserted {
                claim_id,
                agent_id,
                subject,
                predicate,
                state,
                score,
                conflict_id,
            })),
        }
    }

    pub fn conflict_resolved(
        conflict_id: String,
        org_id: String,
        accepted_claim_id: String,
        occurred_at_unix_ms: u128,
    ) -> Self {
        Self {
            event_id: format!("evt_conflict_resolved_{conflict_id}"),
            schema_version: EVENT_SCHEMA_VERSION,
            org_id,
            occurred_at_unix_ms: saturating_u64(occurred_at_unix_ms),
            payload: Some(control_plane_event::Payload::ConflictResolved(
                ConflictResolved {
                    conflict_id,
                    accepted_claim_id,
                },
            )),
        }
    }

    pub fn subject(&self) -> &'static str {
        match self.payload {
            Some(control_plane_event::Payload::MemoryWritten(_)) => {
                "energon.events.memory.written.v1"
            }
            Some(control_plane_event::Payload::MemoryPromoted(_)) => {
                "energon.events.memory.promoted.v1"
            }
            Some(control_plane_event::Payload::ContextBuilt(_)) => {
                "energon.events.context.built.v1"
            }
            Some(control_plane_event::Payload::ClaimAsserted(_)) => {
                "energon.events.claim.asserted.v1"
            }
            Some(control_plane_event::Payload::ConflictResolved(_)) => {
                "energon.events.conflict.resolved.v1"
            }
            None => "energon.events.unknown.v1",
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        self.encode_to_vec()
    }
}

fn scope_name(scope: &crate::MemoryScope) -> &'static str {
    match scope {
        crate::MemoryScope::Open => "open",
        crate::MemoryScope::Org => "org",
        crate::MemoryScope::Project => "project",
        crate::MemoryScope::Role => "role",
        crate::MemoryScope::AgentPrivate => "agent_private",
        crate::MemoryScope::UserPrivate => "user_private",
        crate::MemoryScope::Session => "session",
    }
}

fn saturating_u64(value: u128) -> u64 {
    value.min(u64::MAX.into()) as u64
}

#[cfg(test)]
mod tests {
    use prost::Message;

    use crate::{AgentIdentity, MemoryRecord, MemoryScope, WriteMemoryRequest};

    use super::{ControlPlaneEvent, control_plane_event::Payload};

    #[test]
    fn memory_event_is_binary_round_trippable() {
        let agent = AgentIdentity::new("agent_1", "org_1", None, None);
        let memory = MemoryRecord::from_write(
            "mem_1",
            &agent,
            WriteMemoryRequest {
                scope: MemoryScope::AgentPrivate,
                content: "verified source".to_owned(),
                tags: vec![],
                project_id: None,
                role_id: None,
                user_id: None,
                session_id: None,
                source: None,
            },
            1,
        )
        .expect("private memory should be valid");

        let event = ControlPlaneEvent::memory_written(&memory);
        let encoded = event.encode();
        let decoded = ControlPlaneEvent::decode(encoded.as_slice()).expect("event should decode");

        assert_eq!(decoded.event_id, "evt_memory_written_mem_1");
        assert!(matches!(decoded.payload, Some(Payload::MemoryWritten(_))));
    }

    #[test]
    fn claim_event_is_binary_round_trippable() {
        let event = ControlPlaneEvent::claim_asserted(
            "claim_1".to_owned(),
            "org_1".to_owned(),
            "agent_1".to_owned(),
            "vendor:acme".to_owned(),
            "security_status".to_owned(),
            "accepted".to_owned(),
            42_500_000,
            None,
            1,
        );
        let decoded = ControlPlaneEvent::decode(event.encode().as_slice()).expect("event decodes");

        assert!(matches!(decoded.payload, Some(Payload::ClaimAsserted(_))));
    }
}
