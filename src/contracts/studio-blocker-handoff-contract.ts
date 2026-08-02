import {
  computeBlockerSignature,
  isBlockerResolution,
  normalizeBlockerResolutionClass,
  type BlockerResolution,
  type BlockerResolutionClass,
} from './blocker-resolution-contract.js';

export const STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION = 'rapidkit-studio-blocker-handoff-v1' as const;

export const STUDIO_BLOCKER_HANDOFF_SOURCES = [
  'repair',
  'artifacts',
  'advisor',
  'tree',
  'dashboard',
] as const;

export type StudioBlockerHandoffSource = (typeof STUDIO_BLOCKER_HANDOFF_SOURCES)[number];

export const STUDIO_BLOCKER_EXECUTION_MODES = [
  'FIX',
  'RUN_ONCE',
  'VERIFY_ONLY',
  'EXPLAIN',
] as const;

export type StudioBlockerExecutionMode = (typeof STUDIO_BLOCKER_EXECUTION_MODES)[number];

export type StudioIncidentPhase = 'detect' | 'diagnose' | 'fix' | 'verify' | 'audit';
export type StudioIncidentAuditStatus = 'not-started' | 'pending' | 'saved' | 'failed' | 'unknown';

export type StudioIncidentSummary = {
  title: string;
  phase: StudioIncidentPhase;
  primaryAction: string;
  verifyRequired: boolean;
  auditStatus: StudioIncidentAuditStatus;
};

export type StudioBlockerHandoff = {
  schemaVersion: typeof STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION;
  cardId: string;
  cardLabel?: string;
  cardStatus: 'pass' | 'warn' | 'fail' | 'missing';
  /** Contract-backed release posture. Advisory blockers may be present while false. */
  blocking?: boolean;
  blockers: string[];
  affectedProjectNames?: string[];
  artifactPath: string;
  sourceCommand: string;
  dashboardCommandId?: string;
  executionChannel?: 'terminal' | 'background';
  capabilityGate?: string;
  safetyRisk?: 'read' | 'write' | 'destructive';
  safetyConfirmation?: string;
  safetyRefreshCommands?: string[];
  scope: 'workspace' | 'project';
  stderrTail?: string;
  exitCode?: number | null;
  blockerSignature: string;
  commandRunCount?: number;
  resolutionClass?: BlockerResolutionClass;
  studioMode?: StudioBlockerExecutionMode;
  resolutionHints?: BlockerResolution[];
  incidentSummary?: StudioIncidentSummary;
  verifyCommand?: string;
  verifyArtifact?: string;
  handoffSource?: StudioBlockerHandoffSource;
  workspacePath?: string;
  projectPath?: string;
};

export function normalizeStudioBlockerHandoffSource(
  value: unknown
): StudioBlockerHandoffSource | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim() as StudioBlockerHandoffSource;
  return STUDIO_BLOCKER_HANDOFF_SOURCES.includes(normalized) ? normalized : null;
}

export function normalizeStudioBlockerExecutionMode(
  value: unknown
): StudioBlockerExecutionMode | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase() as StudioBlockerExecutionMode;
  return STUDIO_BLOCKER_EXECUTION_MODES.includes(normalized) ? normalized : null;
}

