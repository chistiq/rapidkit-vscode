import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import {
  resolveStudioFixPhase,
  studioModeDetail,
  studioModeHeadline,
  type StudioBlockerHandoffView,
  type StudioFixPhase,
  type StudioIncidentSummaryView,
} from '@/lib/studioBlockerHandoff';
import {
  studioVerifyFailureSummary,
  type StudioVerifyFailureView,
} from '@/lib/studioVerifyFailure';
import { buildStudioIncidentCopy } from '@/lib/dashboardIncidentContract';

type StudioBlockerChromeProps = {
  handoff: StudioBlockerHandoffView | null;
  phase: StudioFixPhase;
  onAutoFix: () => void;
  onVerify: () => void;
  autoFixBusy?: boolean;
  verifyFailure?: StudioVerifyFailureView | null;
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
  onAutoFix,
  onVerify,
  autoFixBusy = false,
  verifyFailure = null,
}: StudioBlockerChromeProps) {
  if (!handoff) {
    return null;
  }

  const headline = studioModeHeadline(handoff.studioMode);
  const detail = studioModeDetail(handoff);
  const incident = buildStudioIncidentCopy({ handoff });
  const showAutoFix =
    handoff.studioMode === 'FIX' ||
    handoff.studioMode === 'RUN_ONCE' ||
    (handoff.studioMode !== 'VERIFY_ONLY' && phase !== 'awaiting-verify');
  const showVerify = Boolean(handoff.verifyCommand) && phase !== 'idle';

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
          <strong>{headline}</strong>
          <span>{detail}</span>
          <small>
            {handoff.cardLabel ?? handoff.cardId} · {PHASE_LABEL[phase]} ·{' '}
            {handoff.resolutionClass ?? 'blocked'}
          </small>
        </div>
      </div>

      <div className="ws-sidebar__studio-incident" role="note" aria-label="Incident summary">
        <div>
          <span>Phase</span>
          <strong>{incident.phaseLabel}</strong>
        </div>
        <div>
          <span>Action</span>
          <strong>{incident.primaryAction}</strong>
        </div>
        <div>
          <span>Verify</span>
          <strong>{incident.verifyLabel}</strong>
        </div>
        <div>
          <span>Audit</span>
          <strong>{incident.auditLabel}</strong>
        </div>
      </div>

      {handoff.blockers.length > 0 ? (
        <div className="ws-sidebar__studio-blockers" role="note">
          <strong>Blockers</strong>
          <ul>
            {handoff.blockers.slice(0, 4).map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ws-sidebar__studio-cta">
        {showAutoFix ? (
          <button
            type="button"
            className="ws-sidebar__inline ws-sidebar__inline--primary"
            disabled={autoFixBusy || phase === 'awaiting-verify'}
            onClick={onAutoFix}
          >
            {autoFixBusy
              ? 'Running…'
              : handoff.studioMode === 'RUN_ONCE'
                ? 'Run once'
                : 'Auto-fix'}
          </button>
        ) : null}
        {showVerify ? (
          <button
            type="button"
            className="ws-sidebar__inline"
            onClick={onVerify}
            disabled={autoFixBusy}
          >
            {phase === 'awaiting-verify' ? 'Run verify' : 'Verify after fix'}
          </button>
        ) : null}
      </div>

      {phase === 'awaiting-verify' ? (
        <p className="ws-sidebar__studio-note">
          Fix applied — run verify once to refresh the dashboard card.
        </p>
      ) : null}
      {verifyFailure ? (
        <div className="ws-sidebar__studio-verify-alert" role="alert">
          <strong>
            {verifyFailure.title ?? 'Studio action failed'}
            {typeof verifyFailure.exitCode === 'number' ? ` · exit ${verifyFailure.exitCode}` : ''}
          </strong>
          <span>{studioVerifyFailureSummary(verifyFailure)}</span>
          {verifyFailure.commandText ? <code>{verifyFailure.commandText}</code> : null}
          {verifyFailure.nextAction ? <small>{verifyFailure.nextAction}</small> : null}
        </div>
      ) : null}
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
    blockers: record.blockers.filter((entry): entry is string => typeof entry === 'string'),
    artifactPath: typeof record.artifactPath === 'string' ? record.artifactPath : '',
    sourceCommand: record.sourceCommand,
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
