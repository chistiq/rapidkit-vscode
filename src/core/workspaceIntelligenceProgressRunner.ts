import * as vscode from 'vscode';

import { runRapidkitStreaming, type StreamingRunResult } from './streamingRapidkitRunner';
import { shouldRefreshEvidenceForCliLogEvent } from './cliLogEventContract';

/**
 * Hook invoked after a streamed workspace intelligence run completes, so the
 * dashboard / evidence trees refresh exactly as they do on terminal close.
 * `extension.ts` registers the concrete implementation during activation; the
 * runner stays decoupled from activation globals (and trivially testable).
 */
export type WorkspaceEvidenceRefreshHandler = (workspacePath: string) => void | Promise<void>;

let evidenceRefreshHandler: WorkspaceEvidenceRefreshHandler | undefined;

export function setWorkspaceEvidenceRefreshHandler(
  handler: WorkspaceEvidenceRefreshHandler | undefined
): void {
  evidenceRefreshHandler = handler;
}

export interface RunIntelligenceCommandOptions {
  command: string[];
  cwd: string;
  /** Progress notification title, e.g. `Workspace Model — my-workspace`. */
  title: string;
  /** Human label used in failure messages, e.g. `Workspace Model`. */
  featureLabel: string;
  timeoutMs?: number;
  /**
   * Suppress the generic failure toast. Use when the caller presents its own
   * verdict (e.g. the Governance Gate treats a non-zero "blocked" exit as a
   * first-class result, not a crash). Evidence refresh still runs.
   */
  suppressFailureMessage?: boolean;
}

/**
 * Run a single workspace intelligence command programmatically with a real
 * progress notification driven by the `cli-log-event.v1` stream, a definitive
 * result from stdout, and an evidence refresh on completion (roadmap item 2.2).
 *
 * Returns the structured result, or `undefined` if the user cancelled before
 * the process produced a verdict.
 */
