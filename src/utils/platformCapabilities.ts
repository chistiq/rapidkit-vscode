import * as path from 'path';
import * as fs from 'fs-extra';

export type PlatformKind = 'windows' | 'linux' | 'macos' | 'other';

/** Cached npm package specifier from global link / env. Undefined = not warmed yet. */
let resolvedPackageSpecifier: string | null | undefined;

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

export function setResolvedRapidkitNpmPackageSpecifier(specifier: string | null | undefined): void {
  resolvedPackageSpecifier = specifier;
}

export function resetResolvedRapidkitNpmPackageSpecifier(): void {
  resolvedPackageSpecifier = undefined;
}

export function getResolvedRapidkitNpmPackageSpecifier(): string | null | undefined {
  return resolvedPackageSpecifier;
}

function readEnvRapidkitPackageSpecifier(): string | undefined {
  const envSpec = process.env.RAPIDKIT_NPM_PACKAGE?.trim();
  return envSpec && envSpec.length > 0 ? envSpec : undefined;
}

/**
 * npx args that resolve the npm bridge CLI.
 * Prefer unpinned `npx --yes rapidkit` (global npm link / npm exec) because bare
 * `--package rapidkit` can delegate adopt/create frontend to the Python core.
 * When a globally linked file: package exists, pin to that path for reproducibility.
 */
export function buildNpxRapidkitPrefix(): string[] {
  const envSpec = readEnvRapidkitPackageSpecifier();
  const linkedSpec =
    resolvedPackageSpecifier !== undefined && resolvedPackageSpecifier !== null
      ? resolvedPackageSpecifier
      : undefined;
  const packageSpecifier = envSpec ?? linkedSpec;

  if (packageSpecifier) {
    return ['--yes', '--package', packageSpecifier, 'rapidkit'];
  }

  return ['--yes', 'rapidkit'];
}

export async function warmRapidkitNpmPackageResolution(): Promise<void> {
  if (readEnvRapidkitPackageSpecifier()) {
    resolvedPackageSpecifier = readEnvRapidkitPackageSpecifier();
    return;
  }

  if (resolvedPackageSpecifier !== undefined) {
    return;
  }

  try {
    const { run } = await import('./exec.js');
    const result = await run('npm', ['list', '-g', 'rapidkit', '--depth=0', '--json'], {
      timeout: 8000,
      stdio: 'pipe',
    });
    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    if (!stdout.trim()) {
      resolvedPackageSpecifier = null;
      return;
    }

    const parsed = JSON.parse(stdout) as {
      dependencies?: { rapidkit?: { resolved?: string } };
    };
    const resolved = parsed.dependencies?.rapidkit?.resolved?.trim();
    if (resolved?.startsWith('file:')) {
      const filePath = resolved.slice('file:'.length);
      if (path.isAbsolute(filePath)) {
        resolvedPackageSpecifier = `file:${filePath}`;
        return;
      }

      // npm link reports a relative file: path — resolve via the global symlink target.
      const rootResult = await run('npm', ['root', '-g'], { timeout: 8000, stdio: 'pipe' });
      const npmRoot = rootResult.stdout?.trim();
      if (npmRoot) {
        const linkedPackageDir = path.join(npmRoot, 'rapidkit');
        if (await fs.pathExists(linkedPackageDir)) {
          const realPath = await fs.realpath(linkedPackageDir);
          resolvedPackageSpecifier = `file:${realPath}`;
          return;
        }
      }

      resolvedPackageSpecifier = null;
      return;
    }
  } catch {
    // Fall back to unpinned npx resolution.
  }

  resolvedPackageSpecifier = null;
}

export function buildRapidkitCommand(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  return buildShellCommand('npx', buildNpxRapidkitPrefix().concat(args), platform);
}

export function buildRapidkitDisplayCommand(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): string {
  return buildShellCommand('npx', ['rapidkit', ...args], platform);
}

export function toDisplayRapidkitCommand(command: string): string {
  return command
    .replace(/\bnpx\s+--yes\s+--package\s+[^\s]+\s+rapidkit\b/g, 'npx rapidkit')
    .replace(/\bnpx\s+--yes\s+rapidkit\b/g, 'npx rapidkit');
}

export function toPinnedRapidkitExecutionCommand(command: string): string {
  const prefix = buildShellCommand('npx', buildNpxRapidkitPrefix());
  return command.replace(/\bnpx\s+rapidkit\b/g, prefix);
}

export function buildNpxRapidkitArgs(args: string[] = []): string[] {
  return [...buildNpxRapidkitPrefix(), ...args];
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
