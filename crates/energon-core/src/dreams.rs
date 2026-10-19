//! Speculative reflections live outside factual memory and context retrieval.
use crate::{
    AgentIdentity, EnergonError, MemoryRecord, MemoryScope, PromotionAuditRecord,
    WriteMemoryRequest,
    identity::validate_identifier,
    memory::{validate_reason, validate_tags},
};
use serde::{Deserialize, Serialize};

pub const MAX_DREAM_CONTENT_BYTES: usize = 32_000;
pub const MAX_DREAM_INSPIRATIONS: usize = 16;
pub const DEFAULT_DREAM_PAGE: usize = 100;
pub const MAX_DREAM_PAGE: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DreamRecord {
    #[serde(flatten)]
    pub memory: MemoryRecord,
    pub speculative: bool,
    pub sharing: Option<PromotionAuditRecord>,
    /// Memories or earlier dreams this reflection builds on. Kept only on the
    /// private original: a shared excerpt never reveals private provenance.
    #[serde(default)]
    pub inspired_by: Vec<String>,
}

/// A new private dream, as submitted by the external runtime.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DreamDraft {
    pub content: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub inspired_by: Vec<String>,
}

/// An explicit decision to publish an excerpt of a private dream.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DreamShare {
    pub dream_id: String,
    pub content: String,
    pub target_scope: MemoryScope,
    pub reason: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// Which slice of the permitted dreams a journal read returns.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DreamView {
    /// Own private dreams plus every shared dream the agent may read.
    #[default]
    All,
    /// Only the agent's own private dreams.
    Private,
    /// Only shared dreams the agent may read.
    Shared,
}

/// Keyset position in the newest-first journal order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DreamCursor {
    pub created_at_unix_ms: u128,
    pub dream_id: String,
}

impl DreamCursor {
    pub fn after(dream: &DreamRecord) -> Self {
        Self {
            created_at_unix_ms: dream.memory.created_at_unix_ms,
            dream_id: dream.memory.memory_id.clone(),
        }
    }

    pub fn encode(&self) -> String {
        format!("{}:{}", self.created_at_unix_ms, self.dream_id)
    }

    pub fn decode(value: &str) -> Option<Self> {
        let (created, dream_id) = value.split_once(':')?;
        let created_at_unix_ms = created.parse().ok()?;
        validate_identifier("cursor", dream_id).ok()?;

        Some(Self {
            created_at_unix_ms,
            dream_id: dream_id.to_owned(),
        })
    }

    /// Whether `dream` comes strictly after this cursor (newest first).
    pub fn precedes(&self, dream: &DreamRecord) -> bool {
        let created = dream.memory.created_at_unix_ms;
        created < self.created_at_unix_ms
            || (created == self.created_at_unix_ms && dream.memory.memory_id < self.dream_id)
    }
}

#[derive(Debug, Clone, Default)]
pub struct DreamQuery {
    pub view: DreamView,
    pub tag: Option<String>,
    pub cursor: Option<DreamCursor>,
    pub limit: usize,
}

impl DreamQuery {
    /// In-memory equivalent of the Postgres journal filter. Visibility is
    /// checked separately with `DreamRecord::visible_to`.
    pub fn matches(&self, dream: &DreamRecord) -> bool {
        let private = dream.memory.scope == MemoryScope::AgentPrivate;
        let view = match self.view {
            DreamView::All => true,
            DreamView::Private => private,
            DreamView::Shared => !private,
        };
        let tag = self
            .tag
            .as_ref()
            .is_none_or(|tag| dream.memory.tags.contains(tag));
        let cursor = self
            .cursor
            .as_ref()
            .is_none_or(|cursor| cursor.precedes(dream));

        view && tag && cursor
    }
}

