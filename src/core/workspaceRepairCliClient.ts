import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';

import { run } from '../utils/exec.js';
import {
  discoverInstalledNpmPackages,
  type InstalledNpmPackageMetadata,
} from '../utils/platformCapabilities.js';
import { compareSemver, MIN_RAPIDKIT_CLI_VERSION } from './cliVersionPolicy.js';

const CLI_OPERATION_SCHEMA = 'workspai-cli-operation-result-v1';
const REPAIR_PROPOSAL_SCHEMA = 'workspai.workspace-repair-proposal.v1';
const REPAIR_TRANSACTION_SCHEMA = 'workspai.workspace-repair-transaction.v1';
const REPAIR_CAPABILITIES_SCHEMA = 'workspai.workspace-repair-capabilities.v1';
const REPAIR_CONSUMER_PROTOCOL = 'workspai.workspace-repair-consumer-protocol.v1';
const VERSION_SCHEMA = 'rapidkit-version-v1';
const MAX_PROPOSAL_BYTES = 25 * 1024 * 1024;
const MAX_REVIEW_FILE_BYTES = 1024 * 1024;
const MAX_REVIEW_DIFF_LINES = 500;
const REPAIR_STATES = new Set<string>([
  'planned',
  'awaiting-approval',
  'approved',
  'checkpointed',
  'executing',
  'verifying',
  'closed',
  'decision-required',
  'rollback-required',
  'rolling-back',
  'rolled-back',
  'failed',
  'cancelled',
]);
const REPAIR_DECISIONS = new Set<string>([
  'approve-guarded',
  'approve-invasive',
  'allow-breaking',
  'allow-force',
  'manual-repair',
  'rollback',
  'cancel',
]);

export type WorkspaceRepairTransactionState =
  | 'planned'
  | 'awaiting-approval'
  | 'approved'
  | 'checkpointed'
  | 'executing'
  | 'verifying'
  | 'closed'
  | 'decision-required'
  | 'rollback-required'
  | 'rolling-back'
  | 'rolled-back'
  | 'failed'
  | 'cancelled';

export type WorkspaceRepairDecision =
  | 'approve-guarded'
  | 'approve-invasive'
  | 'allow-breaking'
  | 'allow-force'
  | 'manual-repair'
  | 'rollback'
  | 'cancel';

export type WorkspaceRepairDecisionCause = {
  kind:
    | 'missing-executable'
    | 'unsupported-adapter'
    | 'failed-precondition'
    | 'risk-approval'
    | 'policy-exception'
    | 'source-repair-required';
  id: string;
  message: string;
  projectPath?: string;
  adapterId?: string;
  executable?: string;
};

export type WorkspaceRepairCliTransaction = {
  schemaVersion: typeof REPAIR_TRANSACTION_SCHEMA;
  transactionId: string;
  state: WorkspaceRepairTransactionState;
  target: {
    cardId: string;
    scope: 'workspace' | 'project';
    projectName?: string;
    projectPath?: string;
    blockerSignature?: string;
    actionIds: string[];
  };
  adapterEvaluations?: Array<{
    adapterId: string;
    ecosystem: string;
    projectPath: string;
    manifests: string[];
    support: 'full' | 'conditional' | 'unsupported';
    status: 'ready' | 'partial' | 'unsupported';
    requiredExecutables: string[];
    missingExecutables: string[];
    message: string;
  }>;
  checkpoint: {
    status: 'pending' | 'captured' | 'restored' | 'conflicted' | 'unavailable';
    files: Array<{
      path: string;
      existed: boolean;
      beforeHash: string | null;
      afterHash?: string | null;
      backupRef?: string;
    }>;
  };
  stages: Array<{
    id: string;
    kind: 'repair' | 'reconcile' | 'audit' | 'test' | 'build' | 'verify' | 'rollback';
    status: 'pending' | 'running' | 'passed' | 'failed' | 'blocked' | 'skipped' | 'cancelled';
    summary: string;
    changedPaths?: string[];
  }>;
  verification?: {
    status: 'passed' | 'failed' | 'not-run';
    targetStatus?: 'passed' | 'failed' | 'unknown';
    workspaceStatus?: 'passed' | 'blocked' | 'failed';
    remainingActionIds?: string[];
    artifact: '.workspai/reports/workspace-intelligence-run-last-run.json';
    exitCode: number | null;
    summary: string;
  };
  decision?: {
    reason: string;
    options: WorkspaceRepairDecision[];
    causes?: WorkspaceRepairDecisionCause[];
  };
};

export type WorkspaceRepairCliFileChange = {
  relativePath: string;
  status: 'modified' | 'added' | 'deleted';
  isNewFile?: boolean;
  beforeHash: string | null;
  afterHash: string | null;
  binary: boolean;
  stale: boolean;
  failReason?: string;
  diffLines: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string }>;
};

export type WorkspaceRepairCliExecutionResult = {
  transaction: WorkspaceRepairCliTransaction;
  changedPaths: string[];
  fileChanges: WorkspaceRepairCliFileChange[];
};

type WorkspaceRepairFileComparison = WorkspaceRepairCliFileChange & {
  originalContent?: string;
  patchedContent?: string;
};

function completedRepairMessage(transaction: WorkspaceRepairCliTransaction): string {
  if (transaction.state !== 'closed') {
    return transaction.decision?.reason ?? `Repair ended in ${transaction.state}.`;
  }
  if (transaction.verification?.workspaceStatus === 'blocked') {
    return 'Selected repair closed. Other governed workspace findings remain and are available as the next repair target.';
  }
  return transaction.verification?.summary ?? 'Repair closed after canonical verification.';
}

