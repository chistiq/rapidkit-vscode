import { AIActionRegistryView, StudioActionStatus, StudioProofEvent } from './studioState';

export type StudioActionAuditOutcome =
  | 'running'
  | 'approved'
  | 'approval-revoked'
  | 'requested'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'needs-review'
  | 'proposed'
  | 'verified'
  | 'applied'
  | 'rolled-back'
  | 'stale';

export type StudioActionAuditPhase = 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';

export interface StudioActionAuditEvent {
  id: string;
  actionId: string;
  title: string;
  scope: string;
  phase: StudioActionAuditPhase;
  outcome: StudioActionAuditOutcome;
  happenedAt: string;
  timeAgo: string;
  provider?: string;
  detail?: string;
  evidencePath?: string | null;
  evidenceSha256?: string | null;
  evidenceSizeBytes?: number | null;
  commandCount?: number;
  failedCommandCount?: number;
  failedCommands?: string[];
  proofComplete?: boolean;
  proofIssues?: string[];
  rollbackProofRequired?: boolean;
  rollbackPlanPresent?: boolean;
  transcriptId?: string;
  durationMs?: number;
  canRevealEvidence: boolean;
}

export type StudioApprovalAuditOperation =
  | 'approval-confirmed'
  | 'approval-revoked'
  | 'apply-requested'
  | 'verify-requested'
  | 'rollback-requested';

export interface StudioApprovalAuditEvent {
  id: string;
  actionId: string;
  operation: StudioApprovalAuditOperation;
  title: string;
  summary?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  detail?: string;
  provider?: string;
  happenedAt: string;
}

export function formatAuditRelativeTime(value: string, nowMs = Date.now()): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return 'recently';
  }
  const minutes = Math.max(0, Math.round((nowMs - time) / 60000));
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

