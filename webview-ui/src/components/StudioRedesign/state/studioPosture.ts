import {
  AIActionRegistryView,
  HealthMetrics,
  PolicyGateState,
  ReleaseGatePosture,
  StudioEvidenceSummary,
} from './studioState';
import type { StudioTruthSnapshot } from '@/lib/incidentStudioTruthModel';

export type StudioPostureTone = 'ok' | 'warning' | 'error' | 'neutral';
export type StudioPostureLabel = 'Ready' | 'Needs Review' | 'Blocked';

export interface StudioPostureMetric {
  label: string;
  value: string;
  tone: StudioPostureTone;
}

export interface StudioPosture {
  label: StudioPostureLabel;
  tone: Exclude<StudioPostureTone, 'neutral'>;
  summary: string;
  nextProof: string;
  evidence: string;
  action: string;
  proof: string;
  metrics: StudioPostureMetric[];
}

export interface BuildStudioPostureInput {
  releasePosture: ReleaseGatePosture;
  policyGates: PolicyGateState;
  health?: HealthMetrics;
  studioEvidence?: StudioEvidenceSummary;
  aiActionRegistry?: AIActionRegistryView | null;
  truth?: StudioTruthSnapshot | null;
}

export function buildStudioPosture({
  releasePosture,
  policyGates,
  health,
  studioEvidence,
  aiActionRegistry,
  truth,
}: BuildStudioPostureInput): StudioPosture {
  if (truth) {
    const latestAction = aiActionRegistry?.entries[0];
    const latestExecution = latestAction?.executions[0];
    const latestProof = latestExecution?.proof;
    const fail = Math.max(0, studioEvidence?.findings.fail ?? health?.modulesError ?? 0);
    const warn = Math.max(0, studioEvidence?.findings.warn ?? health?.modulesWarning ?? 0);
    const evidenceLabel = studioEvidence?.generatedAt
      ? `Evidence ${studioEvidence.generatedAt}`
      : health?.systemLastCheck
        ? `Evidence ${health.systemLastCheck}`
        : 'Evidence pending';
    const actionLabel = truth.primaryFix
      ? truth.primaryFix.title
      : latestAction
        ? `${latestAction.actionType}/${latestAction.lifecycleStatus}`
        : 'No governed action';

    return {
      label: truth.headline.label,
      tone: truth.headline.tone,
      summary: truth.headline.summary,
      nextProof: truth.primaryFix?.detail ?? 'Archive gate evidence for the release record.',
      evidence: evidenceLabel,
      action: actionLabel,
      proof:
        latestProof && !latestProof.complete
          ? `proof incomplete · ${latestProof.issues[0] || 'review evidence'}`
          : latestExecution?.evidenceSha256
            ? `sha256:${latestExecution.evidenceSha256.slice(0, 12)}`
            : `${fail} fail / ${warn} warn`,
      metrics: [
        {
          label: 'Workspace',
          value: truth.workspaceLane.status,
          tone:
            truth.workspaceLane.status === 'blocked'
              ? 'error'
              : truth.workspaceLane.status === 'review'
                ? 'warning'
                : 'ok',
        },
        {
          label: 'Studio flow',
          value: truth.studioFlowLane.status,
          tone:
            truth.studioFlowLane.status === 'blocked'
              ? 'error'
              : truth.studioFlowLane.status === 'review'
                ? 'warning'
                : 'ok',
        },
        {
          label: 'Gate',
          value: releasePosture,
          tone:
            releasePosture === 'no-go' ? 'error' : releasePosture === 'pending' ? 'warning' : 'ok',
        },
        {
          label: 'Telemetry',
          value: policyGates.telemetryState,
          tone:
            policyGates.telemetryState === 'stale'
              ? 'error'
              : policyGates.telemetryState === 'partial'
                ? 'warning'
                : 'ok',
        },
      ],
    };
  }

  const latestAction = aiActionRegistry?.entries[0];
  const latestExecution = latestAction?.executions[0];
  const latestProof = latestExecution?.proof;
  const proofIncomplete = latestProof?.complete === false;
  const fail = Math.max(0, studioEvidence?.findings.fail ?? health?.modulesError ?? 0);
  const warn = Math.max(0, studioEvidence?.findings.warn ?? health?.modulesWarning ?? 0);
  const evidenceLabel = studioEvidence?.generatedAt
    ? `Evidence ${studioEvidence.generatedAt}`
    : health?.systemLastCheck
      ? `Evidence ${health.systemLastCheck}`
      : 'Evidence pending';
  const actionLabel = latestAction
    ? `${latestAction.actionType}/${latestAction.lifecycleStatus}`
    : 'No governed action';
  const proofLabel = proofIncomplete
    ? `proof incomplete · ${latestProof?.issues[0] || 'review evidence'}`
    : latestExecution?.evidenceSha256
      ? `sha256:${latestExecution.evidenceSha256.slice(0, 12)}`
      : `${fail} fail / ${warn} warn`;

  const hasBlocker =
    releasePosture === 'no-go' ||
    policyGates.flowState === 'blocking' ||
    studioEvidence?.verdict === 'blocked' ||
    fail > 0 ||
    latestAction?.lifecycleStatus === 'blocked' ||
    latestAction?.lifecycleStatus === 'stale' ||
    latestAction?.lifecycleStatus === 'applied-failed-verify';
  const needsReview =
    !hasBlocker &&
    (proofIncomplete ||
      releasePosture === 'pending' ||
      policyGates.flowState === 'warning' ||
      policyGates.telemetryState === 'partial' ||
      policyGates.telemetryState === 'stale' ||
      studioEvidence?.verdict === 'needs-attention' ||
      warn > 0 ||
      latestAction?.lifecycleStatus === 'proposed');

  const label: StudioPostureLabel = hasBlocker ? 'Blocked' : needsReview ? 'Needs Review' : 'Ready';
  const tone: StudioPosture['tone'] = hasBlocker ? 'error' : needsReview ? 'warning' : 'ok';
  const summary = hasBlocker
    ? 'Hold release until impact, verify, or rollback evidence is clean.'
    : needsReview
      ? 'Run verification before treating this workspace as ready.'
      : 'Evidence and gates support the current release posture.';
  const nextProof = hasBlocker
    ? 'Run workspace advisor, then verify or rollback with evidence.'
    : needsReview
      ? proofIncomplete
        ? `Review proof completeness: ${latestProof?.issues[0] || 'proof metadata incomplete'}`
        : 'Run verify gates against the current workspace snapshot.'
      : proofIncomplete
        ? `Review proof completeness: ${latestProof?.issues[0] || 'proof metadata incomplete'}`
        : latestExecution?.evidenceSha256
          ? `Latest proof ${latestExecution.evidenceSha256.slice(0, 12)}`
          : 'Archive gate evidence for the release record.';

  return {
    label,
    tone,
    summary,
    nextProof,
    evidence: evidenceLabel,
    action: actionLabel,
    proof: proofLabel,
    metrics: [
      {
        label: 'Health',
        value: `${fail} err / ${warn} warn`,
        tone: fail > 0 ? 'error' : warn > 0 ? 'warning' : 'ok',
      },
      {
        label: 'Gate',
        value: releasePosture,
        tone:
          releasePosture === 'no-go' ? 'error' : releasePosture === 'pending' ? 'warning' : 'ok',
      },
      {
        label: 'Telemetry',
        value: policyGates.telemetryState,
        tone:
          policyGates.telemetryState === 'stale'
            ? 'error'
            : policyGates.telemetryState === 'partial'
              ? 'warning'
              : 'ok',
      },
      {
        label: 'AI action',
        value: latestAction?.lifecycleStatus || 'none',
        tone:
          latestAction?.lifecycleStatus === 'blocked' ||
          latestAction?.lifecycleStatus === 'stale' ||
          latestAction?.lifecycleStatus === 'applied-failed-verify'
            ? 'error'
            : latestAction?.lifecycleStatus === 'proposed'
              ? 'warning'
              : latestAction
                ? 'ok'
                : 'neutral',
      },
    ],
  };
}
