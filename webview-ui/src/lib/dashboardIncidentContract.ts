import type { DashboardEvidenceCard } from './dashboardEvidence';
import { resolveEvidenceCardPosture } from './dashboardEvidence';
import type { DashboardEvidenceActionContract } from './dashboardActionContract';
import type { StudioBlockerHandoffView } from './studioBlockerHandoff';
import {
  fallbackDashboardIncidentPrimaryAction,
  normalizeDashboardIncidentPrimaryAction,
} from './dashboardIncidentActionLabels';

export type DashboardIncidentPhase = 'detect' | 'diagnose' | 'fix' | 'verify' | 'audit';

export type DashboardIncidentCopy = {
  label: 'Incident';
  phase: DashboardIncidentPhase;
  phaseLabel: string;
  primaryAction: string;
  verifyLabel: 'Required' | 'Optional';
  auditLabel: string;
  artifactLabel: string;
  blockedReason: string;
  compactLabel: string;
};

const PHASE_LABELS: Record<DashboardIncidentPhase, string> = {
  detect: 'Detect',
  diagnose: 'Diagnose',
  fix: 'Fix',
  verify: 'Verify',
  audit: 'Audit',
};

function normalizePhase(value: unknown): DashboardIncidentPhase | undefined {
  return value === 'detect' ||
    value === 'diagnose' ||
    value === 'fix' ||
    value === 'verify' ||
    value === 'audit'
    ? value
    : undefined;
}

function fallbackPhase(card: DashboardEvidenceCard): DashboardIncidentPhase {
  if (card.status === 'missing') {
    return 'detect';
  }
  if (resolveEvidenceCardPosture(card) === 'blocked') {
    return 'fix';
  }
  if (resolveEvidenceCardPosture(card) === 'attention') {
    return 'diagnose';
  }
  return 'audit';
}

function fallbackAction(
  card: DashboardEvidenceCard,
  contract?: DashboardEvidenceActionContract
): string {
  if (contract?.primaryAction.label) {
    return contract.primaryAction.label;
  }
  return fallbackDashboardIncidentPrimaryAction({
    status: card.status,
    phase: fallbackPhase(card),
  });
}

function firstReason(card: DashboardEvidenceCard): string {
  return card.blockers?.find((blocker) => blocker.trim().length > 0) ?? card.summary;
}

export function buildDashboardIncidentCopy(input: {
  card: DashboardEvidenceCard;
  contract?: DashboardEvidenceActionContract;
}): DashboardIncidentCopy {
  const { card, contract } = input;
  const posture = resolveEvidenceCardPosture(card);
  const summary = card.incidentSummary;
  const phase = normalizePhase(summary?.phase) ?? fallbackPhase(card);
  const primaryAction =
    normalizeDashboardIncidentPrimaryAction(summary?.primaryAction, phase) ||
    fallbackAction(card, contract);
  const verifyRequired =
    summary?.verifyRequired ?? (posture === 'blocked' || contract?.primaryAction.type === 'studio');
  const auditLabel = summary?.auditStatus
    ? summary.auditStatus.replace(/-/g, ' ')
    : posture === 'healthy'
      ? 'saved'
      : 'pending';

  const artifactLabel =
    contract?.artifactLabel ?? (card.artifactPath ? 'Artifact ready' : 'Artifact pending');
  const compactLabel = `${PHASE_LABELS[phase]} · ${primaryAction} · ${artifactLabel}`;

  return {
    label: 'Incident',
    phase,
    phaseLabel: PHASE_LABELS[phase],
    primaryAction,
    verifyLabel: verifyRequired ? 'Required' : 'Optional',
    auditLabel,
    artifactLabel,
    blockedReason: firstReason(card),
    compactLabel,
  };
}

export function buildStudioIncidentCopy(input: {
  handoff: StudioBlockerHandoffView;
}): DashboardIncidentCopy {
  const incident = input.handoff.incidentSummary;
  const phase =
    normalizePhase(incident?.phase) ??
    (input.handoff.studioMode === 'VERIFY_ONLY' ? 'verify' : 'fix');
  const primaryAction =
    normalizeDashboardIncidentPrimaryAction(incident?.primaryAction, phase) ||
    (input.handoff.studioMode === 'RUN_ONCE'
      ? 'Generate evidence'
      : input.handoff.studioMode === 'VERIFY_ONLY'
        ? 'Run verify'
        : input.handoff.studioMode === 'EXPLAIN'
          ? 'Explain blocker'
          : 'Fix by Workspai');
  const verifyRequired = incident?.verifyRequired ?? Boolean(input.handoff.verifyCommand);

  const artifactLabel = input.handoff.artifactPath ? 'Artifact ready' : 'Artifact pending';
  const compactLabel = `${PHASE_LABELS[phase]} · ${primaryAction} · ${artifactLabel}`;

  return {
    label: 'Incident',
    phase,
    phaseLabel: PHASE_LABELS[phase],
    primaryAction,
    verifyLabel: verifyRequired ? 'Required' : 'Optional',
    auditLabel: incident?.auditStatus?.replace(/-/g, ' ') ?? 'pending',
    artifactLabel,
    blockedReason: input.handoff.blockers[0] ?? input.handoff.cardLabel ?? input.handoff.cardId,
    compactLabel,
  };
}
