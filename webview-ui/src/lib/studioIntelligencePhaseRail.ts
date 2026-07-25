import {
  getWorkspaceIntelligenceExecutionMilestones,
  isWorkspaceIntelligenceMilestoneId,
} from '@workspai-contracts/workspaceIntelligenceChain';

export const STUDIO_INTELLIGENCE_PHASES = getWorkspaceIntelligenceExecutionMilestones().map(
  ({ id, label, kind }) => ({ id, label, kind })
);

export type StudioIntelligencePhaseId = string;

export type StudioIntelligencePhaseWindowEntry = (typeof STUDIO_INTELLIGENCE_PHASES)[number] & {
  offset: number;
  state: 'past' | 'active' | 'future';
};

export type StudioIntelligencePhaseDirection = 'forward' | 'backward' | 'idle';

const COMMAND_PHASES: Record<string, StudioIntelligencePhaseId> = {
  workspaceSync: 'sync',
  workspaceModel: 'model',
  workspaceIntelligenceSnapshot: 'baseline',
  workspaceSnapshotCreate: 'baseline',
  workspaceDiff: 'diff',
  workspaceImpact: 'impact',
  checkWorkspaceHealth: 'doctor-evidence',
  workspaceDoctor: 'doctor-evidence',
  workspaceContractVerify: 'contract-evidence',
  workspaceAnalyze: 'analyze-evidence',
  workspaceReadiness: 'readiness-evidence',
  workspaceVerify: 'verify',
  workspaceContextAgent: 'context',
  workspaceAgentSync: 'agent-sync',
  workspaceExplain: 'explain',
  workspaceIntelligenceChain: 'sync',
};

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function canonicalPhase(value: unknown): StudioIntelligencePhaseId | undefined {
  return isWorkspaceIntelligenceMilestoneId(value) ? value : undefined;
}

export function studioIntelligencePhaseIndex(phase: StudioIntelligencePhaseId): number {
  return STUDIO_INTELLIGENCE_PHASES.findIndex((entry) => entry.id === phase);
}

export function buildStudioIntelligencePhaseWindow(
  active: StudioIntelligencePhaseId,
  radius = 3
): StudioIntelligencePhaseWindowEntry[] {
  const activeIndex = Math.max(0, studioIntelligencePhaseIndex(active));
  const phaseCount = STUDIO_INTELLIGENCE_PHASES.length;
  const requestedRadius = Number.isFinite(radius) ? Math.max(0, Math.floor(radius)) : 3;
  const windowRadius = Math.min(requestedRadius, Math.floor((phaseCount - 1) / 2));

  return Array.from({ length: windowRadius * 2 + 1 }, (_, windowIndex) => {
    const offset = windowIndex - windowRadius;
    const phaseIndex = (activeIndex + offset + phaseCount) % phaseCount;
    const phase = STUDIO_INTELLIGENCE_PHASES[phaseIndex];
    const state: StudioIntelligencePhaseWindowEntry['state'] =
      offset < 0 ? 'past' : offset > 0 ? 'future' : 'active';
    return { ...phase, offset, state };
  });
}

export function resolveStudioIntelligencePhaseDirection(
  previousIndex: number,
  activeIndex: number
): StudioIntelligencePhaseDirection {
  if (previousIndex === activeIndex) {
    return 'idle';
  }
  const phaseCount = STUDIO_INTELLIGENCE_PHASES.length;
  const forwardDistance = (activeIndex - previousIndex + phaseCount) % phaseCount;
  const backwardDistance = (previousIndex - activeIndex + phaseCount) % phaseCount;
  return forwardDistance <= backwardDistance ? 'forward' : 'backward';
}

export function resolveStudioIntelligencePhaseFromToolEvent(input: {
  toolName?: unknown;
  toolInput?: unknown;
  reportedPhase?: unknown;
}): StudioIntelligencePhaseId | undefined {
  const reported = canonicalPhase(input.reportedPhase);
  if (reported) {
    return reported;
  }
  const toolName = typeof input.toolName === 'string' ? input.toolName : '';
  if (toolName === 'run-governed-command') {
    const commandId = objectRecord(input.toolInput)?.commandId;
    return typeof commandId === 'string' ? canonicalPhase(COMMAND_PHASES[commandId]) : undefined;
  }
  return toolName === 'verify-blocker' ? 'verify' : undefined;
}

export function resolveStudioIntelligencePhaseFromCard(cardId?: string): StudioIntelligencePhaseId {
  if (!cardId) {
    return 'sync';
  }
  if (/readiness/i.test(cardId)) {
    return 'readiness-evidence';
  }
  if (/contract/i.test(cardId)) {
    return 'contract-evidence';
  }
  if (/doctor|bootstrap|dependency|remedi/i.test(cardId)) {
    return 'doctor-evidence';
  }
  if (/analy/i.test(cardId)) {
    return 'analyze-evidence';
  }
  if (/snapshot|baseline/i.test(cardId)) {
    return 'baseline';
  }
  if (/diff/i.test(cardId)) {
    return 'diff';
  }
  if (/impact|trace/i.test(cardId)) {
    return 'impact';
  }
  if (/verify/i.test(cardId)) {
    return 'verify';
  }
  if (/context/i.test(cardId)) {
    return 'context';
  }
  if (/agent|customization|skill|mcp/i.test(cardId)) {
    return 'agent-sync';
  }
  if (/explain/i.test(cardId)) {
    return 'explain';
  }
  return 'sync';
}
