import * as path from 'path';

export type PlatformKind = 'windows' | 'linux' | 'macos' | 'other';

export function detectPlatformKind(platform: NodeJS.Platform = process.platform): PlatformKind {
  if (platform === 'win32') {
    return 'windows';
  }
  if (platform === 'linux') {
    return 'linux';
  }
  if (platform === 'darwin') {
    return 'macos';
  }
  return 'other';
}

export function isWindowsPlatform(platform: NodeJS.Platform = process.platform): boolean {
  return detectPlatformKind(platform) === 'windows';
}

export function quoteShellArg(arg: string, platform: NodeJS.Platform = process.platform): string {
  if (arg.length === 0) {
    return '""';
  }

  if (isWindowsPlatform(platform)) {
    if (!/[\s"^&|<>]/.test(arg)) {
      return arg;
    }
    return `"${arg.replace(/"/g, '""')}"`;
  }

  if (!/[\s'"$`\\]/.test(arg)) {
    return arg;
  }

  return `'${arg.replace(/'/g, `'"'"'`)}'`;
}

export function buildShellCommand(
  command: string,
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  const parts = [
    quoteShellArg(command, platform),
    ...args.map((arg) => quoteShellArg(arg, platform)),
  ];
  return parts.join(' ');
}

export function buildRapidkitCommand(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  // Force npm package resolution so a local rapidkit/rapidkit.cmd launcher in cwd
  // cannot shadow the npm wrapper command (notably on Windows PowerShell).
  return buildShellCommand(
    'npx',
    ['--yes', '--package', 'rapidkit', 'rapidkit', ...args],
    platform
  );
}

export function buildRapidkitDisplayCommand(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  return buildShellCommand('npx', ['rapidkit', ...args], platform);
}

export function toDisplayRapidkitCommand(command: string): string {
  return command.replace(/\bnpx\s+--yes\s+--package\s+rapidkit\s+rapidkit\b/g, 'npx rapidkit');
}

export function toPinnedRapidkitExecutionCommand(command: string): string {
  return command.replace(/\bnpx\s+rapidkit\b/g, 'npx --yes --package rapidkit rapidkit');
}

export function buildNpxRapidkitArgs(args: string[] = []): string[] {
  return ['--yes', '--package', 'rapidkit', 'rapidkit', ...args];
}

/** Non-pinned npx args for npm CLI version probes (Setup verify / status). */
export function buildNpxRapidkitVersionProbeArgs(): string[] {
  return ['--yes', 'rapidkit', '--version'];
}

/**
 * Setup "Verify CLI" terminal commands — match what developers run manually.
 * Pinned `npx --yes --package rapidkit rapidkit --version` can print the Python
 * core banner (`RapidKit Version v…`) when cwd shadows resolution; that is not
 * the npm bridge version shown on the Setup card.
 */
export function buildNpmCliVersionVerifyCommands(
  platform: NodeJS.Platform = process.platform
): string[] {
  return [
    buildRapidkitDisplayCommand(['--version'], platform),
    buildShellCommand('npm', ['list', '-g', 'rapidkit', '--depth=0'], platform),
  ];
}

export function parseNpmCliVersionOutput(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[\d]+\.[\d]+\.[\d]+(?:-[\w.]+)?$/i.test(trimmed)) {
    return trimmed;
  }

  if (/RapidKit Version/i.test(trimmed)) {
    return null;
  }

  const match = trimmed.match(/\b(\d+\.\d+\.\d+(?:-[\w.]+)?)\b/);
  return match?.[1] ?? null;
}

export function getWorkspaceVenvRapidkitCandidates(workspacePath: string): string[] {
  return [
    path.join(workspacePath, '.venv', 'bin', 'rapidkit'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.exe'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.cmd'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit'),
  ];
}
