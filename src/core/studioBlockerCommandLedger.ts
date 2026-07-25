import type * as vscode from 'vscode';

import { computeBlockerSignature } from '../contracts/blocker-resolution-contract.js';

const LEDGER_STATE_KEY = 'workspai.studioBlockerCommandLedger.v1';

export type StudioBlockerLedgerEntry = {
  cardId: string;
  sourceCommand: string;
  dashboardCommandId?: string;
  executionChannel?: 'terminal' | 'background';
  capabilityGate?: string;
  safetyRisk?: 'read' | 'write' | 'destructive';
  safetyConfirmation?: string;
  safetyRefreshCommands?: string[];
  blockerSignature: string;
  count: number;
  lastRunId?: string;
  lastExitCode?: number | null;
  lastAt?: string;
};

type StudioBlockerLedgerState = {
  entries: StudioBlockerLedgerEntry[];
};

function emptyLedger(): StudioBlockerLedgerState {
  return { entries: [] };
}

function readLedger(context: vscode.ExtensionContext): StudioBlockerLedgerState {
  return context.workspaceState.get<StudioBlockerLedgerState>(LEDGER_STATE_KEY) ?? emptyLedger();
}

async function writeLedger(
  context: vscode.ExtensionContext,
  state: StudioBlockerLedgerState
): Promise<void> {
  await context.workspaceState.update(LEDGER_STATE_KEY, state);
}

export function ledgerKey(input: {
  cardId: string;
  sourceCommand: string;
  blockerSignature: string;
}): string {
  return `${input.cardId}::${input.sourceCommand}::${input.blockerSignature}`;
}

export function readStudioBlockerLedgerEntry(
  context: vscode.ExtensionContext,
  input: { cardId: string; sourceCommand: string; blockerSignature: string }
): StudioBlockerLedgerEntry | undefined {
  const key = ledgerKey(input);
  return readLedger(context).entries.find(
    (entry) =>
      ledgerKey({
        cardId: entry.cardId,
        sourceCommand: entry.sourceCommand,
        blockerSignature: entry.blockerSignature,
      }) === key
  );
}

export function readStudioBlockerCommandRunCount(
  context: vscode.ExtensionContext,
  input: { cardId: string; sourceCommand: string; blockerSignature: string }
): number {
  return readStudioBlockerLedgerEntry(context, input)?.count ?? 0;
}

export async function recordStudioBlockerCommandRun(
  context: vscode.ExtensionContext,
  input: {
    cardId: string;
    sourceCommand: string;
    blockers: string[];
    dashboardCommandId?: string;
    executionChannel?: 'terminal' | 'background';
    capabilityGate?: string;
    safetyRisk?: 'read' | 'write' | 'destructive';
    safetyConfirmation?: string;
    safetyRefreshCommands?: string[];
    blockerSignature?: string;
    exitCode?: number | null;
    stderrTail?: string | null;
    runId?: string;
    now?: Date;
  }
): Promise<StudioBlockerLedgerEntry> {
  const blockerSignature =
    input.blockerSignature?.trim() ||
    computeBlockerSignature({
      blockers: input.blockers,
      exitCode: input.exitCode,
      stderrTail: input.stderrTail,
    });
  const state = readLedger(context);
  const key = ledgerKey({
    cardId: input.cardId,
    sourceCommand: input.sourceCommand,
    blockerSignature,
  });
  const existing = state.entries.find(
    (entry) =>
      ledgerKey({
        cardId: entry.cardId,
        sourceCommand: entry.sourceCommand,
        blockerSignature: entry.blockerSignature,
      }) === key
  );
  const next: StudioBlockerLedgerEntry = {
    cardId: input.cardId,
    sourceCommand: input.sourceCommand,
    ...(input.dashboardCommandId?.trim()
      ? { dashboardCommandId: input.dashboardCommandId.trim() }
      : {}),
    ...(input.executionChannel ? { executionChannel: input.executionChannel } : {}),
    ...(input.capabilityGate?.trim() ? { capabilityGate: input.capabilityGate.trim() } : {}),
    ...(input.safetyRisk ? { safetyRisk: input.safetyRisk } : {}),
    ...(input.safetyConfirmation?.trim()
      ? { safetyConfirmation: input.safetyConfirmation.trim() }
      : {}),
    ...(input.safetyRefreshCommands?.length
      ? {
          safetyRefreshCommands: input.safetyRefreshCommands
            .map((command) => command.trim())
            .filter(Boolean),
        }
      : {}),
    blockerSignature,
    count: (existing?.count ?? 0) + 1,
    lastRunId: input.runId,
    lastExitCode: input.exitCode,
    lastAt: (input.now ?? new Date()).toISOString(),
  };
  const entries = [
    next,
    ...state.entries.filter(
      (entry) =>
        ledgerKey({
          cardId: entry.cardId,
          sourceCommand: entry.sourceCommand,
          blockerSignature: entry.blockerSignature,
        }) !== key
    ),
  ].slice(0, 64);
  await writeLedger(context, { entries });
  return next;
}

export async function resetStudioBlockerLedgerForCard(
  context: vscode.ExtensionContext,
  cardId: string,
  blockerSignature?: string
): Promise<void> {
  const state = readLedger(context);
  const entries = state.entries.filter((entry) => {
    if (entry.cardId !== cardId) {
      return true;
    }
    if (!blockerSignature) {
      return false;
    }
    return entry.blockerSignature !== blockerSignature;
  });
  await writeLedger(context, { entries });
}

export type StudioBlockerLedgerReconcileResult = {
  signatureChanged: boolean;
  nextSignature: string;
};

export async function reconcileStudioBlockerLedgerAfterVerify(
  context: vscode.ExtensionContext,
  input: {
    cardId: string;
    blockers: string[];
    priorSignature: string;
    exitCode?: number | null;
    stderrTail?: string | null;
  }
): Promise<StudioBlockerLedgerReconcileResult> {
  const nextSignature = computeBlockerSignature({
    blockers: input.blockers,
    exitCode: input.exitCode,
    stderrTail: input.stderrTail,
  });
  if (nextSignature !== input.priorSignature) {
    await resetStudioBlockerLedgerForCard(context, input.cardId, input.priorSignature);
  }
  return {
    signatureChanged: nextSignature !== input.priorSignature,
    nextSignature,
  };
}
