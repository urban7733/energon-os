"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import {
  AlertTriangle,
  Bot,
  Boxes,
  BrainCircuit,
  Eye,
  EyeOff,
  Focus,
  Network,
  Search,
  ShieldCheck,
  X,
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
  animated?: boolean;
  variant?: "dashboard" | "showcase";
};

/** One palette shared with the dashboard: same colour, same boundary. */
const palette = {
  workspace: "#ffffff",
  agent: "#f2f6fa",
  role: "#84e3c0",
  project: "#9bdcff",
  conflict: "#ff8f86",
  private: "#b7a6ff",
  shared: "#c7ecff",
} as const;

const filterOptions: Array<{ value: AtlasFilter; label: string; icon: typeof Network }> = [
  { value: "all", label: "All", icon: Network },
  { value: "agent", label: "Agents", icon: Bot },
  { value: "memory", label: "Memory", icon: BrainCircuit },
  { value: "role", label: "Roles", icon: ShieldCheck },
  { value: "project", label: "Projects", icon: Boxes },
  { value: "conflict", label: "Conflicts", icon: AlertTriangle },
];

export default function MemoryAtlas({
  organizationName,
  agents,
  memories,
  totalMemories,
  rolePolicies,
  conflicts,
  animated = false,
  variant = "dashboard",
}: MemoryAtlasProps) {
  const [filter, setFilter] = useState<AtlasFilter>("all");
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const graph = useMemo(
    () => buildGraph({ organizationName, agents, memories, rolePolicies, conflicts }),
    [agents, conflicts, memories, organizationName, rolePolicies],
  );
  const positions = useMemo(() => layoutGraph(graph), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of graph.nodes) map.set(node.id, new Set());
    for (const edge of graph.edges) {
      map.get(edge.from)?.add(edge.to);
      map.get(edge.to)?.add(edge.from);
    }
    return map;
  }, [graph]);

  const visibleNodes = useMemo(
    () => graph.nodes.filter((node) => node.type === "workspace" || filter === "all" || node.type === filter),
    [filter, graph.nodes],
  );
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => graph.edges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)),
    [graph.edges, visibleNodeIds],
  );

  const searchMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return new Set(
      visibleNodes
        .filter((node) => `${node.label} ${node.detail}`.toLowerCase().includes(needle))
        .map((node) => node.id),
    );
  }, [query, visibleNodes]);

  const focusCenter = selectedNodeId ?? hoveredNodeId;
  const focus = useMemo(() => {
    if (focusCenter) return new Set([focusCenter, ...(neighbors.get(focusCenter) ?? [])]);
    return searchMatches;
  }, [focusCenter, neighbors, searchMatches]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const selectedNeighbors = selectedNode
    ? Array.from(neighbors.get(selectedNode.id) ?? [])
        .map((id) => nodeById.get(id))
        .filter((node): node is AtlasNode => Boolean(node))
    : [];
  const recordCount = graph.nodes.filter((node) => node.type !== "workspace").length;
  const hasOperationalData = recordCount > 0;
  const counts = {
    agent: agents.length,
    memory: totalMemories,
    role: graph.nodes.filter((node) => node.type === "role").length,
    project: graph.nodes.filter((node) => node.type === "project").length,
    conflict: graph.nodes.filter((node) => node.type === "conflict").length,
  };

  useEffect(() => {
    if (selectedNodeId && !visibleNodeIds.has(selectedNodeId)) setSelectedNodeId(null);
  }, [selectedNodeId, visibleNodeIds]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedNodeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section id="atlas" className={`ax ax-${variant}`} aria-labelledby="atlas-title">
      <div className="ax-stage" aria-label="Interactive three-dimensional memory graph">
        <div className="ax-vignette" aria-hidden="true" />

        {hasOperationalData ? (
          <Canvas
            key={cameraVersion}
            flat
            dpr={[1, 2]}
            camera={{ fov: 42, near: 0.1, far: 60, position: [0, 0.8, 6.1] }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            onPointerMissed={() => setSelectedNodeId(null)}
          >
            <fog attach="fog" args={["#040506", 5.5, 12]} />
            <AtlasScene
              nodes={visibleNodes}
              edges={visibleEdges}
              positions={positions}
              focus={focus}
              focusCenter={focusCenter}
              searchMatches={searchMatches}
              labelsVisible={labelsVisible}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onHoverNode={setHoveredNodeId}
              animated={animated && !selectedNodeId && !hoveredNodeId}
            />
          </Canvas>
        ) : (
          <div className="ax-empty">
            <BrainCircuit size={22} aria-hidden="true" />
            <strong>Waiting for live agent activity</strong>
            <p>Create an agent or write memory to populate this workspace graph.</p>
          </div>
        )}

        <header className="ax-head">
          <div>
            <span className="ax-kicker">
              <span className={`ex-dot ${hasOperationalData ? "ex-dot-live" : "ex-dot-off"}`} />
              {hasOperationalData ? "Live topology" : "Waiting for activity"}
            </span>
            <h2 id="atlas-title">Memory Atlas</h2>
            <p>
              {graph.nodes.length.toLocaleString()} nodes · {graph.edges.length.toLocaleString()} links · {organizationName}
            </p>
          </div>
        </header>

        <div className="ax-toolbar" aria-label="Memory Atlas controls">
          <label className="ax-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nodes"
              aria-label="Search nodes"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X size={12} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="ax-filters" role="group" aria-label="Filter atlas nodes">
            {filterOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                title={label}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="ax-icons">
            <button
              type="button"
              onClick={() => setLabelsVisible((visible) => !visible)}
              aria-label={labelsVisible ? "Hide node labels" : "Show node labels"}
              title={labelsVisible ? "Hide labels" : "Show labels"}
            >
              {labelsVisible ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedNodeId(null);
                setCameraVersion((version) => version + 1);
              }}
              aria-label="Reset atlas camera"
              title="Reset view"
            >
              <Focus size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {selectedNode ? (
          <aside className="ax-inspector" aria-live="polite">
            <div className="ax-inspector-top">
              <span className="ax-type" style={{ "--c": selectedNode.color } as React.CSSProperties}>
                <i />
                {formatNodeType(selectedNode)}
              </span>
              <button type="button" onClick={() => setSelectedNodeId(null)} aria-label="Close inspector">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <strong className="ax-inspector-title">{selectedNode.label}</strong>
            <p className="ax-inspector-detail">{selectedNode.detail}</p>
            {selectedNode.metadata.length ? (
              <dl>
                {selectedNode.metadata.map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {selectedNeighbors.length ? (
              <div className="ax-links">
                <span>Connections · {selectedNeighbors.length}</span>
                <ul>
                  {selectedNeighbors.slice(0, 8).map((node) => (
                    <li key={node.id}>
                      <button type="button" onClick={() => setSelectedNodeId(node.id)}>
                        <i style={{ background: node.color }} />
                        <span>{node.label}</span>
                        <em>{formatNodeType(node)}</em>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        ) : null}

        <footer className="ax-foot">
          <ul className="ax-legend" aria-label="Atlas legend">
            <LegendItem color={palette.agent} label="Agents" count={counts.agent} />
            <LegendItem color={palette.private} label="Private memory" />
            <LegendItem color={palette.shared} label="Shared memory" count={counts.memory} />
            <LegendItem color={palette.role} label="Roles" count={counts.role} />
            <LegendItem color={palette.project} label="Projects" count={counts.project} />
            <LegendItem color={palette.conflict} label="Conflicts" count={counts.conflict} />
          </ul>
          <span className="ax-hint">
            {totalMemories > memories.length
              ? `${memories.length.toLocaleString()} most recent of ${totalMemories.toLocaleString()} records · `
              : ""}
            Drag to orbit · Scroll to zoom · Click a node
          </span>
        </footer>
      </div>
    </section>
  );
}

/* ───────────────────────── Scene ───────────────────────── */

function AtlasScene({
  nodes,
  edges,
  positions,
  focus,
  focusCenter,
  searchMatches,
  labelsVisible,
  selectedNodeId,
  onSelectNode,
  onHoverNode,
  animated,
}: {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  positions: Map<string, Position>;
  focus: Set<string> | null;
  focusCenter: string | null;
  searchMatches: Set<string> | null;
  labelsVisible: boolean;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onHoverNode: (nodeId: string | null) => void;
  animated: boolean;
}) {
  const glow = useGlowTexture();
  const reduceMotion = useReducedMotion();
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  return (
    <>
      <Dust texture={glow} still={reduceMotion} />
      <Edges edges={edges} nodeById={nodeById} positions={positions} focus={focus} />
      {reduceMotion ? null : (
        <FlowParticles edges={edges} positions={positions} texture={glow} focus={focus} />
      )}
      {nodes.map((node) => {
        const position = positions.get(node.id) ?? [0, 0, 0];
        const dimmed = focus ? !focus.has(node.id) : false;
        const emphasised = node.id === focusCenter || node.id === selectedNodeId || Boolean(searchMatches?.has(node.id));
        const showLabel =
          labelsVisible &&
          !dimmed &&
          (node.type === "workspace" ||
            node.type === "agent" ||
            node.type === "conflict" ||
            (focus !== null && focus.has(node.id)));
        return (
          <NodeView
            key={node.id}
            node={node}
            position={position}
            texture={glow}
            dimmed={dimmed}
            emphasised={emphasised}
            selected={node.id === selectedNodeId}
            showLabel={showLabel}
            onSelect={onSelectNode}
            onHover={onHoverNode}
            still={reduceMotion}
          />
        );
      })}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.7}
        minDistance={3.5}
        maxDistance={12}
        autoRotate={animated && !reduceMotion}
        autoRotateSpeed={0.35}
      />
    </>
  );
}

function NodeView({
  node,
  position,
  texture,
  dimmed,
  emphasised,
  selected,
  showLabel,
  onSelect,
  onHover,
  still,
}: {
  node: AtlasNode;
  position: Position;
  texture: THREE.Texture;
  dimmed: boolean;
  emphasised: boolean;
  selected: boolean;
  showLabel: boolean;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  still: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);
  const ring = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(node.color), [node.color]);
  const target = dimmed ? 0.12 : 1;
  const opacity = useRef(target);
  const glowScale = node.radius * (node.type === "workspace" ? 9 : node.type === "memory" ? 7 : 8);

  useFrame((state, delta) => {
    opacity.current = THREE.MathUtils.damp(opacity.current, target, 8, delta);
    const pulse = node.type === "conflict" && !still ? 1 + Math.sin(state.clock.elapsedTime * 3) * 0.18 : 1;
    const boost = emphasised ? 1.35 : 1;
    if (halo.current) {
      const material = halo.current.material as THREE.SpriteMaterial;
      material.opacity = opacity.current * (node.type === "memory" ? 0.55 : 0.75) * boost;
      const scale = glowScale * pulse * boost;
      halo.current.scale.set(scale, scale, 1);
    }
    if (group.current) {
      group.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.core) {
          (child.material as THREE.MeshBasicMaterial).opacity = Math.min(1, opacity.current + 0.05);
        }
      });
    }
    if (ring.current) {
      ring.current.rotation.z += delta * 0.6;
      ring.current.quaternion.copy(state.camera.quaternion);
    }
  });

  return (
    <group ref={group} position={position}>
      <sprite ref={halo} scale={[glowScale, glowScale, 1]} raycast={() => null}>
        <spriteMaterial
          map={texture}
          color={color}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={0.7}
        />
      </sprite>
      <mesh userData={{ core: true }}>
        <sphereGeometry args={[node.radius, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={1} toneMapped={false} />
      </mesh>
      <mesh
        visible={false}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(node.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[Math.max(node.radius * 2.6, 0.16), 12, 12]} />
        <meshBasicMaterial />
      </mesh>
      {selected || node.type === "workspace" ? (
        <mesh ref={ring} raycast={() => null}>
          <ringGeometry args={[node.radius * 2.1, node.radius * 2.1 + 0.012, 64]} />
          <meshBasicMaterial color={color} transparent opacity={selected ? 0.9 : 0.35} toneMapped={false} depthWrite={false} />
        </mesh>
      ) : null}
      {showLabel ? (
        <Html
          position={[0, node.radius + 0.12, 0]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span className={`ax-label ax-label-${node.type}${emphasised ? " is-hot" : ""}`}>
            <i style={{ background: node.color }} />
            {node.label}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

function Edges({
  edges,
  nodeById,
  positions,
  focus,
}: {
  edges: AtlasEdge[];
  nodeById: Map<string, AtlasNode>;
  positions: Map<string, Position>;
  focus: Set<string> | null;
}) {
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();
    for (const edge of edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      const fromNode = nodeById.get(edge.from);
      const toNode = nodeById.get(edge.to);
      if (!from || !to || !fromNode || !toNode) continue;
      const active = !focus || (focus.has(edge.from) && focus.has(edge.to));
      const strength = (edge.kind === "relationship" ? 0.55 : 0.22) * (active ? (focus ? 1.8 : 1) : 0.12);
      vertices.push(...from, ...to);
      color.set(fromNode.color).multiplyScalar(strength);
      colors.push(color.r, color.g, color.b);
      color.set(toNode.color).multiplyScalar(strength);
      colors.push(color.r, color.g, color.b);
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    buffer.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return buffer;
  }, [edges, focus, nodeById, positions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

function FlowParticles({
  edges,
  positions,
  texture,
  focus,
}: {
  edges: AtlasEdge[];
  positions: Map<string, Position>;
  texture: THREE.Texture;
  focus: Set<string> | null;
}) {
  const points = useRef<THREE.Points>(null);
  const tracks = useMemo(
    () =>
      edges
        .filter((edge) => edge.kind === "relationship")
        .map((edge, index) => {
          const from = positions.get(edge.from);
          const to = positions.get(edge.to);
          if (!from || !to) return null;
          return {
            from: new THREE.Vector3(...from),
            to: new THREE.Vector3(...to),
            offset: (stableHash(edge.id) % 1000) / 1000,
            speed: 0.12 + ((index * 37) % 10) / 100,
            active: !focus || (focus.has(edge.from) && focus.has(edge.to)),
          };
        })
        .filter((track): track is NonNullable<typeof track> => track !== null),
    [edges, focus, positions],
  );
  const buffer = useMemo(() => new Float32Array(Math.max(tracks.length, 1) * 3), [tracks.length]);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    tracks.forEach((track, index) => {
      const t = (track.offset + time * track.speed) % 1;
      scratch.lerpVectors(track.from, track.to, t);
      if (!track.active) scratch.set(9999, 9999, 9999);
      buffer[index * 3] = scratch.x;
      buffer[index * 3 + 1] = scratch.y;
      buffer[index * 3 + 2] = scratch.z;
    });
    const attribute = points.current?.geometry.getAttribute("position");
    if (attribute) attribute.needsUpdate = true;
  });

  if (!tracks.length) return null;
  return (
    <points ref={points} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffer, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        color="#c7ecff"
        size={0.11}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function Dust({ texture, still }: { texture: THREE.Texture; still: boolean }) {
  const points = useRef<THREE.Points>(null);
  const buffer = useMemo(() => {
    const count = 420;
    const data = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const u = (stableHash(`dust-u-${index}`) % 10000) / 10000;
      const v = (stableHash(`dust-v-${index}`) % 10000) / 10000;
      const r = 3.5 + ((stableHash(`dust-r-${index}`) % 10000) / 10000) * 6;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      data[index * 3] = r * Math.sin(phi) * Math.cos(theta);
      data[index * 3 + 1] = r * Math.cos(phi) * 0.6;
      data[index * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return data;
  }, []);

  useFrame((_, delta) => {
    if (points.current && !still) points.current.rotation.y += delta * 0.012;
  });

  return (
    <points ref={points} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[buffer, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        color="#9bdcff"
        size={0.06}
        sizeAttenuation
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

function useGlowTexture() {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
      gradient.addColorStop(0.45, "rgba(255,255,255,0.12)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return reduce;
}

function LegendItem({ color, label, count }: { color: string; label: string; count?: number }) {
  return (
    <li>
      <i style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
      {count === undefined ? null : <strong>{count.toLocaleString()}</strong>}
    </li>
  );
}

/* ───────────────────────── Graph model ───────────────────────── */

function buildGraph({
  organizationName,
  agents,
  memories,
  rolePolicies,
  conflicts,
}: Omit<MemoryAtlasProps, "totalMemories" | "animated" | "variant">): AtlasGraph {
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
    detail: "The active Energon workspace. Every agent, role, project and memory belongs to it.",
    metadata: [["record", "workspace"]],
    color: palette.workspace,
    radius: 0.13,
  });

  for (const agent of agents) {
    nodes.push({
      id: `agent:${agent.agent_id}`,
      type: "agent",
      label: agent.name || agent.agent_id,
      detail: `Agent identity ${agent.agent_id}. Reads only the memory its scopes allow.`,
      metadata: compactMetadata([
        ["agent ID", agent.agent_id],
        ["role", agent.role_id],
        ["project", agent.project_id],
      ]),
      color: palette.agent,
      radius: 0.075,
    });
  }

  for (const roleId of Array.from(roleIds).sort()) {
    const policy = roleMap.get(roleId);
    nodes.push({
      id: `role:${roleId}`,
      type: "role",
      label: roleId,
      detail: policy
        ? `Authority ${formatAuthority(policy.authority_bps)}${policy.can_resolve_conflicts ? " · may resolve conflicts" : ""}`
        : "Role boundary for agents and shared memory.",
      metadata: compactMetadata([
        ["role ID", roleId],
        ["authority", policy ? formatAuthority(policy.authority_bps) : null],
        ["conflict resolution", policy ? (policy.can_resolve_conflicts ? "allowed" : "not allowed") : null],
      ]),
      color: palette.role,
      radius: 0.065,
    });
  }

  for (const projectId of Array.from(projectIds).sort()) {
    nodes.push({
      id: `project:${projectId}`,
      type: "project",
      label: projectId,
      detail: "Project boundary for connected agents and memory.",
      metadata: compactMetadata([["project ID", projectId]]),
      color: palette.project,
      radius: 0.065,
    });
  }

  for (const memory of memories) {
    nodes.push({
      id: `memory:${memory.memory_id}`,
      type: "memory",
      label: memory.content_preview ? truncate(memory.content_preview, 34) : compactId(memory.memory_id),
      detail: memory.content_preview || "Memory content is empty.",
      metadata: compactMetadata([
        ["memory ID", memory.memory_id],
        ["scope", formatScope(memory.scope)],
        ["owner agent", memory.owner_agent_id],
        ["project", memory.project_id],
        ["role", memory.role_id],
      ]),
      color: memoryColor(memory.scope),
      radius: 0.038,
      scope: memory.scope,
    });
  }

  for (const conflict of conflicts.filter((item) => item.status === "contested")) {
    nodes.push({
      id: `conflict:${conflict.conflict_id}`,
      type: "conflict",
      label: `${conflict.subject} · ${conflict.predicate}`,
      detail: "Contested claim. Both branches stay separate until a role with authority resolves it.",
      metadata: compactMetadata([
        ["conflict ID", conflict.conflict_id],
        ["status", conflict.status],
      ]),
      color: palette.conflict,
      radius: 0.07,
    });
  }

  for (const node of nodes) {
    if (node.type === "workspace" || node.type === "memory") continue;
    edges.push({ id: `workspace:${node.id}`, from: workspaceId, to: node.id, kind: "structural" });
  }

  for (const agent of agents) {
    const agentNodeId = `agent:${agent.agent_id}`;
    if (agent.role_id) pushRelationship(edges, agentNodeId, `role:${agent.role_id}`);
    if (agent.project_id) pushRelationship(edges, agentNodeId, `project:${agent.project_id}`);
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
      edges.push({ id: `workspace:${memoryNodeId}`, from: workspaceId, to: memoryNodeId, kind: "structural" });
    }
  }

  return { nodes, edges };
}

/**
 * Deterministic force-directed layout (repulsion, springs, gentle gravity),
 * so the same workspace always renders the same constellation.
 */
function layoutGraph(graph: AtlasGraph): Map<string, Position> {
  const { nodes, edges } = graph;
  const index = new Map(nodes.map((node, position) => [node.id, position]));
  const shell: Record<AtlasNodeType, number> = {
    workspace: 0,
    agent: 1.4,
    role: 1.9,
    project: 1.9,
    conflict: 1.6,
    memory: 2.6,
  };
  const points = nodes.map((node) => {
    if (node.type === "workspace") return new THREE.Vector3();
    const u = (stableHash(`${node.id}:u`) % 10000) / 10000;
    const v = (stableHash(`${node.id}:v`) % 10000) / 10000;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = shell[node.type];
    return new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.75, r * Math.sin(phi) * Math.sin(theta));
  });
  const springs = edges
    .map((edge) => {
      const a = index.get(edge.from);
      const b = index.get(edge.to);
      if (a === undefined || b === undefined) return null;
      const memoryEdge = nodes[a].type === "memory" || nodes[b].type === "memory";
      const length = edge.kind === "structural" ? 2.1 : memoryEdge ? 0.6 : 1.2;
      const stiffness = edge.kind === "structural" ? 0.02 : 0.08;
      return { a, b, length, stiffness };
    })
    .filter((spring): spring is NonNullable<typeof spring> => spring !== null);

  const forces = nodes.map(() => new THREE.Vector3());
  const delta = new THREE.Vector3();
  const iterations = 320;

  for (let step = 0; step < iterations; step += 1) {
    const cooling = 1 - step / iterations;
    for (const force of forces) force.set(0, 0, 0);

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        delta.subVectors(points[i], points[j]);
        const distanceSq = Math.max(delta.lengthSq(), 0.01);
        const strength = 0.11 / distanceSq;
        delta.normalize().multiplyScalar(strength);
        forces[i].add(delta);
        forces[j].sub(delta);
      }
    }

    for (const spring of springs) {
      delta.subVectors(points[spring.b], points[spring.a]);
      const distance = Math.max(delta.length(), 0.001);
      delta.multiplyScalar(((distance - spring.length) * spring.stiffness) / distance);
      forces[spring.a].add(delta);
      forces[spring.b].sub(delta);
    }

    points.forEach((point, position) => {
      if (nodes[position].type === "workspace") return;
      forces[position].addScaledVector(point, -0.006);
      forces[position].y -= point.y * 0.01;
      point.add(forces[position].clampLength(0, 0.18).multiplyScalar(cooling));
    });
  }

  const extent = points.reduce((max, point) => Math.max(max, point.length()), 0.001);
  const scale = 2.9 / extent;
  return new Map(
    nodes.map((node, position) => {
      const point = points[position].multiplyScalar(scale);
      return [node.id, [point.x, point.y, point.z] as Position];
    }),
  );
}

function pushRelationship(edges: AtlasEdge[], from: string, to: string) {
  edges.push({ id: `relationship:${from}:${to}`, from, to, kind: "relationship" });
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

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function formatNodeType(node: AtlasNode): string {
  if (node.type === "memory") return node.scope ? `${formatScope(node.scope)} memory` : "Memory";
  return node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

function formatScope(scope: MemoryScope): string {
  return scope.replaceAll("_", " ");
}

function formatAuthority(authorityBps: number): string {
  return `${(authorityBps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function memoryColor(scope: MemoryScope): string {
  if (scope === "agent_private" || scope === "user_private" || scope === "session") return palette.private;
  if (scope === "project") return palette.project;
  if (scope === "role") return palette.role;
  return palette.shared;
}
