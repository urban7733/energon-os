"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Eye,
  EyeOff,
  Focus,
  Landmark,
  Network,
  RotateCcw,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

type MemoryScope =
  | "open"
  | "org"
  | "project"
  | "role"
  | "agent_private"
  | "user_private"
  | "session";

type AtlasAgent = {
  agent_id: string;
  name: string;
  role_id: string | null;
  project_id: string | null;
};

type AtlasMemory = {
  memory_id: string;
  scope: MemoryScope;
  content_preview: string;
  project_id: string | null;
  role_id: string | null;
  owner_agent_id: string | null;
  created_at_unix_ms: number;
};

type AtlasRolePolicy = {
  role_id: string;
  authority_bps: number;
  can_resolve_conflicts: boolean;
};

type AtlasConflict = {
  conflict_id: string;
  subject: string;
  predicate: string;
  status: "contested" | "resolved";
};

type AtlasNodeType = "workspace" | "agent" | "memory" | "role" | "project" | "conflict";
type AtlasFilter = "all" | Exclude<AtlasNodeType, "workspace">;
type Position = [number, number, number];

type AtlasNode = {
  id: string;
  type: AtlasNodeType;
  label: string;
  detail: string;
  metadata: Array<[string, string]>;
  position: Position;
  color: string;
  radius: number;
  scope?: MemoryScope;
};

type AtlasEdge = {
  id: string;
  from: string;
  to: string;
  kind: "structural" | "relationship";
};

type AtlasGraph = {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
};

type MemoryAtlasProps = {
  organizationName: string;
  agents: AtlasAgent[];
  memories: AtlasMemory[];
  totalMemories: number;
  rolePolicies: AtlasRolePolicy[];
  conflicts: AtlasConflict[];
};

const atlasColors: Record<AtlasNodeType, string> = {
  workspace: "#f8fafc",
  agent: "#7dd3fc",
  memory: "#c4b5fd",
  role: "#d8b4fe",
  project: "#a5b4fc",
  conflict: "#fbbf24",
};

const filterOptions: Array<{ value: AtlasFilter; label: string; icon: typeof Network }> = [
  { value: "all", label: "All", icon: Network },
  { value: "agent", label: "Agents", icon: Bot },
  { value: "memory", label: "Memory", icon: BrainCircuit },
  { value: "role", label: "Rules", icon: ShieldCheck },
  { value: "conflict", label: "Conflicts", icon: AlertTriangle },
];

