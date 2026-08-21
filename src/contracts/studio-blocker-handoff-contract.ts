import {
  computeBlockerSignature,
  isBlockerResolution,
  normalizeBlockerResolutionClass,
  type BlockerResolution,
  type BlockerResolutionClass,
} from './blocker-resolution-contract.js';
import type { DoctorFindingTarget } from '../core/doctorEvidenceProjection.js';

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

export type StudioCausalRepairTarget = {
  /** Stable canonical finding identity within the current evidence generation. */
  findingId: string;
  causalKey?: string;
  /** Exact CLI remediation actions authorized for this one transaction. */
  actionIds: string[];
  /** Contract-authored source candidates for this finding only. */
  sourcePaths?: string[];
  projectName?: string;
  projectPath?: string;
  repairMode:
    | 'edit-file'
    | 'run-command'
    | 'refresh-evidence'
    | 'verify-before-fix'
    | 'manual-guidance';
  sourceMutation: 'required' | 'allowed' | 'forbidden';
  verifyCommand?: string;
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
  /** Exact causal findings emitted by the canonical Doctor diagnosis engine. */
  doctorFindings?: DoctorFindingTarget[];
  /** One transaction-scoped target selected from the aggregate card queue. */
  selectedTarget?: StudioCausalRepairTarget;
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
    record.executionChannel !== null &&
    record.executionChannel !== undefined &&
    record.executionChannel !== 'terminal' &&
    record.executionChannel !== 'background'
  ) {
    return false;
  }
  if (
    record.dashboardCommandId !== null &&
    record.dashboardCommandId !== undefined &&
    typeof record.dashboardCommandId !== 'string'
  ) {
    return false;
  }
  if (
    record.capabilityGate !== null &&
    record.capabilityGate !== undefined &&
    typeof record.capabilityGate !== 'string'
  ) {
    return false;
  }
  if (
    record.safetyRisk !== null &&
    record.safetyRisk !== undefined &&
    record.safetyRisk !== 'read' &&
    record.safetyRisk !== 'write' &&
    record.safetyRisk !== 'destructive'
  ) {
    return false;
  }
  if (
    record.safetyConfirmation !== null &&
    record.safetyConfirmation !== undefined &&
    typeof record.safetyConfirmation !== 'string'
  ) {
    return false;
  }
  if (
    record.safetyRefreshCommands !== null &&
    record.safetyRefreshCommands !== undefined &&
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
    record.affectedProjectNames !== null &&
    record.affectedProjectNames !== undefined &&
    (!Array.isArray(record.affectedProjectNames) ||
      !record.affectedProjectNames.every((entry) => typeof entry === 'string'))
  ) {
    return false;
  }
  if (
    record.doctorFindings !== null &&
    record.doctorFindings !== undefined &&
    (!Array.isArray(record.doctorFindings) ||
      !record.doctorFindings.every(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          typeof (entry as Record<string, unknown>).id === 'string' &&
          typeof (entry as Record<string, unknown>).symptom === 'string'
      ))
  ) {
    return false;
  }
  if (
    record.selectedTarget !== null &&
    record.selectedTarget !== undefined &&
    !isStudioCausalRepairTarget(record.selectedTarget)
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
    record.resolutionHints !== null &&
    record.resolutionHints !== undefined &&
    (!Array.isArray(record.resolutionHints) ||
      !record.resolutionHints.every((entry) => isBlockerResolution(entry)))
  ) {
    return false;
  }
  if (
    record.incidentSummary !== null &&
    record.incidentSummary !== undefined &&
    !isStudioIncidentSummary(record.incidentSummary)
  ) {
    return false;
  }
  return true;
}

export function isStudioCausalRepairTarget(value: unknown): value is StudioCausalRepairTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.findingId === 'string' &&
    record.findingId.trim().length > 0 &&
    Array.isArray(record.actionIds) &&
    record.actionIds.length > 0 &&
    record.actionIds.every((entry) => typeof entry === 'string' && entry.trim().length > 0) &&
    new Set(record.actionIds).size === record.actionIds.length &&
    (record.sourcePaths === undefined ||
      (Array.isArray(record.sourcePaths) &&
        record.sourcePaths.every(
          (entry) => typeof entry === 'string' && entry.trim().length > 0
        ))) &&
    (record.repairMode === 'edit-file' ||
      record.repairMode === 'run-command' ||
      record.repairMode === 'refresh-evidence' ||
      record.repairMode === 'verify-before-fix' ||
      record.repairMode === 'manual-guidance') &&
    (record.sourceMutation === 'required' ||
      record.sourceMutation === 'allowed' ||
      record.sourceMutation === 'forbidden') &&
    (record.causalKey === undefined || typeof record.causalKey === 'string') &&
    (record.projectName === undefined || typeof record.projectName === 'string') &&
    (record.projectPath === undefined || typeof record.projectPath === 'string') &&
    (record.verifyCommand === undefined || typeof record.verifyCommand === 'string')
  );
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
  if (input.cardStatus === 'warn') {
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
