import type * as vscode from 'vscode';

import {
  isDashboardEvidenceCardId,
  type DashboardEvidenceCardId,
} from '../contracts/dashboardEvidenceCards.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import type { DashboardEvidenceCard } from './dashboardEvidenceBridge.js';
import { buildDashboardEvidenceCardsForIds } from './dashboardEvidenceCardRefresh.js';
import {
  reconcileStudioBlockerLedgerAfterVerify,
  type StudioBlockerLedgerReconcileResult,
} from './studioBlockerCommandLedger.js';

export type RefreshDashboardEvidenceCards = (input: {
  workspacePath: string;
  cardIds: readonly DashboardEvidenceCardId[];
  projectPath?: string;
  projectName?: string;
}) => Promise<void>;

export function resolveDashboardCardIdsForStudioHandoff(
  handoff: Pick<StudioBlockerHandoff, 'cardId' | 'verifyCommand'>
): DashboardEvidenceCardId[] {
  const ids = new Set<DashboardEvidenceCardId>();

  if (isDashboardEvidenceCardId(handoff.cardId)) {
    ids.add(handoff.cardId);
  }

  if (handoff.verifyCommand?.includes('workspace verify') || handoff.cardId === 'workspaceVerify') {
    ids.add('workspaceVerify');
  }

  if (handoff.cardId === 'doctor' || handoff.cardId === 'projectDoctor') {
    ids.add(handoff.cardId === 'projectDoctor' ? 'projectDoctor' : 'doctor');
  }

  return [...ids];
}

export type StudioSidebarDashboardRefreshResult = {
  cardIds: DashboardEvidenceCardId[];
  primaryCard?: DashboardEvidenceCard;
  refreshedCards: DashboardEvidenceCard[];
  ledger?: StudioBlockerLedgerReconcileResult;
  evidenceOutcome: 'resolved' | 'blocking' | 'missing' | 'verify-failed';
};

/** A warning or advisory is not a failed repair merely because it is not `pass`. */
export function dashboardEvidenceCardIsBlocking(card: DashboardEvidenceCard | undefined): boolean {
  if (!card) {
    return true;
  }
  return card.blocking ?? card.status === 'fail';
}

export async function refreshDashboardAfterStudioVerify(input: {
  context?: vscode.ExtensionContext;
  workspacePath: string;
  handoff: StudioBlockerHandoff;
  projectPath?: string;
  projectName?: string;
  verifyExitCode?: number | null;
  refreshDashboardCards: RefreshDashboardEvidenceCards;
}): Promise<StudioSidebarDashboardRefreshResult> {
  const cardIds = resolveDashboardCardIdsForStudioHandoff(input.handoff);

  await input.refreshDashboardCards({
    workspacePath: input.workspacePath,
    cardIds,
    projectPath: input.projectPath,
    projectName: input.projectName,
  });

  const refreshedCards = await buildDashboardEvidenceCardsForIds({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    projectName: input.projectName,
    cardIds,
  });

  const primaryCard = refreshedCards.find((card) => card.id === input.handoff.cardId);
  // Workspai uses exit 2 for both a governed non-pass posture and a blocker.
  // The refreshed artifact owns that semantic verdict. Other non-zero exits
  // mean the producer itself failed and cannot authorize completion.
  const verifyProducedEvidence = input.verifyExitCode === 0 || input.verifyExitCode === 2;
  const evidenceOutcome: StudioSidebarDashboardRefreshResult['evidenceOutcome'] =
    !verifyProducedEvidence
      ? 'verify-failed'
      : !primaryCard
        ? 'missing'
        : dashboardEvidenceCardIsBlocking(primaryCard)
          ? 'blocking'
          : 'resolved';

  let ledger: StudioBlockerLedgerReconcileResult | undefined;
  if (input.context && primaryCard) {
    ledger = await reconcileStudioBlockerLedgerAfterVerify(input.context, {
      cardId: input.handoff.cardId,
      blockers: primaryCard?.blockers ?? input.handoff.blockers,
      priorSignature: input.handoff.blockerSignature,
      exitCode: input.verifyExitCode ?? null,
    });
  }

  return {
    cardIds,
    primaryCard,
    refreshedCards,
    ledger,
    evidenceOutcome,
  };
}

export function formatStudioCardRefreshToast(input: {
  primaryCard?: DashboardEvidenceCard;
  verifySucceeded: boolean;
}): { kind: 'info' | 'warning' | 'error'; message: string } {
  const label = input.primaryCard?.label ?? 'Evidence card';
  if (!input.primaryCard) {
    return {
      kind: 'error',
      message: 'Verify completed, but refreshed evidence is missing. Studio kept the blocker open.',
    };
  }
  if (input.primaryCard?.status === 'pass') {
    return { kind: 'info', message: `Card refreshed: ${label} is ready.` };
  }
  if (!input.verifySucceeded) {
    return {
      kind: 'error',
      message: `Verify failed for ${label}. Check Studio for the next fix step.`,
    };
  }
  const topBlocker =
    input.primaryCard?.blockers?.[0] ?? input.primaryCard?.summary ?? 'still needs attention';
  return dashboardEvidenceCardIsBlocking(input.primaryCard)
    ? { kind: 'warning', message: `Still blocked: ${topBlocker}` }
    : { kind: 'warning', message: `Verified with attention: ${topBlocker}` };
}
