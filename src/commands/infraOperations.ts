import * as vscode from 'vscode';
import path from 'path';
import { Logger } from '../utils/logger';
import { runGatedRapidkitCommandsInTerminal } from '../core/gatedRapidkitTerminal';
import { appendWorkspaceCommandRefresh } from '../core/workspaceCommandSafety';

type WorkspaceExplorerLike = {
  getSelectedWorkspace?: () => { path: string; name?: string } | null | undefined;
};

type InfraCommandItem = {
  workspace?: { path?: unknown; name?: unknown };
  path?: unknown;
  name?: unknown;
};

type InfraAction = 'plan' | 'up' | 'down' | 'status' | 'open-compose';

type InfraActionQuickPickItem = vscode.QuickPickItem & { value: InfraAction };

async function runInfraRapidkitCommand(input: {
  name: string;
  workspacePath: string;
  commands: string[][];
}): Promise<boolean> {
  return runGatedRapidkitCommandsInTerminal({
    name: input.name,
    cwd: input.workspacePath,
    commands: input.commands,
  });
}

function getItemWorkspacePath(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item;
  }
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  const typed = item as InfraCommandItem;
  const candidate = typed.workspace?.path ?? typed.path;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function getItemWorkspaceName(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  const typed = item as InfraCommandItem;
  const candidate = typed.workspace?.name ?? typed.name;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function resolveInfraTarget(
  item: unknown,
  workspaceExplorer?: WorkspaceExplorerLike
): { workspacePath: string; workspaceName: string } | undefined {
  const selected = workspaceExplorer?.getSelectedWorkspace?.();
  const workspacePath = getItemWorkspacePath(item) ?? selected?.path;
  if (!workspacePath) {
    vscode.window.showErrorMessage(
      'No workspace selected. Select a workspace in the sidebar first.'
    );
    return undefined;
  }

  const workspaceName =
    getItemWorkspaceName(item) ?? selected?.name ?? path.basename(workspacePath);

  return { workspacePath, workspaceName };
}

async function isDockerAvailable(): Promise<boolean> {
  try {
    const { execa } = await import('execa');
    const result = await execa('docker', ['--version'], { timeout: 5000, reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function ensureDockerOrExplain(action: InfraAction): Promise<boolean> {
  if (await isDockerAvailable()) {
    return true;
  }

  const choice = await vscode.window.showErrorMessage(
    `Docker is required to run "infra ${action}" but was not found on PATH. Install Docker (or Docker Desktop) and try again.`,
    'Open Docker Docs',
    'Cancel'
  );
  if (choice === 'Open Docker Docs') {
    vscode.env.openExternal(vscode.Uri.parse('https://docs.docker.com/get-docker/'));
  }
  return false;
}

async function pickInfraPlanFlags(workspaceName: string): Promise<string[] | undefined> {
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'Dry run',
        description: 'Compute the plan without writing compose artifacts',
        value: 'dry-run',
      },
      {
        label: 'Verbose output',
        description: 'Show discovery details per module and env source',
        value: 'verbose',
      },
      {
        label: 'JSON output',
        description: 'Emit machine-readable plan payload',
        value: 'json',
      },
    ],
    {
      title: `Infra Plan — ${workspaceName}`,
      placeHolder: 'Select optional plan flags (optional)',
      canPickMany: true,
      ignoreFocusOut: true,
    }
  );

  if (!selected) {
    return undefined;
  }

  const values = new Set(selected.map((item) => item.value));
  const flags: string[] = [];
  if (values.has('dry-run')) {
    flags.push('--dry-run');
  }
  if (values.has('verbose')) {
    flags.push('--verbose');
  }
  if (values.has('json')) {
    flags.push('--json');
  }
  return flags;
}

async function pickInfraUpFlags(workspaceName: string): Promise<string[] | undefined> {
  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'Rebuild images',
        description: 'Pass --build to docker compose up',
        value: 'build',
      },
      {
        label: 'Skip plan refresh',
        description: 'Reuse the existing compose file without re-planning (--no-plan)',
        value: 'no-plan',
      },
    ],
    {
      title: `Infra Up — ${workspaceName}`,
      placeHolder: 'Select optional flags (optional)',
      canPickMany: true,
      ignoreFocusOut: true,
    }
  );

  if (!selected) {
    return undefined;
  }

  const values = new Set(selected.map((item) => item.value));
  const flags: string[] = [];
  if (values.has('build')) {
    flags.push('--build');
  }
  if (values.has('no-plan')) {
    flags.push('--no-plan');
  }
  return flags;
}

