import {
  AIActionRegistryView,
  HealthMetrics,
  PolicyGateState,
  ReleaseGatePosture,
  StudioEvidenceSummary,
} from './studioState';

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
}

export function buildStudioPosture({
  releasePosture,
  policyGates,
  health,
  studioEvidence,
  aiActionRegistry,
}: BuildStudioPostureInput): StudioPosture {
  const latestAction = aiActionRegistry?.entries[0];
  const latestExecution = latestAction?.executions[0];
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
  const proofLabel = latestExecution?.evidenceSha256
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
    (releasePosture === 'pending' ||
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
    ? 'Run impact lens, then verify or rollback with evidence.'
    : needsReview
      ? 'Run verify gates against the current workspace snapshot.'
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
    proof: latestExecution?.evidenceSha256
      ? `sha256:${latestExecution.evidenceSha256.slice(0, 12)}`
      : proofLabel,
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
