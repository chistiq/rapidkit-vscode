import * as vscode from 'vscode';
import path from 'path';
import { Logger } from '../utils/logger';
import { runShellCommandInTerminal } from '../utils/terminalExecutor';
import { evaluateWorkspaiContractRuntime } from '../core/workspaiContractRuntime';
import { exportVerifyPackContractToWorkspace } from '../core/verifyPackContractExporter';
import { runWorkspaceHygieneProbes } from '../core/workspaceHygieneProbes';
import { runGovernanceGate } from '../core/governanceGate';
import { shouldPromptForWorkspaceCommandPreset } from '../core/workspaceCommandPresets';
import { runGatedRapidkitCommandsInTerminal as runRapidkitCommandsInTerminal } from '../core/gatedRapidkitTerminal';
import {
  appendWorkspaceCommandRefresh,
  confirmWorkspaceCommandSafety,
} from '../core/workspaceCommandSafety';

type WorkspaceExplorerLike = {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
};

type WorkspaceCommandItem = {
  workspace?: { path?: unknown; name?: unknown };
  path?: unknown;
  workspacePath?: unknown;
  name?: unknown;
  workspaceName?: unknown;
  since?: unknown;
  maxWorkers?: unknown;
  scope?: unknown;
  stage?: unknown;
  mode?: unknown;
  preferredAction?: unknown;
  json?: unknown;
  preferExistingProfile?: unknown;
  forceProfilePrompt?: unknown;
  preferProfileSetupRuntimes?: unknown;
  setupRuntime?: unknown;
  profile?: unknown;
  source?: unknown;
};

type WorkspaceTarget = {
  workspacePath?: string;
  workspaceName?: string;
};

function summarizeC06Health(input: {
  evaluated: boolean;
  errors: string[];
  warnings: string[];
  availableKinds: string[];
}): string {
  if (!input.evaluated) {
    return 'C06: contracts not found';
  }
  return `C06: ${input.availableKinds.length} loaded, ${input.errors.length} error(s), ${input.warnings.length} warning(s)`;
}

type WorkspaceHealthAction = 'check' | 'fix' | 'compliance' | 'version' | 'upgrade';
type WorkspaceRunStage = 'init' | 'test' | 'build' | 'start';
type WorkspaceAutopilotMode = 'audit' | 'safe-fix' | 'enforce';
type WorkspaceBootstrapProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';
type WorkspaceSnapshotAction = 'create' | 'list' | 'inspect' | 'restore';
type WorkspaceContractAction = 'init' | 'inspect' | 'verify' | 'graph' | 'open';

type ProfileQuickPickItem = vscode.QuickPickItem & { value: WorkspaceBootstrapProfile };

const WORKSPACE_BOOTSTRAP_PROFILE_OPTIONS: ProfileQuickPickItem[] = [
  {
    label: '$(zap) minimal',
    description: 'Foundation artifacts only (fastest)',
    value: 'minimal',
  },
  {
    label: '$(symbol-namespace) Python runtime',
    description: 'Python + Poetry bootstrap',
    value: 'python-only',
  },
  {
    label: '$(symbol-event) Node.js runtime',
    description: 'Node.js runtime bootstrap (no Python needed)',
    value: 'node-only',
  },
  {
    label: '$(go) Go runtime',
    description: 'Go runtime bootstrap (no Python needed)',
    value: 'go-only',
  },
  {
    label: '$(symbol-class) Java runtime',
    description: 'Java + Spring Boot runtime bootstrap',
    value: 'java-only',
  },
  {
    label: '$(symbol-interface) .NET runtime',
    description: '.NET runtime bootstrap for ASP.NET Core services',
    value: 'dotnet-only',
  },
  {
    label: '$(layers) polyglot',
    description: 'Python + Node + Go + Java + .NET — multi-runtime workspace',
    value: 'polyglot',
  },
  {
    label: '$(shield) enterprise',
    description: 'Polyglot + .NET + governance + Sigstore verification',
    value: 'enterprise',
  },
];

const WORKSPACE_BOOTSTRAP_PROFILES = new Set(
  WORKSPACE_BOOTSTRAP_PROFILE_OPTIONS.map((option) => option.value)
);

const PROFILE_SETUP_RUNTIMES: Record<WorkspaceBootstrapProfile, string[]> = {
  minimal: [],
  'python-only': ['python'],
  'node-only': ['node'],
  'go-only': ['go'],
  'java-only': ['java'],
  'dotnet-only': ['dotnet'],
  polyglot: ['python', 'node', 'go', 'java', 'dotnet'],
  enterprise: ['python', 'node', 'go', 'java', 'dotnet'],
};

async function readWorkspaceBootstrapProfile(
  workspacePath: string
): Promise<WorkspaceBootstrapProfile | undefined> {
  const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
  try {
    const fsBootstrap = await import('fs-extra');
    if (!(await fsBootstrap.default.pathExists(manifestPath))) {
      return undefined;
    }
    const manifest = await fsBootstrap.default.readJSON(manifestPath);
    const profile = manifest?.profile;
    if (
      typeof profile === 'string' &&
      WORKSPACE_BOOTSTRAP_PROFILES.has(profile as WorkspaceBootstrapProfile)
    ) {
      return profile as WorkspaceBootstrapProfile;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readBootstrapProfileHint(
  item?: WorkspaceCommandItem
): WorkspaceBootstrapProfile | undefined {
  const profile = item?.profile;
  if (
    typeof profile === 'string' &&
    WORKSPACE_BOOTSTRAP_PROFILES.has(profile as WorkspaceBootstrapProfile)
  ) {
    return profile as WorkspaceBootstrapProfile;
  }
  return undefined;
}
type RuntimeQuickPickItem = vscode.QuickPickItem & {
  value: 'python' | 'node' | 'go' | 'java' | 'dotnet';
};
type SnapshotActionQuickPickItem = vscode.QuickPickItem & { value: WorkspaceSnapshotAction };
type SnapshotModeQuickPickItem = vscode.QuickPickItem & { value: 'metadata' | 'full' };
type SnapshotRestoreModeQuickPickItem = vscode.QuickPickItem & { value: 'dry-run' | 'force' };
type ContractActionQuickPickItem = vscode.QuickPickItem & { value: WorkspaceContractAction };

function asWorkspaceCommandItem(item: unknown): WorkspaceCommandItem | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  return item as WorkspaceCommandItem;
}

function getWorkspaceItemPath(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item;
  }

  const typed = asWorkspaceCommandItem(item);
  const candidate = typed?.workspace?.path ?? typed?.path ?? typed?.workspacePath;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function getWorkspaceItemName(item: unknown): string | undefined {
  const typed = asWorkspaceCommandItem(item);
  const candidate = typed?.workspace?.name ?? typed?.name ?? typed?.workspaceName;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function reportCommandHandlerError(input: {
  logger: Logger;
  message: string;
  error: unknown;
  code: string;
  workspacePath?: string;
  isRecoverable?: boolean;
}): void {
  input.logger.error(input.message, {
    errorCode: input.code,
    isRecoverable: input.isRecoverable ?? false,
    workspacePath: input.workspacePath ? toSafePathHint(input.workspacePath) : undefined,
    error: input.error instanceof Error ? input.error.message : String(input.error),
  });
}

function toSafePathHint(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function parsePreferredHealthAction(value: unknown): WorkspaceHealthAction | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'check' ||
    normalized === 'fix' ||
    normalized === 'compliance' ||
    normalized === 'version' ||
    normalized === 'upgrade'
  ) {
    return normalized;
  }

  return undefined;
}

function parseWorkspaceRunStage(value: unknown): WorkspaceRunStage | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'init' ||
    normalized === 'test' ||
    normalized === 'build' ||
    normalized === 'start'
  ) {
    return normalized;
  }

  return undefined;
}

function parseWorkspaceAutopilotMode(value: unknown): WorkspaceAutopilotMode | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'audit' || normalized === 'safe-fix' || normalized === 'enforce') {
    return normalized;
  }

  return undefined;
}

