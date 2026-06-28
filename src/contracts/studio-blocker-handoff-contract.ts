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

export type StudioBlockerHandoff = {
  schemaVersion: typeof STUDIO_BLOCKER_HANDOFF_SCHEMA_VERSION;
  cardId: string;
  cardLabel?: string;
  cardStatus: 'pass' | 'warn' | 'fail' | 'missing';
  blockers: string[];
  artifactPath: string;
  sourceCommand: string;
  scope: 'workspace' | 'project';
  stderrTail?: string;
  exitCode?: number | null;
  blockerSignature: string;
  commandRunCount?: number;
  resolutionClass?: BlockerResolutionClass;
  studioMode?: StudioBlockerExecutionMode;
  resolutionHints?: BlockerResolution[];
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
  if (record.scope !== 'workspace' && record.scope !== 'project') {
    return false;
  }
  if (!Array.isArray(record.blockers)) {
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
  return true;
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