export function registerInfraOperationsCommands(options: {
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, getWorkspaceExplorer } = options;

  const runInfraAction = async (item: unknown, action: InfraAction): Promise<void> => {
    const target = resolveInfraTarget(item, getWorkspaceExplorer());
    if (!target) {
      return;
    }

    const { workspacePath, workspaceName } = target;

    if (action === 'open-compose') {
      const composePath = path.join(workspacePath, '.rapidkit', 'infra', 'docker-compose.yml');
      const fs = await import('fs-extra');
      if (!(await fs.default.pathExists(composePath))) {
        const selected = await vscode.window.showInformationMessage(
          `No infra compose file exists for "${workspaceName}" yet. Run "Infra Plan" to generate it.`,
          'Run Infra Plan'
        );
        if (selected === 'Run Infra Plan') {
          await runInfraAction(item, 'plan');
        }
        return;
      }
      const document = await vscode.workspace.openTextDocument(composePath);
      await vscode.window.showTextDocument(document);
      return;
    }

    if (action === 'plan') {
      const flags = await pickInfraPlanFlags(workspaceName);
      if (!flags) {
        return;
      }
      const ran = await runInfraRapidkitCommand({
        name: `Workspai: Infra Plan — ${workspaceName}`,
        workspacePath,
        commands: [['infra', 'plan', ...flags]],
      });
      if (ran) {
        logger.info(`Running infra plan for workspace: ${workspacePath}`);
      }
      return;
    }

    if (!(await ensureDockerOrExplain(action))) {
      return;
    }

    if (action === 'up') {
      const flags = await pickInfraUpFlags(workspaceName);
      if (!flags) {
        return;
      }
      const ran = await runInfraRapidkitCommand({
        name: `Workspai: Infra Up — ${workspaceName}`,
        workspacePath,
        commands: appendWorkspaceCommandRefresh('infraUp', [['infra', 'up', ...flags]]),
      });
      if (ran) {
        logger.info(`Running infra up for workspace: ${workspacePath}`);
      }
      return;
    }

    if (action === 'down') {
      const mode = await vscode.window.showQuickPick(
        [
          {
            label: '$(debug-stop) Stop services',
            description: 'docker compose down (volumes preserved)',
            value: 'stop' as const,
          },
          {
            label: '$(trash) Stop and remove volumes',
            description: 'docker compose down --volumes (deletes service data)',
            value: 'volumes' as const,
          },
        ],
        {
          title: `Infra Down — ${workspaceName}`,
          placeHolder: 'Choose shutdown mode',
          ignoreFocusOut: true,
        }
      );

      if (!mode) {
        return;
      }

      const command = ['infra', 'down'];
      if (mode.value === 'volumes') {
        const confirmed = await vscode.window.showWarningMessage(
          `Remove infra volumes for "${workspaceName}"? All local service data (databases, queues, object storage) will be deleted.`,
          { modal: true },
          'Remove Volumes'
        );
        if (confirmed !== 'Remove Volumes') {
          return;
        }
        command.push('--volumes');
      }

      const ran = await runInfraRapidkitCommand({
        name: `Workspai: Infra Down — ${workspaceName}`,
        workspacePath,
        commands: appendWorkspaceCommandRefresh('infraDown', [command]),
      });
      if (ran) {
        logger.info(`Running infra down for workspace: ${workspacePath}`);
      }
      return;
    }

    // action === 'status'
    const ran = await runInfraRapidkitCommand({
      name: `Workspai: Infra Status — ${workspaceName}`,
      workspacePath,
      commands: [['infra', 'status']],
    });
    if (ran) {
      logger.info(`Running infra status for workspace: ${workspacePath}`);
    }
  };

  return [
    vscode.commands.registerCommand('workspai.infra', async (item?: unknown) => {
      const selected = await vscode.window.showQuickPick<InfraActionQuickPickItem>(
        [
          {
            label: '$(checklist) Plan infrastructure',
            description: 'Discover services from modules/env and write compose artifacts',
            value: 'plan',
          },
          {
            label: '$(play) Start stack',
            description: 'Refresh plan and run docker compose up',
            value: 'up',
          },
          {
            label: '$(debug-stop) Stop stack',
            description: 'Run docker compose down (optionally remove volumes)',
            value: 'down',
          },
          {
            label: '$(pulse) Stack status',
            description: 'Show docker compose service status',
            value: 'status',
          },
          {
            label: '$(go-to-file) Open compose file',
            description: 'Open .rapidkit/infra/docker-compose.yml',
            value: 'open-compose',
          },
        ],
        {
          title: 'Workspace Infrastructure',
          placeHolder: 'Choose infra operation',
          ignoreFocusOut: true,
        }
      );

      if (!selected) {
        return;
      }

      await runInfraAction(item, selected.value);
    }),

    vscode.commands.registerCommand('workspai.infraPlan', async (item?: unknown) => {
      await runInfraAction(item, 'plan');
    }),

    vscode.commands.registerCommand('workspai.infraUp', async (item?: unknown) => {
      await runInfraAction(item, 'up');
    }),

    vscode.commands.registerCommand('workspai.infraDown', async (item?: unknown) => {
      await runInfraAction(item, 'down');
    }),

    vscode.commands.registerCommand('workspai.infraStatus', async (item?: unknown) => {
      await runInfraAction(item, 'status');
    }),

    vscode.commands.registerCommand('workspai.infraOpenCompose', async (item?: unknown) => {
      await runInfraAction(item, 'open-compose');
    }),
  ];
}
