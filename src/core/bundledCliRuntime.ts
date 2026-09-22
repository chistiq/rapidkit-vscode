import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import releasePolicy from '../../contracts/extension-cli-release-policy.v1.json';

export type BundledCliRuntimeFailureCode =
  | 'runtime-missing'
  | 'runtime-incompatible'
  | 'runtime-corrupt'
  | 'runtime-unsupported-host';

export class BundledCliRuntimeError extends Error {
  constructor(
    readonly code: BundledCliRuntimeFailureCode,
    message: string
  ) {
    super(message);
    this.name = 'BundledCliRuntimeError';
  }
}

type RuntimeManifestFile = {
  path: string;
  size: number;
  sha256: string;
};

type RuntimeManifest = {
  schemaVersion: 'workspai-vscode-bundled-cli-runtime.v1';
  channel: 'release' | 'local-candidate';
  distribution: 'release' | 'development-host' | 'local-vsix';
  cli: { name: 'workspai'; version: string };
  entry: string;
  terminal: { bin: 'terminal-bin'; command: 'workspai' };
  integrity: 'sha256';
  files: RuntimeManifestFile[];
};

export type BundledCliRuntime = {
  root: string;
  entry: string;
  version: string;
  channel: 'release' | 'local-candidate';
  distribution: 'release' | 'development-host' | 'local-vsix';
  command: string;
  argsPrefix: string[];
  terminalBin: string;
  terminalCommand: 'workspai';
  env: NodeJS.ProcessEnv;
};

let verifiedRuntime: BundledCliRuntime | null | undefined;
let acquiredRuntime: BundledCliRuntime | undefined;
let acquisitionFailure: BundledCliRuntimeError | undefined;
let terminalStorageRoot: string | undefined;
const stagedTerminalBins = new Set<string>();

/**
 * Remember a CLI runtime that was downloaded into extension storage.
 * Later resolutions use this copy and do not fall back to another install.
 */
export function rememberAcquiredCliRuntime(runtime: BundledCliRuntime): void {
  acquiredRuntime = runtime;
  acquisitionFailure = undefined;
  verifiedRuntime = runtime;
}

export function rememberAcquiredCliRuntimeFailure(error: BundledCliRuntimeError): void {
  acquiredRuntime = undefined;
  acquisitionFailure = error;
  verifiedRuntime = undefined;
}

/**
 * Bind terminal launcher materialization to VS Code's extension-owned storage.
 * VSIX extraction does not preserve POSIX executable bits, so the verified
 * launcher templates must be copied into writable storage before use.
 */
export function configureBundledCliRuntimeStorage(storageRoot: string): void {
  terminalStorageRoot = path.resolve(storageRoot);
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function containedFile(root: string, relativePath: string): string {
  const absolutePath = path.resolve(root, relativePath);
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new BundledCliRuntimeError(
      'runtime-corrupt',
      'The bundled Workspai CLI manifest contains an unsafe file path.'
    );
  }
  return absolutePath;
}

