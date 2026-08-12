export type StudioBlockerExecutionMode = 'FIX' | 'RUN_ONCE' | 'VERIFY_ONLY' | 'EXPLAIN';
export type StudioBlockerExecutionChannel = 'terminal' | 'background';
export type StudioBlockerSafetyRisk = 'read' | 'write' | 'destructive';
export type StudioIncidentPhase = 'detect' | 'diagnose' | 'fix' | 'verify' | 'audit';
export type StudioIncidentAuditStatus = 'not-started' | 'pending' | 'saved' | 'failed' | 'unknown';

export type StudioIncidentSummaryView = {
  title: string;
  phase: StudioIncidentPhase;
  primaryAction: string;
  verifyRequired: boolean;
  auditStatus: StudioIncidentAuditStatus;
};

export type StudioDoctorFindingView = {
  id: string;
  causalKey?: string;
  projectName?: string;
  projectPath?: string;
  probeId?: string;
  issueClass?: string;
  symptom: string;
  status: 'blocking' | 'advisory' | 'informational' | 'unknown';
  repairDisposition?: string;
  capabilityId?: string;
  verifyCommand?: string;
  requiresFreshEvidence?: boolean;
};

export type StudioBlockerHandoffView = {
  schemaVersion: string;
  cardId: string;
  cardLabel?: string;
  cardStatus: 'pass' | 'warn' | 'fail' | 'missing';
  blocking?: boolean;
  blockers: string[];
  affectedProjectNames?: string[];
  doctorFindings?: StudioDoctorFindingView[];
  artifactPath: string;
  sourceCommand: string;
  dashboardCommandId?: string;
  executionChannel?: StudioBlockerExecutionChannel;
  capabilityGate?: string;
  safetyRisk?: StudioBlockerSafetyRisk;
  safetyConfirmation?: string;
  safetyRefreshCommands?: string[];
  scope: 'workspace' | 'project';
  blockerSignature: string;
  commandRunCount?: number;
  resolutionClass?: string;
  resolutionHints?: unknown[];
  studioMode?: StudioBlockerExecutionMode;
  incidentSummary?: StudioIncidentSummaryView;
  verifyCommand?: string;
  verifyArtifact?: string;
  handoffSource?: string;
  workspacePath?: string;
  projectPath?: string;
};

export type StudioFixPhase =
  | 'idle'
  | 'diagnosing'
  | 'fixing'
  | 'fix-applied'
  | 'awaiting-verify'
  | 'verified';

export type StudioFixAppliedPayloadView = {
  cardStatus?: StudioBlockerHandoffView['cardStatus'];
  verifyCommand?: string;
  verifyArtifact?: string;
  requiresVerify?: boolean;
};

export function resolveStudioFixPhase(input: {
  handoff?: StudioBlockerHandoffView | null;
  fixApplied?: boolean;
  autoFixRunning?: boolean;
  completed?: boolean;
}): StudioFixPhase {
  if (!input.handoff) {
    return 'idle';
  }
  if (input.completed) {
    return 'verified';
  }
  if (input.autoFixRunning) {
    return input.handoff.studioMode === 'RUN_ONCE' ? 'diagnosing' : 'fixing';
  }
  if (input.fixApplied) {
    return 'awaiting-verify';
  }
  if (input.handoff.studioMode === 'EXPLAIN') {
    return 'diagnosing';
  }
  return input.handoff.studioMode === 'VERIFY_ONLY' ? 'awaiting-verify' : 'fixing';
}

export function shouldAwaitVerifyAfterStudioFixApplied(
  payload?: StudioFixAppliedPayloadView | null
): boolean {
  if (payload?.cardStatus === 'pass') {
    return false;
  }
  return payload?.requiresVerify !== false;
}

export function mergeStudioFixAppliedIntoHandoff(
  handoff: StudioBlockerHandoffView | null,
  payload?: StudioFixAppliedPayloadView | null
): StudioBlockerHandoffView | null {
  if (!handoff || !payload) {
    return handoff;
  }

  const verifyCommand =
    typeof payload.verifyCommand === 'string' && payload.verifyCommand.trim().length > 0
      ? payload.verifyCommand.trim()
      : undefined;
  const verifyArtifact =
    typeof payload.verifyArtifact === 'string' && payload.verifyArtifact.trim().length > 0
      ? payload.verifyArtifact.trim()
      : undefined;

  return {
    ...handoff,
    ...(payload.cardStatus ? { cardStatus: payload.cardStatus } : {}),
    ...(verifyCommand ? { verifyCommand } : {}),
    ...(verifyArtifact ? { verifyArtifact } : {}),
    ...(handoff.incidentSummary
      ? {
          incidentSummary: {
            ...handoff.incidentSummary,
            phase: payload.cardStatus === 'pass' ? 'verify' : 'audit',
            primaryAction:
              payload.cardStatus === 'pass'
                ? verifyCommand || handoff.verifyCommand || 'Run verify'
                : 'Verify applied fix',
            verifyRequired: payload.cardStatus !== 'pass' && payload.requiresVerify !== false,
          },
        }
      : {}),
    studioMode: payload.cardStatus === 'pass' ? 'VERIFY_ONLY' : handoff.studioMode,
  };
}

export function studioModeHeadline(mode?: StudioBlockerExecutionMode): string {
  switch (mode) {
    case 'RUN_ONCE':
      return 'Run source command once';
    case 'VERIFY_ONLY':
      return 'Verify to refresh card';
    case 'EXPLAIN':
      return 'Explain blockers';
    case 'FIX':
    default:
      return 'Fix source issue';
  }
}

export function studioModeDetail(handoff: StudioBlockerHandoffView): string {
  if (handoff.studioMode === 'RUN_ONCE') {
    return `Generate missing evidence, then verify once.`;
  }
  if (handoff.studioMode === 'VERIFY_ONLY') {
    return handoff.verifyCommand
      ? `Run ${handoff.verifyCommand} to refresh the card.`
      : 'Run verify to refresh the card.';
  }
  if ((handoff.commandRunCount ?? 0) >= 1) {
    return 'Same command already ran — Studio will fix the source, not re-run it.';
  }
  return 'Studio applies the smallest safe fix before verify.';
}
