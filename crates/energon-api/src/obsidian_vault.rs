use std::collections::BTreeMap;

use energon_core::{AgentIdentity, AuditRecord, MemoryRecord, MemoryScope, PromotionAuditRecord};

#[derive(Debug, Clone)]
pub struct VaultArchive {
    pub filename: String,
    pub bytes: Vec<u8>,
}

pub fn build_obsidian_vault(
    agent: &AgentIdentity,
    memories: &[MemoryRecord],
    context_audits: &[AuditRecord],
    promotion_audits: &[PromotionAuditRecord],
) -> VaultArchive {
    let mut files = BTreeMap::new();
    let vault_name = format!("energon-obsidian-vault-{}", slug(&agent.agent_id));

    files.insert(
        "README.md".to_owned(),
        readme_note(agent, memories, context_audits, promotion_audits),
    );
    files.insert(
        "Index/Memory Graph.md".to_owned(),
        graph_index_note(agent, memories, context_audits, promotion_audits),
    );
    files.insert(
        agent_path(&agent.agent_id),
        agent_note(agent, memories, context_audits, promotion_audits),
    );
    files.insert(
        org_path(&agent.org_id),
        org_note(&agent.org_id, memories, context_audits, promotion_audits),
    );

    if let Some(project_id) = agent.project_id.as_deref() {
        files.insert(project_path(project_id), project_note(project_id, memories));
    }

    if let Some(role_id) = agent.role_id.as_deref() {
        files.insert(role_path(role_id), role_note(role_id, memories));
    }

    for memory in memories {
        if let Some(project_id) = memory.project_id.as_deref() {
            files
                .entry(project_path(project_id))
                .or_insert_with(|| project_note(project_id, memories));
        }

        if let Some(role_id) = memory.role_id.as_deref() {
            files
                .entry(role_path(role_id))
                .or_insert_with(|| role_note(role_id, memories));
        }

        if let Some(session_id) = memory.session_id.as_deref() {
            files
                .entry(session_path(session_id))
                .or_insert_with(|| session_note(session_id, memories, context_audits));
        }

        files.insert(
            memory_path(&memory.memory_id),
            memory_note(memory, context_audits, promotion_audits),
        );
    }

    for audit in context_audits {
        files.insert(context_path(&audit.request_id), context_note(audit));
    }

    for promotion in promotion_audits {
        files.insert(
            promotion_path(&promotion.promotion_id),
            promotion_note(promotion),
        );
    }

    VaultArchive {
        filename: format!("{vault_name}.zip"),
        bytes: zip_store(files),
    }
}

fn readme_note(
    agent: &AgentIdentity,
    memories: &[MemoryRecord],
    context_audits: &[AuditRecord],
    promotion_audits: &[PromotionAuditRecord],
) -> String {
    format!(
        r#"---
type: energon_vault
agent_id: {}
org_id: {}
memory_count: {}
context_build_count: {}
promotion_count: {}
---

# Energon Obsidian Vault

This vault is a permission-filtered human view of Energon OS memory.

Source of truth stays in Energon OS: Postgres, pgvector, permission checks, and API audit logs.
This export is a local read-only Obsidian graph view for inspection.

Start here:

- [[Index/Memory Graph]]
- {}
- {}

"#,
        yaml_string(&agent.agent_id),
        yaml_string(&agent.org_id),
        memories.len(),
        context_audits.len(),
        promotion_audits.len(),
        wikilink(&agent_path(&agent.agent_id), &agent.agent_id),
        wikilink(&org_path(&agent.org_id), &agent.org_id),
    )
}

