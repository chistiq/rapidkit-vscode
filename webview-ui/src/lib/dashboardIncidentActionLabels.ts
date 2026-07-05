import type { StudioIncidentPhase } from './studioBlockerHandoff';

export type DashboardIncidentPrimaryActionLabel =
  | 'Generate evidence'
  | 'Fix by Workspai'
  | 'Run verify'
  | 'Explain blocker';

export function normalizeDashboardIncidentPrimaryAction(
  value: unknown,
  phase?: StudioIncidentPhase
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'run source command once' || normalized === 'generate evidence') {
    return 'Generate evidence';
  }
  if (
    normalized === 'fix source issue' ||
    normalized === 'fix in studio' ||
    normalized === 'fix with workspai' ||
    normalized === 'fix by workspai'
  ) {
    return 'Fix by Workspai';
  }
  if (normalized === 'explain blockers' || normalized === 'explain blocker') {
    return 'Explain blocker';
  }
  if (
    normalized === 'run verify' ||
    normalized === 'verify applied fix' ||
    (phase === 'verify' && normalized.includes('verify'))
  ) {
    return 'Run verify';
  }

  return trimmed;
}

export function fallbackDashboardIncidentPrimaryAction(input: {
  status: 'pass' | 'warn' | 'fail' | 'missing';
  phase?: StudioIncidentPhase;
}): DashboardIncidentPrimaryActionLabel | 'Review artifact' | 'Open in Studio' {
  if (input.status === 'missing' || input.phase === 'detect') {
    return 'Generate evidence';
  }
  if (input.phase === 'verify') {
    return 'Run verify';
  }
  if (input.phase === 'diagnose') {
    return 'Explain blocker';
  }
  if (input.status === 'fail') {
    return 'Fix by Workspai';
  }
  if (input.status === 'warn') {
    return 'Open in Studio';
  }
  return 'Review artifact';
}
