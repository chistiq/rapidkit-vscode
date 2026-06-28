import * as vscode from 'vscode';

import { run } from '../utils/exec';
import { buildRapidkitExecutionSpec } from '../utils/platformCapabilities';
import { runShellCommandInTerminal } from '../utils/terminalExecutor';
import { parseTrailingJson } from './canonicalProjectLifecycle';
import { fetchRuntimeCommandSurface } from './runtimeCommandSurface';
import {
  assessCliVersion,
  formatCliVersionMismatchMessage,
  type CliVersionAssessment,
} from './cliVersionPolicy';

const SEMVER_TOKEN = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/;

/**
 * Resolve the linked rapidkit CLI version. Prefers the structured
 * `commands --json` surface (already cached from capability detection); falls
 * back to `--version --json` (`rapidkit-version-v1`) and then a bare
 * `--version` string. Returns `null` when no version can be detected.
 */
export async function resolveLinkedCliVersion(cwd?: string): Promise<string | null> {
  const surface = await fetchRuntimeCommandSurface({ cwd });
  if (surface?.version) {
    return surface.version;
  }

  try {
    const execution = buildRapidkitExecutionSpec(['--version', '--json']);
    const result = await run(execution.command, execution.args, {
      cwd,
      shell: execution.shell,
      timeout: 15_000,
    });
    if (result.exitCode === 0) {
      const parsed = parseTrailingJson<{ version?: unknown }>(result.stdout ?? '');
      if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
        return parsed.version.trim();
      }
      const token = (result.stdout ?? '').match(SEMVER_TOKEN);
      if (token) {
        return token[0];
      }
    }
  } catch {
    // fall through to null
  }

  return null;
}

export interface CliVersionGateDecision {
  assessment: CliVersionAssessment;
  /** True when the user should be warned (incompatible and not yet warned). */
  shouldWarn: boolean;
}

/**
 * Pure gate decision: combine the assessment with the once-per-session guard.
 * Separated from the banner so it is deterministically testable.
 */
export function decideCliVersionGate(
  assessment: CliVersionAssessment,
  options: { alreadyWarned: boolean; force?: boolean }
): CliVersionGateDecision {
  const incompatible = assessment.status !== 'compatible';
  const shouldWarn = incompatible && (options.force === true || !options.alreadyWarned);
  return { assessment, shouldWarn };
}

let warnedThisSession = false;

/** Test/reset helper. */
export function resetCliVersionGateSession(): void {
  warnedThisSession = false;
}

/**
 * Runtime CLI version notice: detect the linked CLI version, compare against
 * {@link import('./cliVersionPolicy').MIN_RAPIDKIT_CLI_VERSION}, and surface a
 * mismatch banner with an "Update CLI" action. This is intentionally usable for
 * activation/read-only contexts. Enterprise workflows must use
 * {@link gateCompatibleCliVersion} so incompatible CLIs fail closed.
 */
export async function presentCliVersionGate(options?: {
  cwd?: string;
  force?: boolean;
}): Promise<CliVersionAssessment> {
  const version = await resolveLinkedCliVersion(options?.cwd);
  const assessment = assessCliVersion(version);
  const { shouldWarn } = decideCliVersionGate(assessment, {
    alreadyWarned: warnedThisSession,
    force: options?.force,
  });

  if (!shouldWarn) {
    return assessment;
  }
  warnedThisSession = true;

  const message = formatCliVersionMismatchMessage(assessment);
  const choice = await vscode.window.showWarningMessage(
    message,
    'Update CLI',
    'Open Setup Recovery'
  );

  if (choice === 'Update CLI') {
    runShellCommandInTerminal({
      name: 'Workspai: Update RapidKit CLI',
      cwd: options?.cwd,
      command: 'npm',
      args: ['install', '-g', 'rapidkit@latest'],
    });
  } else if (choice === 'Open Setup Recovery') {
    await vscode.commands.executeCommand('workspai.openSetup');
  }

  return assessment;
}

export async function gateCompatibleCliVersion(options: {
  cwd?: string;
  featureLabel: string;
}): Promise<boolean> {
  const version = await resolveLinkedCliVersion(options.cwd);
  const assessment = assessCliVersion(version);
  if (assessment.status === 'compatible') {
    return true;
  }

  const message = `${options.featureLabel} is blocked because ${formatCliVersionMismatchMessage(assessment)}`;
  const choice = await vscode.window.showErrorMessage(message, 'Update CLI', 'Open Setup Recovery');

  if (choice === 'Update CLI') {
    runShellCommandInTerminal({
      name: 'Workspai: Update RapidKit CLI',
      cwd: options.cwd,
      command: 'npm',
      args: ['install', '-g', 'rapidkit@latest'],
    });
  } else if (choice === 'Open Setup Recovery') {
    await vscode.commands.executeCommand('workspai.openSetup');
  }

  return false;
}