export default function MemoryAtlas({
  organizationName,
  agents,
  memories,
  totalMemories,
  rolePolicies,
  conflicts,
}: MemoryAtlasProps) {
  const [filter, setFilter] = useState<AtlasFilter>("all");
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const graph = useMemo(
    () => buildGraph({ organizationName, agents, memories, rolePolicies, conflicts }),
    [agents, conflicts, memories, organizationName, rolePolicies],
  );
  const visibleNodes = useMemo(
    () =>
      graph.nodes.filter(
        (node) => node.type === "workspace" || filter === "all" || node.type === filter,
      ),
    [filter, graph.nodes],
  );
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => graph.edges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)),
    [graph.edges, visibleNodeIds],
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const recordCount = graph.nodes.filter((node) => node.type !== "workspace").length;
  const hasOperationalData = recordCount > 0;
  const shownMemoryCount = memories.length;

  useEffect(() => {
    if (selectedNodeId && !visibleNodeIds.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, visibleNodeIds]);

  return (
    <section id="atlas" className="memory-atlas" aria-labelledby="atlas-title">
      <div className="memory-atlas-heading">
        <div>
          <p className="dashboard-eyebrow">Live memory topology</p>
          <h2 id="atlas-title">Memory Atlas</h2>
          <p className="memory-atlas-subtitle">
            {hasOperationalData
              ? `${recordCount.toLocaleString()} connected workspace records`
              : "No workspace records yet"}
          </p>
        </div>
        <span className={hasOperationalData ? "status-pill" : "status-pill status-pill-muted"}>
          <ScanLine size={14} aria-hidden="true" />
          {hasOperationalData ? "live topology" : "waiting for activity"}
        </span>
      </div>

      <div className="atlas-toolbar" aria-label="Memory Atlas controls">
        <div className="atlas-filter-group" role="group" aria-label="Filter atlas nodes">
          {filterOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              className={filter === value ? "atlas-filter is-active" : "atlas-filter"}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <div className="atlas-icon-actions">
          <button
            type="button"
            className="atlas-icon-button"
            onClick={() => setLabelsVisible((visible) => !visible)}
            aria-label={labelsVisible ? "Hide node labels" : "Show node labels"}
            title={labelsVisible ? "Hide node labels" : "Show node labels"}
          >
            {labelsVisible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="atlas-icon-button"
            onClick={() => setCameraVersion((version) => version + 1)}
            aria-label="Reset atlas camera"
            title="Reset atlas camera"
          >
            <Focus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="atlas-icon-button"
            onClick={() => setSelectedNodeId(null)}
            disabled={!selectedNodeId}
            aria-label="Clear selected node"
            title="Clear selected node"
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="atlas-layout">
        <div className="atlas-stage" aria-label="Interactive three-dimensional memory graph">
          {hasOperationalData ? (
            <Canvas
              key={cameraVersion}
              dpr={[1, 1.75]}
              camera={{ fov: 42, near: 0.1, far: 100, position: [0, 0.15, 8.7] }}
              gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            >
              <AtlasScene
                nodes={visibleNodes}
                edges={visibleEdges}
                labelsVisible={labelsVisible}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
            </Canvas>
          ) : (
            <div className="atlas-empty-state">
              <BrainCircuit size={24} aria-hidden="true" />
              <div>
                <strong>Waiting for live agent activity</strong>
                <p>Create an agent or write memory to populate this workspace graph.</p>
              </div>
            </div>
          )}
          {totalMemories > shownMemoryCount ? (
            <p className="atlas-coverage">
              Showing the {shownMemoryCount.toLocaleString()} most recent of {totalMemories.toLocaleString()} memory records.
            </p>
          ) : null}
        </div>

        <aside className="atlas-inspector" aria-live="polite">
          {selectedNode ? (
            <>
              <div className="atlas-inspector-type">
                <span style={{ backgroundColor: selectedNode.color }} />
                {formatNodeType(selectedNode.type)}
              </div>
              <strong>{selectedNode.label}</strong>
              <p>{selectedNode.detail}</p>
              <dl>
                {selectedNode.metadata.map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <div className="atlas-selection-empty">
              <Landmark size={20} aria-hidden="true" />
              <span>Topology inspector</span>
              <p>Select a live record to inspect its connections.</p>
            </div>
          )}
        </aside>
      </div>

      <div className="atlas-legend" aria-label="Atlas legend">
        <LegendItem type="agent" count={agents.length} />
        <LegendItem type="memory" count={totalMemories} />
        <LegendItem type="role" count={graph.nodes.filter((node) => node.type === "role").length} />
        <LegendItem type="project" count={graph.nodes.filter((node) => node.type === "project").length} />
        <LegendItem type="conflict" count={conflicts.filter((conflict) => conflict.status === "contested").length} />
      </div>
    </section>
  );
}

function AtlasScene({
  nodes,
  edges,
  labelsVisible,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  labelsVisible: boolean;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  return (
    <>
      <ambientLight intensity={0.58} />
      <pointLight position={[3.5, 4, 5]} intensity={8} color="#d8b4fe" distance={16} />
      <pointLight position={[-4, -2, 3]} intensity={5} color="#7dd3fc" distance={14} />
      <BrainEnvelope />
      {edges.map((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return null;
        return (
          <Line
            key={edge.id}
            points={[from.position, to.position]}
            color={edge.kind === "relationship" ? "#b9a8eb" : "#5f6c8d"}
            transparent
            opacity={edge.kind === "relationship" ? 0.62 : 0.3}
            lineWidth={edge.kind === "relationship" ? 1.25 : 0.8}
          />
        );
      })}
      {nodes.map((node) => (
        <AtlasNodeMesh
          key={node.id}
          node={node}
          labelsVisible={labelsVisible}
          selected={selectedNodeId === node.id}
          onSelectNode={onSelectNode}
        />
      ))}
      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={5.8}
        maxDistance={13}
        autoRotate
        autoRotateSpeed={0.36}
        makeDefault
      />
    </>
  );
}

function BrainEnvelope() {
  const lobes: Array<{ position: Position; scale: Position; color: string; rotation: Position }> = [
    { position: [-1.12, 0.54, -0.16], scale: [1.2, 1.08, 0.92], color: "#415cbb", rotation: [0.28, 0.18, -0.32] },
    { position: [1.12, 0.54, -0.16], scale: [1.2, 1.08, 0.92], color: "#5b48ac", rotation: [0.28, -0.18, 0.32] },
    { position: [-1.1, -0.42, -0.08], scale: [1.08, 0.78, 0.86], color: "#365f9d", rotation: [-0.2, 0.26, 0.2] },
    { position: [1.1, -0.42, -0.08], scale: [1.08, 0.78, 0.86], color: "#70499e", rotation: [-0.2, -0.26, -0.2] },
    { position: [0, -1.16, -0.34], scale: [0.82, 0.55, 0.66], color: "#3a5b94", rotation: [0.16, 0, 0] },
  ];

  return (
    <group>
      {lobes.map((lobe, index) => (
        <mesh key={index} position={lobe.position} scale={lobe.scale} rotation={lobe.rotation}>
          <icosahedronGeometry args={[1, 3]} />
          <meshStandardMaterial
            color={lobe.color}
            emissive={lobe.color}
            emissiveIntensity={0.16}
            transparent
            opacity={0.065}
            wireframe
            roughness={0.3}
            metalness={0.12}
          />
        </mesh>
      ))}
      <Line points={[[-0.1, 1.42, -0.2], [0, 0.8, -0.42], [0, -0.2, -0.2], [0, -1.5, -0.38]]} color="#a5b4fc" transparent opacity={0.18} lineWidth={0.8} />
      <Line points={[[-2.25, 0.2, -0.38], [-1.52, 0.5, -0.52], [-0.78, 0.18, -0.48], [-0.22, 0.42, -0.4]]} color="#7dd3fc" transparent opacity={0.13} lineWidth={0.8} />
      <Line points={[[2.25, 0.2, -0.38], [1.52, 0.5, -0.52], [0.78, 0.18, -0.48], [0.22, 0.42, -0.4]]} color="#c4b5fd" transparent opacity={0.13} lineWidth={0.8} />
    </group>
  );
}

function AtlasNodeMesh({
  node,
  labelsVisible,
  selected,
  onSelectNode,
}: {
  node: AtlasNode;
  labelsVisible: boolean;
  selected: boolean;
  onSelectNode: (nodeId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const showLabel = labelsVisible && (hovered || selected || node.type === "workspace");

  return (
    <group position={node.position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode(node.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[node.radius, 24, 24]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={selected ? 2.2 : hovered ? 1.35 : 0.72}
          roughness={0.25}
          metalness={0.35}
        />
      </mesh>
      {selected ? (
        <mesh scale={1.75}>
          <sphereGeometry args={[node.radius, 18, 18]} />
          <meshBasicMaterial color={node.color} transparent opacity={0.48} wireframe />
        </mesh>
      ) : null}
      {showLabel ? (
        <Html position={[0, node.radius + 0.2, 0]} center distanceFactor={8} className="atlas-node-label" zIndexRange={[2, 0]}>
          <span>{node.label}</span>
        </Html>
      ) : null}
    </group>
  );
}

function LegendItem({ type, count }: { type: Exclude<AtlasNodeType, "workspace">; count: number }) {
  return (
    <span>
      <i style={{ backgroundColor: atlasColors[type] }} />
      {formatNodeType(type)}
      <strong>{count.toLocaleString()}</strong>
    </span>
  );
}

function buildGraph({
  organizationName,
  agents,
  memories,
  rolePolicies,
  conflicts,
}: Omit<MemoryAtlasProps, "totalMemories">): AtlasGraph {
  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];
  const workspaceId = "workspace:active";
  const roleMap = new Map(rolePolicies.map((policy) => [policy.role_id, policy]));
  const roleIds = new Set(rolePolicies.map((policy) => policy.role_id));
  const projectIds = new Set<string>();

  for (const agent of agents) {
    if (agent.role_id) roleIds.add(agent.role_id);
    if (agent.project_id) projectIds.add(agent.project_id);
  }
  for (const memory of memories) {
    if (memory.role_id) roleIds.add(memory.role_id);
    if (memory.project_id) projectIds.add(memory.project_id);
  }

  nodes.push({
    id: workspaceId,
    type: "workspace",
    label: organizationName || "Active workspace",
    detail: "Active Energon workspace",
    metadata: [["record", "workspace"]],
    position: [0, 0, 0.45],
    color: atlasColors.workspace,
    radius: 0.17,
  });

  const rawNodes: Omit<AtlasNode, "position">[] = [
    ...agents.map((agent) => ({
      id: `agent:${agent.agent_id}`,
      type: "agent" as const,
      label: agent.name || agent.agent_id,
      detail: `Agent ID: ${agent.agent_id}`,
      metadata: compactMetadata([
        ["agent ID", agent.agent_id],
        ["role", agent.role_id],
        ["project", agent.project_id],
      ]),
      color: atlasColors.agent,
      radius: 0.115,
    })),
    ...Array.from(roleIds).sort().map((roleId) => {
      const policy = roleMap.get(roleId);
      return {
        id: `role:${roleId}`,
        type: "role" as const,
        label: roleId,
        detail: policy
          ? `Authority ${formatAuthority(policy.authority_bps)}${policy.can_resolve_conflicts ? " · resolves conflicts" : ""}`
          : "Role assigned to workspace records",
        metadata: compactMetadata([
          ["role ID", roleId],
          ["authority", policy ? formatAuthority(policy.authority_bps) : null],
          ["conflict resolution", policy ? (policy.can_resolve_conflicts ? "allowed" : "not allowed") : null],
        ]),
        color: atlasColors.role,
        radius: 0.1,
      };
    }),
    ...Array.from(projectIds).sort().map((projectId) => ({
      id: `project:${projectId}`,
      type: "project" as const,
      label: projectId,
      detail: "Project boundary for connected agents and memory.",
      metadata: compactMetadata([["project ID", projectId]]),
      color: atlasColors.project,
      radius: 0.1,
    })),
    ...memories.map((memory) => ({
      id: `memory:${memory.memory_id}`,
      type: "memory" as const,
      label: compactId(memory.memory_id),
      detail: memory.content_preview || "Memory content is empty.",
      metadata: compactMetadata([
        ["memory ID", memory.memory_id],
        ["scope", formatScope(memory.scope)],
        ["owner agent", memory.owner_agent_id],
        ["project", memory.project_id],
        ["role", memory.role_id],
      ]),
      color: memoryColor(memory.scope),
      radius: 0.075,
      scope: memory.scope,
    })),
    ...conflicts
      .filter((conflict) => conflict.status === "contested")
      .map((conflict) => ({
        id: `conflict:${conflict.conflict_id}`,
        type: "conflict" as const,
        label: compactId(conflict.conflict_id),
        detail: `${conflict.subject} · ${conflict.predicate}`,
        metadata: compactMetadata([
          ["conflict ID", conflict.conflict_id],
          ["status", conflict.status],
        ]),
        color: atlasColors.conflict,
        radius: 0.11,
      })),
  ];

  const nodeIndexes = new Map<AtlasNodeType, number>();
  for (const node of rawNodes) {
    const nodeIndex = nodeIndexes.get(node.type) ?? 0;
    nodeIndexes.set(node.type, nodeIndex + 1);
    nodes.push({ ...node, position: positionForNode(node.id, node.type, nodeIndex, node.scope) });
    if (node.type !== "memory") {
      edges.push({
        id: `workspace:${node.id}`,
        from: workspaceId,
        to: node.id,
        kind: "structural",
      });
    }
  }

  for (const agent of agents) {
    const agentNodeId = `agent:${agent.agent_id}`;
    if (agent.role_id) {
      pushRelationship(edges, agentNodeId, `role:${agent.role_id}`);
    }
    if (agent.project_id) {
      pushRelationship(edges, agentNodeId, `project:${agent.project_id}`);
    }
  }
  for (const memory of memories) {
    const memoryNodeId = `memory:${memory.memory_id}`;
    let linked = false;
    if (memory.owner_agent_id && agents.some((agent) => agent.agent_id === memory.owner_agent_id)) {
      pushRelationship(edges, memoryNodeId, `agent:${memory.owner_agent_id}`);
      linked = true;
    }
    if (memory.role_id) {
      pushRelationship(edges, memoryNodeId, `role:${memory.role_id}`);
      linked = true;
    }
    if (memory.project_id) {
      pushRelationship(edges, memoryNodeId, `project:${memory.project_id}`);
      linked = true;
    }
    if (!linked) {
      edges.push({
        id: `workspace:${memoryNodeId}`,
        from: workspaceId,
        to: memoryNodeId,
        kind: "structural",
      });
    }
  }

  return { nodes, edges };
}

function pushRelationship(edges: AtlasEdge[], from: string, to: string) {
  edges.push({ id: `relationship:${from}:${to}`, from, to, kind: "relationship" });
}

function positionForNode(
  id: string,
  type: AtlasNodeType,
  index: number,
  scope?: MemoryScope,
): Position {
  const hash = stableHash(`${id}:${index}`);
  const hemisphere = hash % 2 === 0 ? -1 : 1;
  const random = (offset: number) => ((stableHash(`${id}:${offset}`) % 1000) / 1000) - 0.5;
  const regions: Record<AtlasNodeType, { x: number; y: number; z: number; spread: Position }> = {
    workspace: { x: 0, y: 0, z: 0, spread: [0, 0, 0] },
    agent: { x: 1.08, y: 0.72, z: 0.12, spread: [0.65, 0.54, 0.74] },
    role: { x: 0.82, y: 1.18, z: -0.12, spread: [0.42, 0.32, 0.55] },
    project: { x: 1.4, y: -0.04, z: -0.22, spread: [0.48, 0.56, 0.65] },
    memory: { x: 1.2, y: -0.42, z: 0.16, spread: [0.78, 0.64, 0.9] },
    conflict: { x: 0.42, y: -1.2, z: 0.18, spread: [0.34, 0.28, 0.46] },
  };
  const region = regions[type];
  if (type === "workspace") return [0, 0, 0.45];
  const memoryRegion = scope ? memoryScopeRegion(scope) : region;
  const activeRegion = type === "memory" ? memoryRegion : region;
  return [
    hemisphere * (activeRegion.x + random(1) * activeRegion.spread[0]),
    activeRegion.y + random(2) * activeRegion.spread[1],
    activeRegion.z + random(3) * activeRegion.spread[2],
  ];
}

function memoryScopeRegion(scope: MemoryScope): { x: number; y: number; z: number; spread: Position } {
  if (scope === "session") return { x: 0.48, y: -1.22, z: 0.1, spread: [0.38, 0.24, 0.42] };
  if (["agent_private", "user_private"].includes(scope)) {
    return { x: 1.22, y: -0.54, z: 0.18, spread: [0.65, 0.46, 0.84] };
  }
  if (scope === "role") return { x: 1.02, y: 0.98, z: 0.08, spread: [0.5, 0.34, 0.64] };
  if (scope === "project") return { x: 1.42, y: -0.04, z: -0.18, spread: [0.48, 0.52, 0.7] };
  return { x: 1.14, y: 0.3, z: 0.08, spread: [0.7, 0.52, 0.84] };
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compactMetadata(entries: Array<[string, string | null]>): Array<[string, string]> {
  return entries.filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function compactId(id: string): string {
  return id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-8)}` : id;
}

function formatNodeType(type: AtlasNodeType): string {
  return type === "workspace" ? "Workspace" : `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function formatScope(scope: MemoryScope): string {
  return scope.replaceAll("_", " ");
}

function formatAuthority(authorityBps: number): string {
  return `${(authorityBps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function memoryColor(scope: MemoryScope): string {
  if (["agent_private", "user_private", "session"].includes(scope)) return "#b8a8f7";
  if (scope === "open" || scope === "org") return "#7dd3fc";
  return atlasColors.memory;
}
