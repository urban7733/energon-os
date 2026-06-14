use serde::{Deserialize, Serialize};

use crate::{
    audit::AuditRecord,
    context_packer::pack_context,
    identity::AgentIdentity,
    memory::{MemoryRecord, MemoryScope},
    permissions::{AccessContext, can_read_memory},
    retrieval::{ScoredMemory, score_memory},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContextBuildRequest {
    pub task: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub user_id: Option<String>,
    #[serde(default = "default_token_budget")]
    pub token_budget: usize,
}

fn default_token_budget() -> usize {
    4000
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContextItem {
    pub memory_id: String,
    pub scope: MemoryScope,
    pub content: String,
    pub estimated_tokens: usize,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContextPack {
    pub request_id: String,
    pub agent_id: String,
    pub task: String,
    pub token_budget: usize,
    pub estimated_tokens: usize,
    pub context_pack: Vec<String>,
    pub items: Vec<ContextItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContextBuildOutcome {
    pub pack: ContextPack,
    pub audit: AuditRecord,
}

pub fn build_context(
    agent: &AgentIdentity,
    request_id: String,
    request: ContextBuildRequest,
    memories: &[MemoryRecord],
    created_at_unix_ms: u128,
) -> ContextBuildOutcome {
    let access_context = AccessContext {
        project_id: request
            .project_id
            .clone()
            .or_else(|| agent.project_id.clone()),
        user_id: request.user_id.clone(),
        session_id: request.session_id.clone(),
    };

    let mut denied_memory_count = 0;
    let mut scored = Vec::new();

    for memory in memories {
        if can_read_memory(agent, memory, &access_context) {
            let scored_memory = score_memory(&request.task, memory);

            if scored_memory.score > 0 {
                scored.push(scored_memory);
            }
        } else {
            denied_memory_count += 1;
        }
    }

    scored.sort_by(sort_scored_memory);

    let (items, estimated_tokens) = pack_context(scored, request.token_budget);
    let allowed_memory_ids = items
        .iter()
        .map(|item| item.memory_id.clone())
        .collect::<Vec<_>>();

    let pack = ContextPack {
        request_id: request_id.clone(),
        agent_id: agent.agent_id.clone(),
        task: request.task.clone(),
        token_budget: request.token_budget,
        estimated_tokens,
        context_pack: items.iter().map(|item| item.content.clone()).collect(),
        items,
    };

    let audit = AuditRecord {
        request_id,
        agent_id: agent.agent_id.clone(),
        org_id: agent.org_id.clone(),
        task: request.task,
        allowed_memory_ids,
        denied_memory_count,
        token_budget: pack.token_budget,
        estimated_tokens,
        created_at_unix_ms,
    };

    ContextBuildOutcome { pack, audit }
}

fn sort_scored_memory(left: &ScoredMemory, right: &ScoredMemory) -> std::cmp::Ordering {
    right.score.cmp(&left.score).then_with(|| {
        right
            .memory
            .created_at_unix_ms
            .cmp(&left.memory.created_at_unix_ms)
    })
}

#[cfg(test)]
mod tests {
    use crate::{
        AgentIdentity, ContextBuildRequest, MemoryRecord, MemoryScope,
        context_broker::build_context,
    };

    fn memory(memory_id: &str, scope: MemoryScope, owner_agent_id: Option<&str>) -> MemoryRecord {
        MemoryRecord {
            memory_id: memory_id.to_owned(),
            org_id: "org_1".to_owned(),
            scope,
            content: "Investor outreach should position Apex Verify as trust infrastructure."
                .to_owned(),
            tags: vec!["investor".to_owned()],
            project_id: Some("apex_verify".to_owned()),
            role_id: Some("strategist".to_owned()),
            owner_agent_id: owner_agent_id.map(str::to_owned),
            user_id: None,
            session_id: None,
            source: None,
            promoted_from: None,
            created_at_unix_ms: 1,
        }
    }

    #[test]
    fn context_build_excludes_other_agents_private_memory() {
        let agent = AgentIdentity::new(
            "agent_777",
            "org_1",
            Some("strategist".to_owned()),
            Some("apex_verify".to_owned()),
        );
        let request = ContextBuildRequest {
            task: "prepare investor outreach".to_owned(),
            project_id: Some("apex_verify".to_owned()),
            session_id: None,
            user_id: None,
            token_budget: 4000,
        };
        let memories = vec![
            memory(
                "mem_private_self",
                MemoryScope::AgentPrivate,
                Some("agent_777"),
            ),
            memory(
                "mem_private_other",
                MemoryScope::AgentPrivate,
                Some("agent_888"),
            ),
            memory("mem_org", MemoryScope::Org, Some("agent_888")),
        ];

        let outcome = build_context(&agent, "ctx_1".to_owned(), request, &memories, 1);

        assert_eq!(outcome.audit.denied_memory_count, 1);
        assert_eq!(outcome.pack.context_pack.len(), 2);
        assert!(
            outcome
                .pack
                .items
                .iter()
                .all(|item| item.memory_id != "mem_private_other")
        );
    }
}
