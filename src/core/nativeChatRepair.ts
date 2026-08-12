import * as path from 'path';
import type * as vscode from 'vscode';

import type { AIModalContext } from './aiService.js';
import {
  buildDashboardEvidenceBundle,
  type DashboardEvidenceCard,
} from './dashboardEvidenceBridge.js';
import { buildStudioBlockerHandoff } from './studioBlockerHandoffBuilder.js';
import {
  decideCliOwnedRepair,
  executeCliOwnedCanonicalRepair,
  type WorkspaceRepairCliExecutionResult,
  type WorkspaceRepairDecision,
} from './workspaceRepairCliClient.js';
import { resolveStudioCliRepairDisposition } from './studioRepairReceipt.js';
import { runNativeChatStudioAgent } from './nativeChatStudioAgent.js';
import { renderNativeRepairDecisionButtons } from './nativeChatRepairDecisionActions.js';

const REPAIR_DECISIONS = new Set<WorkspaceRepairDecision>([
  'approve-guarded',
  'approve-invasive',
  'allow-breaking',
  'allow-force',
  'manual-repair',
  'rollback',
  'cancel',
]);

type NativeRepairStream = Pick<vscode.ChatResponseStream, 'button' | 'markdown' | 'progress'>;

export type NativeChatRepairResult = {
  cardId?: string;
  transactionId?: string;
  state?: string;
  requiresDecision?: boolean;
  agentSessionId?: string;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cardPriority(card: DashboardEvidenceCard): number {
  if (card.blocking === true) {
    return 0;
  }
  if (card.status === 'fail') {
    return 1;
  }
  if (card.status === 'missing') {
    return 2;
  }
  if (card.status === 'warn') {
    return 3;
  }
  return 4;
}

export function selectNativeChatRepairCard(
  cards: readonly DashboardEvidenceCard[],
  prompt: string
): DashboardEvidenceCard | undefined {
  const candidates = cards.filter(
    (card) =>
      card.status !== 'pass' &&
      (card.blocking === true || card.status === 'fail' || card.status === 'missing')
  );
  if (candidates.length === 0) {
    return undefined;
  }

  const queryTerms = normalizeSearchText(prompt)
    .split(' ')
    .filter((term) => term.length > 2 && !['fix', 'repair', 'this', 'the'].includes(term));
  return [...candidates].sort((left, right) => {
    const leftIdentity = normalizeSearchText(`${left.id} ${left.label}`);
    const rightIdentity = normalizeSearchText(`${right.id} ${right.label}`);
    const leftMatch = queryTerms.filter((term) => leftIdentity.includes(term)).length;
    const rightMatch = queryTerms.filter((term) => rightIdentity.includes(term)).length;
    return (
      rightMatch - leftMatch ||
      cardPriority(left) - cardPriority(right) ||
      left.label.localeCompare(right.label)
    );
  })[0];
}

function parseRepairDecision(
  prompt: string
): { decision: WorkspaceRepairDecision; transactionId: string } | undefined {
  const [decision, transactionId, ...rest] = prompt.trim().split(/\s+/);
  if (
    rest.length > 0 ||
    !REPAIR_DECISIONS.has(decision as WorkspaceRepairDecision) ||
    !/^repair_[a-z0-9_-]+$/i.test(transactionId ?? '')
  ) {
    return undefined;
  }
  return { decision: decision as WorkspaceRepairDecision, transactionId };
}

function portableChangedPaths(workspacePath: string, changedPaths: readonly string[]): string[] {
  return changedPaths.flatMap((changedPath) => {
    const relative = path.isAbsolute(changedPath)
      ? path.relative(workspacePath, changedPath)
      : path.normalize(changedPath);
    if (!relative || relative === '.' || relative.startsWith('..') || path.isAbsolute(relative)) {
      return [];
    }
    return [relative.split(path.sep).join('/')];
  });
}

function renderRepairResult(
  stream: NativeRepairStream,
  workspacePath: string,
  card: Pick<DashboardEvidenceCard, 'id' | 'label'> | undefined,
  result: WorkspaceRepairCliExecutionResult
): NativeChatRepairResult {
  const transaction = result.transaction;
  const changedPaths = portableChangedPaths(workspacePath, result.changedPaths);
  if (transaction.state === 'closed') {
    stream.markdown(
      `### Repair verified\n\n` +
        `The CLI Repair Engine closed **${card?.label ?? transaction.target.cardId}** after canonical verification.` +
        (changedPaths.length > 0
          ? `\n\n**Changed files**\n${changedPaths.map((entry) => `- \`${entry}\``).join('\n')}`
          : '\n\nNo source files required a change.')
    );
  } else if (transaction.state === 'decision-required' && transaction.decision) {
    stream.markdown(
      `### Decision required\n\n${transaction.decision.reason}\n\n` +
        'Choose an option below. The choice is submitted to this exact immutable CLI transaction.'
    );
    renderNativeRepairDecisionButtons(
      stream,
      transaction.transactionId,
      transaction.decision.options
    );
  } else {
    stream.markdown(
      `### Repair did not close\n\n` +
        `The canonical transaction ended in **${transaction.state}**. Workspai will not report this blocker as fixed without a closed verification receipt.`
    );
  }

  return {
    cardId: card?.id ?? transaction.target.cardId,
    transactionId: transaction.transactionId,
    state: transaction.state,
    requiresDecision: transaction.state === 'decision-required' && Boolean(transaction.decision),
  };
}