fn graph_index_note(
    agent: &AgentIdentity,
    memories: &[MemoryRecord],
    context_audits: &[AuditRecord],
    promotion_audits: &[PromotionAuditRecord],
) -> String {
    let mut content = format!(
        r#"---
type: energon_graph_index
agent_id: {}
org_id: {}
---

# Memory Graph

## Identity

- Agent: {}
- Organization: {}
"#,
        yaml_string(&agent.agent_id),
        yaml_string(&agent.org_id),
        wikilink(&agent_path(&agent.agent_id), &agent.agent_id),
        wikilink(&org_path(&agent.org_id), &agent.org_id),
    );

    if let Some(project_id) = agent.project_id.as_deref() {
        content.push_str(&format!(
            "- Project: {}\n",
            wikilink(&project_path(project_id), project_id)
        ));
    }

    if let Some(role_id) = agent.role_id.as_deref() {
        content.push_str(&format!(
            "- Role: {}\n",
            wikilink(&role_path(role_id), role_id)
        ));
    }

    content.push_str("\n## Memory\n\n");
    for memory in memories {
        content.push_str(&format!(
            "- {} `{}` scope `{}`\n",
            wikilink(&memory_path(&memory.memory_id), &memory.memory_id),
            memory.owner_agent_id.as_deref().unwrap_or("shared"),
            scope_name(&memory.scope),
        ));
    }

    content.push_str("\n## Context Builds\n\n");
    for audit in context_audits {
        content.push_str(&format!(
            "- {} `{}`\n",
            wikilink(&context_path(&audit.request_id), &audit.request_id),
            audit.task
        ));
    }

    content.push_str("\n## Promotions\n\n");
    for promotion in promotion_audits {
        content.push_str(&format!(
            "- {} {} -> {}\n",
            wikilink(
                &promotion_path(&promotion.promotion_id),
                &promotion.promotion_id
            ),
            wikilink(
                &memory_path(&promotion.source_memory_id),
                &promotion.source_memory_id
            ),
            wikilink(
                &memory_path(&promotion.promoted_memory_id),
                &promotion.promoted_memory_id
            ),
        ));
    }

    content
}

fn agent_note(
    agent: &AgentIdentity,
    memories: &[MemoryRecord],
    context_audits: &[AuditRecord],
    promotion_audits: &[PromotionAuditRecord],
) -> String {
    let mut content = format!(
        r#"---
type: agent
agent_id: {}
org_id: {}
role_id: {}
project_id: {}
---

# Agent {}

Organization: {}

"#,
        yaml_string(&agent.agent_id),
        yaml_string(&agent.org_id),
        yaml_optional(agent.role_id.as_deref()),
        yaml_optional(agent.project_id.as_deref()),
        agent.agent_id,
        wikilink(&org_path(&agent.org_id), &agent.org_id),
    );

    push_section_links(
        &mut content,
        "Owned Memory",
        memories
            .iter()
            .filter(|memory| memory.owner_agent_id.as_deref() == Some(agent.agent_id.as_str()))
            .map(|memory| (memory_path(&memory.memory_id), memory.memory_id.as_str())),
    );
    push_section_links(
        &mut content,
        "Context Builds",
        context_audits
            .iter()
            .filter(|audit| audit.agent_id == agent.agent_id)
            .map(|audit| (context_path(&audit.request_id), audit.request_id.as_str())),
    );
    push_section_links(
        &mut content,
        "Promotions",
        promotion_audits
            .iter()
            .filter(|promotion| promotion.agent_id == agent.agent_id)
            .map(|promotion| {
                (
                    promotion_path(&promotion.promotion_id),
                    promotion.promotion_id.as_str(),
                )
            }),
    );

    content
}

fn org_note(
    org_id: &str,
    memories: &[MemoryRecord],
    context_audits: &[AuditRecord],
    promotion_audits: &[PromotionAuditRecord],
) -> String {
    let mut content = format!(
        r#"---
type: organization
org_id: {}
---

# Organization {}

"#,
        yaml_string(org_id),
        org_id,
    );

    push_section_links(
        &mut content,
        "Memory",
        memories
            .iter()
            .filter(|memory| memory.org_id == org_id)
            .map(|memory| (memory_path(&memory.memory_id), memory.memory_id.as_str())),
    );
    push_section_links(
        &mut content,
        "Context Builds",
        context_audits
            .iter()
            .filter(|audit| audit.org_id == org_id)
            .map(|audit| (context_path(&audit.request_id), audit.request_id.as_str())),
    );
    push_section_links(
        &mut content,
        "Promotions",
        promotion_audits
            .iter()
            .filter(|promotion| promotion.org_id == org_id)
            .map(|promotion| {
                (
                    promotion_path(&promotion.promotion_id),
                    promotion.promotion_id.as_str(),
                )
            }),
    );

    content
}