export type WorkspaceRepairProgress = {
  phase: 'plan' | 'approval' | 'execute' | 'complete';
  state?: WorkspaceRepairTransactionState;
  transactionId?: string;
  message: string;
};

export type WorkspaceRepairPatch = {
  relativePath: string;
  operation?: 'write' | 'delete';
  baseSha256?: string | null;
  patchedContent?: string;
};

type CliOperationResult = {
  schemaVersion: typeof CLI_OPERATION_SCHEMA;
  operation: string;
  status: 'success' | 'error';
  exitCode: number;
  artifact?: unknown;
  error?: { code: string; message: string };
};

type WorkspaiCliEntrypoint = {
  version: string;
  packageRoot: string;
  entrypoint: string;
  source: InstalledNpmPackageMetadata['source'];
  nodeExecutables: string[];
  nodeExecutable?: string;
  protocolVersion?: typeof REPAIR_CONSUMER_PROTOCOL;
};

type CliRunner = (input: {
  entrypoint: WorkspaiCliEntrypoint;
  workspacePath: string;
  args: string[];
  timeoutMs: number;
}) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function parseOperationResult(stdout: string): CliOperationResult | null {
  const trimmed = stdout.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) {
    return null;
  }
  try {
    const value = JSON.parse(trimmed.slice(first, last + 1)) as Partial<CliOperationResult>;
    return value.schemaVersion === CLI_OPERATION_SCHEMA ? (value as CliOperationResult) : null;
  } catch {
    return null;
  }
}

function asTransaction(operation: CliOperationResult): WorkspaceRepairCliTransaction {
  if (operation.status !== 'success' || !isRepairTransaction(operation.artifact)) {
    throw new Error(
      operation.error?.message ??
        `Workspai CLI returned an incompatible result for ${operation.operation}.`
    );
  }
  return operation.artifact;
}

function resolveManifestBin(manifest: {
  bin?: string | Record<string, string>;
}): string | undefined {
  if (typeof manifest.bin === 'string') {
    return manifest.bin;
  }
  if (manifest.bin && typeof manifest.bin.workspai === 'string') {
    return manifest.bin.workspai;
  }
  return undefined;
}

function nodeExecutableNames(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? ['node.exe', 'node'] : ['node', 'nodejs'];
}

function isUsableNodeExecutable(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    const stat = fs.statSync(candidate);
    if (!stat.isFile()) {
      return false;
    }
    return platform === 'win32' || (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * Resolve the real Node runtime that owns an installed npm package.
 *
 * `process.execPath` is Node in unit tests, but inside VS Code it can be the
 * Code/Electron executable. Passing a CLI JavaScript entrypoint to that binary
 * makes VS Code parse Workspai flags such as `--json` itself. The repair plane
 * therefore resolves bounded, local Node installations and never assumes that
 * the Extension Host executable is Node.
 */
export function resolveWorkspaiNodeExecutables(input: {
  manifestPath: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  processExecutable?: string;
}): string[] {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const homeDir = input.homeDir ?? os.homedir();
  const processExecutable = input.processExecutable ?? process.execPath;
  const names = nodeExecutableNames(platform);
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string | undefined): void => {
    if (!candidate?.trim()) {
      return;
    }
    const normalized = path.normalize(candidate.trim());
    if (!seen.has(normalized) && isUsableNodeExecutable(normalized, platform)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  };
  const addDirectory = (directory: string | undefined): void => {
    if (!directory?.trim()) {
      return;
    }
    for (const name of names) {
      add(path.join(directory.trim(), name));
    }
  };

  add(env.npm_node_execpath);
  addDirectory(env.NVM_BIN);
  addDirectory(env.NVM_SYMLINK);
  addDirectory(env.VOLTA_HOME ? path.join(env.VOLTA_HOME, 'bin') : undefined);
  addDirectory(path.join(homeDir, '.volta', 'bin'));
  addDirectory(path.join(homeDir, '.asdf', 'shims'));

  const pathDelimiter = platform === 'win32' ? ';' : ':';
  for (const directory of (env.PATH ?? '').split(pathDelimiter).filter(Boolean)) {
    addDirectory(directory);
  }

  // Global npm layouts retain the owning runtime above lib/node_modules:
  // <node-root>/lib/node_modules/workspai/package.json -> <node-root>/bin/node.
  let cursor = path.dirname(path.resolve(input.manifestPath));
  for (let depth = 0; depth < 8; depth += 1) {
    addDirectory(cursor);
    addDirectory(path.join(cursor, 'bin'));
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }

  const processName = path.basename(processExecutable).toLowerCase();
  if (names.includes(processName) || env.ELECTRON_RUN_AS_NODE === '1') {
    add(processExecutable);
  }
  return candidates;
}

export function buildWorkspaiCliRuntimeEnv(input: {
  nodeExecutable: string;
  baseEnv?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
}): NodeJS.ProcessEnv {
  const platform = input.platform ?? process.platform;
  const env = input.baseEnv ?? process.env;
  const homeDir = input.homeDir ?? os.homedir();
  const delimiter = platform === 'win32' ? ';' : ':';
  const entries: string[] = [];
  const seen = new Set<string>();
  const add = (directory: string | undefined): void => {
    if (!directory?.trim()) {
      return;
    }
    const normalized = path.normalize(directory.trim());
    if (!seen.has(normalized) && fs.existsSync(normalized)) {
      seen.add(normalized);
      entries.push(normalized);
    }
  };

  add(path.dirname(input.nodeExecutable));
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    add(directory);
  }
  add(path.join(homeDir, '.local', 'bin'));
  add(path.join(homeDir, 'bin'));
  add(path.join(homeDir, '.pyenv', 'shims'));
  add(path.join(homeDir, '.asdf', 'shims'));
  add(path.join(homeDir, '.volta', 'bin'));
  add(path.join(homeDir, '.cargo', 'bin'));
  add(path.join(homeDir, '.dotnet', 'tools'));
  if (platform === 'win32') {
    add(env.APPDATA ? path.join(env.APPDATA, 'npm') : undefined);
    add(env.NVM_SYMLINK);
  }

  return { ...env, PATH: entries.join(delimiter) };
}

async function resolveInstalledWorkspaiCliCandidates(input: {
  workspacePath: string;
  installedPackages?: InstalledNpmPackageMetadata[];
}): Promise<WorkspaiCliEntrypoint[]> {
  const installed = (
    input.installedPackages ??
    discoverInstalledNpmPackages('workspai', { cwd: input.workspacePath })
  )
    .filter((candidate) => compareSemver(candidate.version, MIN_RAPIDKIT_CLI_VERSION) >= 0)
    .sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === 'workspace' ? -1 : 1;
      }
      return compareSemver(right.version, left.version);
    });

  const candidates: WorkspaiCliEntrypoint[] = [];
  const candidateByEntrypoint = new Map<string, WorkspaiCliEntrypoint>();
  for (const candidate of installed) {
    try {
      const manifest = (await fs.readJson(candidate.manifestPath)) as {
        name?: string;
        version?: string;
        bin?: string | Record<string, string>;
      };
      const bin = resolveManifestBin(manifest);
      if (manifest.name !== 'workspai' || manifest.version !== candidate.version || !bin) {
        continue;
      }
      const packageRoot = await fs.realpath(path.dirname(candidate.manifestPath));
      const entrypoint = await fs.realpath(path.resolve(packageRoot, bin));
      const stat = await fs.lstat(entrypoint);
      if (!stat.isFile() || !isInside(packageRoot, entrypoint)) {
        continue;
      }
      const nodeExecutables = resolveWorkspaiNodeExecutables({
        manifestPath: candidate.manifestPath,
      });
      const existing = candidateByEntrypoint.get(entrypoint);
      if (existing) {
        existing.nodeExecutables = [...new Set([...existing.nodeExecutables, ...nodeExecutables])];
        continue;
      }
      const resolvedCandidate: WorkspaiCliEntrypoint = {
        version: candidate.version,
        packageRoot,
        entrypoint,
        source: candidate.source,
        nodeExecutables,
      };
      candidateByEntrypoint.set(entrypoint, resolvedCandidate);
      candidates.push(resolvedCandidate);
    } catch {
      continue;
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `Workspai CLI ${MIN_RAPIDKIT_CLI_VERSION}+ must be installed or linked locally before Studio can execute a repair transaction. Studio will not fetch a CLI from the registry.`
    );
  }
  return candidates;
}