export async function runNativeChatRepair(input: {
  prompt: string;
  context: AIModalContext;
  stream: NativeRepairStream;
  token: vscode.CancellationToken;
  extensionContext?: vscode.ExtensionContext;
  requestedModelId?: string;
}): Promise<NativeChatRepairResult> {
  const workspacePath = input.context.workspaceRootPath ?? input.context.path;
  if (!workspacePath) {
    input.stream.markdown(
      'Select a Workspai workspace before running `/repair`. The native repair flow never guesses a workspace boundary.'
    );
    return {};
  }

  const requestedDecision = parseRepairDecision(input.prompt);
  if (requestedDecision) {
    input.stream.progress('Submitting the decision to the CLI Repair Engine…');
    const result = await decideCliOwnedRepair({
      workspacePath,
      transactionId: requestedDecision.transactionId,
      decision: requestedDecision.decision,
      approvedBy: 'vscode:native-chat-explicit-decision',
      reportProgress: (progress) => input.stream.progress(progress.message),
    });
    return renderRepairResult(input.stream, workspacePath, undefined, result);
  }

  input.stream.progress('Reading canonical workspace evidence…');
  const bundle = await buildDashboardEvidenceBundle({
    workspacePath,
    projectPath: input.context.projectRootPath,
    projectName: input.context.type === 'project' ? input.context.name : undefined,
  });
  const card = selectNativeChatRepairCard(bundle.cards, input.prompt);
  if (!card) {
    input.stream.markdown(
      '### No repairable blocker found\n\nCurrent canonical evidence does not contain a failed, missing, or blocking card. Run Workspace Intelligence again if the repository changed.'
    );
    return {};
  }
  if (input.token.isCancellationRequested) {
    return { cardId: card.id };
  }

  const handoff = await buildStudioBlockerHandoff({
    card,
    workspacePath,
    projectPath: input.context.projectRootPath,
    handoffSource: 'repair',
  });
  input.stream.markdown(
    `### ${card.label}\n\n${card.blockers?.[0] ?? card.summary}\n\n` +
      `Running the governed repair capability and requiring **${handoff.verifyCommand}** before completion.\n\n`
  );
  input.stream.progress('Starting a governed CLI repair transaction…');
  const projectName =
    card.scope === 'project'
      ? card.affectedProjectNames?.length === 1
        ? card.affectedProjectNames[0]
        : input.context.type === 'project'
          ? input.context.name
          : undefined
      : undefined;
  const result = await executeCliOwnedCanonicalRepair({
    workspacePath,
    cardId: card.id,
    projectName,
    approvedBy: 'vscode:native-chat-repair',
    reportProgress: (progress) => input.stream.progress(progress.message),
  });
  const sourceCandidates = (result.transaction.checkpoint?.files ?? [])
    .filter((file) => file.existed)
    .map((file) => file.path);
  const disposition = resolveStudioCliRepairDisposition({
    transaction: result.transaction,
    sourceCandidates,
  });
  if (disposition.generalSourceRepair && input.extensionContext) {
    input.stream.markdown(
      '### Source repair required\n\nThe deterministic CLI plan isolated the blocker but requires a source-level change. The Workspai Agent is continuing with inspected, transaction-bound tools.\n\n'
    );
    const agent = await runNativeChatStudioAgent({
      extensionContext: input.extensionContext,
      workspacePath,
      projectPath: input.context.projectRootPath,
      handoff,
      task: `Resolve ${card.label}: ${card.blockers?.[0] ?? card.summary}`,
      stream: input.stream,
      token: input.token,
      requestedModelId: input.requestedModelId,
    });
    return {
      cardId: card.id,
      transactionId: agent.transactionIds.at(-1) ?? result.transaction.transactionId,
      state: agent.status,
      agentSessionId: agent.sessionId,
    };
  }
  return renderRepairResult(input.stream, workspacePath, card, result);
}
