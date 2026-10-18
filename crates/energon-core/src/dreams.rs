//! Speculative reflections live outside factual memory and context retrieval.
use crate::{
    AgentIdentity, EnergonError, MemoryRecord, MemoryScope, PromotionAuditRecord,
    WriteMemoryRequest,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamRecord {
    #[serde(flatten)]
    pub memory: MemoryRecord,
    pub speculative: bool,
    pub sharing: Option<PromotionAuditRecord>,
}

impl DreamRecord {
    pub fn private(
        id: String,
        agent: &AgentIdentity,
        content: String,
        timestamp: u128,
    ) -> Result<Self, EnergonError> {
        let memory = MemoryRecord::from_write(
            id,
            agent,
            WriteMemoryRequest {
                scope: MemoryScope::AgentPrivate,
                content,
                tags: vec![],
                project_id: None,
                role_id: None,
                user_id: None,
                session_id: None,
                source: None,
            },
            timestamp,
        )?;
        Ok(Self {
            memory,
            speculative: true,
            sharing: None,
        })
    }

    /// Share an explicitly selected excerpt; never copy the private body implicitly.
    pub fn share(
        &self,
        id: String,
        actor: &AgentIdentity,
        content: String,
        target: MemoryScope,
        reason: String,
        timestamp: u128,
    ) -> Result<Self, EnergonError> {
        if self.memory.org_id != actor.org_id
            || self.memory.owner_agent_id.as_ref() != Some(&actor.agent_id)
        {
            return Err(EnergonError::PermissionDenied {
                agent_id: actor.agent_id.clone(),
                memory_id: self.memory.memory_id.clone(),
            });
        }
        if content.trim().is_empty() {
            return Err(EnergonError::EmptyMemory);
        }
        if reason.trim().is_empty() {
            return Err(EnergonError::EmptyPromotionReason);
        }
        let mut source = self.memory.clone();
        // Sharing uses current membership, even if the dream predates a role change.
        source.project_id = actor.project_id.clone();
        source.role_id = actor.role_id.clone();
        let mut memory = source.promoted_copy(id, target, timestamp)?;
        memory.content = content.trim().to_owned();
        let sharing = PromotionAuditRecord {
            promotion_id: format!("dream_share_{}", memory.memory_id),
            source_memory_id: self.memory.memory_id.clone(),
            promoted_memory_id: memory.memory_id.clone(),
            agent_id: actor.agent_id.clone(),
            org_id: actor.org_id.clone(),
            target_scope: memory.scope.clone(),
            reason: reason.trim().to_owned(),
            created_at_unix_ms: timestamp,
        };
        Ok(Self {
            memory,
            speculative: true,
            sharing: Some(sharing),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn agent(id: &str, org: &str) -> AgentIdentity {
        AgentIdentity::new(id, org, Some("research".into()), Some("launch".into()))
    }
    #[test]
    fn private_until_explicit_excerpt_is_shared() {
        let author = agent("a", "org");
        let dream = DreamRecord::private("dream_1".into(), &author, "Secret and an idea".into(), 1)
            .unwrap();
        assert_eq!(dream.memory.scope, MemoryScope::AgentPrivate);
        let shared = dream
            .share(
                "dream_2".into(),
                &author,
                "Only an idea".into(),
                MemoryScope::Project,
                "Discuss possibility".into(),
                2,
            )
            .unwrap();
        assert_eq!(shared.memory.content, "Only an idea");
        assert_eq!(dream.memory.content, "Secret and an idea");
        assert!(shared.speculative);
        assert!(shared.sharing.is_some());
        assert!(!crate::can_read_memory(
            &agent("b", "other"),
            &shared.memory,
            &Default::default()
        ));
    }
    #[test]
    fn others_cannot_share_and_sharing_requires_reason() {
        let author = agent("a", "org");
        let dream = DreamRecord::private("dream_1".into(), &author, "Idea".into(), 1).unwrap();
        for actor in [agent("b", "org"), agent("a", "other")] {
            assert!(
                dream
                    .share(
                        "d2".into(),
                        &actor,
                        "Idea".into(),
                        MemoryScope::Org,
                        "Share".into(),
                        2
                    )
                    .is_err()
            );
        }
        assert!(
            dream
                .share(
                    "d2".into(),
                    &author,
                    "Idea".into(),
                    MemoryScope::Org,
                    " ".into(),
                    2
                )
                .is_err()
        );
    }
    #[test]
    fn sharing_uses_current_membership_and_rejects_missing_scope() {
        let author = agent("a", "org");
        let dream = DreamRecord::private("d1".into(), &author, "Idea".into(), 1).unwrap();
        let mut changed = author.clone();
        changed.project_id = Some("new-project".into());
        let shared = dream
            .share(
                "d2".into(),
                &changed,
                "Idea".into(),
                MemoryScope::Project,
                "Discuss".into(),
                2,
            )
            .unwrap();
        assert_eq!(shared.memory.project_id.as_deref(), Some("new-project"));
        assert!(!crate::can_read_memory(
            &author,
            &shared.memory,
            &Default::default()
        ));
        changed.project_id = None;
        assert!(
            dream
                .share(
                    "d3".into(),
                    &changed,
                    "Idea".into(),
                    MemoryScope::Project,
                    "Discuss".into(),
                    2
                )
                .is_err()
        );
    }
}
