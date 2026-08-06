import crypto from 'node:crypto';
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
const MAX_PROPOSAL_BYTES = 25 * 1024 * 1024;
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

export type WorkspaceRepairCliTransaction = {
  schemaVersion: typeof REPAIR_TRANSACTION_SCHEMA;
  transactionId: string;
  state: WorkspaceRepairTransactionState;
  target: {
    cardId: string;
    scope: 'workspace' | 'project';
    projectName?: string;
    projectPath?: string;
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
    }>;
  };
  stages: Array<{
    id: string;
    kind: 'repair' | 'reconcile' | 'audit' | 'test' | 'build' | 'verify' | 'rollback';
    status: 'pending' | 'running' | 'passed' | 'failed' | 'blocked' | 'skipped' | 'cancelled';
    summary: string;
    changedPaths?: string[];
  }>;
  decision?: {
    reason: string;
    options: WorkspaceRepairDecision[];
  };
};

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

export async function resolveInstalledWorkspaiCli(input: {
  workspacePath: string;
  installedPackages?: InstalledNpmPackageMetadata[];
}): Promise<WorkspaiCliEntrypoint> {
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
      return {
        version: candidate.version,
        packageRoot,
        entrypoint,
        source: candidate.source,
      };
    } catch {
      continue;
    }
  }

  throw new Error(
    `Workspai CLI ${MIN_RAPIDKIT_CLI_VERSION}+ must be installed or linked locally before Studio can execute a repair transaction. Studio will not fetch a CLI from the registry.`
  );
}

const defaultCliRunner: CliRunner = async ({ entrypoint, workspacePath, args, timeoutMs }) => {
  const result = await run(process.execPath, [entrypoint.entrypoint, ...args], {
    cwd: workspacePath,
    timeout: timeoutMs,
    shell: false,
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

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
    args: [
      'workspace',
      'repair',
      input.action,
      '--workspace',
      input.workspacePath,
      '--json',
      ...(input.args ?? []),
    ],
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
  return [
    ...new Set([
      ...transaction.checkpoint.files.map((file) => file.path),
      ...transaction.stages.flatMap((stage) => stage.changedPaths ?? []),
    ]),
  ];
}

function isRepairTransaction(value: unknown): value is WorkspaceRepairCliTransaction {
  const candidate = value as Partial<WorkspaceRepairCliTransaction> | undefined;
  const decisionOptions = candidate?.decision?.options;
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
        decisionOptions.every((decision) => REPAIR_DECISIONS.has(decision))))
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

async function advanceApprovedRepair(input: {
  workspacePath: string;
  entrypoint: WorkspaiCliEntrypoint;
  transaction: WorkspaceRepairCliTransaction;
  approvedBy: string;
  runner: CliRunner;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
}): Promise<{ transaction: WorkspaceRepairCliTransaction; changedPaths: string[] }> {
  let transaction = input.transaction;
  if (transaction.state === 'decision-required') {
    await input.reportProgress?.({
      phase: 'complete',
      state: transaction.state,
      transactionId: transaction.transactionId,
      message: transaction.decision?.reason ?? 'Repair requires an explicit user decision.',
    });
    return { transaction, changedPaths: changedPaths(transaction) };
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
    message:
      transaction.state === 'closed'
        ? 'Repair closed after canonical verification.'
        : (transaction.decision?.reason ?? `Repair ended in ${transaction.state}.`),
  });
  return { transaction, changedPaths: changedPaths(transaction) };
}

async function resumeRepair(input: {
  workspacePath: string;
  entrypoint: WorkspaiCliEntrypoint;
  transaction: WorkspaceRepairCliTransaction;
  approvedBy: string;
  runner: CliRunner;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
}): Promise<{ transaction: WorkspaceRepairCliTransaction; changedPaths: string[] }> {
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
    return {
      transaction: input.transaction,
      changedPaths: changedPaths(input.transaction),
    };
  }
  if (['closed', 'rolled-back', 'cancelled', 'failed'].includes(input.transaction.state)) {
    return {
      transaction: input.transaction,
      changedPaths: changedPaths(input.transaction),
    };
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
    message:
      transaction.state === 'closed'
        ? 'Repair closed after canonical verification.'
        : (transaction.decision?.reason ?? `Repair ended in ${transaction.state}.`),
  });
  return { transaction, changedPaths: changedPaths(transaction) };
}

export async function decideCliOwnedRepair(input: {
  workspacePath: string;
  transactionId: string;
  decision: WorkspaceRepairDecision;
  approvedBy: string;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
  installedPackages?: InstalledNpmPackageMetadata[];
  runner?: CliRunner;
}): Promise<{ transaction: WorkspaceRepairCliTransaction; changedPaths: string[] }> {
  const entrypoint = await resolveInstalledWorkspaiCli({
    workspacePath: input.workspacePath,
    installedPackages: input.installedPackages,
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
  patches: WorkspaceRepairPatch[];
  approvedBy: string;
  reportProgress?: (progress: WorkspaceRepairProgress) => Promise<void> | void;
  installedPackages?: InstalledNpmPackageMetadata[];
  runner?: CliRunner;
}): Promise<{ transaction: WorkspaceRepairCliTransaction; changedPaths: string[] }> {
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

  const inbox = path.join(input.workspacePath, '.workspai', 'repair', 'inbox');
  const proposalPath = path.join(inbox, `${crypto.randomUUID()}.json`);
  await fs.ensureDir(inbox);
  await fs.writeFile(proposalPath, serialized, { encoding: 'utf8', flag: 'wx' });
  try {
    const entrypoint = await resolveInstalledWorkspaiCli({
      workspacePath: input.workspacePath,
      installedPackages: input.installedPackages,
    });
    await input.reportProgress?.({
      phase: 'plan',
      message: 'CLI is validating the model proposal and compiling a deterministic repair plan.',
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
}): Promise<{ transaction: WorkspaceRepairCliTransaction; changedPaths: string[] }> {
  const entrypoint = await resolveInstalledWorkspaiCli({
    workspacePath: input.workspacePath,
    installedPackages: input.installedPackages,
  });
  const active = await readLatestCliOwnedRepair({ workspacePath: input.workspacePath });
  if (
    active &&
    active.target.cardId === input.cardId &&
    (!input.projectName || active.target.projectName === input.projectName) &&
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