function listRuntimeFiles(root: string, directory = root): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new BundledCliRuntimeError(
        'runtime-corrupt',
        'The bundled Workspai CLI runtime contains an unexpected symbolic link.'
      );
    }
    if (entry.isDirectory()) {
      files.push(...listRuntimeFiles(root, absolutePath));
    } else if (entry.isFile()) {
      const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
      if (relativePath !== 'manifest.json') {
        files.push(relativePath);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function hashFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stageTerminalBin(root: string, manifest: RuntimeManifest): string {
  const sourceBin = containedFile(root, manifest.terminal.bin);
  const parentRoot = terminalStorageRoot
    ? path.join(terminalStorageRoot, 'cli-terminal')
    : path.join(os.tmpdir(), 'workspai-vscode-cli-terminal');

  try {
    fs.mkdirSync(parentRoot, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') {
      fs.chmodSync(parentRoot, 0o700);
    }
    const stagedBin = fs.mkdtempSync(
      path.join(parentRoot, `${manifest.cli.version}-${manifest.channel}-`)
    );
    if (process.platform !== 'win32') {
      fs.chmodSync(stagedBin, 0o700);
    }

    for (const launcherName of ['workspai', 'workspai.cmd'] as const) {
      const source = path.join(sourceBin, launcherName);
      const target = path.join(stagedBin, launcherName);
      fs.copyFileSync(source, target);
      if (process.platform !== 'win32') {
        fs.chmodSync(target, launcherName === 'workspai' ? 0o700 : 0o600);
      }
      if (hashFile(source) !== hashFile(target)) {
        throw new Error(`Staged terminal launcher integrity failed for ${launcherName}.`);
      }
    }

    stagedTerminalBins.add(stagedBin);
    return stagedBin;
  } catch (error) {
    throw new BundledCliRuntimeError(
      'runtime-corrupt',
      `The verified Workspai terminal launcher could not be prepared safely: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function runtimeRootCandidate(): string | null {
  if (process.env.WORKSPAI_DISABLE_BUNDLED_CLI === '1') {
    return null;
  }
  const override = process.env.WORKSPAI_BUNDLED_CLI_ROOT?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(__dirname, 'workspai-runtime');
}

function parseManifest(root: string): RuntimeManifest {
  const manifestPath = path.join(root, 'manifest.json');
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as RuntimeManifest;
  } catch {
    throw new BundledCliRuntimeError(
      'runtime-corrupt',
      'The bundled Workspai CLI integrity manifest is missing or unreadable.'
    );
  }
}

function assertSupportedHost(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
  if (!Number.isFinite(major) || major < 20) {
    throw new BundledCliRuntimeError(
      'runtime-unsupported-host',
      'This VS Code runtime cannot host the bundled Workspai CLI. VS Code 1.106 or newer is required.'
    );
  }
}

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function versionAtLeast(candidate: string, minimum: string): boolean {
  const left = parseVersion(candidate);
  const right = parseVersion(minimum);
  if (!left || !right) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] > right[index];
    }
  }
  return !candidate.includes('-') || minimum.includes('-');
}

function verifyRuntime(root: string): BundledCliRuntime {
  assertSupportedHost();
  const manifest = parseManifest(root);
  const expectedVersion = releasePolicy.verifiedCliVersion;
  const localCandidateAllowed = process.env.WORKSPAI_ALLOW_LOCAL_CLI_CANDIDATE === '1';
  const releaseCompatible =
    manifest.channel === 'release' &&
    manifest.distribution === 'release' &&
    manifest.cli?.version === expectedVersion;
  const localCandidateCompatible =
    manifest.channel === 'local-candidate' &&
    (localCandidateAllowed || manifest.distribution === 'local-vsix') &&
    (manifest.distribution === 'development-host' || manifest.distribution === 'local-vsix') &&
    versionAtLeast(manifest.cli?.version ?? '', releasePolicy.minimumCliVersion);
  if (
    manifest.schemaVersion !== 'workspai-vscode-bundled-cli-runtime.v1' ||
    manifest.integrity !== 'sha256' ||
    manifest.cli?.name !== 'workspai' ||
    manifest.terminal?.bin !== 'terminal-bin' ||
    manifest.terminal?.command !== 'workspai' ||
    (!releaseCompatible && !localCandidateCompatible) ||
    !Array.isArray(manifest.files)
  ) {
    throw new BundledCliRuntimeError(
      'runtime-incompatible',
      manifest.channel === 'local-candidate' &&
        !localCandidateAllowed &&
        manifest.distribution !== 'local-vsix'
        ? 'A local Workspai CLI candidate is present, but this extension host did not explicitly enable the development channel.'
        : `The extension requires its verified Workspai CLI ${expectedVersion} runtime.`
    );
  }

  const declaredPaths = manifest.files
    .map((entry) => normalizeRelativePath(entry.path))
    .sort((left, right) => left.localeCompare(right));
  const actualPaths = listRuntimeFiles(root);
  if (JSON.stringify(declaredPaths) !== JSON.stringify(actualPaths)) {
    throw new BundledCliRuntimeError(
      'runtime-corrupt',
      'The bundled Workspai CLI file inventory failed integrity verification.'
    );
  }

  for (const entry of manifest.files) {
    const filePath = containedFile(root, entry.path);
    const stat = fs.lstatSync(filePath);
    if (
      !stat.isFile() ||
      stat.size !== entry.size ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      hashFile(filePath) !== entry.sha256
    ) {
      throw new BundledCliRuntimeError(
        'runtime-corrupt',
        `The bundled Workspai CLI failed integrity verification for ${entry.path}.`
      );
    }
  }

  const entry = containedFile(root, manifest.entry);
  if (!declaredPaths.includes(normalizeRelativePath(manifest.entry))) {
    throw new BundledCliRuntimeError(
      'runtime-corrupt',
      'The bundled Workspai CLI entry is not integrity-bound.'
    );
  }
  const packagedTerminalBin = path.resolve(root, manifest.terminal.bin);
  const terminalRelative = path.relative(root, packagedTerminalBin);
  if (
    terminalRelative.startsWith('..') ||
    path.isAbsolute(terminalRelative) ||
    !fs.existsSync(packagedTerminalBin) ||
    !fs.statSync(packagedTerminalBin).isDirectory() ||
    !declaredPaths.includes('terminal-bin/workspai') ||
    !declaredPaths.includes('terminal-bin/workspai.cmd')
  ) {
    throw new BundledCliRuntimeError(
      'runtime-corrupt',
      'The bundled Workspai CLI terminal launcher is missing or unsafe.'
    );
  }
  const terminalBin = stageTerminalBin(root, manifest);

  return {
    root,
    entry,
    version: manifest.cli.version,
    channel: manifest.channel,
    distribution: manifest.distribution,
    command: process.execPath,
    argsPrefix: [entry],
    terminalBin,
    terminalCommand: manifest.terminal.command,
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      WORKSPAI_EXTENSION_RUNTIME: '1',
      WORKSPAI_CLI_RUNTIME_CHANNEL: manifest.channel,
    },
  };
}

/**
 * Resolve and verify the CLI runtime shipped inside the VSIX.
 *
 * Source tests and unpackaged development may not have a built `dist` runtime;
 * those callers retain the explicit npm fallback. A packaged but corrupt
 * runtime fails closed and never silently changes execution authority.
 */
export function resolveBundledCliRuntime(): BundledCliRuntime | null {
  if (acquisitionFailure) {
    throw acquisitionFailure;
  }
  if (acquiredRuntime) {
    return acquiredRuntime;
  }
  if (verifiedRuntime !== undefined) {
    return verifiedRuntime;
  }
  const root = runtimeRootCandidate();
  if (!root) {
    verifiedRuntime = null;
    return null;
  }
  if (!fs.existsSync(root)) {
    const explicitlyConfigured = Boolean(process.env.WORKSPAI_BUNDLED_CLI_ROOT?.trim());
    const packagedExtension = path.basename(__dirname) === 'dist';
    if (explicitlyConfigured || packagedExtension) {
      throw new BundledCliRuntimeError(
        'runtime-missing',
        'The verified Workspai CLI runtime is missing from this extension installation.'
      );
    }
    verifiedRuntime = null;
    return null;
  }
  verifiedRuntime = verifyRuntime(root);
  return verifiedRuntime;
}

export function resetBundledCliRuntimeForTests(): void {
  verifiedRuntime = undefined;
  acquiredRuntime = undefined;
  acquisitionFailure = undefined;
  terminalStorageRoot = undefined;
  for (const stagedBin of stagedTerminalBins) {
    fs.rmSync(stagedBin, { recursive: true, force: true });
  }
  stagedTerminalBins.clear();
}
