import type { IncidentStudioStabilizationKpiStatus } from './incidentStudioPayload';
import { deriveStabilizationEnterpriseClaim } from './incidentStudioStabilizationClaim';

export type LiteReleaseState = {
  label: 'READY' | 'HOLD' | 'NO-GO';
  tone: 'passed' | 'warning' | 'failed';
  summary: string;
  blocksRelease: boolean;
};

export type LiteReleasePostureTone = 'ok' | 'warning' | 'error';

export function mapLiteReleaseTone(tone: LiteReleaseState['tone']): LiteReleasePostureTone {
  if (tone === 'passed') {
    return 'ok';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  return 'error';
}

export type LitePrimaryActionPlan = {
  label: string;
  buttonLabel: string;
  source: string;
  kind: 'blocker-query' | 'board-action' | 'fallback-query';
  query?: string;
};

export function deriveLiteReleaseState(input: {
  releaseDecision?: 'go' | 'no-go';
  hardBlockerCount: number;
  advisoryBlockerCount: number;
}): LiteReleaseState {
  if (input.releaseDecision === 'no-go' || input.hardBlockerCount > 0) {
    const blockerCount = input.hardBlockerCount;
    return {
      label: 'NO-GO',
      tone: 'failed',
      summary: `Blocked by ${blockerCount} hard signal${blockerCount === 1 ? '' : 's'}`,
      blocksRelease: true,
    };
  }

  if (input.advisoryBlockerCount > 0) {
    return {
      label: 'HOLD',
      tone: 'warning',
      summary: `Hold: ${input.advisoryBlockerCount} stabilization signal${input.advisoryBlockerCount === 1 ? '' : 's'} need review`,
      blocksRelease: false,
    };
  }

  return {
    label: 'READY',
    tone: 'passed',
    summary: 'No hard blockers detected in current evidence',
    blocksRelease: false,
  };
}

export function deriveLitePrimaryActionPlan(input: {
  topBlocker: string | null;
  primaryActionLabel: string;
  primaryActionSource: string;
  fallbackQuery: string;
}): LitePrimaryActionPlan {
  if (input.topBlocker) {
    return {
      label: `Investigate blocker: ${input.topBlocker}`,
      buttonLabel: 'Investigate blocker',
      source: 'derived:blocker-investigation',
      kind: 'blocker-query',
      query: `Inspect this blocker and propose one deterministic remediation command: ${input.topBlocker}`,
    };
  }

  if (input.primaryActionSource === 'chatBrainBoard.actions[0]') {
    return {
      label: input.primaryActionLabel,
      buttonLabel: 'Run this next action',
      source: input.primaryActionSource,
      kind: 'board-action',
    };
  }

  return {
    label: input.primaryActionLabel,
    buttonLabel: 'Ask AI for next action',
    source: input.primaryActionSource,
    kind: 'fallback-query',
    query: input.fallbackQuery,
  };
}

export function getLiteProofButtonLabel(hasTopBlocker: boolean): string {
  return hasTopBlocker ? 'Run blocker check' : 'Run verify command';
}

export function resolveLiteReleaseStateFromStudioContext(input: {
  releaseDecision?: 'go' | 'no-go';
  stabilizationKpiStatus?: IncidentStudioStabilizationKpiStatus | null;
  verifyGateBlockedReasons?: string[];
  policyReleasePosture?: 'go' | 'hold' | 'blocked' | 'no-go';
}): LiteReleaseState {
  const stabilizationClaim = deriveStabilizationEnterpriseClaim({
    status: input.stabilizationKpiStatus ?? null,
  });

  let hardBlockerCount = 0;
  if (input.releaseDecision === 'no-go') {
    hardBlockerCount += 1;
  }
  if (input.policyReleasePosture === 'blocked' || input.policyReleasePosture === 'no-go') {
    hardBlockerCount += 1;
  }
  hardBlockerCount += input.verifyGateBlockedReasons?.length ?? 0;

  return deriveLiteReleaseState({
    releaseDecision: input.releaseDecision,
    hardBlockerCount,
    advisoryBlockerCount: stabilizationClaim.normalizedBlockers.length,
  });
}