fn project_note(project_id: &str, memories: &[MemoryRecord]) -> String {
    let mut content = format!(
        r#"---
type: project
project_id: {}
---

# Project {}

"#,
        yaml_string(project_id),
        project_id,
    );

    push_section_links(
        &mut content,
        "Project Memory",
        memories
            .iter()
            .filter(|memory| memory.project_id.as_deref() == Some(project_id))
            .map(|memory| (memory_path(&memory.memory_id), memory.memory_id.as_str())),
    );

    content
}

fn role_note(role_id: &str, memories: &[MemoryRecord]) -> String {
    let mut content = format!(
        r#"---
type: role
role_id: {}
---

# Role {}

"#,
        yaml_string(role_id),
        role_id,
    );

    push_section_links(
        &mut content,
        "Role Memory",
        memories
            .iter()
            .filter(|memory| memory.role_id.as_deref() == Some(role_id))
            .map(|memory| (memory_path(&memory.memory_id), memory.memory_id.as_str())),
    );

    content
}

fn session_note(
    session_id: &str,
    memories: &[MemoryRecord],
    context_audits: &[AuditRecord],
) -> String {
    let mut content = format!(
        r#"---
type: session
session_id: {}
---

# Session {}

"#,
        yaml_string(session_id),
        session_id,
    );

    push_section_links(
        &mut content,
        "Session Memory",
        memories
            .iter()
            .filter(|memory| memory.session_id.as_deref() == Some(session_id))
            .map(|memory| (memory_path(&memory.memory_id), memory.memory_id.as_str())),
    );
    push_section_links(
        &mut content,
        "Context Builds",
        context_audits
            .iter()
            .map(|audit| (context_path(&audit.request_id), audit.request_id.as_str())),
    );

    content
}

fn memory_note(
    memory: &MemoryRecord,
    context_audits: &[AuditRecord],
    promotion_audits: &[PromotionAuditRecord],
) -> String {
    let mut content = format!(
        r#"---
type: memory
memory_id: {}
org_id: {}
scope: {}
project_id: {}
role_id: {}
owner_agent_id: {}
user_id: {}
session_id: {}
source: {}
promoted_from: {}
created_at_unix_ms: {}
tags: {}
---

# Memory {}

## Content

{}

## Links

- Organization: {}
"#,
        yaml_string(&memory.memory_id),
        yaml_string(&memory.org_id),
        yaml_string(scope_name(&memory.scope)),
        yaml_optional(memory.project_id.as_deref()),
        yaml_optional(memory.role_id.as_deref()),
        yaml_optional(memory.owner_agent_id.as_deref()),
        yaml_optional(memory.user_id.as_deref()),
        yaml_optional(memory.session_id.as_deref()),
        yaml_optional(memory.source.as_deref()),
        yaml_optional(memory.promoted_from.as_deref()),
        memory.created_at_unix_ms,
        yaml_array(&memory.tags),
        memory.memory_id,
        memory.content,
        wikilink(&org_path(&memory.org_id), &memory.org_id),
    );

    if let Some(agent_id) = memory.owner_agent_id.as_deref() {
        content.push_str(&format!(
            "- Owner Agent: {}\n",
            wikilink(&agent_path(agent_id), agent_id)
        ));
    }
    if let Some(project_id) = memory.project_id.as_deref() {
        content.push_str(&format!(
            "- Project: {}\n",
            wikilink(&project_path(project_id), project_id)
        ));
    }
    if let Some(role_id) = memory.role_id.as_deref() {
        content.push_str(&format!(
            "- Role: {}\n",
            wikilink(&role_path(role_id), role_id)
        ));
    }
    if let Some(session_id) = memory.session_id.as_deref() {
        content.push_str(&format!(
            "- Session: {}\n",
            wikilink(&session_path(session_id), session_id)
        ));
    }
    if let Some(source_memory_id) = memory.promoted_from.as_deref() {
        content.push_str(&format!(
            "- Promoted From: {}\n",
            wikilink(&memory_path(source_memory_id), source_memory_id)
        ));
    }

    let influencing_contexts = context_audits
        .iter()
        .filter(|audit| {
            audit
                .allowed_memory_ids
                .iter()
                .any(|id| id == &memory.memory_id)
        })
        .map(|audit| (context_path(&audit.request_id), audit.request_id.as_str()));
    push_section_links(
        &mut content,
        "Influenced Context Builds",
        influencing_contexts,
    );

    let related_promotions = promotion_audits
        .iter()
        .filter(|promotion| {
            promotion.source_memory_id == memory.memory_id
                || promotion.promoted_memory_id == memory.memory_id
        })
        .map(|promotion| {
            (
                promotion_path(&promotion.promotion_id),
                promotion.promotion_id.as_str(),
            )
        });
    push_section_links(&mut content, "Promotion Trail", related_promotions);

    content
}

