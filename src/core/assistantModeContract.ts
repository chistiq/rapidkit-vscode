import type { StudioAgentPermissionLevel } from './studioAgentToolRegistry.js';

export type WorkspaiAssistantMode = 'agent' | 'ask' | 'plan';

export type WorkspaiAssistantModeContract = {
  id: WorkspaiAssistantMode;
  label: string;
  intent: 'autonomous-repair' | 'evidence-answer' | 'repair-plan';
  permissionLevel: StudioAgentPermissionLevel;
  canMutateWorkspace: boolean;
  canRunGovernedMutations: boolean;
  requiresVerifiedCompletion: boolean;
  toolNames: readonly string[];
};

const CONTRACTS: Record<WorkspaiAssistantMode, WorkspaiAssistantModeContract> = {
  agent: {
    id: 'agent',
    label: 'Agent',
    intent: 'autonomous-repair',
    permissionLevel: 'autopilot',
    canMutateWorkspace: true,
    canRunGovernedMutations: true,
    requiresVerifiedCompletion: true,
    toolNames: [
      'recover-active-blocker',
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
      'apply-workspace-patch',
      'delete-workspace-files',
      'run-governed-command',
      'run-workspace-command',
      'inspect-remediation-plan',
      'execute-remediation-step',
      'inspect-dependency-security',
      'repair-dependency-security',
      'upgrade-dependency-security',
      'verify-blocker',
    ],
  },
  ask: {
    id: 'ask',
    label: 'Ask',
    intent: 'evidence-answer',
    permissionLevel: 'default',
    canMutateWorkspace: false,
    canRunGovernedMutations: false,
    requiresVerifiedCompletion: false,
    toolNames: [
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
    ],
  },
  plan: {
    id: 'plan',
    label: 'Plan',
    intent: 'repair-plan',
    permissionLevel: 'default',
    canMutateWorkspace: false,
    canRunGovernedMutations: false,
    requiresVerifiedCompletion: false,
    toolNames: [
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
      'verify-blocker',
    ],
  },
};

export function isWorkspaiAssistantMode(value: unknown): value is WorkspaiAssistantMode {
  return value === 'agent' || value === 'ask' || value === 'plan';
}

export function resolveWorkspaiAssistantModeContract(mode: unknown): WorkspaiAssistantModeContract {
  return CONTRACTS[isWorkspaiAssistantMode(mode) ? mode : 'agent'];
}