export function buildStudioActionAuditTimeline(params: {
  registry?: AIActionRegistryView | null;
  status?: StudioActionStatus | null;
  approvalEvents?: StudioApprovalAuditEvent[];
  proofEvents?: StudioProofEvent[];
  nowMs?: number;
}): StudioActionAuditEvent[] {
  const { registry, status, approvalEvents = [], proofEvents = [], nowMs = Date.now() } = params;
  const events: StudioActionAuditEvent[] = [];

  for (const event of approvalEvents) {
    const requested = event.operation.endsWith('-requested');
    events.push({
      id: `approval-${event.id}`,
      actionId: event.actionId,
      title: event.title,
      scope: event.riskLevel ? `approval · ${event.riskLevel} risk` : 'approval',
      phase:
        event.operation === 'verify-requested'
          ? 'verify'
          : event.operation === 'rollback-requested'
            ? 'learn'
            : 'plan',
      outcome:
        event.operation === 'approval-confirmed'
          ? 'approved'
          : event.operation === 'approval-revoked'
            ? 'approval-revoked'
            : 'requested',
      happenedAt: event.happenedAt,
      timeAgo: formatAuditRelativeTime(event.happenedAt, nowMs),
      provider: event.provider,
      detail: event.detail || event.summary,
      canRevealEvidence: false,
      commandCount: requested ? 1 : undefined,
    });
  }

  for (const proof of proofEvents) {
    events.push({
      id: `proof-${proof.generatedAt}-${proof.actionId}`,
      actionId: proof.actionId,
      title: proof.summary,
      scope: proof.verdict ? `proof · ${proof.verdict}` : `proof · ${proof.source}`,
      phase: proof.status === 'failed' ? 'diagnose' : 'verify',
      outcome: proof.status === 'failed' ? 'failed' : 'completed',
      happenedAt: proof.generatedAt,
      timeAgo: formatAuditRelativeTime(proof.generatedAt, nowMs),
      detail: typeof proof.score === 'number' ? `Score ${proof.score}` : undefined,
      evidencePath: proof.evidencePath,
      evidenceSha256: proof.evidenceSha256,
      commandCount: proof.commandCount,
      failedCommandCount: proof.failedCommandCount,
      transcriptId: proof.executionTranscriptId,
      durationMs: proof.durationMs,
      canRevealEvidence: Boolean(proof.evidencePath),
    });
  }

  if (status) {
    const result = status.result;
    const proofEvent = result?.proofEvent;
    events.push({
      id: `live-${status.updatedAt}-${status.actionId}`,
      actionId: status.actionId,
      title:
        proofEvent?.summary ||
        result?.summary ||
        status.detail ||
        `Studio action ${status.status}: ${status.actionTitle || status.actionId.replace(/-/g, ' ')}`,
      scope:
        proofEvent?.verdict || result?.verdict
          ? `live status · ${proofEvent?.verdict || result?.verdict}`
          : 'live status',
      phase:
        status.status === 'failed' ? 'diagnose' : status.status === 'completed' ? 'verify' : 'plan',
      outcome:
        status.status === 'started'
          ? 'running'
          : status.status === 'completed'
            ? 'completed'
            : 'failed',
      happenedAt: status.updatedAt,
      timeAgo: formatAuditRelativeTime(status.updatedAt, nowMs),
      detail:
        status.detail ||
        (typeof proofEvent?.score === 'number'
          ? `Score ${proofEvent.score}`
          : typeof result?.score === 'number'
            ? `Score ${result.score}`
            : undefined),
      evidencePath: proofEvent?.evidencePath || result?.evidencePath,
      evidenceSha256: proofEvent?.evidenceSha256 || result?.evidenceSha256,
      evidenceSizeBytes: result?.evidenceSizeBytes,
      commandCount: result?.commandCount,
      failedCommandCount: result?.failedCommandCount,
      failedCommands: result?.failedCommands,
      proofComplete: result?.proof?.complete,
      proofIssues: result?.proof?.issues,
      rollbackProofRequired: result?.proof?.rollbackProofRequired,
      rollbackPlanPresent: result?.proof?.rollbackPlanPresent,
      transcriptId: proofEvent?.executionTranscriptId || result?.executionTranscript?.id,
      durationMs: proofEvent?.durationMs || result?.executionTranscript?.durationMs,
      canRevealEvidence: Boolean(proofEvent?.evidencePath || result?.evidencePath),
    });
  }

  for (const entry of registry?.entries ?? []) {
    if (entry.executions.length === 0) {
      events.push({
        id: `registry-${entry.id}`,
        actionId: entry.id,
        title: entry.summary,
        scope: `${entry.actionType} · ${entry.riskLevel}`,
        phase: entry.validationStatus === 'blocked' ? 'diagnose' : 'plan',
        outcome:
          entry.validationStatus === 'blocked'
            ? 'blocked'
            : entry.validationStatus === 'needs-review'
              ? 'needs-review'
              : 'proposed',
        happenedAt: entry.createdAt,
        timeAgo: formatAuditRelativeTime(entry.createdAt, nowMs),
        provider: entry.provider,
        detail: entry.validationStatus,
        canRevealEvidence: false,
      });
      continue;
    }

    for (const execution of entry.executions) {
      const outcome: StudioActionAuditOutcome =
        execution.ok === false
          ? 'failed'
          : entry.lifecycleStatus === 'applied-failed-verify'
            ? 'failed'
            : entry.lifecycleStatus === 'blocked'
              ? 'blocked'
              : entry.lifecycleStatus === 'stale'
                ? 'stale'
                : entry.lifecycleStatus === 'verified'
                  ? 'verified'
                  : entry.lifecycleStatus === 'applied'
                    ? 'applied'
                    : entry.lifecycleStatus === 'rolled-back'
                      ? 'rolled-back'
                      : entry.validationStatus === 'needs-review'
                        ? 'needs-review'
                        : 'completed';
      events.push({
        id: `execution-${entry.id}-${execution.operation}-${execution.completedAt}`,
        actionId: entry.id,
        title: execution.summary || entry.summary,
        scope: `${entry.actionType} · ${execution.operation}`,
        phase:
          execution.operation === 'verify'
            ? 'verify'
            : execution.operation === 'rollback'
              ? 'learn'
              : outcome === 'failed'
                ? 'diagnose'
                : 'plan',
        outcome,
        happenedAt: execution.completedAt,
        timeAgo: formatAuditRelativeTime(execution.completedAt, nowMs),
        provider: entry.provider,
        detail: entry.summary,
        evidencePath: execution.evidencePath,
        evidenceSha256: execution.evidenceSha256,
        evidenceSizeBytes: execution.evidenceSizeBytes,
        commandCount: execution.commandCount,
        failedCommandCount: execution.failedCommandCount,
        failedCommands: execution.failedCommands,
        proofComplete: execution.proof?.complete,
        proofIssues: execution.proof?.issues,
        rollbackProofRequired: execution.proof?.rollbackProofRequired,
        rollbackPlanPresent: execution.proof?.rollbackPlanPresent,
        canRevealEvidence: Boolean(execution.evidencePath),
      });
    }
  }

  return events
    .sort((a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime())
    .slice(0, 8);
}
