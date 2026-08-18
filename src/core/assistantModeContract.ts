import type { StudioAgentPermissionLevel } from './studioAgentToolRegistry.js';

export type WorkspaiAssistantMode = 'agent' | 'ask' | 'plan' | 'goal';

export type WorkspaiAssistantModeContract = {
  id: WorkspaiAssistantMode;
  label: string;
  intent: 'autonomous-repair' | 'evidence-answer' | 'repair-plan' | 'governed-goal';
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
      'query-workspace-graph',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
      'apply-workspace-patch',
      'apply-workspace-edits',
      'delete-workspace-files',
      'run-governed-command',
      'run-workspace-command',
      'inspect-remediation-plan',
      'execute-remediation-step',
      'inspect-dependency-security',
      'verify-blocker',
      'verify-goal',
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
      'query-workspace-graph',
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
      'query-workspace-graph',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
      'verify-blocker',
    ],
  },
  goal: {
    id: 'goal',
    label: 'Goal',
    intent: 'governed-goal',
    permissionLevel: 'autopilot',
    canMutateWorkspace: true,
    canRunGovernedMutations: true,
    requiresVerifiedCompletion: true,
    toolNames: [
      'discover-workspace-files',
      'inspect-source',
      'inspect-evidence',
      'search-workspace',
      'query-workspace-graph',
      'inspect-workspace-diagnostics',
      'inspect-workspace-changes',
      'apply-workspace-patch',
      'apply-workspace-edits',
      'delete-workspace-files',
      'run-governed-command',
      'run-workspace-command',
      'inspect-remediation-plan',
      'execute-remediation-step',
      'verify-goal',
    ],
  },
};

export function isWorkspaiAssistantMode(value: unknown): value is WorkspaiAssistantMode {
  return value === 'agent' || value === 'ask' || value === 'plan' || value === 'goal';
}

export function isAutonomousWorkspaiAssistantMode(
  value: WorkspaiAssistantMode
): value is 'agent' | 'goal' {
  return value === 'agent' || value === 'goal';
}

export function resolveWorkspaiAssistantModeContract(mode: unknown): WorkspaiAssistantModeContract {
  return CONTRACTS[isWorkspaiAssistantMode(mode) ? mode : 'agent'];
}
