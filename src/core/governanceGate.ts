import * as vscode from 'vscode';
import * as path from 'path';

import { runWorkspaceIntelligenceCommandWithProgress } from './workspaceIntelligenceProgressRunner';
import { gateCompatibleCliVersion } from './cliVersionGate';

/**
 * Governance Gate (roadmap item 2.6): a single entrypoint that runs
 * `pipeline --json --strict` through the streaming runner and presents a clear
 * pass/blocked verdict from the `pipeline-last-run.v1` result, instead of
 * leaving the outcome buried in terminal text.
 */
export type GovernanceGateVerdict = 'ready' | 'needs-attention' | 'blocked' | 'unknown';

export interface GovernanceGateSummary {
  verdict: GovernanceGateVerdict;
  passed: boolean;
  exitCode: number | null;
  stagesPassed: number;
  stagesWarn: number;
  stagesFailed: number;
  blockers: string[];
  message: string;
}

interface PipelineReportLike {
  summary?: {
    verdict?: unknown;
    exitCode?: unknown;
    stagesPassed?: unknown;
    stagesWarn?: unknown;
    stagesFailed?: unknown;
  };
  blockingReasons?: unknown;
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeVerdict(value: unknown): GovernanceGateVerdict {
  return value === 'ready' || value === 'needs-attention' || value === 'blocked'
    ? value
    : 'unknown';
}

function collectBlockers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 12);
}

/**
 * Pure: derive a Governance Gate verdict from a parsed pipeline report. Kept
 * free of vscode so it is deterministically testable.
 */
export function summarizeGovernanceGateResult(report: unknown): GovernanceGateSummary {
  if (!report || typeof report !== 'object') {
    return {
      verdict: 'unknown',
      passed: false,
      exitCode: null,
      stagesPassed: 0,
      stagesWarn: 0,
      stagesFailed: 0,
      blockers: [],
      message: 'Governance gate result was unavailable — see the Workspai evidence output.',
    };
  }

  const typed = report as PipelineReportLike;
  const summary = typed.summary ?? {};
  const verdict = normalizeVerdict(summary.verdict);
  const stagesPassed = toCount(summary.stagesPassed);
  const stagesWarn = toCount(summary.stagesWarn);
  const stagesFailed = toCount(summary.stagesFailed);
  const blockers = collectBlockers(typed.blockingReasons);
  const exitCode = typeof summary.exitCode === 'number' ? summary.exitCode : null;

  let message: string;
  switch (verdict) {
    case 'ready':
      message = `Governance gate passed — ${stagesPassed} stage(s) green.`;
      break;
    case 'needs-attention':
      message = `Governance gate needs attention — ${stagesWarn} warning(s) across ${stagesPassed + stagesWarn + stagesFailed} stage(s).`;
      break;
    case 'blocked':
      message = `Governance gate blocked — ${stagesFailed} stage(s) failed.`;
      break;
    default:
      message = 'Governance gate verdict was indeterminate.';
      break;
  }

  return {
    verdict,
    passed: verdict === 'ready',
    exitCode,
    stagesPassed,
    stagesWarn,
    stagesFailed,
    blockers,
    message,
  };
}

async function openPipelineEvidence(workspacePath: string): Promise<void> {
  const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'pipeline-last-run.json');
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(reportPath));
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch {
    void vscode.window.showWarningMessage(
      'Governance gate report not found yet. Run the Governance Gate to generate it.'
    );
  }
}

/** Present the gate verdict: a quiet confirmation on pass, an actionable warning otherwise. */
export async function presentGovernanceGate(
  summary: GovernanceGateSummary,
  workspaceName: string,
  workspacePath: string
): Promise<void> {
  if (summary.passed) {
    void vscode.window.showInformationMessage(
      `Governance Gate — ${workspaceName}: ${summary.message}`
    );
    return;
  }

  const detail = summary.blockers.slice(0, 3).join(' · ');
  const viewReport = 'View Report';
  const choice = await vscode.window.showWarningMessage(
    `Governance Gate — ${workspaceName}: ${summary.message}${detail ? ` — ${detail}` : ''}`,
    viewReport
  );
  if (choice === viewReport) {
    await openPipelineEvidence(workspacePath);
  }
}

/**
 * Run the Governance Gate end-to-end: version-gate parity, streamed
 * `pipeline --json --strict`, then a single clear verdict. Returns the summary,
 * or `undefined` if the user cancelled the run.
 */
export async function runGovernanceGate(options: {
  workspacePath: string;
  workspaceName: string;
}): Promise<GovernanceGateSummary | undefined> {
  const versionAllowed = await gateCompatibleCliVersion({
    cwd: options.workspacePath,
    featureLabel: 'Governance Gate',
  });
  if (!versionAllowed) {
    return undefined;
  }

  const result = await runWorkspaceIntelligenceCommandWithProgress<PipelineReportLike>({
    command: ['pipeline', '--json', '--strict'],
    cwd: options.workspacePath,
    title: `Governance Gate — ${options.workspaceName}`,
    featureLabel: 'Governance Gate',
    // "blocked" exits non-zero by design under --strict; present it as a verdict.
    suppressFailureMessage: true,
  });

  if (!result) {
    return undefined;
  }

  const summary = summarizeGovernanceGateResult(result.result ?? null);
  await presentGovernanceGate(summary, options.workspaceName, options.workspacePath);
  return summary;
}
