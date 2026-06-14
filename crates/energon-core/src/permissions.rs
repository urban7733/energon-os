use crate::{
    identity::AgentIdentity,
    memory::{MemoryRecord, MemoryScope},
};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AccessContext {
    pub project_id: Option<String>,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
}

pub fn can_read_memory(
    agent: &AgentIdentity,
    memory: &MemoryRecord,
    context: &AccessContext,
) -> bool {
    if memory.org_id != agent.org_id {
        return false;
    }

    match memory.scope {
        MemoryScope::Open | MemoryScope::Org => true,
        MemoryScope::Project => {
            let project_id = context.project_id.as_ref().or(agent.project_id.as_ref());
            memory.project_id.as_ref() == project_id
        }
        MemoryScope::Role => memory.role_id == agent.role_id,
        MemoryScope::AgentPrivate => memory.owner_agent_id.as_ref() == Some(&agent.agent_id),
        MemoryScope::UserPrivate => context.user_id.is_some() && memory.user_id == context.user_id,
        MemoryScope::Session => {
            context.session_id.is_some() && memory.session_id == context.session_id
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        AgentIdentity, MemoryRecord, MemoryScope,
        permissions::{AccessContext, can_read_memory},
    };

    fn agent(agent_id: &str) -> AgentIdentity {
        AgentIdentity::new(
            agent_id,
            "org_1",
            Some("strategist".to_owned()),
            Some("apex_verify".to_owned()),
        )
    }

    fn memory(scope: MemoryScope) -> MemoryRecord {
        MemoryRecord {
            memory_id: "mem_1".to_owned(),
            org_id: "org_1".to_owned(),
            scope,
            content: "Positioning memory".to_owned(),
            tags: vec![],
            project_id: Some("apex_verify".to_owned()),
            role_id: Some("strategist".to_owned()),
            owner_agent_id: Some("agent_777".to_owned()),
            user_id: None,
            session_id: None,
            source: None,
            promoted_from: None,
            created_at_unix_ms: 1,
        }
    }

    #[test]
    fn agent_private_memory_is_visible_only_to_owner() {
        let owner = agent("agent_777");
        let other = agent("agent_888");
        let memory = memory(MemoryScope::AgentPrivate);
        let context = AccessContext::default();

        assert!(can_read_memory(&owner, &memory, &context));
        assert!(!can_read_memory(&other, &memory, &context));
    }

    #[test]
    fn project_memory_requires_project_match() {
        let mut other_project_agent = agent("agent_888");
        other_project_agent.project_id = Some("other_project".to_owned());

        let memory = memory(MemoryScope::Project);

        assert!(can_read_memory(
            &agent("agent_777"),
            &memory,
            &AccessContext::default()
        ));
        assert!(!can_read_memory(
            &other_project_agent,
            &memory,
            &AccessContext::default()
        ));
    }
}