export async function runWorkspaceIntelligenceCommandWithProgress<T = unknown>(
  options: RunIntelligenceCommandOptions
): Promise<StreamingRunResult<T> | undefined> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Workspai: ${options.title}`,
      cancellable: true,
    },
    async (progress, token) => {
      const result = await runRapidkitStreaming<T>({
        command: options.command,
        cwd: options.cwd,
        featureLabel: options.featureLabel,
        timeoutMs: options.timeoutMs,
        onProgress: (message) => {
          if (message.trim()) {
            progress.report({ message });
          }
        },
        signal: {
          onCancelled: (listener) => token.onCancellationRequested(listener),
        },
      });

      await finalizeIntelligenceRun(options, result);
      return result;
    }
  );
}

export interface IntelligenceSequenceStep {
  command: string[];
  /** Short label shown in the progress notification, e.g. `Model`. */
  label: string;
  exitPolicy?: 'stop-on-error' | 'continue-on-structured-verdict';
}

/**
 * Intelligence-chain steps such as verify/explain exit non-zero when the
 * workspace needs attention, even though they wrote a structured artifact.
 * Treat those as verdicts, not crashes, so downstream chain steps still run.
 */
export function isIntelligenceChainVerdictExit(
  step: IntelligenceSequenceStep,
  result: StreamingRunResult
): boolean {
  if (!result.failed) {
    return false;
  }
  if (step.exitPolicy === 'stop-on-error') {
    return false;
  }
  if (
    step.exitPolicy !== 'continue-on-structured-verdict' &&
    ![
      'Doctor Evidence',
      'Contract Evidence',
      'Readiness Evidence',
      'Verify',
      'Explain',
      'Why',
    ].includes(step.label)
  ) {
    return false;
  }
  const payload = result.result as Record<string, unknown> | null | undefined;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const outputPath = payload.outputPath;
  if (typeof outputPath === 'string' && outputPath.trim().length > 0) {
    return true;
  }
  const evidencePath = payload.evidencePath;
  if (typeof evidencePath === 'string' && evidencePath.trim().length > 0) {
    return true;
  }
  if (
    ['Doctor Evidence', 'Readiness Evidence'].includes(step.label) &&
    typeof payload.generatedAt === 'string'
  ) {
    return true;
  }
  if (step.label === 'Verify' && payload.summary != null && payload.gate != null) {
    return true;
  }
  return false;
}

function intelligenceChainVerdictDetail(
  step: IntelligenceSequenceStep,
  result: StreamingRunResult
): string | undefined {
  const payload = result.result as Record<string, unknown> | null | undefined;
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  if (step.label === 'Verify') {
    const summary = payload.summary as Record<string, unknown> | undefined;
    const verdict = typeof summary?.verdict === 'string' ? summary.verdict : undefined;
    if (verdict) {
      return `verify reported ${verdict.replace(/-/g, ' ')} (exit ${result.exitCode}) — continuing chain`;
    }
  }
  if (typeof payload.summary === 'string' && payload.summary.trim()) {
    return `${step.label} completed with attention (exit ${result.exitCode}) — continuing chain`;
  }
  return `${step.label} wrote evidence (exit ${result.exitCode}) — continuing chain`;
}

export interface RunIntelligenceSequenceOptions {
  steps: IntelligenceSequenceStep[];
  cwd: string;
  title: string;
  timeoutMs?: number;
}

/**
 * Run an ordered chain of workspace intelligence commands inside a single
 * progress notification, streaming each step's `cli-log-event.v1` events. Stops
 * at the first failing step (downstream steps depend on upstream evidence) and
 * refreshes evidence once at the end (roadmap item 2.2).
 */
export async function runWorkspaceIntelligenceSequenceWithProgress(
  options: RunIntelligenceSequenceOptions
): Promise<StreamingRunResult[]> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Workspai: ${options.title}`,
      cancellable: true,
    },
    async (progress, token) => {
      const results: StreamingRunResult[] = [];
      const total = options.steps.length;

      for (let index = 0; index < total; index += 1) {
        if (token.isCancellationRequested) {
          break;
        }
        const step = options.steps[index];
        progress.report({ message: `${index + 1}/${total} ${step.label}…` });

        const result = await runRapidkitStreaming({
          command: step.command,
          cwd: options.cwd,
          featureLabel: step.label,
          timeoutMs: options.timeoutMs,
          onProgress: (message) => {
            if (message.trim()) {
              progress.report({ message: `${index + 1}/${total} ${step.label}: ${message}` });
            }
          },
          signal: {
            onCancelled: (listener) => token.onCancellationRequested(listener),
          },
        });
        results.push(result);

        if (result.failed && !isIntelligenceChainVerdictExit(step, result)) {
          const detail =
            result.lastLifecycleEvent?.message?.trim() ||
            result.stderr.trim().split('\n').filter(Boolean).pop() ||
            `exited with code ${result.exitCode}`;
          void vscode.window.showErrorMessage(`${step.label} failed: ${detail}`);
          break;
        }

        if (result.failed && isIntelligenceChainVerdictExit(step, result)) {
          const detail = intelligenceChainVerdictDetail(step, result);
          if (detail) {
            void vscode.window.showWarningMessage(detail);
          }
        }
      }

      if (evidenceRefreshHandler && results.some((result) => !result.failed)) {
        await evidenceRefreshHandler(options.cwd);
      }
      return results;
    }
  );
}

async function finalizeIntelligenceRun(
  options: RunIntelligenceCommandOptions,
  result: StreamingRunResult
): Promise<void> {
  const lifecycle = result.lastLifecycleEvent;

  if (result.failed && !options.suppressFailureMessage) {
    const detail =
      lifecycle?.message?.trim() ||
      result.stderr.trim().split('\n').filter(Boolean).pop() ||
      `exited with code ${result.exitCode}`;
    void vscode.window.showErrorMessage(`${options.featureLabel} failed: ${detail}`);
  }

  // Refresh evidence surfaces when the run produced workspace evidence — the
  // same condition the terminal-close path uses, now driven by the definitive
  // lifecycle event instead of a closed terminal.
  const shouldRefresh = lifecycle ? shouldRefreshEvidenceForCliLogEvent(lifecycle) : !result.failed;
  if (shouldRefresh && evidenceRefreshHandler) {
    await evidenceRefreshHandler(options.cwd);
  }
}
