import * as vscode from 'vscode';

import { run } from '../utils/exec';
import {
  buildPackageRunnerInvocationEnv,
  discoverInstalledNpmPackages,
  discoverPackageRunnerInvocations,
  parseGlobalNpmPackageVersionOutput,
  type InstalledNpmPackageMetadata,
} from '../utils/platformCapabilities';
import { runShellCommandInTerminal } from '../utils/terminalExecutor';
import { parseTrailingJson } from './canonicalProjectLifecycle';
import {
  assessCliVersion,
  compareSemver,
  formatCliVersionMismatchMessage,
  type CliVersionAssessment,
} from './cliVersionPolicy';

const SEMVER_TOKEN = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/;

/**
 * Resolve an installed or linked Workspai CLI version without downloading a
 * package during extension activation. Workspace-local package metadata wins;
 * then the executable PATH, version-manager package metadata, and bounded npm
 * global probes are checked. Returns `null` only after every local source has
 * been exhausted.
 */
export async function resolveLinkedCliVersion(
  cwd?: string,
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
    installedPackages?: InstalledNpmPackageMetadata[];
  } = {}
): Promise<string | null> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const installedPackages =
    options.installedPackages ??
    discoverInstalledNpmPackages('workspai', {
      cwd,
      platform,
      env,
      homeDir: options.homeDir,
    });
  const workspacePackage = installedPackages.find((entry) => entry.source === 'workspace');
  if (workspacePackage) {
    return workspacePackage.version;
  }

  try {
    const result = await run('workspai', ['--version', '--json'], {
      cwd,
      shell: platform === 'win32',
      timeout: 5_000,
      env,
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
    // Fall through to filesystem and package-manager discovery. VS Code can
    // retain a stale Extension Host PATH when Node is managed by nvm/fnm/asdf.
  }

  const globalPackageVersions = installedPackages
    .filter((entry) => entry.source === 'global')
    .map((entry) => entry.version)
    .filter((version, index, versions) => versions.indexOf(version) === index)
    .sort((left, right) => compareSemver(right, left));
  if (globalPackageVersions[0]) {
    return globalPackageVersions[0];
  }

  for (const npmInvocation of discoverPackageRunnerInvocations(
    'npm',
    platform,
    env,
    options.homeDir
  )) {
    try {
      const result = await run(
        npmInvocation.command,
        [...npmInvocation.prefixArgs, 'list', '-g', 'workspai', '--depth=0'],
        {
          cwd,
          shell: platform === 'win32',
          timeout: 5_000,
          env: buildPackageRunnerInvocationEnv(npmInvocation, env, platform),
        }
      );
      const version = parseGlobalNpmPackageVersionOutput(result.stdout ?? '');
      if (result.exitCode === 0 && version) {
        return version;
      }
    } catch {
      continue;
    }
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
      name: 'Workspai: Update CLI',
      cwd: options?.cwd,
      command: 'npm',
      args: ['install', '-g', 'workspai@latest'],
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
      name: 'Workspai: Update CLI',
      cwd: options.cwd,
      command: 'npm',
      args: ['install', '-g', 'workspai@latest'],
    });
  } else if (choice === 'Open Setup Recovery') {
    await vscode.commands.executeCommand('workspai.openSetup');
  }

  return false;
}
