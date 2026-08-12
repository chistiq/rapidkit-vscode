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
  workspaceName?: string;
  projectName?: string;
  autoFixBusy?: boolean;
  loop?: ReactNode;
};

const PHASE_LABEL: Record<StudioFixPhase, string> = {
  idle: 'Blocked',
  diagnosing: 'Running',
  fixing: 'Fixing',
  'fix-applied': 'Awaiting verify',
  'awaiting-verify': 'Awaiting verify',
  verified: 'Verified',
};

export function StudioBlockerChrome({
  handoff,
  phase,
  workspaceName,
  projectName,
  autoFixBusy = false,
  loop,
}: StudioBlockerChromeProps) {
  if (!handoff) {
    return null;
  }

  const subject = handoff.cardLabel?.trim() || handoff.cardId;
  const resolvedWorkspaceName =
    workspaceName?.trim() ||
    handoff.workspacePath?.split(/[\\/]/).filter(Boolean).at(-1) ||
    'Workspace';
  const resolvedProjectName =
    projectName?.trim() || handoff.projectPath?.split(/[\\/]/).filter(Boolean).at(-1);
  const blocker = handoff.blockers[0];
  return (
    <div className="ws-sidebar__studio-chrome" data-phase={phase}>
      <header
        className="ws-sidebar__studio-context"
        role="status"
        aria-live="polite"
        aria-label={`${resolvedWorkspaceName}${resolvedProjectName ? `, ${resolvedProjectName}` : ''}, ${subject}, ${PHASE_LABEL[phase]}`}
      >
        <div className="ws-sidebar__studio-incident-row">
          <span className="ws-sidebar__studio-posture-icon" aria-hidden="true">
            {phase === 'awaiting-verify' || phase === 'fix-applied' || phase === 'verified' ? (
              <CheckCircle2 size={14} strokeWidth={1.75} />
            ) : handoff.studioMode === 'EXPLAIN' ? (
              <AlertTriangle size={14} strokeWidth={1.75} />
            ) : (
              <Wrench size={14} strokeWidth={1.75} />
            )}
          </span>
          <div className="ws-sidebar__studio-incident-copy">
            <strong>{subject}</strong>
            <span className="ws-sidebar__studio-context-path">
              <span title={handoff.workspacePath}>{resolvedWorkspaceName}</span>
              {resolvedProjectName ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span title={handoff.projectPath}>{resolvedProjectName}</span>
                </>
              ) : null}
              {blocker ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="ws-sidebar__studio-blocker-summary" title={blocker}>
                    {blocker}
                  </span>
                </>
              ) : null}
            </span>
          </div>
          <span className="ws-sidebar__studio-state-badge" data-phase={phase}>
            {PHASE_LABEL[phase]}
          </span>
        </div>
      </header>

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
    affectedProjectNames: Array.isArray(record.affectedProjectNames)
      ? record.affectedProjectNames.filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
        )
      : undefined,
    doctorFindings: Array.isArray(record.doctorFindings)
      ? record.doctorFindings.flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return [];
          }
          const finding = entry as Record<string, unknown>;
          const status = finding.status;
          if (
            typeof finding.id !== 'string' ||
            typeof finding.symptom !== 'string' ||
            (status !== 'blocking' &&
              status !== 'advisory' &&
              status !== 'informational' &&
              status !== 'unknown')
          ) {
            return [];
          }
          return [
            {
              id: finding.id,
              symptom: finding.symptom,
              status,
              causalKey: typeof finding.causalKey === 'string' ? finding.causalKey : undefined,
              projectName:
                typeof finding.projectName === 'string' ? finding.projectName : undefined,
              projectPath:
                typeof finding.projectPath === 'string' ? finding.projectPath : undefined,
              probeId: typeof finding.probeId === 'string' ? finding.probeId : undefined,
              issueClass: typeof finding.issueClass === 'string' ? finding.issueClass : undefined,
              repairDisposition:
                typeof finding.repairDisposition === 'string'
                  ? finding.repairDisposition
                  : undefined,
              capabilityId:
                typeof finding.capabilityId === 'string' ? finding.capabilityId : undefined,
              verifyCommand:
                typeof finding.verifyCommand === 'string' ? finding.verifyCommand : undefined,
              requiresFreshEvidence:
                typeof finding.requiresFreshEvidence === 'boolean'
                  ? finding.requiresFreshEvidence
                  : undefined,
            },
          ];
        })
      : undefined,
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