impl DreamDraft {
    pub fn validate(&self) -> Result<(), EnergonError> {
        validate_dream_content(&self.content)?;
        validate_tags(&self.tags)?;

        if self.inspired_by.len() > MAX_DREAM_INSPIRATIONS {
            return Err(EnergonError::InputTooLarge {
                field: "inspired_by",
                limit: "16 references",
            });
        }

        for id in &self.inspired_by {
            validate_identifier("inspired_by", id)?;
        }

        Ok(())
    }
}

impl DreamShare {
    pub fn validate(&self) -> Result<(), EnergonError> {
        validate_identifier("dream_id", &self.dream_id)?;
        validate_dream_content(&self.content)?;
        validate_reason(&self.reason)?;
        validate_tags(&self.tags)
    }
}

fn validate_dream_content(content: &str) -> Result<(), EnergonError> {
    if content.trim().is_empty() {
        return Err(EnergonError::EmptyMemory);
    }

    if content.len() > MAX_DREAM_CONTENT_BYTES {
        return Err(EnergonError::InputTooLarge {
            field: "dream content",
            limit: "32000 bytes",
        });
    }

    Ok(())
}

impl DreamRecord {
    pub fn private(
        id: String,
        agent: &AgentIdentity,
        draft: DreamDraft,
        timestamp: u128,
    ) -> Result<Self, EnergonError> {
        draft.validate()?;
        let memory = MemoryRecord::from_write(
            id,
            agent,
            WriteMemoryRequest {
                scope: MemoryScope::AgentPrivate,
                content: draft.content,
                tags: draft.tags,
                project_id: None,
                role_id: None,
                user_id: None,
                session_id: None,
                source: None,
            },
            timestamp,
        )?;
        let mut seen = std::collections::HashSet::new();
        let mut inspired_by = draft.inspired_by;
        inspired_by.retain(|id| seen.insert(id.clone()));

        Ok(Self {
            memory,
            speculative: true,
            sharing: None,
            inspired_by,
        })
    }

    /// Share an explicitly selected excerpt; never copy the private body implicitly.
    pub fn share(
        &self,
        id: String,
        actor: &AgentIdentity,
        request: DreamShare,
        timestamp: u128,
    ) -> Result<Self, EnergonError> {
        if !self.owned_privately_by(actor) {
            return Err(EnergonError::PermissionDenied {
                agent_id: actor.agent_id.clone(),
                memory_id: self.memory.memory_id.clone(),
            });
        }
        request.validate()?;
        let mut source = self.memory.clone();
        // Sharing uses current membership, even if the dream predates a role change.
        source.project_id = actor.project_id.clone();
        source.role_id = actor.role_id.clone();
        let mut memory = source.promoted_copy(id, request.target_scope, timestamp)?;
        memory.content = request.content.trim().to_owned();
        // Tags are part of what the author chooses to publish, like the excerpt.
        memory.tags = request
            .tags
            .into_iter()
            .map(|tag| tag.trim().to_owned())
            .filter(|tag| !tag.is_empty())
            .collect();
        let sharing = PromotionAuditRecord {
            promotion_id: format!("dream_share_{}", memory.memory_id),
            source_memory_id: self.memory.memory_id.clone(),
            promoted_memory_id: memory.memory_id.clone(),
            agent_id: actor.agent_id.clone(),
            org_id: actor.org_id.clone(),
            target_scope: memory.scope.clone(),
            reason: request.reason.trim().to_owned(),
            created_at_unix_ms: timestamp,
        };
        Ok(Self {
            memory,
            speculative: true,
            sharing: Some(sharing),
            inspired_by: Vec::new(),
        })
    }

    pub fn visible_to(&self, agent: &AgentIdentity) -> bool {
        crate::can_read_memory(agent, &self.memory, &Default::default())
    }

    pub fn owned_privately_by(&self, agent: &AgentIdentity) -> bool {
        self.memory.scope == MemoryScope::AgentPrivate
            && self.memory.org_id == agent.org_id
            && self.memory.owner_agent_id.as_ref() == Some(&agent.agent_id)
    }

