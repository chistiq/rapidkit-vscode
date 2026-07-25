export type DoctorRemediationPlanStepView = {
  id: string;
  phase: string;
  order: number;
  projectName: string;
  projectPath: string;
  originalCommand: string;
  kind: string;
  risk: 'safe' | 'guarded' | 'invasive';
  executable: boolean;
  studioState: 'ready' | 'blocked' | 'review-required' | 'guidance-only';
  studioReason: string;
  primaryAction: string;
  requiresApproval: boolean;
  confidence?: 'high' | 'medium' | 'low';
  previewTitle: string;
  previewSummary: string;
  diffSummary: string;
  files: string[];
  verifyCommand?: string;
  refreshCommands: string[];
  blockedReason?: string;
  canApply: boolean;
  operation?: { type?: string };
};

export type DoctorRemediationPlanView = {
  schemaVersion: 'doctor-remediation-plan-v2';
  sourcePath: string;
  generatedAt: string;
  policyProfile: string;
  totalSteps: number;
  executableSteps: number;
  risk: {
    safe: number;
    guarded: number;
    invasive: number;
  };
  visibleSteps: DoctorRemediationPlanStepView[];
  hiddenStepCount: number;
  scope: 'workspace' | 'project';
  freshness: {
    verdict: 'fresh' | 'stale' | 'unknown';
    reason?: string;
    comparedArtifactPath?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function riskValue(value: unknown): DoctorRemediationPlanStepView['risk'] {
  return value === 'safe' || value === 'guarded' || value === 'invasive' ? value : 'guarded';
}

function studioStateValue(value: unknown): DoctorRemediationPlanStepView['studioState'] {
  return value === 'ready' ||
    value === 'blocked' ||
    value === 'review-required' ||
    value === 'guidance-only'
    ? value
    : 'blocked';
}

function confidenceValue(value: unknown): DoctorRemediationPlanStepView['confidence'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : undefined;
}

function parseStep(value: unknown): DoctorRemediationPlanStepView | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    id: stringValue(value.id, 'unknown'),
    phase: stringValue(value.phase, 'manual-review'),
    order: numberValue(value.order),
    projectName: stringValue(value.projectName, 'workspace'),
    projectPath: stringValue(value.projectPath),
    originalCommand: stringValue(value.originalCommand),
    kind: stringValue(value.kind, 'manual-url'),
    risk: riskValue(value.risk),
    executable: booleanValue(value.executable),
    studioState: studioStateValue(value.studioState),
    studioReason: stringValue(value.studioReason),
    primaryAction: stringValue(value.primaryAction, stringValue(value.originalCommand, 'Review')),
    requiresApproval: booleanValue(value.requiresApproval, true),
    confidence: confidenceValue(value.confidence),
    previewTitle: stringValue(value.previewTitle, stringValue(value.kind, 'Repair step')),
    previewSummary: stringValue(value.previewSummary),
    diffSummary: stringValue(value.diffSummary),
    files: stringArray(value.files),
    verifyCommand: stringValue(value.verifyCommand) || undefined,
    refreshCommands: stringArray(value.refreshCommands),
    blockedReason: stringValue(value.blockedReason) || undefined,
    canApply: booleanValue(value.canApply),
    operation: isRecord(value.operation)
      ? { type: stringValue(value.operation.type) || undefined }
      : undefined,
  };
}

export function parseDoctorRemediationPlanView(value: unknown): DoctorRemediationPlanView | null {
  if (!isRecord(value) || value.schemaVersion !== 'doctor-remediation-plan-v2') {
    return null;
  }
  const risk = isRecord(value.risk) ? value.risk : {};
  const visibleSteps = Array.isArray(value.visibleSteps)
    ? value.visibleSteps
        .map(parseStep)
        .filter((entry): entry is DoctorRemediationPlanStepView => Boolean(entry))
    : [];
  const freshness = isRecord(value.freshness) ? value.freshness : {};
  const freshnessVerdict =
    freshness.verdict === 'fresh' ||
    freshness.verdict === 'stale' ||
    freshness.verdict === 'unknown'
      ? freshness.verdict
      : 'unknown';
  return {
    schemaVersion: 'doctor-remediation-plan-v2',
    sourcePath: stringValue(value.sourcePath),
    generatedAt: stringValue(value.generatedAt),
    policyProfile: stringValue(value.policyProfile, 'enterprise-strict'),
    totalSteps: numberValue(value.totalSteps, visibleSteps.length),
    executableSteps: numberValue(value.executableSteps),
    risk: {
      safe: numberValue(risk.safe),
      guarded: numberValue(risk.guarded),
      invasive: numberValue(risk.invasive),
    },
    visibleSteps,
    hiddenStepCount: numberValue(value.hiddenStepCount),
    scope: value.scope === 'project' ? 'project' : 'workspace',
    freshness: {
      verdict: freshnessVerdict,
      reason: stringValue(freshness.reason) || undefined,
      comparedArtifactPath: stringValue(freshness.comparedArtifactPath) || undefined,
    },
  };
}

export function remediationRiskLabel(plan: DoctorRemediationPlanView): string {
  const parts = [
    plan.risk.safe ? `${plan.risk.safe} safe` : '',
    plan.risk.guarded ? `${plan.risk.guarded} guarded` : '',
    plan.risk.invasive ? `${plan.risk.invasive} invasive` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No executable risk';
}
