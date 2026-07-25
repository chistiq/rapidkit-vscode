import architectureContract from '../../contracts/workspace-intelligence-architecture.v1.json';

export const WORKSPACE_INTELLIGENCE_ARCHITECTURE_SCHEMA_VERSION =
  'workspai-workspace-intelligence-architecture-v1' as const;

export type ArchitectureLoopEntry = {
  id: string;
  status: string;
  purpose: string;
  commands: string[];
  artifacts: string[];
};

type ArchitectureContract = {
  schemaVersion: string;
  canonicalPositioning: {
    tagline: string;
    category: string;
    primaryPromise: string;
  };
  architectureCore: {
    loop: ArchitectureLoopEntry[];
    evidencePrinciples: string[];
  };
  auxiliaryCapabilities: Array<{
    id: string;
    commands: string[];
    reads: string[];
    role: string;
    chainStep: false;
  }>;
};

const contract = architectureContract as ArchitectureContract;

export function getWorkspaceIntelligencePositioning() {
  return contract.canonicalPositioning;
}

export function getAvailableWorkspaceIntelligenceLoop(): ArchitectureLoopEntry[] {
  return contract.architectureCore.loop.filter((entry) => entry.status === 'available');
}

export function getWorkspaceIntelligenceEvidencePrinciples(): string[] {
  return [...contract.architectureCore.evidencePrinciples];
}

export function getWorkspaceIntelligenceAuxiliaryCapabilities() {
  return contract.auxiliaryCapabilities.map((capability) => ({ ...capability }));
}

export function validateWorkspaceIntelligenceArchitectureContract(): string[] {
  const errors: string[] = [];
  if (contract.schemaVersion !== WORKSPACE_INTELLIGENCE_ARCHITECTURE_SCHEMA_VERSION) {
    errors.push(`Unsupported architecture schema: ${contract.schemaVersion}`);
  }
  if (!contract.canonicalPositioning.tagline.trim()) {
    errors.push('Architecture contract tagline is missing.');
  }
  const ids = new Set<string>();
  for (const entry of contract.architectureCore.loop) {
    if (ids.has(entry.id)) {
      errors.push(`Duplicate architecture loop id: ${entry.id}`);
    }
    ids.add(entry.id);
    if (entry.status === 'available' && entry.commands.length === 0) {
      errors.push(`Available architecture loop entry has no command: ${entry.id}`);
    }
  }
  for (const capability of contract.auxiliaryCapabilities) {
    if (capability.chainStep !== false) {
      errors.push(`Auxiliary capability must not be a chain step: ${capability.id}`);
    }
    if (capability.commands.length === 0 || capability.reads.length === 0) {
      errors.push(`Auxiliary capability is incomplete: ${capability.id}`);
    }
  }
  return errors;
}