fn context_note(audit: &AuditRecord) -> String {
    let mut content = format!(
        r#"---
type: context_build
request_id: {}
agent_id: {}
org_id: {}
task: {}
token_budget: {}
estimated_tokens: {}
denied_memory_count: {}
created_at_unix_ms: {}
---

# Context Build {}

Task: {}

Agent: {}

"#,
        yaml_string(&audit.request_id),
        yaml_string(&audit.agent_id),
        yaml_string(&audit.org_id),
        yaml_string(&audit.task),
        audit.token_budget,
        audit.estimated_tokens,
        audit.denied_memory_count,
        audit.created_at_unix_ms,
        audit.request_id,
        audit.task,
        wikilink(&agent_path(&audit.agent_id), &audit.agent_id),
    );

    push_section_links(
        &mut content,
        "Allowed Memory",
        audit
            .allowed_memory_ids
            .iter()
            .map(|memory_id| (memory_path(memory_id), memory_id.as_str())),
    );

    content
}

fn promotion_note(promotion: &PromotionAuditRecord) -> String {
    format!(
        r#"---
type: promotion
promotion_id: {}
source_memory_id: {}
promoted_memory_id: {}
agent_id: {}
org_id: {}
target_scope: {}
reason: {}
created_at_unix_ms: {}
---

# Promotion {}

Source: {}

Promoted Memory: {}

Agent: {}

Target Scope: `{}`

Reason:

{}
"#,
        yaml_string(&promotion.promotion_id),
        yaml_string(&promotion.source_memory_id),
        yaml_string(&promotion.promoted_memory_id),
        yaml_string(&promotion.agent_id),
        yaml_string(&promotion.org_id),
        yaml_string(scope_name(&promotion.target_scope)),
        yaml_string(&promotion.reason),
        promotion.created_at_unix_ms,
        promotion.promotion_id,
        wikilink(
            &memory_path(&promotion.source_memory_id),
            &promotion.source_memory_id
        ),
        wikilink(
            &memory_path(&promotion.promoted_memory_id),
            &promotion.promoted_memory_id
        ),
        wikilink(&agent_path(&promotion.agent_id), &promotion.agent_id),
        scope_name(&promotion.target_scope),
        promotion.reason,
    )
}

fn push_section_links<'a>(
    content: &mut String,
    title: &str,
    links: impl Iterator<Item = (String, &'a str)>,
) {
    let links = links.collect::<Vec<_>>();
    if links.is_empty() {
        return;
    }

    content.push_str(&format!("\n## {title}\n\n"));
    for (path, label) in links {
        content.push_str(&format!("- {}\n", wikilink(&path, label)));
    }
}

fn agent_path(agent_id: &str) -> String {
    format!("Agents/{}.md", slug(agent_id))
}

fn org_path(org_id: &str) -> String {
    format!("Organizations/{}.md", slug(org_id))
}

fn project_path(project_id: &str) -> String {
    format!("Projects/{}.md", slug(project_id))
}

fn role_path(role_id: &str) -> String {
    format!("Roles/{}.md", slug(role_id))
}

fn session_path(session_id: &str) -> String {
    format!("Sessions/{}.md", slug(session_id))
}

fn memory_path(memory_id: &str) -> String {
    format!("Memory/{}.md", slug(memory_id))
}

fn context_path(request_id: &str) -> String {
    format!("Context Builds/{}.md", slug(request_id))
}

fn promotion_path(promotion_id: &str) -> String {
    format!("Promotions/{}.md", slug(promotion_id))
}

fn wikilink(path: &str, label: &str) -> String {
    let target = path.strip_suffix(".md").unwrap_or(path);
    format!("[[{target}|{label}]]")
}

