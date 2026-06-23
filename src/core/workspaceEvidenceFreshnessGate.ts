import * as vscode from 'vscode';

import {
  isEvidenceFreshnessBlocking,
  resolveWorkspaceEvidenceFreshness,
  type EvidenceFreshnessAssessment,
} from './workspaceEvidenceFreshness';

export type FreshnessGateMode = 'auto-refresh' | 'warn' | 'off';

export const FRESHNESS_GATE_CONFIG_KEY = 'workspai.evidenceFreshnessGate';
const DEFAULT_GATE_MODE: FreshnessGateMode = 'warn';

export type FreshnessGateOutcome = 'proceed' | 'refreshed' | 'cancelled';

export interface FreshnessGatePlan {
  action: 'proceed' | 'auto-refresh' | 'warn';
  assessment: EvidenceFreshnessAssessment;
}

/**
 * Pure planning: given an assessment and mode, decide what the gate should do.
 * Separated from the UI so it is deterministically testable.
 */
export function planFreshnessGate(
  assessment: EvidenceFreshnessAssessment,
  mode: FreshnessGateMode
): FreshnessGatePlan {
  if (mode === 'off' || !isEvidenceFreshnessBlocking(assessment.verdict)) {
    return { action: 'proceed', assessment };
  }
  return { action: mode === 'auto-refresh' ? 'auto-refresh' : 'warn', assessment };
}

export function getFreshnessGateMode(): FreshnessGateMode {
  const configured = vscode.workspace
    .getConfiguration()
    .get<string>(FRESHNESS_GATE_CONFIG_KEY, DEFAULT_GATE_MODE);
  return configured === 'auto-refresh' || configured === 'warn' || configured === 'off'
    ? configured
    : DEFAULT_GATE_MODE;
}

export interface EnsureFreshEvidenceOptions {
  workspacePath: string;
  /** User-facing label for the action being gated, e.g. "Send to Copilot". */
  actionLabel: string;
  /** Runs the refresh (e.g. the intelligence chain or model+context). */
  refresh: () => Promise<void>;
  /** Override the configured mode (mainly for tests). */
  mode?: FreshnessGateMode;
  now?: number;
}

/**
 * Evidence-freshness gate before an AI action (roadmap item 2.4). When the
 * workspace intelligence evidence is stale or missing, either auto-refresh it
 * or warn the user explicitly with actionable choices. Fresh/aging/unknown
 * evidence proceeds without friction.
 */
export async function ensureFreshEvidenceForAIAction(
  options: EnsureFreshEvidenceOptions
): Promise<FreshnessGateOutcome> {
  const mode = options.mode ?? getFreshnessGateMode();
  const assessment = await resolveWorkspaceEvidenceFreshness(options.workspacePath, options.now);
  const plan = planFreshnessGate(assessment, mode);

  if (plan.action === 'proceed') {
    return 'proceed';
  }

  if (plan.action === 'auto-refresh') {
    await options.refresh();
    return 'refreshed';
  }

  // warn
  const refreshLabel = 'Refresh now';
  const useAnywayLabel = 'Use anyway';
  const choice = await vscode.window.showWarningMessage(
    `${options.actionLabel}: ${assessment.reason} Refresh workspace intelligence for accurate AI grounding?`,
    { modal: false },
    refreshLabel,
    useAnywayLabel
  );

  if (choice === refreshLabel) {
    await options.refresh();
    return 'refreshed';
  }
  if (choice === useAnywayLabel) {
    return 'proceed';
  }
  return 'cancelled';
}
