import * as vscode from 'vscode';
import path from 'path';
import { Logger } from '../utils/logger';
import { runRapidkitCommandsInTerminal } from '../utils/terminalExecutor';

type ProjectExplorerLike = {
  getSelectedProject?: () => { path?: string; name?: string } | null | undefined;
};

type ModuleMaintenanceAction = 'upgrade' | 'diff' | 'rollback' | 'uninstall' | 'checkpoint';

type ModuleMaintenanceItem = {
  project?: { path?: unknown; name?: unknown };
  projectPath?: unknown;
  module?: { slug?: unknown };
  moduleSlug?: unknown;
  preferNonInteractive?: boolean;
};

type MaintenanceActionQuickPickItem = vscode.QuickPickItem & { value: ModuleMaintenanceAction };

type InstalledModuleEntry = {
  slug: string;
  version?: string;
};

function asMaintenanceItem(item: unknown): ModuleMaintenanceItem | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  return item as ModuleMaintenanceItem;
}

function resolveProjectTarget(
  item: unknown,
  projectExplorer?: ProjectExplorerLike
): { projectPath: string; projectName: string } | undefined {
  const typed = asMaintenanceItem(item);
  const itemPath = typed?.project?.path ?? typed?.projectPath;
  const itemName = typed?.project?.name;

  let projectPath = typeof itemPath === 'string' && itemPath.length > 0 ? itemPath : undefined;
  let projectName = typeof itemName === 'string' && itemName.length > 0 ? itemName : undefined;

  if (!projectPath) {
    const selected = projectExplorer?.getSelectedProject?.();
    if (selected?.path) {
      projectPath = selected.path;
      projectName = projectName ?? selected.name;
    }
  }

  if (!projectPath) {
    vscode.window.showErrorMessage(
      'No project selected. Select a project in the Projects view first.'
    );
    return undefined;
  }

  return {
    projectPath,
    projectName: projectName ?? path.basename(projectPath),
  };
}