export async function resolveInstalledWorkspaiCli(input: {
  workspacePath: string;
  installedPackages?: InstalledNpmPackageMetadata[];
}): Promise<WorkspaiCliEntrypoint> {
  return (await resolveInstalledWorkspaiCliCandidates(input))[0];
}

const defaultCliRunner: CliRunner = async ({ entrypoint, workspacePath, args, timeoutMs }) => {
  const nodeExecutable = entrypoint.nodeExecutable ?? entrypoint.nodeExecutables[0];
  if (!nodeExecutable) {
    throw new Error(
      'No local Node.js runtime could be associated with the installed Workspai CLI.'
    );
  }
  const result = await run(nodeExecutable, [entrypoint.entrypoint, ...args], {
    cwd: workspacePath,
    timeout: timeoutMs,
    shell: false,
    env: buildWorkspaiCliRuntimeEnv({ nodeExecutable }),
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

function parseJsonObject(stdout: string): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) {
    return undefined;
  }
  try {
    const value = JSON.parse(trimmed.slice(first, last + 1)) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function containsOrderedStages(actual: string[], required: string[]): boolean {
  let cursor = 0;
  for (const stage of actual) {
    if (stage === required[cursor]) {
      cursor += 1;
    }
    if (cursor === required.length) {
      return true;
    }
  }
  return false;
}

async function runtimeVerifyCandidate(input: {
  candidate: WorkspaiCliEntrypoint;
  workspacePath: string;
  runner: CliRunner;
}): Promise<WorkspaiCliEntrypoint> {
  const versionExecution = await input.runner({
    entrypoint: input.candidate,
    workspacePath: input.workspacePath,
    args: ['--version', '--json'],
    timeoutMs: 30_000,
  });
  const version = parseJsonObject(versionExecution.stdout);
  if (
    versionExecution.exitCode !== 0 ||
    version?.schemaVersion !== VERSION_SCHEMA ||
    version?.cli !== 'workspai' ||
    typeof version?.version !== 'string'
  ) {
    throw new Error(
      versionExecution.stderr.trim() ||
        `runtime version probe returned an incompatible ${String(version?.schemaVersion ?? 'unknown')} payload`
    );
  }
  if (version.version !== input.candidate.version) {
    throw new Error(
      `manifest declares ${input.candidate.version}, but the selected executable reports ${version.version}`
    );
  }
  if (compareSemver(version.version, MIN_RAPIDKIT_CLI_VERSION) < 0) {
    throw new Error(`runtime version ${version.version} is below ${MIN_RAPIDKIT_CLI_VERSION}`);
  }

  const capabilitiesExecution = await input.runner({
    entrypoint: input.candidate,
    workspacePath: input.workspacePath,
    args: ['workspace', 'repair', 'capabilities', '--json'],
    timeoutMs: 30_000,
  });
  const capabilities = parseJsonObject(capabilitiesExecution.stdout);
  const protocol =
    capabilities?.consumerProtocol &&
    typeof capabilities.consumerProtocol === 'object' &&
    !Array.isArray(capabilities.consumerProtocol)
      ? (capabilities.consumerProtocol as Record<string, unknown>)
      : undefined;
  const contracts =
    protocol?.contracts &&
    typeof protocol.contracts === 'object' &&
    !Array.isArray(protocol.contracts)
      ? (protocol.contracts as Record<string, unknown>)
      : undefined;
  const invocation =
    protocol?.invocation &&
    typeof protocol.invocation === 'object' &&
    !Array.isArray(protocol.invocation)
      ? (protocol.invocation as Record<string, unknown>)
      : undefined;
  const invariants =
    capabilities?.invariants &&
    typeof capabilities.invariants === 'object' &&
    !Array.isArray(capabilities.invariants)
      ? (capabilities.invariants as Record<string, unknown>)
      : undefined;
  const actions = stringArray(invocation?.actions);
  const workspaceResolution = stringArray(invocation?.workspaceResolution);
  const workflow = stringArray(capabilities?.workflow);
  const requiredActions = [
    'capabilities',
    'plan',
    'propose',
    'approve',
    'decide',
    'execute',
    'resume',
  ];
  const requiredWorkflow = [
    'plan',
    'preconditions',
    'approval',
    'target-precondition',
    'checkpoint',
    'execute',
    'reconcile',
    'audit',
    'test',
    'build',
    'target-producer-verify',
    'canonical-verify',
    'close-or-rollback-or-decision',
  ];
  if (
    capabilitiesExecution.exitCode !== 0 ||
    capabilities?.schemaVersion !== REPAIR_CAPABILITIES_SCHEMA ||
    protocol?.protocolVersion !== REPAIR_CONSUMER_PROTOCOL ||
    invariants?.consumerHandshakeRequired !== true ||
    invariants?.ephemeralProposalsAreEvidence !== false ||
    invariants?.mutationAuthority !== 'cli-only' ||
    invariants?.targetClosure !== 'selected-causal-action-set' ||
    invariants?.changeReceipt !== 'checkpoint-hash-delta' ||
    invariants?.consumerTimeline !== 'durable-transaction-events' ||
    invariants?.typedDecisionCauses !== true ||
    contracts?.operationResult !== CLI_OPERATION_SCHEMA ||
    contracts?.proposal !== REPAIR_PROPOSAL_SCHEMA ||
    contracts?.transaction !== REPAIR_TRANSACTION_SCHEMA ||
    !workspaceResolution.includes('process-cwd') ||
    requiredActions.some((action) => !actions.includes(action)) ||
    !containsOrderedStages(workflow, requiredWorkflow)
  ) {
    throw new Error(
      capabilitiesExecution.stderr.trim() ||
        `repair capabilities do not satisfy ${REPAIR_CONSUMER_PROTOCOL}`
    );
  }
  return { ...input.candidate, protocolVersion: REPAIR_CONSUMER_PROTOCOL };
}

export async function verifyInstalledWorkspaiRepairCli(input: {
  workspacePath: string;
  installedPackages?: InstalledNpmPackageMetadata[];
  runner?: CliRunner;
}): Promise<WorkspaiCliEntrypoint> {
  const candidates = await resolveInstalledWorkspaiCliCandidates(input);
  const failures: string[] = [];
  for (const candidate of candidates) {
    const runtimeCandidates = input.runner
      ? [candidate.nodeExecutables[0]]
      : candidate.nodeExecutables.length > 0
        ? candidate.nodeExecutables
        : [undefined];
    for (const nodeExecutable of runtimeCandidates) {
      const runtimeCandidate = {
        ...candidate,
        ...(nodeExecutable ? { nodeExecutable } : {}),
      };
      try {
        return await runtimeVerifyCandidate({
          candidate: runtimeCandidate,
          workspacePath: input.workspacePath,
          runner: input.runner ?? defaultCliRunner,
        });
      } catch (error) {
        failures.push(
          `${candidate.version} (${candidate.source}, ${candidate.entrypoint}${
            nodeExecutable ? ` via ${nodeExecutable}` : ''
          }): ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
  throw new Error(
    `Workspai CLI repair protocol handshake failed. No installed executable is safe to use. ${failures.join(' | ')}`
  );
}

async function invokeRepair(input: {
  workspacePath: string;
  entrypoint: WorkspaiCliEntrypoint;
  action: string;
  args?: string[];
  runner: CliRunner;
}): Promise<WorkspaceRepairCliTransaction> {
  const execution = await input.runner({
    entrypoint: input.entrypoint,
    workspacePath: input.workspacePath,
    args: ['workspace', 'repair', input.action, '--json', ...(input.args ?? [])],
    timeoutMs: input.action === 'execute' || input.action === 'resume' ? 15 * 60_000 : 60_000,
  });
  const operation = parseOperationResult(execution.stdout);
  if (!operation) {
    throw new Error(
      execution.stderr.trim() ||
        execution.stdout.trim() ||
        `Workspai CLI repair ${input.action} exited with ${execution.exitCode}.`
    );
  }
  if (![0, 1, 2].includes(execution.exitCode)) {
    throw new Error(
      operation.error?.message ?? `Workspai CLI repair ${input.action} exited unexpectedly.`
    );
  }
  return asTransaction(operation);
}

function changedPaths(transaction: WorkspaceRepairCliTransaction): string[] {
  return transaction.checkpoint.files
    .filter((file) => file.afterHash !== undefined && file.afterHash !== file.beforeHash)
    .map((file) => file.path)
    .sort();
}

function sha256(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function textContent(content: Buffer | undefined): string | undefined {
  if (!content || content.byteLength > MAX_REVIEW_FILE_BYTES || content.includes(0)) {
    return undefined;
  }
  return content.toString('utf8');
}

function boundedDiffLines(
  before: string,
  after: string
): WorkspaceRepairCliFileChange['diffLines'] {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const contextStart = Math.max(0, prefix - 3);
  const beforeMiddleEnd = beforeLines.length - suffix;
  const afterMiddleEnd = afterLines.length - suffix;
  const suffixEnd = Math.min(beforeLines.length, beforeMiddleEnd + 3);
  const lines: WorkspaceRepairCliFileChange['diffLines'] = [
    ...beforeLines
      .slice(contextStart, prefix)
      .map((content) => ({ type: 'unchanged' as const, content })),
    ...beforeLines
      .slice(prefix, beforeMiddleEnd)
      .map((content) => ({ type: 'removed' as const, content })),
    ...afterLines
      .slice(prefix, afterMiddleEnd)
      .map((content) => ({ type: 'added' as const, content })),
    ...beforeLines
      .slice(beforeMiddleEnd, suffixEnd)
      .map((content) => ({ type: 'unchanged' as const, content })),
  ];
  if (lines.length <= MAX_REVIEW_DIFF_LINES) {
    return lines;
  }
  return [
    ...lines.slice(0, Math.floor(MAX_REVIEW_DIFF_LINES / 2)),
    {
      type: 'unchanged',
      content: '… diff truncated; open the native comparison for the full file …',
    },
    ...lines.slice(-Math.floor(MAX_REVIEW_DIFF_LINES / 2)),
  ];
}

function repairTransactionDirectory(workspacePath: string, transactionId: string): string {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(transactionId)) {
    throw new Error('Invalid repair transaction id.');
  }
  return path.join(workspacePath, '.workspai', 'repair', 'transactions', transactionId);
}

async function readRegularFile(candidate: string): Promise<Buffer | undefined> {
  const stat = await fs.lstat(candidate).catch(() => undefined);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > MAX_REVIEW_FILE_BYTES) {
    return undefined;
  }
  return fs.readFile(candidate);
}

export async function readCliOwnedRepairFileComparison(input: {
  workspacePath: string;
  transaction: WorkspaceRepairCliTransaction;
  relativePath: string;
}): Promise<WorkspaceRepairFileComparison> {
  const workspacePath = path.resolve(input.workspacePath);
  const relativePath = input.relativePath.replace(/\\/g, '/');
  const absolutePath = path.resolve(workspacePath, relativePath);
  if (!isInside(workspacePath, absolutePath) || relativePath === '.') {
    throw new Error('Repair comparison path escapes the workspace.');
  }
  const checkpoint = input.transaction.checkpoint.files.find(
    (entry) => entry.path.replace(/\\/g, '/') === relativePath
  );
  if (
    !checkpoint ||
    checkpoint.afterHash === undefined ||
    checkpoint.afterHash === checkpoint.beforeHash
  ) {
    throw new Error(`${relativePath} is not a changed file in this repair transaction.`);
  }
  let beforeBytes: Buffer | undefined;
  if (checkpoint.existed) {
    if (!checkpoint.backupRef) {
      throw new Error(`Repair checkpoint is missing the original content for ${relativePath}.`);
    }
    const transactionDirectory = repairTransactionDirectory(
      workspacePath,
      input.transaction.transactionId
    );
    const backupPath = path.resolve(transactionDirectory, checkpoint.backupRef);
    if (!isInside(transactionDirectory, backupPath)) {
      throw new Error('Repair checkpoint reference escapes its transaction directory.');
    }
    beforeBytes = await readRegularFile(backupPath);
    if (!beforeBytes || sha256(beforeBytes) !== checkpoint.beforeHash) {
      throw new Error(`Repair checkpoint integrity failed for ${relativePath}.`);
    }
  }
  const afterBytes = await readRegularFile(absolutePath);
  const currentAfterHash = afterBytes ? sha256(afterBytes) : null;
  const stale = currentAfterHash !== checkpoint.afterHash;
  const beforeText = textContent(beforeBytes) ?? (checkpoint.existed ? undefined : '');
  const afterText = textContent(afterBytes) ?? (checkpoint.afterHash === null ? '' : undefined);
  const binary = beforeText === undefined || afterText === undefined;
  const status = !checkpoint.existed
    ? 'added'
    : checkpoint.afterHash === null
      ? 'deleted'
      : 'modified';
  return {
    relativePath,
    status,
    ...(status === 'added' ? { isNewFile: true } : {}),
    beforeHash: checkpoint.beforeHash,
    afterHash: checkpoint.afterHash,
    binary,
    stale,
    ...(stale
      ? { failReason: 'The file changed again after this repair transaction.' }
      : binary
        ? { failReason: 'Binary or oversized files use hash-only review.' }
        : {}),
    diffLines: binary ? [] : boundedDiffLines(beforeText, afterText),
    ...(beforeText !== undefined ? { originalContent: beforeText } : {}),
    ...(afterText !== undefined ? { patchedContent: afterText } : {}),
  };
}

async function repairExecutionResult(input: {
  workspacePath: string;
  transaction: WorkspaceRepairCliTransaction;
}): Promise<WorkspaceRepairCliExecutionResult> {
  const paths = changedPaths(input.transaction);
  const fileChanges = await Promise.all(
    paths.map(async (relativePath) => {
      const checkpoint = input.transaction.checkpoint.files.find(
        (entry) => entry.path.replace(/\\/g, '/') === relativePath
      );
      try {
        const comparison = await readCliOwnedRepairFileComparison({
          workspacePath: input.workspacePath,
          transaction: input.transaction,
          relativePath,
        });
        return {
          relativePath: comparison.relativePath,
          status: comparison.status,
          ...(comparison.isNewFile ? { isNewFile: true } : {}),
          beforeHash: comparison.beforeHash,
          afterHash: comparison.afterHash,
          binary: comparison.binary,
          stale: comparison.stale,
          ...(comparison.failReason ? { failReason: comparison.failReason } : {}),
          diffLines: comparison.diffLines,
        };
      } catch (error) {
        // The repair outcome remains authoritative even when a historical or
        // damaged checkpoint cannot safely supply inline content. Fail closed
        // for review while preserving the verified transaction receipt.
        return {
          relativePath,
          status: !checkpoint?.existed
            ? ('added' as const)
            : checkpoint.afterHash === null
              ? ('deleted' as const)
              : ('modified' as const),
          ...(!checkpoint?.existed ? { isNewFile: true } : {}),
          beforeHash: checkpoint?.beforeHash ?? null,
          afterHash: checkpoint?.afterHash ?? null,
          binary: true,
          stale: true,
          failReason: error instanceof Error ? error.message : String(error),
          diffLines: [],
        };
      }
    })
  );
  return { transaction: input.transaction, changedPaths: paths, fileChanges };
}

function isRepairTransaction(value: unknown): value is WorkspaceRepairCliTransaction {
  const candidate = value as Partial<WorkspaceRepairCliTransaction> | undefined;
  const decisionOptions = candidate?.decision?.options;
  const decisionCauses = candidate?.decision?.causes;
  return (
    candidate?.schemaVersion === REPAIR_TRANSACTION_SCHEMA &&
    typeof candidate.transactionId === 'string' &&
    REPAIR_STATES.has(String(candidate.state)) &&
    Boolean(candidate.target) &&
    Boolean(candidate.checkpoint) &&
    Array.isArray(candidate.stages) &&
    (!candidate.adapterEvaluations ||
      (Array.isArray(candidate.adapterEvaluations) &&
        candidate.adapterEvaluations.every(
          (adapter) =>
            typeof adapter.adapterId === 'string' &&
            typeof adapter.projectPath === 'string' &&
            ['full', 'conditional', 'unsupported'].includes(adapter.support) &&
            ['ready', 'partial', 'unsupported'].includes(adapter.status) &&
            Array.isArray(adapter.requiredExecutables) &&
            Array.isArray(adapter.missingExecutables)
        ))) &&
    (!candidate.decision ||
      (typeof candidate.decision.reason === 'string' &&
        Array.isArray(decisionOptions) &&
        decisionOptions.length > 0 &&
        decisionOptions.every((decision) => REPAIR_DECISIONS.has(decision)) &&
        (decisionCauses === undefined ||
          (Array.isArray(decisionCauses) &&
            decisionCauses.length > 0 &&
            decisionCauses.every(
              (cause) =>
                Boolean(cause) &&
                typeof cause.id === 'string' &&
                typeof cause.message === 'string' &&
                [
                  'missing-executable',
                  'unsupported-adapter',
                  'failed-precondition',
                  'risk-approval',
                  'policy-exception',
                  'source-repair-required',
                ].includes(cause.kind)
            ))))) &&
    (!candidate.verification ||
      (['passed', 'failed', 'not-run'].includes(candidate.verification.status) &&
        (candidate.verification.targetStatus === undefined ||
          ['passed', 'failed', 'unknown'].includes(candidate.verification.targetStatus)) &&
        (candidate.verification.workspaceStatus === undefined ||
          ['passed', 'blocked', 'failed'].includes(candidate.verification.workspaceStatus)) &&
        (candidate.verification.remainingActionIds === undefined ||
          Array.isArray(candidate.verification.remainingActionIds))))
  );
}

export async function readLatestCliOwnedRepair(input: {
  workspacePath: string;
}): Promise<WorkspaceRepairCliTransaction | undefined> {
  const reportPath = path.join(
    input.workspacePath,
    '.workspai',
    'reports',
    'workspace-repair-last-run.json'
  );
  try {
    const value = await fs.readJson(reportPath);
    return isRepairTransaction(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function readCliOwnedRepairById(input: {
  workspacePath: string;
  transactionId: string;
}): Promise<WorkspaceRepairCliTransaction> {
  const transactionDirectory = repairTransactionDirectory(
    path.resolve(input.workspacePath),
    input.transactionId
  );
  const transactionPath = path.join(transactionDirectory, 'transaction.json');
  const value = await fs.readJson(transactionPath).catch(() => undefined);
  if (!isRepairTransaction(value) || value.transactionId !== input.transactionId) {
    throw new Error(`Repair transaction ${input.transactionId} is unavailable or incompatible.`);
  }
  return value;
}

async function advanceApprovedRepair(input: {
  workspacePath: string;
  entrypoint: WorkspaiCliEntrypoint;
  transaction: WorkspaceRepairCliTransaction;
  approvedBy: string;
  runner: CliRunner;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
}): Promise<WorkspaceRepairCliExecutionResult> {
  let transaction = input.transaction;
  if (transaction.state === 'decision-required') {
    await input.reportProgress?.({
      phase: 'complete',
      state: transaction.state,
      transactionId: transaction.transactionId,
      message: transaction.decision?.reason ?? 'Repair requires an explicit user decision.',
    });
    return repairExecutionResult({ workspacePath: input.workspacePath, transaction });
  }
  if (transaction.state !== 'awaiting-approval') {
    throw new Error(
      `Repair ${transaction.transactionId} cannot be approved from ${transaction.state}.`
    );
  }

  await input.reportProgress?.({
    phase: 'approval',
    state: transaction.state,
    transactionId: transaction.transactionId,
    message: 'Binding the extension authorization to the immutable CLI repair plan.',
  });
  transaction = await invokeRepair({
    workspacePath: input.workspacePath,
    entrypoint: input.entrypoint,
    action: 'approve',
    args: ['--transaction', transaction.transactionId, '--approved-by', input.approvedBy],
    runner: input.runner,
  });
  await input.reportProgress?.({
    phase: 'execute',
    state: transaction.state,
    transactionId: transaction.transactionId,
    message:
      'CLI owns checkpoint, mutation, reconciliation, validation, verification, and rollback.',
  });
  transaction = await invokeRepair({
    workspacePath: input.workspacePath,
    entrypoint: input.entrypoint,
    action: 'execute',
    args: ['--transaction', transaction.transactionId],
    runner: input.runner,
  });
  await input.reportProgress?.({
    phase: 'complete',
    state: transaction.state,
    transactionId: transaction.transactionId,
    message: completedRepairMessage(transaction),
  });
  return repairExecutionResult({ workspacePath: input.workspacePath, transaction });
}

async function resumeRepair(input: {
  workspacePath: string;
  entrypoint: WorkspaiCliEntrypoint;
  transaction: WorkspaceRepairCliTransaction;
  approvedBy: string;
  runner: CliRunner;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
}): Promise<WorkspaceRepairCliExecutionResult> {
  if (input.transaction.state === 'awaiting-approval') {
    return advanceApprovedRepair(input);
  }
  if (input.transaction.state === 'decision-required') {
    await input.reportProgress?.({
      phase: 'complete',
      state: input.transaction.state,
      transactionId: input.transaction.transactionId,
      message: input.transaction.decision?.reason ?? 'Repair requires an explicit user decision.',
    });
    return repairExecutionResult({
      workspacePath: input.workspacePath,
      transaction: input.transaction,
    });
  }
  if (['closed', 'rolled-back', 'cancelled', 'failed'].includes(input.transaction.state)) {
    return repairExecutionResult({
      workspacePath: input.workspacePath,
      transaction: input.transaction,
    });
  }
  await input.reportProgress?.({
    phase: 'execute',
    state: input.transaction.state,
    transactionId: input.transaction.transactionId,
    message: 'CLI is resuming the durable transaction from its last verified state.',
  });
  const transaction = await invokeRepair({
    workspacePath: input.workspacePath,
    entrypoint: input.entrypoint,
    action: 'resume',
    args: ['--transaction', input.transaction.transactionId],
    runner: input.runner,
  });
  await input.reportProgress?.({
    phase: 'complete',
    state: transaction.state,
    transactionId: transaction.transactionId,
    message: completedRepairMessage(transaction),
  });
  return repairExecutionResult({ workspacePath: input.workspacePath, transaction });
}

export async function decideCliOwnedRepair(input: {
  workspacePath: string;
  transactionId: string;
  decision: WorkspaceRepairDecision;
  approvedBy: string;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
  installedPackages?: InstalledNpmPackageMetadata[];
  runner?: CliRunner;
}): Promise<WorkspaceRepairCliExecutionResult> {
  const entrypoint = await verifyInstalledWorkspaiRepairCli({
    workspacePath: input.workspacePath,
    installedPackages: input.installedPackages,
    runner: input.runner,
  });
  await input.reportProgress?.({
    phase: 'approval',
    transactionId: input.transactionId,
    message: `Submitting the explicit ${input.decision} decision to the CLI Repair Engine.`,
  });
  const transaction = await invokeRepair({
    workspacePath: input.workspacePath,
    entrypoint,
    action: 'decide',
    args: ['--transaction', input.transactionId, '--decision', input.decision],
    runner: input.runner ?? defaultCliRunner,
  });
  return resumeRepair({
    workspacePath: input.workspacePath,
    entrypoint,
    transaction,
    approvedBy: input.approvedBy,
    runner: input.runner ?? defaultCliRunner,
    reportProgress: input.reportProgress,
  });
}

export async function executeCliOwnedPatchRepair(input: {
  workspacePath: string;
  projectPath?: string;
  projectName?: string;
  cardId: string;
  blockerSignature?: string;
  targetActionIds?: string[];
  patches: WorkspaceRepairPatch[];
  approvedBy: string;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
  installedPackages?: InstalledNpmPackageMetadata[];
  runner?: CliRunner;
}): Promise<WorkspaceRepairCliExecutionResult> {
  if (input.patches.length === 0) {
    throw new Error('At least one inspected source change is required.');
  }
  const changes = input.patches.map((patch, index) => {
    if (patch.baseSha256 === undefined) {
      throw new Error(`Repair target ${patch.relativePath} has no inspected base hash.`);
    }
    const operation = patch.operation ?? 'write';
    if (operation === 'write' && typeof patch.patchedContent !== 'string') {
      throw new Error(`Repair target ${patch.relativePath} has no replacement content.`);
    }
    return {
      id: `model-change-${index + 1}`,
      path: patch.relativePath.replace(/\\/g, '/'),
      operation,
      expectedBeforeHash: patch.baseSha256,
      ...(operation === 'write' ? { content: patch.patchedContent } : {}),
      risk: 'guarded',
      summary: `${operation === 'write' ? 'Update' : 'Delete'} inspected source ${patch.relativePath}`,
    };
  });
  const proposal = {
    schemaVersion: REPAIR_PROPOSAL_SCHEMA,
    cardId: input.cardId,
    ...(input.blockerSignature ? { blockerSignature: input.blockerSignature } : {}),
    ...(input.targetActionIds?.length
      ? { targetActionIds: [...new Set(input.targetActionIds)].sort() }
      : {}),
    ...(input.projectName ? { projectName: input.projectName } : {}),
    ...(input.projectPath
      ? {
          projectPath: path
            .relative(input.workspacePath, path.resolve(input.projectPath))
            .replace(/\\/g, '/'),
        }
      : {}),
    rationale:
      'Model-proposed source repair. Workspai CLI remains the sole authority for policy, checkpointing, execution, validation, rollback, and closure.',
    changes,
  };
  const serialized = `${JSON.stringify(proposal, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROPOSAL_BYTES) {
    throw new Error('Repair proposal exceeds the 25 MiB transaction boundary.');
  }

  const entrypoint = await verifyInstalledWorkspaiRepairCli({
    workspacePath: input.workspacePath,
    installedPackages: input.installedPackages,
    runner: input.runner,
  });
  const inbox = path.join(input.workspacePath, '.workspai', 'repair', 'inbox');
  const proposalPath = path.join(inbox, `${crypto.randomUUID()}.json`);
  await fs.ensureDir(inbox);
  await fs.writeFile(proposalPath, serialized, { encoding: 'utf8', flag: 'wx' });
  try {
    await input.reportProgress?.({
      phase: 'plan',
      message: `CLI handshake passed: workspai ${entrypoint.version} · ${entrypoint.protocolVersion}. Validating the model proposal and compiling a deterministic repair plan.`,
    });
    const transaction = await invokeRepair({
      workspacePath: input.workspacePath,
      entrypoint,
      action: 'propose',
      args: [
        '--proposal',
        path.relative(input.workspacePath, proposalPath),
        '--max-risk',
        'guarded',
      ],
      runner: input.runner ?? defaultCliRunner,
    });
    return advanceApprovedRepair({
      workspacePath: input.workspacePath,
      entrypoint,
      transaction,
      approvedBy: input.approvedBy,
      runner: input.runner ?? defaultCliRunner,
      reportProgress: input.reportProgress,
    });
  } finally {
    await fs.remove(proposalPath).catch(() => undefined);
  }
}

export async function executeCliOwnedCanonicalRepair(input: {
  workspacePath: string;
  cardId: string;
  projectName?: string;
  actionId?: string;
  approvedBy: string;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
  installedPackages?: InstalledNpmPackageMetadata[];
  runner?: CliRunner;
}): Promise<WorkspaceRepairCliExecutionResult> {
  const entrypoint = await verifyInstalledWorkspaiRepairCli({
    workspacePath: input.workspacePath,
    installedPackages: input.installedPackages,
    runner: input.runner,
  });
  const active = await readLatestCliOwnedRepair({ workspacePath: input.workspacePath });
  const activeRequiresExplicitRiskDecision = active?.decision?.options.some((option) =>
    ['approve-guarded', 'approve-invasive', 'allow-breaking', 'allow-force'].includes(option)
  );
  const activeMatchesRequestedAction =
    !input.actionId || active?.target.actionIds.includes(input.actionId) === true;
  if (
    active &&
    active.target.cardId === input.cardId &&
    activeMatchesRequestedAction &&
    (!input.projectName || active.target.projectName === input.projectName) &&
    (active.state !== 'decision-required' || activeRequiresExplicitRiskDecision) &&
    !['closed', 'rolled-back', 'cancelled', 'failed'].includes(active.state)
  ) {
    return resumeRepair({
      workspacePath: input.workspacePath,
      entrypoint,
      transaction: active,
      approvedBy: input.approvedBy,
      runner: input.runner ?? defaultCliRunner,
      reportProgress: input.reportProgress,
    });
  }
  await input.reportProgress?.({
    phase: 'plan',
    message: 'CLI is deriving the repair transaction from fresh governed evidence.',
  });
  const transaction = await invokeRepair({
    workspacePath: input.workspacePath,
    entrypoint,
    action: 'plan',
    args: [
      '--card',
      input.cardId,
      '--max-risk',
      'guarded',
      ...(input.projectName ? ['--project', input.projectName] : []),
      ...(input.actionId ? ['--action-id', input.actionId] : []),
    ],
    runner: input.runner ?? defaultCliRunner,
  });
  return advanceApprovedRepair({
    workspacePath: input.workspacePath,
    entrypoint,
    transaction,
    approvedBy: input.approvedBy,
    runner: input.runner ?? defaultCliRunner,
    reportProgress: input.reportProgress,
  });
}
