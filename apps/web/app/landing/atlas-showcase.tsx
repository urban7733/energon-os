"use client";

import dynamic from "next/dynamic";
import {
  demoAgents,
  demoConflicts,
  demoMemories,
  demoRolePolicies,
} from "../../lib/demo-workspace";

const MemoryAtlas = dynamic(() => import("../../components/dashboard/memory-atlas"), {
  ssr: false,
  loading: () => <div className="ax-loading" aria-label="Loading Memory Atlas" />,
});

export function AtlasShowcase() {
  return (
    <MemoryAtlas
      variant="showcase"
      organizationName="Energon Labs"
      agents={demoAgents}
      memories={demoMemories}
      totalMemories={2847}
      rolePolicies={demoRolePolicies}
      conflicts={demoConflicts}
      animated
    />
  );
}