function resolveItemModuleSlug(item: unknown): string | undefined {
  const typed = asMaintenanceItem(item);
  const candidate = typed?.module?.slug ?? typed?.moduleSlug;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function isDashboardAction(item: unknown): boolean {
  return asMaintenanceItem(item)?.preferNonInteractive === true;
}

export async function readInstalledModules(projectPath: string): Promise<InstalledModuleEntry[]> {
  try {
    const fs = await import('fs-extra');
    const primaryPath = path.join(projectPath, 'registry.json');
    const legacyPath = path.join(projectPath, '.rapidkit', 'registry.json');
    const registryPath = (await fs.default.pathExists(primaryPath)) ? primaryPath : legacyPath;

    if (!(await fs.default.pathExists(registryPath))) {
      return [];
    }

    const registry = await fs.default.readJson(registryPath);
    if (!Array.isArray(registry?.installed_modules)) {
      return [];
    }

    return registry.installed_modules
      .filter(
        (mod: unknown): mod is { slug: string; version?: string } =>
          !!mod &&
          typeof mod === 'object' &&
          typeof (mod as { slug?: unknown }).slug === 'string' &&
          (mod as { slug: string }).slug.length > 0
      )
      .map((mod: { slug: string; version?: string }) => ({
        slug: mod.slug,
        version: typeof mod.version === 'string' ? mod.version : undefined,
      }));
  } catch {
    return [];
  }
}

async function promptModuleSlug(input: {
  item: unknown;
  projectPath: string;
  projectName: string;
  action: ModuleMaintenanceAction;
}): Promise<string | undefined> {
  const itemSlug = resolveItemModuleSlug(input.item);
  if (itemSlug) {
    return itemSlug;
  }

  const installed = await readInstalledModules(input.projectPath);
  const title = `Module ${input.action} — ${input.projectName}`;

  if (installed.length > 0) {
    const manualEntry = {
      label: '$(edit) Enter module name manually…',
      description: 'Type a module slug that is not listed',
      slug: undefined as string | undefined,
    };
    const picked = await vscode.window.showQuickPick(
      [
        ...installed.map((mod) => ({
          label: mod.slug,
          description: mod.version ? `v${mod.version}` : undefined,
          slug: mod.slug as string | undefined,
        })),
        manualEntry,
      ],
      {
        title,
        placeHolder: 'Select an installed module',
        ignoreFocusOut: true,
      }
    );

    if (!picked) {
      return undefined;
    }
    if (picked.slug) {
      return picked.slug;
    }
  }

  const manual = await vscode.window.showInputBox({
    title,
    prompt: 'Module name (slug) recorded in the project registry',
    placeHolder: 'free/core/health',
    ignoreFocusOut: true,
    validateInput: (raw) => (raw.trim().length === 0 ? 'Module name is required.' : undefined),
  });

  return manual?.trim() || undefined;
}

function runInNpmTerminal(input: {
  name: string;
  projectPath: string;
  commands: string[][];
}): void {
  runRapidkitCommandsInTerminal({
    name: input.name,
    cwd: input.projectPath,
    commands: input.commands,
  });
}

function terminalName(projectName: string, action: ModuleMaintenanceAction): string {
  return `Workspai: Module ${action[0].toUpperCase()}${action.slice(1)} — ${projectName}`;
}

export function registerModuleMaintenanceCommands(options: {
  logger: Logger;
  getProjectExplorer: () => ProjectExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, getProjectExplorer } = options;

  const runMaintenanceAction = async (
    item: unknown,
    action: ModuleMaintenanceAction
  ): Promise<void> => {
    const target = resolveProjectTarget(item, getProjectExplorer());
    if (!target) {
      return;
    }

    const { projectPath, projectName } = target;
    const slug = await promptModuleSlug({ item, projectPath, projectName, action });
    if (!slug) {
      return;
    }

    const dashboard = isDashboardAction(item);

    if (action === 'upgrade') {
      if (dashboard) {
        const confirmed = await vscode.window.showWarningMessage(
          `Upgrade module "${slug}" in project "${projectName}"?`,
          { modal: true },
          'Upgrade Module'
        );
        if (confirmed !== 'Upgrade Module') {
          return;
        }

        runInNpmTerminal({
          name: terminalName(projectName, action),
          projectPath,
          commands: [['upgrade', 'module', slug]],
        });
        logger.info(`Running module upgrade (${slug}) for project: ${projectPath}`);
        return;
      }

      const mode = await vscode.window.showQuickPick(
        [
          {
            label: '$(search) Dry run',
            description: 'Preview file changes without writing',
            value: 'dry-run' as const,
          },
          {
            label: '$(arrow-up) Apply upgrade',
            description: 'Upgrade module files (locally modified files are preserved)',
            value: 'apply' as const,
          },
        ],
        {
          title: `Upgrade Module — ${slug}`,
          placeHolder: 'Choose upgrade mode',
          ignoreFocusOut: true,
        }
      );

      if (!mode) {
        return;
      }

      const command = ['upgrade', 'module', slug];
      if (mode.value === 'dry-run') {
        command.push('--dry-run');
      } else {
        const confirmed = await vscode.window.showWarningMessage(
          `Upgrade module "${slug}" in project "${projectName}"? Run a checkpoint or snapshot first if you need a restore point.`,
          { modal: true },
          'Upgrade Module'
        );
        if (confirmed !== 'Upgrade Module') {
          return;
        }
      }

      runInNpmTerminal({
        name: terminalName(projectName, action),
        projectPath,
        commands: [command],
      });
      logger.info(`Running module upgrade (${slug}) for project: ${projectPath}`);
      return;
    }

    if (action === 'diff') {
      if (dashboard) {
        runInNpmTerminal({
          name: terminalName(projectName, action),
          projectPath,
          commands: [['diff', 'module', slug]],
        });
        logger.info(`Running module diff (${slug}) for project: ${projectPath}`);
        return;
      }

      const withPatch = await vscode.window.showQuickPick(
        [
          {
            label: '$(list-flat) Summary',
            description: 'Show changed/diverged file summary',
            value: false,
          },
          {
            label: '$(diff) Unified patch',
            description: 'Include full unified diff output (--patch)',
            value: true,
          },
        ],
        {
          title: `Diff Module — ${slug}`,
          placeHolder: 'Choose diff detail level',
          ignoreFocusOut: true,
        }
      );

      if (!withPatch) {
        return;
      }

      const command = ['diff', 'module', slug];
      if (withPatch.value) {
        command.push('--patch');
      }

      runInNpmTerminal({
        name: terminalName(projectName, action),
        projectPath,
        commands: [command],
      });
      logger.info(`Running module diff (${slug}) for project: ${projectPath}`);
      return;
    }

    if (action === 'rollback') {
      if (dashboard) {
        const confirmed = await vscode.window.showWarningMessage(
          `Roll back module "${slug}" in project "${projectName}" to the last checkpoint?`,
          { modal: true },
          'Rollback Module'
        );
        if (confirmed !== 'Rollback Module') {
          return;
        }

        runInNpmTerminal({
          name: terminalName(projectName, action),
          projectPath,
          commands: [['rollback', 'module', slug]],
        });
        logger.info(`Running module rollback (${slug}) for project: ${projectPath}`);
        return;
      }

      const mode = await vscode.window.showQuickPick(
        [
          {
            label: '$(search) Dry run',
            description: 'Preview what would be rolled back',
            value: 'dry-run' as const,
          },
          {
            label: '$(history) Apply rollback',
            description: 'Restore module files from the last checkpoint',
            value: 'apply' as const,
          },
        ],
        {
          title: `Rollback Module — ${slug}`,
          placeHolder: 'Choose rollback mode',
          ignoreFocusOut: true,
        }
      );

      if (!mode) {
        return;
      }

      const command = ['rollback', 'module', slug];
      if (mode.value === 'dry-run') {
        command.push('--dry-run');
      } else {
        const confirmed = await vscode.window.showWarningMessage(
          `Roll back module "${slug}" in project "${projectName}"? Current module files will be replaced with the checkpointed versions.`,
          { modal: true },
          'Rollback Module'
        );
        if (confirmed !== 'Rollback Module') {
          return;
        }
      }

      runInNpmTerminal({
        name: terminalName(projectName, action),
        projectPath,
        commands: [command],
      });
      logger.info(`Running module rollback (${slug}) for project: ${projectPath}`);
      return;
    }

    if (action === 'uninstall') {
      if (dashboard) {
        const confirmed = await vscode.window.showWarningMessage(
          `Uninstall module "${slug}" from project "${projectName}"? Unmodified module files will be deleted.`,
          { modal: true },
          'Uninstall Module'
        );
        if (confirmed !== 'Uninstall Module') {
          return;
        }

        runInNpmTerminal({
          name: terminalName(projectName, action),
          projectPath,
          commands: [['uninstall', 'module', slug]],
        });
        logger.info(`Running module uninstall (${slug}) for project: ${projectPath}`);
        return;
      }

      const mode = await vscode.window.showQuickPick(
        [
          {
            label: '$(search) Dry run',
            description: 'Preview which files would be removed',
            value: 'dry-run' as const,
          },
          {
            label: '$(trash) Uninstall module',
            description: 'Remove module files (locally modified files are kept)',
            value: 'apply' as const,
          },
        ],
        {
          title: `Uninstall Module — ${slug}`,
          placeHolder: 'Choose uninstall mode',
          ignoreFocusOut: true,
        }
      );

      if (!mode) {
        return;
      }

      const command = ['uninstall', 'module', slug];
      if (mode.value === 'dry-run') {
        command.push('--dry-run');
      } else {
        const confirmed = await vscode.window.showWarningMessage(
          `Uninstall module "${slug}" from project "${projectName}"? Unmodified module files will be deleted.`,
          { modal: true },
          'Uninstall Module'
        );
        if (confirmed !== 'Uninstall Module') {
          return;
        }
      }

      runInNpmTerminal({
        name: terminalName(projectName, action),
        projectPath,
        commands: [command],
      });
      logger.info(`Running module uninstall (${slug}) for project: ${projectPath}`);
      return;
    }

    // action === 'checkpoint'
    runInNpmTerminal({
      name: terminalName(projectName, action),
      projectPath,
      commands: [['checkpoint', 'module', slug]],
    });
    logger.info(`Running module checkpoint (${slug}) for project: ${projectPath}`);
  };

  return [
    vscode.commands.registerCommand('workspai.moduleMaintenance', async (item?: unknown) => {
      const selected = await vscode.window.showQuickPick<MaintenanceActionQuickPickItem>(
        [
          {
            label: '$(arrow-up) Upgrade module',
            description: 'Upgrade module files to the latest template version',
            value: 'upgrade',
          },
          {
            label: '$(diff) Diff module',
            description: 'Compare project files against the module template',
            value: 'diff',
          },
          {
            label: '$(save) Checkpoint module',
            description: 'Record a restore point for modified module files',
            value: 'checkpoint',
          },
          {
            label: '$(history) Rollback module',
            description: 'Restore module files from the last checkpoint',
            value: 'rollback',
          },
          {
            label: '$(trash) Uninstall module',
            description: 'Remove a module from the project',
            value: 'uninstall',
          },
        ],
        {
          title: 'Module Maintenance',
          placeHolder: 'Choose module operation',
          ignoreFocusOut: true,
        }
      );

      if (!selected) {
        return;
      }

      await runMaintenanceAction(item, selected.value);
    }),

    vscode.commands.registerCommand('workspai.moduleUpgrade', async (item?: unknown) => {
      await runMaintenanceAction(item, 'upgrade');
    }),

    vscode.commands.registerCommand('workspai.moduleDiff', async (item?: unknown) => {
      await runMaintenanceAction(item, 'diff');
    }),

    vscode.commands.registerCommand('workspai.moduleRollback', async (item?: unknown) => {
      await runMaintenanceAction(item, 'rollback');
    }),

    vscode.commands.registerCommand('workspai.moduleUninstall', async (item?: unknown) => {
      await runMaintenanceAction(item, 'uninstall');
    }),

    vscode.commands.registerCommand('workspai.moduleCheckpoint', async (item?: unknown) => {
      await runMaintenanceAction(item, 'checkpoint');
    }),
  ];
}
