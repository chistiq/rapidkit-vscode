import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

export type PlatformKind = 'windows' | 'linux' | 'macos' | 'other';

export type RapidkitExecutionSpec = {
  command: string;
  args: string[];
  displayCommand: string;
  shell: boolean;
};

export type PackageRunnerInvocation = {
  command: string;
  prefixArgs: string[];
};

export type InstalledNpmPackageMetadata = {
  name: string;
  version: string;
  manifestPath: string;
  source: 'workspace' | 'global';
};

/** Cached npm package specifier from global link / env. Undefined = not warmed yet. */
let resolvedPackageSpecifier: string | null | undefined;

const WORKSPAI_NPM_PACKAGE = 'workspai';
const WORKSPAI_NPM_BINARY = 'workspai';

const PACKAGE_RUNNER_COMMANDS = new Set(['npx', 'npm', 'yarn', 'pnpm']);

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

function packageRunnerCliBasename(command: string): string {
  return command === 'npx' ? 'npx-cli.js' : 'npm-cli.js';
}

function npmExecPathCandidate(command: string, env: NodeJS.ProcessEnv): string | null {
  const execPath = env.npm_execpath;
  if (!execPath) {
    return null;
  }

  const basename = path.basename(execPath).toLowerCase();
  if (command === 'npx' && basename !== 'npx-cli.js') {
    const sibling = path.join(path.dirname(execPath), 'npx-cli.js');
    return fs.existsSync(sibling) ? sibling : null;
  }
  if (command === 'npm' && basename === 'npx-cli.js') {
    const sibling = path.join(path.dirname(execPath), 'npm-cli.js');
    return fs.existsSync(sibling) ? sibling : null;
  }
  return fs.existsSync(execPath) ? execPath : null;
}

function wellKnownPackageRunnerCliCandidates(command: string): string[] {
  if (command !== 'npm' && command !== 'npx') {
    return [];
  }

  const cli = packageRunnerCliBasename(command);
  const nodeBinDir = path.dirname(process.execPath);
  const prefix = path.dirname(nodeBinDir);

  return [
    path.join(prefix, 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join(prefix, 'lib64', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'local', 'lib', 'node_modules', 'npm', 'bin', cli),
    path.join('/usr', 'share', 'nodejs', 'npm', 'bin', cli),
  ];
}

export function resolvePackageRunnerInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): PackageRunnerInvocation {
  const normalized = command.trim();
  if (!PACKAGE_RUNNER_COMMANDS.has(normalized)) {
    return { command: normalized, prefixArgs: [] };
  }

  const nodeBinDir = path.dirname(process.execPath);
  const extension = isWindowsPlatform(platform) ? '.cmd' : '';
  const candidates = [
    path.join(nodeBinDir, `${normalized}${extension}`),
    path.join(nodeBinDir, normalized),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { command: candidate, prefixArgs: [] };
    }
  }

  const npmExecPath = npmExecPathCandidate(normalized, env);
  if (npmExecPath) {
    return { command: process.execPath, prefixArgs: [npmExecPath] };
  }

  for (const candidate of wellKnownPackageRunnerCliCandidates(normalized)) {
    if (fs.existsSync(candidate)) {
      return { command: process.execPath, prefixArgs: [candidate] };
    }
  }

  if (normalized === 'npm') {
    return { command: 'corepack', prefixArgs: ['npm'] };
  }

  return { command: normalized, prefixArgs: [] };
}

