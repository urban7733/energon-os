permit(
  principal,
  action == Action::"read_memory",
  resource
)
when {
  principal.org_id == resource.org_id &&
  (resource.scope == "open" || resource.scope == "org")
};

permit(
  principal,
  action == Action::"read_memory",
  resource
)
when {
  principal.org_id == resource.org_id &&
  resource.scope == "project" &&
  principal.project_id == resource.project_id
};

permit(
  principal,
  action == Action::"read_memory",
  resource
)
when {
  principal.org_id == resource.org_id &&
  resource.scope == "role" &&
  principal.role_id == resource.role_id
};

permit(
  principal,
  action == Action::"read_memory",
  resource
)
when {
  principal.org_id == resource.org_id &&
  resource.scope == "agent_private" &&
  principal.agent_id == resource.owner_agent_id
};
