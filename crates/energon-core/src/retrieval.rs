use crate::memory::MemoryRecord;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScoredMemory {
    pub memory: MemoryRecord,
    pub score: usize,
    pub reason: String,
}

pub fn score_memory(task: &str, memory: &MemoryRecord) -> ScoredMemory {
    let keywords = keywords(task);
    let searchable = format!(
        "{} {}",
        memory.content.to_lowercase(),
        memory.tags.join(" ").to_lowercase()
    );

    let score = keywords
        .iter()
        .filter(|keyword| searchable.contains(keyword.as_str()))
        .count();

    let reason = if score > 0 {
        "matched task terms or tags".to_owned()
    } else {
        "allowed but no direct keyword match".to_owned()
    };

    ScoredMemory {
        memory: memory.clone(),
        score,
        reason,
    }
}

fn keywords(input: &str) -> Vec<String> {
    input
        .split_whitespace()
        .map(|word| {
            word.chars()
                .filter(|ch| ch.is_alphanumeric())
                .collect::<String>()
                .to_lowercase()
        })
        .filter(|word| word.len() > 2)
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::{MemoryRecord, MemoryScope, retrieval::score_memory};

    #[test]
    fn scores_matching_task_terms() {
        let memory = MemoryRecord {
            memory_id: "mem_1".to_owned(),
            org_id: "org_1".to_owned(),
            scope: MemoryScope::Org,
            content: "Investor outreach should focus on trust infrastructure.".to_owned(),
            tags: vec!["positioning".to_owned()],
            project_id: None,
            role_id: None,
            owner_agent_id: None,
            user_id: None,
            session_id: None,
            source: None,
            promoted_from: None,
            created_at_unix_ms: 1,
        };

        assert!(score_memory("prepare investor outreach", &memory).score >= 2);
    }
}