export function isStudioBlockerHandoff(value: unknown): value is StudioBlockerHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION) {
    return false;
  }
  if (typeof record.cardId !== 'string' || !record.cardId.trim()) {
    return false;
  }
  if (typeof record.sourceCommand !== 'string') {
    return false;
  }
  if (
    record.blocking !== undefined &&
    record.blocking !== null &&
    typeof record.blocking !== 'boolean'
  ) {
    return false;
  }
  if (
    record.executionChannel != null &&
    record.executionChannel !== 'terminal' &&
    record.executionChannel !== 'background'
  ) {
    return false;
  }
  if (record.dashboardCommandId != null && typeof record.dashboardCommandId !== 'string') {
    return false;
  }
  if (record.capabilityGate != null && typeof record.capabilityGate !== 'string') {
    return false;
  }
  if (
    record.safetyRisk != null &&
    record.safetyRisk !== 'read' &&
    record.safetyRisk !== 'write' &&
    record.safetyRisk !== 'destructive'
  ) {
    return false;
  }
  if (record.safetyConfirmation != null && typeof record.safetyConfirmation !== 'string') {
    return false;
  }
  if (
    record.safetyRefreshCommands != null &&
    (!Array.isArray(record.safetyRefreshCommands) ||
      !record.safetyRefreshCommands.every((entry) => typeof entry === 'string'))
  ) {
    return false;
  }
  if (record.scope !== 'workspace' && record.scope !== 'project') {
    return false;
  }
  if (!Array.isArray(record.blockers)) {
    return false;
  }
  if (
    record.affectedProjectNames != null &&
    (!Array.isArray(record.affectedProjectNames) ||
      !record.affectedProjectNames.every((entry) => typeof entry === 'string'))
  ) {
    return false;
  }
  if (typeof record.artifactPath !== 'string') {
    return false;
  }
  if (typeof record.blockerSignature !== 'string' || record.blockerSignature.length < 8) {
    return false;
  }
  if (
    record.resolutionHints != null &&
    (!Array.isArray(record.resolutionHints) ||
      !record.resolutionHints.every((entry) => isBlockerResolution(entry)))
  ) {
    return false;
  }
  if (record.incidentSummary != null && !isStudioIncidentSummary(record.incidentSummary)) {
    return false;
  }
  return true;
}

export function isStudioIncidentSummary(value: unknown): value is StudioIncidentSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === 'string' &&
    record.title.trim().length > 0 &&
    (record.phase === 'detect' ||
      record.phase === 'diagnose' ||
      record.phase === 'fix' ||
      record.phase === 'verify' ||
      record.phase === 'audit') &&
    typeof record.primaryAction === 'string' &&
    record.primaryAction.trim().length > 0 &&
    typeof record.verifyRequired === 'boolean' &&
    (record.auditStatus === 'not-started' ||
      record.auditStatus === 'pending' ||
      record.auditStatus === 'saved' ||
      record.auditStatus === 'failed' ||
      record.auditStatus === 'unknown')
  );
}

export function buildStudioIncidentSummary(input: {
  cardId: string;
  cardLabel?: string;
  cardStatus: StudioBlockerHandoff['cardStatus'];
  studioMode?: StudioBlockerExecutionMode;
  verifyCommand?: string;
  auditStatus?: StudioIncidentAuditStatus;
}): StudioIncidentSummary {
  const title = input.cardLabel?.trim() || input.cardId;
  const verifyRequired = Boolean(input.verifyCommand) && input.cardStatus !== 'pass';
  if (input.cardStatus === 'missing' || input.studioMode === 'RUN_ONCE') {
    return {
      title,
      phase: 'detect',
      primaryAction: 'Run source command once',
      verifyRequired,
      auditStatus: input.auditStatus ?? 'not-started',
    };
  }
  if (input.studioMode === 'VERIFY_ONLY' || input.cardStatus === 'pass') {
    return {
      title,
      phase: 'verify',
      primaryAction: input.verifyCommand?.trim() || 'Run verify',
      verifyRequired,
      auditStatus: input.auditStatus ?? 'not-started',
    };
  }
  if (input.studioMode === 'EXPLAIN') {
    return {
      title,
      phase: 'diagnose',
      primaryAction: 'Explain blockers',
      verifyRequired,
      auditStatus: input.auditStatus ?? 'not-started',
    };
  }
  return {
    title,
    phase: 'fix',
    primaryAction: 'Fix source issue',
    verifyRequired,
    auditStatus: input.auditStatus ?? 'not-started',
  };
}

export function buildBlockerSignatureFromHandoff(input: {
  blockers: string[];
  exitCode?: number | null;
  stderrTail?: string | null;
}): string {
  return computeBlockerSignature(input);
}

export function attachResolutionMetadata(
  handoff: StudioBlockerHandoff,
  resolutionHints: BlockerResolution[]
): StudioBlockerHandoff {
  const primaryClass =
    normalizeBlockerResolutionClass(resolutionHints[0]?.resolutionClass) ?? handoff.resolutionClass;
  return {
    ...handoff,
    resolutionHints,
    resolutionClass: primaryClass,
  };
}