function existingPackageRunnerAt(
  binDir: string,
  command: string,
  platform: NodeJS.Platform
): string | null {
  if (!binDir.trim()) {
    return null;
  }
  const extensions = isWindowsPlatform(platform) ? ['.cmd', '.exe', ''] : [''];
  for (const extension of extensions) {
    const candidate = path.join(binDir, `${command}${extension}`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function childDirectories(root: string): string[] {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
}

function readInstalledNpmPackageMetadata(
  manifestPath: string,
  packageName: string,
  source: InstalledNpmPackageMetadata['source']
): InstalledNpmPackageMetadata | null {
  try {
    const manifest = fs.readJsonSync(manifestPath) as {
      name?: unknown;
      version?: unknown;
    };
    if (
      manifest.name !== packageName ||
      typeof manifest.version !== 'string' ||
      !manifest.version.trim()
    ) {
      return null;
    }
    return {
      name: packageName,
      version: manifest.version.trim(),
      manifestPath,
      source,
    };
  } catch {
    return null;
  }
}

/**
 * Discover installed npm package metadata without spawning npm or contacting a
 * registry. This is the activation-safe source of truth for version gates when
 * the VS Code Extension Host inherited a stale PATH from before nvm/fnm/asdf
 * initialized the user's shell.
 */
export function discoverInstalledNpmPackages(
  packageName: string,
  options: {
    cwd?: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    homeDir?: string;
  } = {}
): InstalledNpmPackageMetadata[] {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const manifests: Array<{
    path: string;
    source: InstalledNpmPackageMetadata['source'];
  }> = [];
  const seenManifestPaths = new Set<string>();
  const addManifest = (
    manifestPath: string,
    source: InstalledNpmPackageMetadata['source']
  ): void => {
    const normalized = path.normalize(manifestPath);
    if (!seenManifestPaths.has(normalized)) {
      seenManifestPaths.add(normalized);
      manifests.push({ path: normalized, source });
    }
  };
  const addGlobalRoot = (root: string | undefined): void => {
    if (root?.trim()) {
      addManifest(path.join(root.trim(), packageName, 'package.json'), 'global');
    }
  };
  const addPrefix = (prefix: string | undefined): void => {
    if (!prefix?.trim()) {
      return;
    }
    addGlobalRoot(path.join(prefix.trim(), 'lib', 'node_modules'));
    addGlobalRoot(path.join(prefix.trim(), 'lib64', 'node_modules'));
    addGlobalRoot(path.join(prefix.trim(), 'node_modules'));
  };

  if (options.cwd?.trim()) {
    let current = path.resolve(options.cwd);
    let previous = '';
    while (current !== previous) {
      addManifest(path.join(current, 'node_modules', packageName, 'package.json'), 'workspace');
      previous = current;
      current = path.dirname(current);
    }
  }

  addPrefix(env.npm_config_prefix);
  addPrefix(env.NVM_BIN ? path.dirname(env.NVM_BIN) : undefined);
  addPrefix(path.dirname(path.dirname(process.execPath)));

  for (const versionDir of childDirectories(path.join(homeDir, '.nvm', 'versions', 'node'))) {
    addPrefix(versionDir);
  }
  for (const versionDir of childDirectories(
    path.join(homeDir, '.local', 'share', 'fnm', 'node-versions')
  )) {
    addPrefix(path.join(versionDir, 'installation'));
  }

  addGlobalRoot(
    path.join(homeDir, '.volta', 'tools', 'image', 'packages', packageName, 'lib', 'node_modules')
  );
  addGlobalRoot(path.join('/usr', 'local', 'lib', 'node_modules'));
  addGlobalRoot(path.join('/usr', 'lib', 'node_modules'));
  if (isWindowsPlatform(platform)) {
    addGlobalRoot(env.APPDATA ? path.join(env.APPDATA, 'npm', 'node_modules') : undefined);
    addPrefix(env.NVM_SYMLINK);
  }

  for (const invocation of discoverPackageRunnerInvocations('npm', platform, env, homeDir)) {
    if (path.isAbsolute(invocation.command)) {
      addPrefix(path.dirname(path.dirname(invocation.command)));
    }
  }

  return manifests
    .map((candidate) =>
      readInstalledNpmPackageMetadata(candidate.path, packageName, candidate.source)
    )
    .filter((candidate): candidate is InstalledNpmPackageMetadata => candidate !== null);
}

/**
 * Resolve package runners beyond the Extension Host PATH.
 *
 * VS Code commonly starts before nvm/fnm/asdf modifies the interactive shell.
 * The first result remains the canonical invocation; remaining candidates are
 * bounded, read-only probes of well-known version-manager installations.
 */
export function discoverPackageRunnerInvocations(
  command: 'npm' | 'npx',
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir()
): PackageRunnerInvocation[] {
  const invocations: PackageRunnerInvocation[] = [
    resolvePackageRunnerInvocation(command, platform, env),
  ];
  const binDirectories = new Set<string>();
  const addBin = (value: string | undefined): void => {
    if (value?.trim()) {
      binDirectories.add(value.trim());
    }
  };

  addBin(env.NVM_BIN);
  addBin(env.FNM_MULTISHELL_PATH);
  addBin(env.VOLTA_HOME ? path.join(env.VOLTA_HOME, 'bin') : undefined);
  addBin(env.NVM_SYMLINK);
  addBin(path.join(homeDir, '.volta', 'bin'));
  addBin(path.join(homeDir, '.asdf', 'shims'));
  addBin(path.join(homeDir, '.local', 'bin'));

  for (const nodeVersionDir of childDirectories(path.join(homeDir, '.nvm', 'versions', 'node'))) {
    addBin(path.join(nodeVersionDir, 'bin'));
  }
  for (const nodeVersionDir of childDirectories(
    path.join(homeDir, '.local', 'share', 'fnm', 'node-versions')
  )) {
    addBin(path.join(nodeVersionDir, 'installation', 'bin'));
  }

  for (const binDir of binDirectories) {
    const executable = existingPackageRunnerAt(binDir, command, platform);
    if (executable) {
      invocations.push({ command: executable, prefixArgs: [] });
    }
  }

  const seen = new Set<string>();
  return invocations.filter((invocation) => {
    const key = `${invocation.command}\0${invocation.prefixArgs.join('\0')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function discoverPythonExecutableCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = os.homedir()
): string[] {
  const candidates: string[] = [];
  const add = (value: string | undefined): void => {
    if (value?.trim() && fs.existsSync(value.trim())) {
      candidates.push(value.trim());
    }
  };

  const pyenvRoots = new Set<string>([
    ...(env.PYENV_ROOT?.trim() ? [env.PYENV_ROOT.trim()] : []),
    path.join(homeDir, '.pyenv'),
  ]);

  if (isWindowsPlatform(platform)) {
    for (const root of pyenvRoots) {
      add(path.join(root, 'pyenv-win', 'shims', 'python.exe'));
      add(path.join(root, 'shims', 'python.exe'));
      for (const versionDir of childDirectories(path.join(root, 'versions'))) {
        add(path.join(versionDir, 'python.exe'));
      }
    }
    add(path.join(homeDir, '.asdf', 'shims', 'python.exe'));
  } else {
    for (const root of pyenvRoots) {
      add(path.join(root, 'shims', 'python'));
      for (const versionDir of childDirectories(path.join(root, 'versions'))) {
        add(path.join(versionDir, 'bin', 'python'));
        add(path.join(versionDir, 'bin', 'python3'));
      }
    }
    add(path.join(homeDir, '.asdf', 'shims', 'python'));
    add(path.join(homeDir, '.local', 'bin', 'python'));
    add(path.join(homeDir, '.local', 'bin', 'python3'));
  }

  return [...new Set(candidates)];
}

export function buildPackageRunnerInvocationEnv(
  invocation: PackageRunnerInvocation,
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const env = buildPackageRunnerSubprocessEnv(baseEnv, platform);
  const executableDir =
    invocation.command.includes('/') || invocation.command.includes('\\')
      ? path.dirname(invocation.command)
      : undefined;
  if (!executableDir) {
    return env;
  }
  const delimiter = isWindowsPlatform(platform) ? ';' : ':';
  const entries = (env.PATH ?? '').split(delimiter).filter(Boolean);
  if (!entries.includes(executableDir)) {
    entries.unshift(executableDir);
  }
  return { ...env, PATH: entries.join(delimiter) };
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
  const envSpec =
    process.env.WORKSPAI_NPM_PACKAGE?.trim() ?? process.env.RAPIDKIT_NPM_PACKAGE?.trim();
  return envSpec && envSpec.length > 0 ? envSpec : undefined;
}

/**
 * npx args that resolve the npm bridge CLI.
 * Resolve the registry package explicitly so ambient global npm links cannot leak
 * mutable development builds into extension-host commands.
 */
export function buildNpxRapidkitPrefix(): string[] {
  const envSpec = readEnvRapidkitPackageSpecifier();
  const packageSpecifier = envSpec ?? WORKSPAI_NPM_PACKAGE;
  return ['--yes', '--package', packageSpecifier, WORKSPAI_NPM_BINARY];
}

export async function warmRapidkitNpmPackageResolution(): Promise<void> {
  resolvedPackageSpecifier = readEnvRapidkitPackageSpecifier() ?? null;
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
  return buildShellCommand('npx', [WORKSPAI_NPM_BINARY, ...args], platform);
}

export function toDisplayRapidkitCommand(command: string): string {
  return command
    .replace(/\bnpx\s+--yes\s+--package\s+[^\s]+\s+workspai\b/g, 'npx workspai')
    .replace(/\bnpx\s+--yes\s+workspai\b/g, 'npx workspai');
}

export function toPinnedRapidkitExecutionCommand(command: string): string {
  const prefix = buildShellCommand('npx', buildNpxRapidkitPrefix());
  return command.replace(/\bnpx\s+workspai\b/g, prefix);
}

export function buildNpxRapidkitArgs(args: string[] = []): string[] {
  return [...buildNpxRapidkitPrefix(), ...args];
}

/**
 * Canonical subprocess contract for extension-host RapidKit execution.
 *
 * Callers pass only Workspai CLI args (`['workspace', 'verify', ...]`); this
 * function supplies the npm wrapper, display-safe command text, and the
 * platform shell mode in one place so enterprise paths do not rebuild npx
 * invocations ad hoc.
 */
export function buildRapidkitExecutionSpec(
  args: string[] = [],
  platform: NodeJS.Platform = process.platform
): RapidkitExecutionSpec {
  const invocation = resolvePackageRunnerInvocation('npx', platform);
  return {
    command: invocation.command,
    args: [...invocation.prefixArgs, ...buildNpxRapidkitArgs(args)],
    displayCommand: buildRapidkitDisplayCommand(args, platform),
    shell: isWindowsPlatform(platform),
  };
}

/** Ensure subprocesses spawned from the extension host can find npx/npm (nvm, fnm, etc.). */
export function augmentPathWithNodeBin(
  pathEnv?: string,
  platform: NodeJS.Platform = process.platform
): string {
  const delimiter = isWindowsPlatform(platform) ? ';' : ':';
  const nodeBin = path.dirname(process.execPath);
  const parts = (pathEnv ?? process.env.PATH ?? '').split(delimiter).filter(Boolean);
  if (!parts.includes(nodeBin)) {
    parts.unshift(nodeBin);
  }
  return parts.join(delimiter);
}

/** Env for extension-host package runner subprocesses. */
export function buildPackageRunnerSubprocessEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PATH: augmentPathWithNodeBin(baseEnv.PATH, platform),
    COREPACK_HOME: baseEnv.COREPACK_HOME ?? path.join(os.tmpdir(), 'rapidkit-corepack'),
  };

  delete env.npm_config_package;
  delete env.npm_config__package;
  return env;
}

/** Non-pinned npx args for npm CLI version probes (Setup verify / status). */
export function buildNpxRapidkitVersionProbeArgs(): string[] {
  return ['--yes', WORKSPAI_NPM_BINARY, '--version'];
}

/**
 * Setup "Verify CLI" terminal commands — match what developers run manually.
 * The npm package and Python Core use different binaries. Setup verifies the
 * Workspai npm CLI and reports its package version.
 */
export function buildNpmCliVersionVerifyCommands(
  platform: NodeJS.Platform = process.platform
): string[] {
  return [
    buildRapidkitDisplayCommand(['--version'], platform),
    buildShellCommand('npm', ['list', '-g', WORKSPAI_NPM_PACKAGE, '--depth=0'], platform),
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

export function parseGlobalNpmPackageVersionOutput(
  stdout: string,
  packageName: string = WORKSPAI_NPM_PACKAGE
): string | null {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stdout.match(
    new RegExp(`(?:^|\\s|[└├─])${escapedPackage}@(\\d+\\.\\d+\\.\\d+(?:-[\\w.]+)?)\\b`, 'm')
  );
  return match?.[1] ?? null;
}

export function parseRapidkitCoreVersion(value: string): string | null {
  const match = value.trim().match(/\bv?(\d+\.\d+\.\d+(?:(?:rc|a|b)\d+)?)\b/i);
  return match?.[1] ?? null;
}

export function parsePipxRapidkitCoreVersion(value: string): string | null {
  const packageLine = value.match(
    /\bpackage\s+rapidkit-core\s+(v?\d+\.\d+\.\d+(?:(?:rc|a|b)\d+)?)\b/i
  );
  return packageLine ? parseRapidkitCoreVersion(packageLine[1]) : null;
}

export function getWorkspaceVenvRapidkitCandidates(workspacePath: string): string[] {
  return [
    path.join(workspacePath, '.venv', 'bin', 'rapidkit'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.exe'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit.cmd'),
    path.join(workspacePath, '.venv', 'Scripts', 'rapidkit'),
  ];
}