async function pickWorkspaceRunFlags(
  stage: WorkspaceRunStage,
  workspaceName: string,
  options?: { preferredSince?: string; preferredMaxWorkers?: number; preferredScope?: string }
): Promise<string[] | undefined> {
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'Affected projects only',
        description: 'Run only changed projects from VCS diff',
        value: 'affected',
      },
      {
        label: 'Blast radius expansion',
        description: 'Include downstream dependents (auto-enables affected mode)',
        value: 'blast-radius',
      },
      {
        label: 'Parallel execution',
        description: 'Run selected projects concurrently',
        value: 'parallel',
      },
      {
        label: 'Continue on error',
        description: 'Continue remaining projects even if one fails',
        value: 'continue-on-error',
      },
      {
        label: 'Strict gates',
        description: 'Fail on gate warnings/failures',
        value: 'strict',
      },
      {
        label: 'Disable gates',
        description: 'Skip doctor/readiness pre-run gates',
        value: 'no-gates',
      },
      {
        label: 'JSON output',
        description: 'Emit machine-readable report payload',
        value: 'json',
      },
    ],
    {
      title: `Workspace Run (${stage}) — ${workspaceName}`,
      placeHolder: 'Select optional execution flags (optional)',
      canPickMany: true,
      ignoreFocusOut: true,
    }
  );

  if (!selected) {
    return undefined;
  }

  const selectedValues = new Set(selected.map((item) => item.value));
  if (selectedValues.has('blast-radius')) {
    selectedValues.add('affected');
  }

  const flags: string[] = [];
  if (selectedValues.has('affected')) {
    flags.push('--affected');
  }
  if (selectedValues.has('blast-radius')) {
    flags.push('--blast-radius');
  }
  if (selectedValues.has('parallel')) {
    flags.push('--parallel');
  }
  if (selectedValues.has('continue-on-error')) {
    flags.push('--continue-on-error');
  }
  if (selectedValues.has('strict')) {
    flags.push('--strict');
  }
  if (selectedValues.has('no-gates')) {
    flags.push('--no-gates');
  }
  if (selectedValues.has('json')) {
    flags.push('--json');
  }

  if (selectedValues.has('affected') || selectedValues.has('blast-radius')) {
    const preferredSince = options?.preferredSince?.trim();
    let sinceRef = preferredSince && preferredSince.length > 0 ? preferredSince : undefined;
    if (!sinceRef) {
      const sinceInput = await vscode.window.showInputBox({
        title: `Workspace Run (${stage}) — ${workspaceName}`,
        prompt:
          'Optional: git ref for affected calculation (--since). Leave empty to use CLI default (HEAD~1).',
        placeHolder: 'HEAD~1',
        ignoreFocusOut: true,
      });

      if (sinceInput === undefined) {
        return undefined;
      }

      const trimmed = sinceInput.trim();
      sinceRef = trimmed.length > 0 ? trimmed : undefined;
    }

    if (sinceRef) {
      flags.push('--since', sinceRef);
    }
  }

  const typedScope =
    typeof options?.preferredScope === 'string' && options.preferredScope.trim().length > 0
      ? options.preferredScope.trim()
      : undefined;
  if (typedScope && typedScope !== 'all') {
    flags.push('--scope', typedScope.startsWith('project:') ? typedScope : `project:${typedScope}`);
  }

  if (selectedValues.has('parallel')) {
    const preferredMaxWorkers = parsePositiveInteger(options?.preferredMaxWorkers);
    let maxWorkers = preferredMaxWorkers;
    if (!maxWorkers) {
      const workerInput = await vscode.window.showInputBox({
        title: `Workspace Run (${stage}) — ${workspaceName}`,
        prompt:
          'Optional: max worker count for parallel run (--max-workers). Leave empty for CLI default.',
        placeHolder: '4',
        ignoreFocusOut: true,
      });

      if (workerInput === undefined) {
        return undefined;
      }

      const parsed = parsePositiveInteger(workerInput);
      if (workerInput.trim().length > 0 && !parsed) {
        vscode.window.showErrorMessage('Invalid max workers value. Enter a positive integer.');
        return undefined;
      }
      maxWorkers = parsed;
    }

    if (maxWorkers) {
      flags.push('--max-workers', String(maxWorkers));
    }
  }

  return flags;
}

async function pickAutopilotReleaseFlags(input: {
  workspaceName: string;
  preferredSince?: string;
  preferredMaxWorkers?: number;
}): Promise<string[] | undefined> {
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'Parallel execution',
        description: 'Run project-level stages concurrently where possible',
        value: 'parallel',
      },
      {
        label: 'Include --since',
        description: 'Use a specific git ref for affected scope',
        value: 'since',
      },
    ],
    {
      title: `Autopilot Release — ${input.workspaceName}`,
      placeHolder: 'Select optional release execution flags (optional)',
      canPickMany: true,
      ignoreFocusOut: true,
    }
  );

  if (!selected) {
    return undefined;
  }

  const values = new Set(selected.map((item) => item.value));
  const flags: string[] = [];

  if (values.has('since')) {
    const preferredSince = input.preferredSince?.trim();
    let sinceRef = preferredSince && preferredSince.length > 0 ? preferredSince : undefined;
    if (!sinceRef) {
      const sinceInput = await vscode.window.showInputBox({
        title: `Autopilot Release — ${input.workspaceName}`,
        prompt:
          'Optional: git ref for affected/project discovery scope (--since). Leave empty to use CLI default.',
        placeHolder: 'HEAD~1',
        ignoreFocusOut: true,
      });

      if (sinceInput === undefined) {
        return undefined;
      }

      const trimmed = sinceInput.trim();
      sinceRef = trimmed.length > 0 ? trimmed : undefined;
    }

    if (sinceRef) {
      flags.push('--since', sinceRef);
    }
  }

  if (values.has('parallel')) {
    flags.push('--parallel');

    const preferredMaxWorkers = parsePositiveInteger(input.preferredMaxWorkers);
    let maxWorkers = preferredMaxWorkers;
    if (!maxWorkers) {
      const workerInput = await vscode.window.showInputBox({
        title: `Autopilot Release — ${input.workspaceName}`,
        prompt:
          'Optional: max worker count for parallel execution (--max-workers). Leave empty for CLI default.',
        placeHolder: '4',
        ignoreFocusOut: true,
      });

      if (workerInput === undefined) {
        return undefined;
      }

      const parsed = parsePositiveInteger(workerInput);
      if (workerInput.trim().length > 0 && !parsed) {
        vscode.window.showErrorMessage('Invalid max workers value. Enter a positive integer.');
        return undefined;
      }
      maxWorkers = parsed;
    }

    if (maxWorkers) {
      flags.push('--max-workers', String(maxWorkers));
    }
  }

  return flags;
}

function resolveWorkspaceTarget(
  item: unknown,
  workspaceExplorer?: WorkspaceExplorerLike
): WorkspaceTarget {
  const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace?.();

  const itemWorkspacePath = getWorkspaceItemPath(item);
  const itemWorkspaceName = getWorkspaceItemName(item);
  const selectedPath = selectedWorkspace?.path;

  const workspacePath =
    typeof itemWorkspacePath === 'string' && itemWorkspacePath.length > 0
      ? itemWorkspacePath
      : selectedPath;

  const workspaceName =
    workspacePath === selectedPath
      ? (selectedWorkspace?.name ?? itemWorkspaceName)
      : typeof itemWorkspaceName === 'string' && itemWorkspaceName.length > 0
        ? itemWorkspaceName
        : workspacePath
          ? path.basename(workspacePath)
          : selectedWorkspace?.name;

  return { workspacePath, workspaceName };
}

function requireWorkspaceTarget(
  item: unknown,
  workspaceExplorer?: WorkspaceExplorerLike
): Required<WorkspaceTarget> | undefined {
  const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
  if (!workspacePath) {
    vscode.window.showErrorMessage(
      'No workspace selected. Select a workspace in the sidebar first.'
    );
    return undefined;
  }

  return {
    workspacePath,
    workspaceName: workspaceName || path.basename(workspacePath),
  };
}

function normalizeOptionalInput(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

async function promptSnapshotName(input: {
  title: string;
  prompt: string;
  placeHolder?: string;
  required?: boolean;
}): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: input.title,
    prompt: input.prompt,
    placeHolder: input.placeHolder,
    ignoreFocusOut: true,
    validateInput: input.required
      ? (raw) => (raw.trim().length === 0 ? 'Snapshot name is required.' : undefined)
      : undefined,
  });

  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeOptionalInput(value);
  return input.required ? normalized : (normalized ?? '');
}

async function promptSnapshotReason(title: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title,
    prompt:
      'Optional reason recorded by RapidKit. Workspace policy may require a reason for restore.',
    placeHolder: 'before dependency upgrade',
    ignoreFocusOut: true,
  });

  if (value === undefined) {
    return undefined;
  }

  return normalizeOptionalInput(value) ?? '';
}