    /// Only the author may forget a private dream, and only the agent that
    /// shared an excerpt may retract it. Readers can never delete.
    pub fn forgettable_by(&self, agent: &AgentIdentity) -> bool {
        self.owned_privately_by(agent)
            || (self.memory.org_id == agent.org_id
                && self
                    .sharing
                    .as_ref()
                    .is_some_and(|sharing| sharing.agent_id == agent.agent_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn agent(id: &str, org: &str) -> AgentIdentity {
        AgentIdentity::new(id, org, Some("research".into()), Some("launch".into()))
    }
    fn draft(content: &str) -> DreamDraft {
        DreamDraft {
            content: content.into(),
            tags: vec![],
            inspired_by: vec![],
        }
    }
    fn share_request(content: &str, target: MemoryScope, reason: &str) -> DreamShare {
        DreamShare {
            dream_id: "dream_1".into(),
            content: content.into(),
            target_scope: target,
            reason: reason.into(),
            tags: vec![],
        }
    }
    #[test]
    fn private_until_explicit_excerpt_is_shared() {
        let author = agent("a", "org");
        let mut secret = draft("Secret and an idea");
        secret.tags = vec!["onboarding".into()];
        secret.inspired_by = vec!["mem_private".into()];
        let dream = DreamRecord::private("dream_1".into(), &author, secret, 1).unwrap();
        assert_eq!(dream.memory.scope, MemoryScope::AgentPrivate);
        let shared = dream
            .share(
                "dream_2".into(),
                &author,
                share_request("Only an idea", MemoryScope::Project, "Discuss possibility"),
                2,
            )
            .unwrap();
        assert_eq!(shared.memory.content, "Only an idea");
        assert_eq!(dream.memory.content, "Secret and an idea");
        assert!(shared.speculative);
        assert!(shared.sharing.is_some());
        assert!(
            shared.memory.tags.is_empty(),
            "private tags are not published implicitly"
        );
        assert!(
            shared.inspired_by.is_empty(),
            "private provenance is not published"
        );
        assert!(!shared.visible_to(&agent("b", "other")));
    }
    #[test]
    fn others_cannot_share_and_sharing_requires_reason() {
        let author = agent("a", "org");
        let dream = DreamRecord::private("dream_1".into(), &author, draft("Idea"), 1).unwrap();
        for actor in [agent("b", "org"), agent("a", "other")] {
            assert!(
                dream
                    .share(
                        "d2".into(),
                        &actor,
                        share_request("Idea", MemoryScope::Org, "Share"),
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
                    share_request("Idea", MemoryScope::Org, " "),
                    2
                )
                .is_err()
        );
    }
    #[test]
    fn sharing_uses_current_membership_and_rejects_missing_scope() {
        let author = agent("a", "org");
        let dream = DreamRecord::private("d1".into(), &author, draft("Idea"), 1).unwrap();
        let mut changed = author.clone();
        changed.project_id = Some("new-project".into());
        let shared = dream
            .share(
                "d2".into(),
                &changed,
                share_request("Idea", MemoryScope::Project, "Discuss"),
                2,
            )
            .unwrap();
        assert_eq!(shared.memory.project_id.as_deref(), Some("new-project"));
        assert!(!shared.visible_to(&author));
        changed.project_id = None;
        assert!(
            dream
                .share(
                    "d3".into(),
                    &changed,
                    share_request("Idea", MemoryScope::Project, "Discuss"),
                    2
                )
                .is_err()
        );
    }
    #[test]
    fn drafts_are_bounded_and_references_deduplicated() {
        let author = agent("a", "org");
        let mut too_long = draft("x");
        too_long.content = "x".repeat(MAX_DREAM_CONTENT_BYTES + 1);
        assert!(DreamRecord::private("d1".into(), &author, too_long, 1).is_err());

        let mut too_many = draft("Idea");
        too_many.inspired_by = (0..=MAX_DREAM_INSPIRATIONS)
            .map(|i| format!("mem_{i}"))
            .collect();
        assert!(DreamRecord::private("d1".into(), &author, too_many, 1).is_err());

        let mut hostile = draft("Idea");
        hostile.inspired_by = vec!["../../secrets".into()];
        assert!(DreamRecord::private("d1".into(), &author, hostile, 1).is_err());

        let mut repeated = draft("Idea");
        repeated.inspired_by = vec!["mem_1".into(), "mem_2".into(), "mem_1".into()];
        let dream = DreamRecord::private("d1".into(), &author, repeated, 1).unwrap();
        assert_eq!(dream.inspired_by, vec!["mem_1", "mem_2"]);
    }
    #[test]
    fn only_authors_and_sharers_can_forget() {
        let author = agent("a", "org");
        let reader = agent("b", "org");
        let dream = DreamRecord::private("d1".into(), &author, draft("Idea"), 1).unwrap();
        assert!(dream.forgettable_by(&author));
        assert!(!dream.forgettable_by(&reader));
        assert!(!dream.forgettable_by(&agent("a", "other")));

        let shared = dream
            .share(
                "d2".into(),
                &author,
                share_request("Idea", MemoryScope::Org, "Discuss"),
                2,
            )
            .unwrap();
        assert!(shared.visible_to(&reader));
        assert!(shared.forgettable_by(&author));
        assert!(!shared.forgettable_by(&reader));
    }
    #[test]
    fn cursors_page_newest_first_without_gaps() {
        let author = agent("a", "org");
        let dreams: Vec<_> = [(3, "d_c"), (2, "d_b"), (2, "d_a"), (1, "d_z")]
            .into_iter()
            .map(|(at, id)| DreamRecord::private(id.into(), &author, draft("Idea"), at).unwrap())
            .collect();
        let cursor = DreamCursor::decode(&DreamCursor::after(&dreams[1]).encode()).unwrap();
        let query = DreamQuery {
            cursor: Some(cursor),
            ..Default::default()
        };
        let rest: Vec<_> = dreams
            .iter()
            .filter(|dream| query.matches(dream))
            .map(|dream| dream.memory.memory_id.as_str())
            .collect();
        assert_eq!(rest, vec!["d_a", "d_z"]);
        assert!(DreamCursor::decode("not-a-cursor").is_none());
        assert!(DreamCursor::decode("12:bad id").is_none());
    }
    #[test]
    fn views_and_tags_filter_the_journal() {
        let author = agent("a", "org");
        let mut tagged = draft("Idea");
        tagged.tags = vec!["growth".into()];
        let private = DreamRecord::private("d1".into(), &author, tagged, 1).unwrap();
        let shared = private
            .share(
                "d2".into(),
                &author,
                share_request("Idea", MemoryScope::Org, "Discuss"),
                2,
            )
            .unwrap();
        let only = |view, tag: Option<&str>| DreamQuery {
            view,
            tag: tag.map(str::to_owned),
            ..Default::default()
        };
        assert!(only(DreamView::Private, None).matches(&private));
        assert!(!only(DreamView::Private, None).matches(&shared));
        assert!(only(DreamView::Shared, None).matches(&shared));
        assert!(only(DreamView::All, Some("growth")).matches(&private));
        assert!(!only(DreamView::All, Some("growth")).matches(&shared));
    }
    #[test]
    fn stored_documents_without_provenance_still_load() {
        let author = agent("a", "org");
        let dream = DreamRecord::private("d1".into(), &author, draft("Idea"), 1).unwrap();
        // Round-trip through text like the JSONB column does (u128 timestamps
        // cannot be serialized into a serde_json::Value directly).
        let mut value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&dream).unwrap()).unwrap();
        value.as_object_mut().unwrap().remove("inspired_by");
        let loaded: DreamRecord = serde_json::from_str(&value.to_string()).unwrap();
        assert!(loaded.inspired_by.is_empty());
    }
}
