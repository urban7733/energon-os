use crate::{context_broker::ContextItem, retrieval::ScoredMemory};

pub fn approximate_tokens(text: &str) -> usize {
    let words = text.split_whitespace().count();
    (words * 4).div_ceil(3)
}

pub fn pack_context(scored: Vec<ScoredMemory>, token_budget: usize) -> (Vec<ContextItem>, usize) {
    let mut items = Vec::new();
    let mut used_tokens = 0;

    for scored_memory in scored {
        let estimated_tokens = approximate_tokens(&scored_memory.memory.content);

        if used_tokens + estimated_tokens > token_budget {
            continue;
        }

        used_tokens += estimated_tokens;
        items.push(ContextItem {
            memory_id: scored_memory.memory.memory_id,
            scope: scored_memory.memory.scope,
            content: scored_memory.memory.content,
            estimated_tokens,
            reason: scored_memory.reason,
        });
    }

    (items, used_tokens)
}