export function registerWorkspaceOperationsCommands(options: {
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
  context: vscode.ExtensionContext;
}): vscode.Disposable[] {
  const { logger, getWorkspaceExplorer, context } = options;

  const runWorkspaceStageCommand = async (item: unknown, stage: WorkspaceRunStage) => {
    const workspaceExplorer = getWorkspaceExplorer();
    const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
    if (!workspacePath) {
      vscode.window.showErrorMessage(
        'No workspace selected. Select a workspace in the sidebar first.'
      );
      return;
    }

    const wsName = workspaceName || path.basename(workspacePath);
    const typedItem = asWorkspaceCommandItem(item);
    const preferredSince =
      typeof typedItem?.since === 'string' && typedItem.since.trim().length > 0
        ? typedItem.since.trim()
        : undefined;
    const preferredMaxWorkers = parsePositiveInteger(typedItem?.maxWorkers);
    const preferredScope =
      typeof typedItem?.scope === 'string' && typedItem.scope.trim().length > 0
        ? typedItem.scope.trim()
        : undefined;
    const flags = await pickWorkspaceRunFlags(stage, wsName, {
      preferredSince,
      preferredMaxWorkers,
      preferredScope,
    });
    if (!flags) {
      return;
    }

    runRapidkitCommandsInTerminal({
      name: `Workspai: Workspace Run (${stage}) — ${wsName}`,
      cwd: workspacePath,
      commands: [['workspace', 'run', stage, ...flags]],
    });
  };

  const runWorkspaceAutopilotReleaseCommand = async (item: unknown) => {
    const workspaceExplorer = getWorkspaceExplorer();
    const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
    if (!workspacePath) {
      vscode.window.showErrorMessage(
        'No workspace selected. Select a workspace in the sidebar first.'
      );
      return;
    }

    const wsName = workspaceName || path.basename(workspacePath);
    const typedItem = asWorkspaceCommandItem(item);
    const preferredMode = parseWorkspaceAutopilotMode(typedItem?.mode);
    const selectedMode = preferredMode
      ? { value: preferredMode }
      : await vscode.window.showQuickPick(
          [
            {
              label: 'enforce',
              description: 'Fail-closed release gate (recommended for CI)',
              value: 'enforce' as WorkspaceAutopilotMode,
            },
            {
              label: 'safe-fix',
              description: 'Apply safe remediation before verdict',
              value: 'safe-fix' as WorkspaceAutopilotMode,
            },
            {
              label: 'audit',
              description: 'Assessment only (no mutations)',
              value: 'audit' as WorkspaceAutopilotMode,
            },
          ],
          {
            title: `Autopilot Release — ${wsName}`,
            placeHolder: 'Select execution mode',
            ignoreFocusOut: true,
          }
        );

    if (!selectedMode) {
      return;
    }

    const preferredSince =
      typeof typedItem?.since === 'string' && typedItem.since.trim().length > 0
        ? typedItem.since.trim()
        : undefined;
    const preferredMaxWorkers = parsePositiveInteger(typedItem?.maxWorkers);
    const flags = await pickAutopilotReleaseFlags({
      workspaceName: wsName,
      preferredSince,
      preferredMaxWorkers,
    });
    if (!flags) {
      return;
    }

    const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'autopilot-release.json');

    runRapidkitCommandsInTerminal({
      name: `Workspai: Autopilot Release (${selectedMode.value}) — ${wsName}`,
      cwd: workspacePath,
      commands: [
        [
          'autopilot',
          'release',
          '--mode',
          selectedMode.value,
          '--json',
          '--output',
          reportPath,
          ...flags,
        ],
      ],
    });
  };

  const runWorkspaceSnapshotAction = async (
    item: unknown,
    action: WorkspaceSnapshotAction
  ): Promise<void> => {
    const workspaceTarget = requireWorkspaceTarget(item, getWorkspaceExplorer());
    if (!workspaceTarget) {
      return;
    }

    const { workspacePath, workspaceName } = workspaceTarget;

    if (action === 'list') {
      runRapidkitCommandsInTerminal({
        name: `Workspai: Snapshots — ${workspaceName}`,
        cwd: workspacePath,
        commands: [['snapshot', 'list']],
      });
      return;
    }

    if (action === 'create') {
      const mode = await vscode.window.showQuickPick<SnapshotModeQuickPickItem>(
        [
          {
            label: '$(database) Metadata snapshot',
            description: 'Workspace metadata only; fastest and safest default',
            value: 'metadata',
          },
          {
            label: '$(archive) Full snapshot',
            description: 'Include project source files; excludes RapidKit audit/archive/snapshots',
            value: 'full',
          },
        ],
        {
          title: `Create Snapshot — ${workspaceName}`,
          placeHolder: 'Choose snapshot scope',
          ignoreFocusOut: true,
        }
      );

      if (!mode) {
        return;
      }

      const name = await promptSnapshotName({
        title: `Create Snapshot — ${workspaceName}`,
        prompt: 'Optional snapshot name. Leave empty to let RapidKit generate one.',
        placeHolder: 'before-upgrade',
      });
      if (name === undefined) {
        return;
      }

      const reason = await promptSnapshotReason(`Create Snapshot — ${workspaceName}`);
      if (reason === undefined) {
        return;
      }

      const command = ['snapshot', 'create'];
      if (name) {
        command.push(name);
      }
      if (mode.value === 'full') {
        command.push('--include-projects');
      }
      if (reason) {
        command.push('--reason', reason);
      }

      runRapidkitCommandsInTerminal({
        name: `Workspai: Snapshot Create — ${workspaceName}`,
        cwd: workspacePath,
        commands: [command],
      });
      return;
    }

    const name = await promptSnapshotName({
      title:
        action === 'inspect'
          ? `Inspect Snapshot — ${workspaceName}`
          : `Restore Snapshot — ${workspaceName}`,
      prompt: 'Snapshot name',
      placeHolder: 'before-upgrade',
      required: true,
    });
    if (!name) {
      return;
    }

    if (action === 'inspect') {
      runRapidkitCommandsInTerminal({
        name: `Workspai: Snapshot Inspect — ${workspaceName}`,
        cwd: workspacePath,
        commands: [['snapshot', 'inspect', name]],
      });
      return;
    }

    const restoreMode = await vscode.window.showQuickPick<SnapshotRestoreModeQuickPickItem>(
      [
        {
          label: '$(search) Dry run',
          description: 'Preview restore impact without changing files',
          value: 'dry-run',
        },
        {
          label: '$(warning) Restore with --force',
          description: 'Apply restore; RapidKit creates a safety snapshot first',
          value: 'force',
        },
      ],
      {
        title: `Restore Snapshot — ${workspaceName}`,
        placeHolder: 'Choose restore mode',
        ignoreFocusOut: true,
      }
    );

    if (!restoreMode) {
      return;
    }

    const command = ['snapshot', 'restore', name];
    if (restoreMode.value === 'dry-run') {
      command.push('--dry-run');
    } else {
      const confirmed = await vscode.window.showWarningMessage(
        `Restore snapshot "${name}" into workspace "${workspaceName}"? RapidKit will use --force and create a safety snapshot first.`,
        { modal: true },
        'Restore Snapshot'
      );
      if (confirmed !== 'Restore Snapshot') {
        return;
      }

      const reason = await promptSnapshotReason(`Restore Snapshot — ${workspaceName}`);
      if (reason === undefined) {
        return;
      }

      command.push('--force');
      if (reason) {
        command.push('--reason', reason);
      }
    }

    runRapidkitCommandsInTerminal({
      name: `Workspai: Snapshot Restore — ${workspaceName}`,
      cwd: workspacePath,
      commands: appendWorkspaceCommandRefresh('workspaceSnapshotRestore', [command]),
    });
  };

  const runWorkspaceContractAction = async (
    item: unknown,
    action: WorkspaceContractAction
  ): Promise<void> => {
    const workspaceTarget = requireWorkspaceTarget(item, getWorkspaceExplorer());
    if (!workspaceTarget) {
      return;
    }

    const { workspacePath, workspaceName } = workspaceTarget;
    const contractPath = path.join(workspacePath, '.rapidkit', 'workspace.contract.json');

    if (action === 'open') {
      const fsContract = await import('fs-extra');
      if (!(await fsContract.default.pathExists(contractPath))) {
        const selected = await vscode.window.showInformationMessage(
          `No workspace contract exists for "${workspaceName}".`,
          'Initialize Contract'
        );
        if (selected === 'Initialize Contract') {
          await runWorkspaceContractAction(item, 'init');
        }
        return;
      }
      const document = await vscode.workspace.openTextDocument(contractPath);
      await vscode.window.showTextDocument(document);
      return;
    }

    const command = ['workspace', 'contract', action];
    if (action === 'verify') {
      command.push('--strict');
    }
    if (action === 'inspect' || action === 'verify' || action === 'graph') {
      command.push('--json');
    }

    runRapidkitCommandsInTerminal({
      name: `Workspai: Contract ${action} — ${workspaceName}`,
      cwd: workspacePath,
      commands:
        action === 'init'
          ? appendWorkspaceCommandRefresh('workspaceContractInit', [command])
          : [command],
    });
  };

  return [
    vscode.commands.registerCommand('workspai.workspaceContract', async (item?: unknown) => {
      const selected = await vscode.window.showQuickPick<ContractActionQuickPickItem>(
        [
          {
            label: '$(add) Initialize contract',
            description: 'Create .rapidkit/workspace.contract.json',
            value: 'init',
          },
          {
            label: '$(json) Inspect contract',
            description: 'Print the current contract as JSON',
            value: 'inspect',
          },
          {
            label: '$(shield) Verify contract',
            description: 'Strictly validate ports, dependencies, events, and paths',
            value: 'verify',
          },
          {
            label: '$(type-hierarchy) Show graph',
            description: 'Render service/dependency/event topology in terminal',
            value: 'graph',
          },
          {
            label: '$(go-to-file) Open contract file',
            description: 'Open the canonical contract JSON',
            value: 'open',
          },
        ],
        {
          title: 'Workspace Contract',
          placeHolder: 'Choose contract operation',
          ignoreFocusOut: true,
        }
      );

      if (!selected) {
        return;
      }

      await runWorkspaceContractAction(item, selected.value);
    }),

    vscode.commands.registerCommand('workspai.workspaceContractInit', async (item?: unknown) => {
      await runWorkspaceContractAction(item, 'init');
    }),

    vscode.commands.registerCommand('workspai.workspaceContractInspect', async (item?: unknown) => {
      await runWorkspaceContractAction(item, 'inspect');
    }),

    vscode.commands.registerCommand('workspai.workspaceContractVerify', async (item?: unknown) => {
      await runWorkspaceContractAction(item, 'verify');
    }),

    vscode.commands.registerCommand('workspai.workspaceContractGraph', async (item?: unknown) => {
      await runWorkspaceContractAction(item, 'graph');
    }),

    vscode.commands.registerCommand('workspai.workspaceContractOpen', async (item?: unknown) => {
      await runWorkspaceContractAction(item, 'open');
    }),

    vscode.commands.registerCommand('workspai.workspaceSnapshot', async (item?: unknown) => {
      const selected = await vscode.window.showQuickPick<SnapshotActionQuickPickItem>(
        [
          {
            label: '$(add) Create snapshot',
            description: 'Create metadata or full workspace snapshot',
            value: 'create',
          },
          {
            label: '$(list-tree) List snapshots',
            description: 'Show snapshots recorded in this workspace',
            value: 'list',
          },
          {
            label: '$(search) Inspect snapshot',
            description: 'Show manifest, file count, size, and project metadata',
            value: 'inspect',
          },
          {
            label: '$(history) Restore snapshot',
            description: 'Dry-run or apply a guarded restore',
            value: 'restore',
          },
        ],
        {
          title: 'Workspace Snapshots',
          placeHolder: 'Choose snapshot operation',
          ignoreFocusOut: true,
        }
      );

      if (!selected) {
        return;
      }

      await runWorkspaceSnapshotAction(item, selected.value);
    }),

    vscode.commands.registerCommand('workspai.workspaceSnapshotCreate', async (item?: unknown) => {
      await runWorkspaceSnapshotAction(item, 'create');
    }),

    vscode.commands.registerCommand('workspai.workspaceSnapshotList', async (item?: unknown) => {
      await runWorkspaceSnapshotAction(item, 'list');
    }),

    vscode.commands.registerCommand('workspai.workspaceSnapshotInspect', async (item?: unknown) => {
      await runWorkspaceSnapshotAction(item, 'inspect');
    }),

    vscode.commands.registerCommand('workspai.workspaceSnapshotRestore', async (item?: unknown) => {
      await runWorkspaceSnapshotAction(item, 'restore');
    }),

    vscode.commands.registerCommand('workspai.workspaceBootstrap', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }
      const wsName = workspaceName || path.basename(workspacePath);
      const commandItem = asWorkspaceCommandItem(item);
      const existingProfile = await readWorkspaceBootstrapProfile(workspacePath);
      const profileHint = readBootstrapProfileHint(commandItem);
      const forceProfilePrompt =
        commandItem?.forceProfilePrompt === true ||
        shouldPromptForWorkspaceCommandPreset({
          source: commandItem?.source,
          preset: profileHint,
          forcePresetPrompt: commandItem?.forceProfilePrompt,
        });

      let selectedProfile: WorkspaceBootstrapProfile | undefined;

      if (forceProfilePrompt) {
        const profile = await vscode.window.showQuickPick<ProfileQuickPickItem>(
          WORKSPACE_BOOTSTRAP_PROFILE_OPTIONS,
          {
            placeHolder: existingProfile
              ? `Current profile: ${existingProfile} — select to change`
              : 'Select a bootstrap profile',
            title: `Bootstrap Workspace: ${wsName}`,
            ignoreFocusOut: true,
          }
        );
        if (!profile) {
          return;
        }
        selectedProfile = profile.value;
      } else if (existingProfile) {
        selectedProfile = existingProfile;
      } else if (profileHint) {
        selectedProfile = profileHint;
      } else {
        const profile = await vscode.window.showQuickPick<ProfileQuickPickItem>(
          WORKSPACE_BOOTSTRAP_PROFILE_OPTIONS,
          {
            placeHolder: 'Select a bootstrap profile',
            title: `Bootstrap Workspace: ${wsName}`,
            ignoreFocusOut: true,
          }
        );
        if (!profile) {
          return;
        }
        selectedProfile = profile.value;
      }

      if (!selectedProfile) {
        return;
      }

      const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
      try {
        const fsBootstrap = await import('fs-extra');
        if (await fsBootstrap.default.pathExists(manifestPath)) {
          const manifest = await fsBootstrap.default.readJSON(manifestPath);
          manifest.profile = selectedProfile;
          await fsBootstrap.default.writeJSON(manifestPath, manifest, { spaces: 2 });
        }
      } catch (error) {
        logger.warn('Failed to update workspace profile in manifest', {
          code: 'WORKSPACE_MANIFEST_PROFILE_UPDATE_FAILED',
          workspacePath: toSafePathHint(workspacePath),
          manifestPath: toSafePathHint(manifestPath),
          error: error instanceof Error ? error.message : String(error),
          isRecoverable: true,
        });
      }

      runRapidkitCommandsInTerminal({
        name: `Workspai: Bootstrap — ${wsName}`,
        cwd: workspacePath,
        commands: [['bootstrap', '--profile', selectedProfile]],
      });
    }),

    vscode.commands.registerCommand('workspai.workspaceSetup', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }
      const wsName = workspaceName || path.basename(workspacePath);
      const commandItem = asWorkspaceCommandItem(item);
      const preferProfileSetupRuntimes = commandItem?.preferProfileSetupRuntimes === true;
      const directSetupRuntime =
        typeof commandItem?.setupRuntime === 'string' ? commandItem.setupRuntime.trim() : '';

      if (preferProfileSetupRuntimes) {
        const profile = await readWorkspaceBootstrapProfile(workspacePath);
        const runtimes = profile ? PROFILE_SETUP_RUNTIMES[profile] : [];
        if (runtimes.length > 0) {
          runRapidkitCommandsInTerminal({
            name: `Workspai: Setup — ${wsName}`,
            cwd: workspacePath,
            env: {
              RAPIDKIT_ENABLE_RUNTIME_ADAPTERS: '1',
            },
            commands: runtimes.map((runtime) => ['setup', runtime]),
          });
          return;
        }
      }

      if (directSetupRuntime) {
        runRapidkitCommandsInTerminal({
          name: `Workspai: Setup — ${wsName}`,
          cwd: workspacePath,
          env: {
            RAPIDKIT_ENABLE_RUNTIME_ADAPTERS: '1',
          },
          commands: [['setup', directSetupRuntime]],
        });
        return;
      }

      const runtime = await vscode.window.showQuickPick<RuntimeQuickPickItem>(
        [
          {
            label: '$(symbol-namespace) python',
            description: 'Check Python prerequisites (version + venv)',
            value: 'python',
          },
          {
            label: '$(package) node',
            description: 'Check Node.js / npm prerequisites',
            value: 'node',
          },
          {
            label: '$(go) go',
            description: 'Check Go runtime prerequisites',
            value: 'go',
          },
          {
            label: '$(symbol-class) java',
            description: 'Check Java / Maven / Gradle prerequisites',
            value: 'java',
          },
          {
            label: '$(symbol-interface) dotnet',
            description: 'Check .NET SDK prerequisites',
            value: 'dotnet',
          },
        ],
        {
          placeHolder: 'Select runtime to verify',
          title: `Setup Runtime — ${wsName}`,
          ignoreFocusOut: true,
        }
      );
      if (!runtime) {
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Setup — ${wsName}`,
        cwd: workspacePath,
        env: {
          RAPIDKIT_ENABLE_RUNTIME_ADAPTERS: '1',
        },
        commands: [['setup', runtime.value]],
      });
    }),

    vscode.commands.registerCommand('workspai.workspaceSync', async (item?: unknown) => {
      const workspaceTarget = requireWorkspaceTarget(item, getWorkspaceExplorer());
      if (!workspaceTarget) {
        return;
      }

      const { workspacePath, workspaceName } = workspaceTarget;
      runRapidkitCommandsInTerminal({
        name: `Workspai: Workspace Sync — ${workspaceName}`,
        cwd: workspacePath,
        commands: [['workspace', 'sync']],
      });
      logger.info(`Running workspace sync for: ${workspacePath}`);
    }),

    vscode.commands.registerCommand(
      'workspai.workspaceFoundationEnsure',
      async (item?: unknown) => {
        const workspaceTarget = requireWorkspaceTarget(item, getWorkspaceExplorer());
        if (!workspaceTarget) {
          return;
        }

        const { workspacePath, workspaceName } = workspaceTarget;
        const requestedMode =
          item &&
          typeof item === 'object' &&
          ((item as WorkspaceCommandItem).mode === 'ensure' ||
            (item as WorkspaceCommandItem).mode === 'force')
            ? ((item as WorkspaceCommandItem).mode as 'ensure' | 'force')
            : undefined;

        const mode =
          requestedMode ??
          (
            await vscode.window.showQuickPick(
              [
                {
                  label: '$(check) Ensure foundation',
                  description: 'Create missing foundation files only (non-destructive)',
                  value: 'ensure' as const,
                },
                {
                  label: '$(sync) Force re-sync foundation',
                  description: 'Rewrite foundation files from current defaults (--force)',
                  value: 'force' as const,
                },
              ],
              {
                title: `Workspace Foundation — ${workspaceName}`,
                placeHolder: 'Choose foundation mode',
                ignoreFocusOut: true,
              }
            )
          )?.value;

        if (!mode) {
          return;
        }

        const command = ['workspace', 'foundation', 'ensure'];
        if (mode === 'force') {
          const confirmed = await vscode.window.showWarningMessage(
            `Force re-sync foundation files for "${workspaceName}"? Existing workspace marker, policies, and toolchain stubs will be rewritten from defaults.`,
            { modal: true },
            'Re-sync Foundation'
          );
          if (confirmed !== 'Re-sync Foundation') {
            return;
          }
          command.push('--force');
        }
        if (item && typeof item === 'object' && (item as WorkspaceCommandItem).json === true) {
          command.push('--json');
        }

        runRapidkitCommandsInTerminal({
          name: `Workspai: Foundation — ${workspaceName}`,
          cwd: workspacePath,
          commands: appendWorkspaceCommandRefresh('workspaceFoundationEnsure', [command]),
        });
        logger.info(`Running workspace foundation ensure for: ${workspacePath}`);
      }
    ),

    vscode.commands.registerCommand('workspai.workspaceInit', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }
      const wsName = workspaceName || path.basename(workspacePath);
      runRapidkitCommandsInTerminal({
        name: `Workspai: Workspace Run Init — ${wsName}`,
        cwd: workspacePath,
        commands: [['workspace', 'run', 'init']],
      });
    }),

    vscode.commands.registerCommand('workspai.workspaceRunInit', async (item?: unknown) => {
      await runWorkspaceStageCommand(item, 'init');
    }),

    vscode.commands.registerCommand('workspai.workspaceRunTest', async (item?: unknown) => {
      await runWorkspaceStageCommand(item, 'test');
    }),

    vscode.commands.registerCommand('workspai.workspaceRunBuild', async (item?: unknown) => {
      await runWorkspaceStageCommand(item, 'build');
    }),

    vscode.commands.registerCommand('workspai.workspaceRunStart', async (item?: unknown) => {
      await runWorkspaceStageCommand(item, 'start');
    }),

    vscode.commands.registerCommand('workspai.workspaceWatch', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }
      const wsName = workspaceName || path.basename(workspacePath);
      runRapidkitCommandsInTerminal({
        name: `Workspai: Workspace Watch — ${wsName}`,
        cwd: workspacePath,
        commands: [['workspace', 'watch', '--once', '--json']],
      });
    }),

    vscode.commands.registerCommand('workspai.workspaceMcp', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }
      const wsName = workspaceName || path.basename(workspacePath);
      void vscode.window.showInformationMessage(
        'Workspace MCP serve starts a stdio MCP server in the integrated terminal. Stop it with Ctrl+C when finished.'
      );
      runRapidkitCommandsInTerminal({
        name: `Workspai: Workspace MCP — ${wsName}`,
        cwd: workspacePath,
        commands: [['workspace', 'mcp', 'serve']],
      });
    }),

    vscode.commands.registerCommand(
      'workspai.workspaceAutopilotRelease',
      async (item?: unknown) => {
        await runWorkspaceAutopilotReleaseCommand(item);
      }
    ),

    vscode.commands.registerCommand('workspai.workspaceAnalyze', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }

      const wsName = workspaceName || path.basename(workspacePath);
      // Create a platform-independent CLI-friendly output path (use POSIX separators)
      const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'analyze-last-run.json');
      const reportOutputPath = reportPath.split(path.sep).join(path.posix.sep);

      runRapidkitCommandsInTerminal({
        name: `Workspai: Analyze Workspace — ${wsName}`,
        cwd: workspacePath,
        commands: [['analyze', '--json', '--output', reportOutputPath]],
      });
    }),

    vscode.commands.registerCommand('workspai.workspaceReadiness', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }

      const wsName = workspaceName || path.basename(workspacePath);
      runRapidkitCommandsInTerminal({
        name: `Workspai: Readiness — ${wsName}`,
        cwd: workspacePath,
        commands: [['readiness', '--json']],
      });
    }),

    vscode.commands.registerCommand('workspai.workspacePipeline', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }

      const wsName = workspaceName || path.basename(workspacePath);
      // Single Governance Gate entrypoint: streamed `pipeline --json --strict`
      // with a definitive pass/blocked verdict (roadmap item 2.6).
      await runGovernanceGate({ workspacePath, workspaceName: wsName });
    }),

    vscode.commands.registerCommand('workspai.workspaceRunStage', async (item?: unknown) => {
      const typedItem = asWorkspaceCommandItem(item);
      const requestedStage = parseWorkspaceRunStage(typedItem?.stage);
      if (requestedStage) {
        await runWorkspaceStageCommand(item, requestedStage);
        return;
      }

      const selected = await vscode.window.showQuickPick(
        [
          { label: 'init', description: 'Fleet initialization stage', value: 'init' as const },
          { label: 'test', description: 'Fleet test stage', value: 'test' as const },
          { label: 'build', description: 'Fleet build stage', value: 'build' as const },
          { label: 'start', description: 'Fleet start stage', value: 'start' as const },
        ],
        {
          title: 'Workspace Run Stage',
          placeHolder: 'Select workspace run stage',
          ignoreFocusOut: true,
        }
      );

      if (!selected) {
        return;
      }

      await runWorkspaceStageCommand(item, selected.value);
    }),

    vscode.commands.registerCommand('workspai.workspacePolicyShow', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }

      const wsName = workspaceName || path.basename(workspacePath);
      runRapidkitCommandsInTerminal({
        name: `Workspai: Policy — ${wsName}`,
        cwd: workspacePath,
        commands: [['workspace', 'policy', 'show']],
      });
    }),

    vscode.commands.registerCommand(
      'workspai.exportWorkspaceShareBundle',
      async (item?: unknown) => {
        const workspaceExplorer = getWorkspaceExplorer();
        const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
        if (!workspacePath) {
          vscode.window.showErrorMessage('No workspace selected.');
          return;
        }

        const wsName = workspaceName || path.basename(workspacePath);
        const selectedFlags = await vscode.window.showQuickPick(
          [
            {
              label: 'Include absolute paths',
              description: 'Adds absolute workspace/project paths to the share bundle',
              value: 'include-paths',
            },
            {
              label: 'Exclude doctor evidence',
              description: 'Skips doctor section in exported bundle',
              value: 'no-doctor',
            },
          ],
          {
            title: `Workspace Share Export: ${wsName}`,
            placeHolder: 'Choose export options (optional)',
            canPickMany: true,
            ignoreFocusOut: true,
          }
        );

        if (!selectedFlags) {
          return;
        }

        const defaultUri = vscode.Uri.file(
          path.join(workspacePath, '.rapidkit', 'reports', 'share-bundle.json')
        );

        const outputUri = await vscode.window.showSaveDialog({
          title: `Export Workspace Share Bundle: ${wsName}`,
          saveLabel: 'Export Share Bundle',
          defaultUri,
          filters: {
            JSON: ['json'],
          },
        });

        if (!outputUri) {
          return;
        }

        const command: string[] = ['workspace', 'share', '--output', outputUri.fsPath];
        if (selectedFlags.some((item) => item.value === 'include-paths')) {
          command.push('--include-paths');
        }
        if (selectedFlags.some((item) => item.value === 'no-doctor')) {
          command.push('--no-doctor');
        }

        runRapidkitCommandsInTerminal({
          name: `Workspai: Share Export — ${wsName}`,
          cwd: workspacePath,
          commands: [command],
        });
      }
    ),

    vscode.commands.registerCommand('workspai.workspacePolicySet', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }

      const wsName = workspaceName || path.basename(workspacePath);
      const policyKey = await vscode.window.showQuickPick(
        [
          {
            label: 'mode',
            description: 'warn | strict',
          },
          {
            label: 'dependency_sharing_mode',
            description: 'isolated | shared-runtime-caches | shared-node-deps',
          },
          {
            label: 'rules.enforce_workspace_marker',
            description: 'true | false',
          },
          {
            label: 'rules.enforce_toolchain_lock',
            description: 'true | false',
          },
          {
            label: 'rules.disallow_untrusted_tool_sources',
            description: 'true | false',
          },
          {
            label: 'rules.enforce_compatibility_matrix',
            description: 'true | false',
          },
          {
            label: 'rules.require_mirror_lock_for_offline',
            description: 'true | false',
          },
        ],
        {
          placeHolder: 'Select workspace policy key to update',
          title: `Workspace Policy: ${wsName}`,
          ignoreFocusOut: true,
        }
      );

      if (!policyKey) {
        return;
      }

      let policyValue: string | undefined;

      if (policyKey.label === 'mode') {
        const selected = await vscode.window.showQuickPick(['warn', 'strict'], {
          placeHolder: 'Select mode value',
          title: `Workspace Policy: ${policyKey.label}`,
          ignoreFocusOut: true,
        });
        policyValue = selected;
      } else if (policyKey.label === 'dependency_sharing_mode') {
        const selected = await vscode.window.showQuickPick(
          ['isolated', 'shared-runtime-caches', 'shared-node-deps'],
          {
            placeHolder: 'Select dependency sharing mode',
            title: `Workspace Policy: ${policyKey.label}`,
            ignoreFocusOut: true,
          }
        );
        policyValue = selected;
      } else {
        const selected = await vscode.window.showQuickPick(['true', 'false'], {
          placeHolder: 'Select boolean value',
          title: `Workspace Policy: ${policyKey.label}`,
          ignoreFocusOut: true,
        });
        policyValue = selected;
      }

      if (!policyValue) {
        return;
      }

      if (
        !(await confirmWorkspaceCommandSafety({
          commandId: 'workspacePolicySet',
          workspaceName: wsName,
        }))
      ) {
        return;
      }

      runRapidkitCommandsInTerminal({
        name: `Workspai: Policy — ${wsName}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh('workspacePolicySet', [
          ['workspace', 'policy', 'set', policyKey.label, policyValue],
        ]),
      });
    }),

    vscode.commands.registerCommand('workspai.cacheStatus', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Cache — ${workspaceName || path.basename(workspacePath)}`,
        cwd: workspacePath,
        commands: [['cache', 'status']],
      });
    }),

    vscode.commands.registerCommand('workspai.cacheClear', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      const wsName = workspaceName || path.basename(workspacePath);
      if (
        !(await confirmWorkspaceCommandSafety({
          commandId: 'cacheClear',
          workspaceName: wsName,
        }))
      ) {
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Cache — ${wsName}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh('cacheClear', [['cache', 'clear']]),
      });
    }),

    vscode.commands.registerCommand('workspai.cachePrune', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Cache — ${workspaceName || path.basename(workspacePath)}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh('cachePrune', [['cache', 'prune']]),
      });
    }),

    vscode.commands.registerCommand('workspai.cacheRepair', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Cache — ${workspaceName || path.basename(workspacePath)}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh('cacheRepair', [['cache', 'repair']]),
      });
    }),

    vscode.commands.registerCommand('workspai.mirrorOps', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }

      type MirrorAction = 'status' | 'sync' | 'verify' | 'rotate';
      const actions: Array<{ label: string; description: string; action: MirrorAction }> = [
        {
          label: '$(pulse) Mirror status',
          description: 'Initialize mirror config stub and write mirror-ops evidence',
          action: 'status',
        },
        {
          label: '$(cloud-download) Mirror sync',
          description: 'Sync pinned registry mirror artifacts',
          action: 'sync',
        },
        {
          label: '$(verified) Mirror verify',
          description: 'Verify mirror integrity in offline/CI mode',
          action: 'verify',
        },
        {
          label: '$(refresh) Rotate keys',
          description: 'Re-sign pinned mirror artifacts (destructive)',
          action: 'rotate',
        },
      ];

      const selection = await vscode.window.showQuickPick(actions, {
        title: 'Mirror Operations',
        placeHolder: 'Choose mirror operation',
        ignoreFocusOut: true,
      });
      if (!selection) {
        return;
      }

      const wsName = workspaceName || path.basename(workspacePath);
      if (selection.action === 'rotate') {
        if (
          !(await confirmWorkspaceCommandSafety({
            commandId: 'mirrorRotate',
            workspaceName: wsName,
          }))
        ) {
          return;
        }
      }

      runRapidkitCommandsInTerminal({
        name: `Workspai: Mirror — ${wsName}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh(
          selection.action === 'rotate'
            ? 'mirrorRotate'
            : selection.action === 'sync'
              ? 'mirrorSync'
              : selection.action === 'verify'
                ? 'mirrorVerify'
                : 'mirrorStatus',
          [['mirror', selection.action]]
        ),
      });
    }),

    vscode.commands.registerCommand('workspai.mirrorStatus', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Mirror — ${workspaceName || path.basename(workspacePath)}`,
        cwd: workspacePath,
        commands: [['mirror', 'status']],
      });
    }),

    vscode.commands.registerCommand('workspai.mirrorSync', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Mirror — ${workspaceName || path.basename(workspacePath)}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh('mirrorSync', [['mirror', 'sync']]),
      });
    }),

    vscode.commands.registerCommand('workspai.mirrorVerify', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Mirror — ${workspaceName || path.basename(workspacePath)}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh('mirrorVerify', [['mirror', 'verify']]),
      });
    }),

    vscode.commands.registerCommand('workspai.mirrorRotate', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);
      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected.');
        return;
      }
      const wsName = workspaceName || path.basename(workspacePath);
      if (
        !(await confirmWorkspaceCommandSafety({
          commandId: 'mirrorRotate',
          workspaceName: wsName,
        }))
      ) {
        return;
      }
      runRapidkitCommandsInTerminal({
        name: `Workspai: Mirror — ${wsName}`,
        cwd: workspacePath,
        commands: appendWorkspaceCommandRefresh('mirrorRotate', [['mirror', 'rotate']]),
      });
    }),

    vscode.commands.registerCommand('workspai.checkWorkspaceHealth', async (item: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const target = resolveWorkspaceTarget(item, workspaceExplorer);
      const workspacePath = target.workspacePath;
      let workspaceName = target.workspaceName;
      const typedItem = asWorkspaceCommandItem(item);
      const preferredAction = parsePreferredHealthAction(typedItem?.preferredAction);

      if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace selected');
        return;
      }

      if (!workspaceName) {
        workspaceName = path.basename(workspacePath);
      }

      logger.info('Running doctor check for workspace:', workspaceName);

      const contractRuntime = await evaluateWorkspaiContractRuntime({ workspacePath });
      const c06HealthSummary = summarizeC06Health(contractRuntime);

      const { CoreVersionService } = await import('../core/coreVersionService.js');
      const versionService = CoreVersionService.getInstance();
      const versionInfo = await versionService.getVersionInfo(workspacePath);

      const actions = [
        { label: '$(pulse) Check Health', action: 'check' },
        { label: '$(tools) Check & Auto-fix', action: 'fix' },
        { label: '$(shield) View Compliance Reports', action: 'compliance' },
        { label: '$(info) Show Version Info', action: 'version' },
      ];

      if (versionInfo.status === 'update-available') {
        actions.splice(1, 0, {
          label: `$(arrow-up) Upgrade to v${versionInfo.latest}`,
          action: 'upgrade',
        });
      }

      const selection = preferredAction
        ? actions.find((action) => action.action === preferredAction)
        : await vscode.window.showQuickPick(actions, {
            placeHolder: `Workspai: Health & Version - ${workspaceName}`,
            title: `${versionService.getStatusMessage(versionInfo)} · ${c06HealthSummary}`,
          });

      if (!selection) {
        return;
      }

      switch (selection.action) {
        case 'check':
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `🩺 Checking health of workspace: ${workspaceName}`,
              cancellable: false,
            },
            async (progress) => {
              progress.report({ increment: 0, message: 'Starting health check...' });

              try {
                runRapidkitCommandsInTerminal({
                  name: `Workspai: Doctor - ${workspaceName}`,
                  cwd: workspacePath,
                  commands: [['doctor', 'workspace']],
                });
                progress.report({ increment: 50, message: 'Running diagnostics...' });
                progress.report({ increment: 100, message: 'Complete!' });

                vscode.window.showInformationMessage(
                  `Workspace health check running for "${workspaceName}". ${c06HealthSummary}. Check the terminal for results.`,
                  'OK'
                );
              } catch (error) {
                reportCommandHandlerError({
                  logger,
                  message: 'Error running doctor check',
                  error,
                  code: 'WORKSPACE_DOCTOR_CHECK_FAILED',
                  workspacePath,
                  isRecoverable: true,
                });
                vscode.window.showErrorMessage(
                  `Failed to run health check: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            }
          );
          break;

        case 'fix':
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `🛠️ Checking and fixing workspace: ${workspaceName}`,
              cancellable: false,
            },
            async (progress) => {
              progress.report({ increment: 0, message: 'Starting doctor --fix...' });

              try {
                runRapidkitCommandsInTerminal({
                  name: `Workspai: Doctor Fix - ${workspaceName}`,
                  cwd: workspacePath,
                  commands: [['doctor', 'workspace', '--fix']],
                });
                progress.report({ increment: 50, message: 'Applying safe fixes...' });
                progress.report({ increment: 100, message: 'Complete!' });

                vscode.window.showInformationMessage(
                  `Workspace doctor fix is running for "${workspaceName}". ${c06HealthSummary}. Check the terminal for details.`,
                  'OK'
                );
              } catch (error) {
                reportCommandHandlerError({
                  logger,
                  message: 'Error running doctor fix',
                  error,
                  code: 'WORKSPACE_DOCTOR_FIX_FAILED',
                  workspacePath,
                  isRecoverable: true,
                });
                vscode.window.showErrorMessage(
                  `Failed to run doctor fix: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            }
          );
          break;

        case 'compliance': {
          const fsCompat = await import('fs-extra');
          const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
          try {
            const dirExists = await fsCompat.default.pathExists(reportsDir);
            if (!dirExists) {
              const choice = await vscode.window.showInformationMessage(
                `No compliance reports found for "${workspaceName}".\n\nRun Bootstrap Workspace to generate reports.`,
                'Bootstrap Now'
              );
              if (choice === 'Bootstrap Now') {
                vscode.commands.executeCommand('workspai.workspaceBootstrap', {
                  workspace: { path: workspacePath },
                });
              }
              break;
            }

            const files: string[] = await fsCompat.default.readdir(reportsDir);
            const complianceFiles = files
              .filter((f: string) => f.startsWith('bootstrap-compliance'))
              .sort()
              .reverse();
            const mirrorFiles = files
              .filter((f: string) => f.startsWith('mirror-ops'))
              .sort()
              .reverse();

            if (complianceFiles.length === 0) {
              const manifestPath = path.join(workspacePath, '.rapidkit', 'workspace.json');
              let profileHint = '';
              try {
                if (await fsCompat.default.pathExists(manifestPath)) {
                  const manifest = (await fsCompat.default.readJSON(manifestPath)) as Record<
                    string,
                    unknown
                  >;
                  const profile =
                    typeof manifest.profile === 'string' ? manifest.profile.trim() : '';
                  if (profile) {
                    profileHint = `\n\nProfile "${profile}" was saved at create. Run Bootstrap once to generate the compliance report.`;
                  }
                }
              } catch {
                // ignore manifest read errors
              }
              const choice = await vscode.window.showInformationMessage(
                `No bootstrap-compliance report yet.${profileHint}\n\nRun "Bootstrap Workspace" to generate one.`,
                'Bootstrap Now'
              );
              if (choice === 'Bootstrap Now') {
                vscode.commands.executeCommand('workspai.workspaceBootstrap', {
                  workspace: { path: workspacePath },
                });
              }
              break;
            }

            const reportPath = path.join(reportsDir, complianceFiles[0]);
            const reportData = await fsCompat.default.readJSON(reportPath).catch(() => null);

            const output = vscode.window.createOutputChannel(
              `Workspai: Compliance — ${workspaceName}`
            );
            output.clear();
            output.appendLine(`=== Bootstrap Compliance Report: ${workspaceName} ===`);
            output.appendLine(`File: ${toSafePathHint(reportPath)}`);
            output.appendLine('');

            if (reportData) {
              const rawResult =
                reportData.result || reportData.status || reportData.overall_status || 'unknown';
              const statusLabel =
                rawResult === 'ok'
                  ? 'PASSING'
                  : rawResult === 'ok_with_warnings'
                    ? 'PASSING (with warnings)'
                    : rawResult === 'failed'
                      ? 'FAILING'
                      : rawResult.toUpperCase();
              const statusIcon =
                rawResult === 'ok' || rawResult === 'ok_with_warnings' ? '✅' : '❌';

              const profile = reportData.profile || reportData.bootstrap_profile || 'unknown';
              const timestamp = reportData.generated_at || reportData.timestamp || '';

              output.appendLine(`Status:   ${statusIcon} ${statusLabel}`);
              output.appendLine(`Profile:  ${profile}`);
              if (timestamp) {
                output.appendLine(`Generated: ${timestamp}`);
              }

              const checks = reportData.checks || reportData.rules;
              if (checks) {
                output.appendLine('');
                output.appendLine('--- Rule Results ---');
                if (Array.isArray(checks)) {
                  for (const check of checks) {
                    const icon =
                      check.status === 'passed' ? '✅' : check.status === 'skipped' ? '⏭' : '❌';
                    output.appendLine(`  ${icon} [${check.status}] ${check.id}`);
                    if (check.message) {
                      output.appendLine(`       ${check.message}`);
                    }
                  }
                } else if (typeof checks === 'object') {
                  for (const [rule, result] of Object.entries(checks as Record<string, unknown>)) {
                    const typedResult = result as { status?: string; passed?: boolean };
                    const pass =
                      result === true ||
                      typedResult?.status === 'pass' ||
                      typedResult?.passed === true;
                    output.appendLine(`  ${pass ? '✅' : '❌'} ${rule}`);
                  }
                }
              }

              if (mirrorFiles.length > 0) {
                output.appendLine('');
                output.appendLine(
                  `--- Mirror Reports (${mirrorFiles.length} found, latest: ${mirrorFiles[0]}) ---`
                );
                const latestMirror = await fsCompat.default
                  .readJSON(path.join(reportsDir, mirrorFiles[0]))
                  .catch(() => null);
                if (latestMirror) {
                  const mirrorStatus =
                    latestMirror.status || latestMirror.overall_status || 'unknown';
                  output.appendLine(`  Mirror status: ${mirrorStatus}`);
                }
              }
            } else {
              output.appendLine('(Could not parse report JSON — file may be malformed)');
            }

            // ── Workspace hygiene probes ──────────────────────────────────
            try {
              const hygieneReport = await runWorkspaceHygieneProbes(workspacePath);
              output.appendLine('');
              output.appendLine('--- Workspace Hygiene ---');
              for (const probe of hygieneReport.probes) {
                const icon = probe.status === 'pass' ? '✅' : probe.status === 'warn' ? '⚠️' : '❌';
                output.appendLine(`${icon} ${probe.label}`);
                for (const finding of probe.findings) {
                  output.appendLine(`     Finding: ${finding}`);
                }
                for (const suggestion of probe.suggestions) {
                  output.appendLine(`     Suggestion: ${suggestion}`);
                }
              }
              const hygieneIcon =
                hygieneReport.overallStatus === 'pass'
                  ? '✅'
                  : hygieneReport.overallStatus === 'warn'
                    ? '⚠️'
                    : '❌';
              output.appendLine(
                `${hygieneIcon} Overall hygiene: ${hygieneReport.overallStatus.toUpperCase()}`
              );
            } catch (hygieneErr) {
              logger.warn('Hygiene probes failed (non-fatal)', {
                errorCode: 'WORKSPACE_HYGIENE_PROBES_FAILED',
                isRecoverable: true,
                workspacePath: toSafePathHint(workspacePath),
                error: hygieneErr instanceof Error ? hygieneErr.message : String(hygieneErr),
              });
            }

            output.appendLine('');
            output.appendLine('All reports: .rapidkit/reports');
            output.show();
          } catch (error) {
            reportCommandHandlerError({
              logger,
              message: 'Error reading compliance reports',
              error,
              code: 'WORKSPACE_COMPLIANCE_READ_FAILED',
              workspacePath,
              isRecoverable: true,
            });
            vscode.window.showErrorMessage(
              `Failed to read compliance reports: ${error instanceof Error ? error.message : String(error)}`
            );
          }
          break;
        }

        case 'version': {
          const locationText = versionInfo.location
            ? `\n\n**Location:** ${toSafePathHint(versionInfo.location)}`
            : '';
          const pathText = versionInfo.path
            ? `\n**Path:** ${toSafePathHint(versionInfo.path)}`
            : '';
          const updateText =
            versionInfo.status === 'update-available'
              ? `\n\n**💡 Update Available:** v${versionInfo.latest}`
              : '';

          await vscode.window.showInformationMessage(
            `**RapidKit Core**\n\n**Installed:** v${versionInfo.installed || 'Not installed'}${locationText}${pathText}${updateText}`,
            { modal: true },
            'OK'
          );
          break;
        }

        case 'upgrade': {
          const confirmUpgrade = await vscode.window.showInformationMessage(
            `Upgrade RapidKit Core from v${versionInfo.installed} to v${versionInfo.latest}?`,
            'Upgrade',
            'Cancel'
          );

          if (confirmUpgrade === 'Upgrade') {
            if (versionInfo.location === 'workspace') {
              runShellCommandInTerminal({
                name: `Workspai: Upgrade - ${workspaceName}`,
                cwd: workspacePath,
                command: 'poetry',
                args: ['update', 'rapidkit-core'],
              });
            } else {
              runShellCommandInTerminal({
                name: `Workspai: Upgrade - ${workspaceName}`,
                cwd: workspacePath,
                command: 'pipx',
                args: ['upgrade', 'rapidkit-core'],
              });
            }

            vscode.window.showInformationMessage(
              'Upgrading RapidKit Core... Check terminal for progress.',
              'OK'
            );

            versionService.clearCache(workspacePath);
          }
          break;
        }
      }
    }),

    vscode.commands.registerCommand('workspai.checkForUpdates', async () => {
      const { forceCheckForUpdates } = await import('../utils/updateChecker.js');
      await forceCheckForUpdates(context);
    }),

    vscode.commands.registerCommand('workspai.exportVerifyPackContract', async (item?: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const { workspacePath, workspaceName } = resolveWorkspaceTarget(item, workspaceExplorer);

      if (!workspacePath) {
        vscode.window.showErrorMessage(
          'No workspace selected. Select a workspace in the sidebar first.'
        );
        return;
      }

      const wsName = workspaceName || path.basename(workspacePath);

      // Enumerate projects in the workspace using RapidKit markers.
      const fsCompat = await import('fs-extra');
      const projectEntries: Array<{ label: string; description: string; projectPath: string }> = [];

      try {
        const entries = await fsCompat.default.readdir(workspacePath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) {
            continue;
          }
          const projectPath = path.join(workspacePath, entry.name);
          const hasMarker =
            (await fsCompat.default.pathExists(
              path.join(projectPath, '.rapidkit', 'project.json')
            )) ||
            (await fsCompat.default.pathExists(
              path.join(projectPath, '.rapidkit', 'context.json')
            )) ||
            (await fsCompat.default.pathExists(path.join(projectPath, 'package.json'))) ||
            (await fsCompat.default.pathExists(path.join(projectPath, 'pyproject.toml')));
          if (hasMarker) {
            projectEntries.push({
              label: entry.name,
              description: projectPath,
              projectPath,
            });
          }
        }
      } catch (err) {
        reportCommandHandlerError({
          logger,
          message: 'Error scanning workspace projects',
          error: err,
          code: 'WORKSPACE_PROJECT_SCAN_FAILED',
          workspacePath,
          isRecoverable: true,
        });
      }

      if (projectEntries.length === 0) {
        vscode.window.showWarningMessage(
          `No projects found in workspace "${wsName}". Verify the workspace contains project directories.`
        );
        return;
      }

      const pickedProject =
        projectEntries.length === 1
          ? projectEntries[0]
          : await vscode.window.showQuickPick(projectEntries, {
              title: `Export Verify-Pack Contract — ${wsName}`,
              placeHolder: 'Select a project to verify',
              ignoreFocusOut: true,
            });

      if (!pickedProject) {
        return;
      }

      const projectPath = pickedProject.projectPath;
      const projectName = path.basename(projectPath);

      // Detect project type from markers to pick the right verify-pack profile.
      let projectType: string | undefined;
      let packageManager: 'npm' | 'pnpm' | 'yarn' | undefined;

      try {
        const rapidkitContextPath = path.join(projectPath, '.rapidkit', 'context.json');
        const rapidkitProjectPath = path.join(projectPath, '.rapidkit', 'project.json');

        for (const metaPath of [rapidkitContextPath, rapidkitProjectPath]) {
          if (await fsCompat.default.pathExists(metaPath)) {
            const meta = await fsCompat.default.readJSON(metaPath).catch(() => null);
            if (meta?.kit_type) {
              projectType = String(meta.kit_type);
              break;
            }
            if (meta?.projectType) {
              projectType = String(meta.projectType);
              break;
            }
          }
        }

        // Fallback: infer from package.json presence
        if (!projectType) {
          if (await fsCompat.default.pathExists(path.join(projectPath, 'package.json'))) {
            const pkg = await fsCompat.default
              .readJSON(path.join(projectPath, 'package.json'))
              .catch(() => null);
            if (pkg?.dependencies?.['@nestjs/core'] || pkg?.devDependencies?.['@nestjs/core']) {
              projectType = 'nestjs.standard';
            } else if (pkg?.dependencies?.['express'] || pkg?.devDependencies?.['express']) {
              projectType = 'express';
            } else {
              projectType = 'node';
            }

            if (await fsCompat.default.pathExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
              packageManager = 'pnpm';
            } else if (await fsCompat.default.pathExists(path.join(projectPath, 'yarn.lock'))) {
              packageManager = 'yarn';
            } else {
              packageManager = 'npm';
            }
          } else if (await fsCompat.default.pathExists(path.join(projectPath, 'pyproject.toml'))) {
            projectType = 'python';
          }
        }
      } catch (err) {
        logger.warn('Failed to detect project type — using generic profile', {
          errorCode: 'VERIFY_PACK_PROJECT_TYPE_DETECTION_FAILED',
          isRecoverable: true,
          workspacePath: toSafePathHint(workspacePath),
          projectPath: toSafePathHint(projectPath),
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Running verify-pack for "${projectName}"…`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: 'Building verify plan…' });

          try {
            progress.report({ increment: 10, message: 'Starting simulation…' });

            const result = await exportVerifyPackContractToWorkspace({
              workspacePath,
              projectPath,
              planInput: {
                projectType,
                packageManager,
                projectPath,
              },
              commandTimeoutMs: 90_000,
              maxTotalDurationMs: 600_000,
            });

            progress.report({ increment: 90, message: 'Writing contract…' });

            const statusIcon =
              result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭';
            const contractFileName = path.basename(result.contractPath);
            const passedCount = result.contract.summary.passedCommands;
            const totalCount = result.contract.summary.totalCommands;

            logger.info(`Verify-pack contract exported: ${result.contractPath}`);

            const selectedAction = await vscode.window.showInformationMessage(
              `${statusIcon} Verify-pack complete (${passedCount}/${totalCount} passed).\nContract: .rapidkit/reports/${contractFileName}`,
              'Copy Contract Path',
              'Open Reports Folder'
            );

            if (selectedAction === 'Copy Contract Path') {
              await vscode.env.clipboard.writeText(result.contractPath);
            } else if (selectedAction === 'Open Reports Folder') {
              await vscode.commands.executeCommand(
                'revealFileInOS',
                vscode.Uri.file(path.dirname(result.contractPath))
              );
            }
          } catch (err) {
            reportCommandHandlerError({
              logger,
              message: 'Export verify-pack contract failed',
              error: err,
              code: 'VERIFY_PACK_EXPORT_FAILED',
              workspacePath,
              isRecoverable: true,
            });
            vscode.window.showErrorMessage(
              `Verify-pack export failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      );
    }),
  ];
}
