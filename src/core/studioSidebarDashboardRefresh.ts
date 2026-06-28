import type * as vscode from 'vscode';

import {
  isDashboardEvidenceCardId,
  type DashboardEvidenceCardId,
} from '../contracts/dashboardEvidenceCards.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';
import {
  buildDashboardEvidenceBundle,
  type DashboardEvidenceCard,
} from './dashboardEvidenceBridge.js';
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
};

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

  const bundle = await buildDashboardEvidenceBundle({
    workspacePath: input.workspacePath,
    projectPath: input.projectPath,
    projectName: input.projectName,
  });

  const refreshedCards = bundle.cards.filter((card) => cardIds.includes(card.id));
  const primaryCard = bundle.cards.find((card) => card.id === input.handoff.cardId);

  let ledger: StudioBlockerLedgerReconcileResult | undefined;
  if (input.context) {
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
  };
}

export function formatStudioCardRefreshToast(input: {
  primaryCard?: DashboardEvidenceCard;
  verifySucceeded: boolean;
}): { kind: 'info' | 'warning' | 'error'; message: string } {
  const label = input.primaryCard?.label ?? 'Evidence card';
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
  return { kind: 'warning', message: `Still blocked: ${topBlocker}` };
}
