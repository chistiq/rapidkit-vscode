import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import {
  resolveStudioFixPhase,
  type StudioBlockerHandoffView,
  type StudioFixPhase,
  type StudioIncidentSummaryView,
} from '@/lib/studioBlockerHandoff';

type StudioBlockerChromeProps = {
  handoff: StudioBlockerHandoffView | null;
  phase: StudioFixPhase;
  autoFixBusy?: boolean;
  loop?: ReactNode;
};

const PHASE_LABEL: Record<StudioFixPhase, string> = {
  idle: 'Blocked',
  diagnosing: 'Running',
  fixing: 'Fixing',
  'fix-applied': 'Awaiting verify',
  'awaiting-verify': 'Awaiting verify',
};

export function StudioBlockerChrome({
  handoff,
  phase,
  autoFixBusy = false,
  loop,
}: StudioBlockerChromeProps) {
  if (!handoff) {
    return null;
  }

  const subject = handoff.cardLabel?.trim() || handoff.cardId;
  const headline =
    phase === 'diagnosing'
      ? `Diagnosing ${subject}`
      : phase === 'fixing'
        ? `Repairing ${subject}`
        : phase === 'fix-applied' || phase === 'awaiting-verify'
          ? `Verifying ${subject}`
          : `Repair ${subject}`;
  return (
    <div className="ws-sidebar__studio-chrome" data-phase={phase}>
      <div className="ws-sidebar__studio-posture" role="status" aria-live="polite">
        <span className="ws-sidebar__studio-posture-icon" aria-hidden="true">
          {phase === 'awaiting-verify' || phase === 'fix-applied' ? (
            <CheckCircle2 size={14} strokeWidth={1.75} />
          ) : handoff.studioMode === 'EXPLAIN' ? (
            <AlertTriangle size={14} strokeWidth={1.75} />
          ) : (
            <Wrench size={14} strokeWidth={1.75} />
          )}
        </span>
        <div className="ws-sidebar__studio-posture-copy">
          <small className="ws-sidebar__studio-eyebrow">
            Workspai Agent · {PHASE_LABEL[phase]}
          </small>
          <strong>{headline}</strong>
          {handoff.blockers.length > 0 ? <span>{handoff.blockers[0]}</span> : null}
        </div>
      </div>

      {loop}

      {autoFixBusy ? <span className="ws-sidebar__sr-only">Agent repair is active.</span> : null}
    </div>
  );
}

function parseStudioIncidentSummary(value: unknown): StudioIncidentSummaryView | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const phase =
    record.phase === 'detect' ||
    record.phase === 'diagnose' ||
    record.phase === 'fix' ||
    record.phase === 'verify' ||
    record.phase === 'audit'
      ? record.phase
      : undefined;
  const auditStatus =
    record.auditStatus === 'not-started' ||
    record.auditStatus === 'pending' ||
    record.auditStatus === 'saved' ||
    record.auditStatus === 'failed' ||
    record.auditStatus === 'unknown'
      ? record.auditStatus
      : undefined;
  if (
    typeof record.title !== 'string' ||
    !record.title.trim() ||
    !phase ||
    typeof record.primaryAction !== 'string' ||
    !record.primaryAction.trim() ||
    typeof record.verifyRequired !== 'boolean' ||
    !auditStatus
  ) {
    return undefined;
  }
  return {
    title: record.title.trim(),
    phase,
    primaryAction: record.primaryAction.trim(),
    verifyRequired: record.verifyRequired,
    auditStatus,
  };
}

export function parseStudioBlockerHandoffView(value: unknown): StudioBlockerHandoffView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.cardId !== 'string' || typeof record.sourceCommand !== 'string') {
    return null;
  }
  if (!Array.isArray(record.blockers)) {
    return null;
  }
  return {
    schemaVersion: typeof record.schemaVersion === 'string' ? record.schemaVersion : 'unknown',
    cardId: record.cardId,
    cardLabel: typeof record.cardLabel === 'string' ? record.cardLabel : undefined,
    cardStatus:
      record.cardStatus === 'pass' ||
      record.cardStatus === 'warn' ||
      record.cardStatus === 'fail' ||
      record.cardStatus === 'missing'
        ? record.cardStatus
        : 'fail',
    blocking: typeof record.blocking === 'boolean' ? record.blocking : undefined,
    blockers: record.blockers.filter((entry): entry is string => typeof entry === 'string'),
    artifactPath: typeof record.artifactPath === 'string' ? record.artifactPath : '',
    sourceCommand: record.sourceCommand,
    dashboardCommandId:
      typeof record.dashboardCommandId === 'string' ? record.dashboardCommandId : undefined,
    executionChannel:
      record.executionChannel === 'terminal' || record.executionChannel === 'background'
        ? record.executionChannel
        : undefined,
    capabilityGate: typeof record.capabilityGate === 'string' ? record.capabilityGate : undefined,
    safetyRisk:
      record.safetyRisk === 'read' ||
      record.safetyRisk === 'write' ||
      record.safetyRisk === 'destructive'
        ? record.safetyRisk
        : undefined,
    safetyConfirmation:
      typeof record.safetyConfirmation === 'string' ? record.safetyConfirmation : undefined,
    safetyRefreshCommands: Array.isArray(record.safetyRefreshCommands)
      ? record.safetyRefreshCommands.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    scope: record.scope === 'project' ? 'project' : 'workspace',
    blockerSignature:
      typeof record.blockerSignature === 'string' ? record.blockerSignature : 'unknown',
    commandRunCount:
      typeof record.commandRunCount === 'number' ? record.commandRunCount : undefined,
    resolutionClass:
      typeof record.resolutionClass === 'string' ? record.resolutionClass : undefined,
    resolutionHints: Array.isArray(record.resolutionHints) ? record.resolutionHints : undefined,
    studioMode:
      record.studioMode === 'FIX' ||
      record.studioMode === 'RUN_ONCE' ||
      record.studioMode === 'VERIFY_ONLY' ||
      record.studioMode === 'EXPLAIN'
        ? record.studioMode
        : undefined,
    incidentSummary: parseStudioIncidentSummary(record.incidentSummary),
    verifyCommand: typeof record.verifyCommand === 'string' ? record.verifyCommand : undefined,
    verifyArtifact: typeof record.verifyArtifact === 'string' ? record.verifyArtifact : undefined,
    handoffSource: typeof record.handoffSource === 'string' ? record.handoffSource : undefined,
    workspacePath: typeof record.workspacePath === 'string' ? record.workspacePath : undefined,
    projectPath: typeof record.projectPath === 'string' ? record.projectPath : undefined,
  };
}

export { resolveStudioFixPhase };