fn scope_name(scope: &MemoryScope) -> &'static str {
    match scope {
        MemoryScope::Open => "open",
        MemoryScope::Org => "org",
        MemoryScope::Project => "project",
        MemoryScope::Role => "role",
        MemoryScope::AgentPrivate => "agent_private",
        MemoryScope::UserPrivate => "user_private",
        MemoryScope::Session => "session",
    }
}

fn yaml_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_owned())
}

fn yaml_optional(value: Option<&str>) -> String {
    value.map(yaml_string).unwrap_or_else(|| "null".to_owned())
}

fn yaml_array(values: &[String]) -> String {
    let items = values
        .iter()
        .map(|value| yaml_string(value))
        .collect::<Vec<_>>();
    format!("[{}]", items.join(", "))
}

fn slug(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '_' | '-') {
            slug.push(character);
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }

    slug.trim_matches('-').to_owned()
}

fn zip_store(files: BTreeMap<String, String>) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut central_directory = Vec::new();
    let mut entries = 0_u16;

    for (path, content) in files {
        let path_bytes = path.as_bytes();
        let content_bytes = content.as_bytes();
        let offset = bytes.len() as u32;
        let crc = crc32(content_bytes);
        let size = content_bytes.len() as u32;

        write_u32(&mut bytes, 0x0403_4b50);
        write_u16(&mut bytes, 20);
        write_u16(&mut bytes, 0);
        write_u16(&mut bytes, 0);
        write_u16(&mut bytes, 0);
        write_u16(&mut bytes, 0);
        write_u32(&mut bytes, crc);
        write_u32(&mut bytes, size);
        write_u32(&mut bytes, size);
        write_u16(&mut bytes, path_bytes.len() as u16);
        write_u16(&mut bytes, 0);
        bytes.extend_from_slice(path_bytes);
        bytes.extend_from_slice(content_bytes);

        write_u32(&mut central_directory, 0x0201_4b50);
        write_u16(&mut central_directory, 20);
        write_u16(&mut central_directory, 20);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u32(&mut central_directory, crc);
        write_u32(&mut central_directory, size);
        write_u32(&mut central_directory, size);
        write_u16(&mut central_directory, path_bytes.len() as u16);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u16(&mut central_directory, 0);
        write_u32(&mut central_directory, 0);
        write_u32(&mut central_directory, offset);
        central_directory.extend_from_slice(path_bytes);

        entries += 1;
    }

    let central_directory_offset = bytes.len() as u32;
    let central_directory_size = central_directory.len() as u32;
    bytes.extend_from_slice(&central_directory);

    write_u32(&mut bytes, 0x0605_4b50);
    write_u16(&mut bytes, 0);
    write_u16(&mut bytes, 0);
    write_u16(&mut bytes, entries);
    write_u16(&mut bytes, entries);
    write_u32(&mut bytes, central_directory_size);
    write_u32(&mut bytes, central_directory_offset);
    write_u16(&mut bytes, 0);

    bytes
}

fn write_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn write_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff;

    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = 0_u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }

    !crc
}

#[cfg(test)]
mod tests {
    use super::*;

    fn agent() -> AgentIdentity {
        AgentIdentity::new(
            "agent_777",
            "org_1",
            Some("strategist".to_owned()),
            Some("apex_verify".to_owned()),
        )
    }

    fn memory(memory_id: &str) -> MemoryRecord {
        MemoryRecord {
            memory_id: memory_id.to_owned(),
            org_id: "org_1".to_owned(),
            scope: MemoryScope::AgentPrivate,
            content: "Investor memory".to_owned(),
            tags: vec!["investor".to_owned()],
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
    fn vault_contains_obsidian_wikilinks() {
        let archive = build_obsidian_vault(&agent(), &[memory("mem_1")], &[], &[]);
        let bytes = String::from_utf8_lossy(&archive.bytes);

        assert!(bytes.contains("[[Agents/agent_777|agent_777]]"));
        assert!(bytes.contains("[[Memory/mem_1|mem_1]]"));
    }

    #[test]
    fn zip_archive_has_local_file_header() {
        let archive = build_obsidian_vault(&agent(), &[memory("mem_1")], &[], &[]);

        assert_eq!(&archive.bytes[..4], &[0x50, 0x4b, 0x03, 0x04]);
    }
}
