import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import type { WorkspaiProject, WorkspaiWorkspace } from '../types';
import { Logger } from '../utils/logger';
import { ModulesCatalogService } from '../core/modulesCatalogService';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { openWorkspace, openWorkspaceFolder, copyWorkspacePath } from './workspaceContextMenu';
import { openTerminal } from '../utils/terminalExecutor';
import {
  downloadWorkspaceArchiveToTemp,
  verifyWorkspaceArchive,
  type WorkspaceArchiveVerificationResult,
} from '../utils/workspaceArchive';

type WorkspaceLike = WorkspaiWorkspace;
type ProjectLike = WorkspaiProject;
type WorkspaceTreeItemLike = { path?: unknown; workspace?: { path?: unknown } };
type ProjectInputCandidate = {
  path?: unknown;
  name?: unknown;
  type?: unknown;
  kit?: unknown;
  managed?: unknown;
  modules?: unknown;
  isValid?: unknown;
  workspacePath?: unknown;
  project?: unknown;
};

type WorkspaceExplorerLike = {
  refresh(): void;
  getWorkspaceByPath(workspacePath: string): WorkspaceLike | null | undefined;
  selectWorkspace(workspace: WorkspaceLike): Promise<void>;
  getSelectedWorkspace?(): WorkspaceLike | null | undefined;
  addWorkspace(): Promise<void>;
  importWorkspace(): Promise<void>;
  removeWorkspace(workspace: WorkspaceLike): Promise<void>;
  exportWorkspace(workspace: WorkspaceLike): Promise<void>;
  autoDiscover(): Promise<void>;
};

type ProjectExplorerLike = {
  refresh(): void;
  setWorkspace(workspace: WorkspaceLike | null): void;
  setSelectedProject(project: ProjectLike): void;
  getSelectedProject?(): ProjectLike | null | undefined;
};

type ModuleExplorerLike = {
  refresh(): void;
  setProjectPath(projectPath: string, projectType: string): void;
};

type WorkspaceCommandItem = {
  workspace?: WorkspaceLike;
  path?: string;
};
type WorkspaceArchiveAction = 'inspect' | 'verify' | 'doctor';
type ArchiveSource = {
  archivePath: string;
  sourceLabel: string;
  cleanupPaths: string[];
};

const PROJECT_TYPES: ReadonlySet<ProjectLike['type']> = new Set([
  'fastapi',
  'django',
  'flask',
  'nestjs',
  'express',
  'koa',
  'go',
  'springboot',
  'rails',
  'dotnet',
  'unknown',
]);

function normalizeProjectType(value: unknown): ProjectLike['type'] {
  if (typeof value === 'string' && PROJECT_TYPES.has(value as ProjectLike['type'])) {
    return value as ProjectLike['type'];
  }
  return 'unknown';
}

function resolveWorkspacePathFromItem(item: unknown): string | undefined {
  if (typeof item === 'string') {
    return item;
  }

  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const treeItem = item as WorkspaceTreeItemLike;
  const candidate = treeItem.workspace?.path ?? treeItem.path;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function resolveWorkspaceFromItem(
  item: unknown,
  workspaceExplorer?: WorkspaceExplorerLike
): WorkspaceLike | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const typedItem = item as WorkspaceCommandItem;
  if (typedItem.workspace?.path) {
    return typedItem.workspace;
  }

  const workspacePath = resolveWorkspacePathFromItem(item);
  if (!workspacePath || !workspaceExplorer) {
    return undefined;
  }

  return workspaceExplorer.getWorkspaceByPath(workspacePath) ?? undefined;
}

function resolveProjectFromItem(item: unknown): ProjectLike | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }

  const typedItem = item as ProjectInputCandidate;
  const projectCandidateRaw = typedItem.project ?? typedItem;
  if (!projectCandidateRaw || typeof projectCandidateRaw !== 'object') {
    return undefined;
  }
  const projectCandidate = projectCandidateRaw as ProjectInputCandidate;

  if (
    typeof projectCandidate.path === 'string' &&
    typeof projectCandidate.name === 'string' &&
    typeof projectCandidate.type === 'string'
  ) {
    return {
      path: projectCandidate.path,
      name: projectCandidate.name,
      type: normalizeProjectType(projectCandidate.type),
      kit: typeof projectCandidate.kit === 'string' ? projectCandidate.kit : '',
      managed: typeof projectCandidate.managed === 'boolean' ? projectCandidate.managed : undefined,
      modules: Array.isArray(projectCandidate.modules)
        ? projectCandidate.modules.filter((module): module is string => typeof module === 'string')
        : [],
      isValid: typeof projectCandidate.isValid === 'boolean' ? projectCandidate.isValid : true,
      workspacePath:
        typeof projectCandidate.workspacePath === 'string'
          ? projectCandidate.workspacePath
          : undefined,
    };
  }

  return undefined;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function buildArchiveReportLines(input: {
  sourceLabel: string;
  verification: WorkspaceArchiveVerificationResult;
  mode: WorkspaceArchiveAction;
}): string[] {
  const { sourceLabel, verification, mode } = input;
  const manifest = verification.manifest;
  const issues = [
    ...verification.missingArchiveEntries.map((entry) => `Missing archive entry: ${entry}`),
    ...verification.extraArchiveEntries.map((entry) => `Unexpected archive entry: ${entry}`),
    ...verification.missingChecksumFiles.map((entry) => `Missing checksum: ${entry}`),
    ...verification.mismatches.map(
      (entry) =>
        `Checksum or size mismatch: ${entry.path} (expected ${entry.expected.size ?? 'unknown'} bytes, got ${entry.actual.size} bytes)`
    ),
  ];

  const lines = [
    `Workspace Archive ${mode === 'doctor' ? 'Doctor' : mode === 'inspect' ? 'Inspect' : 'Verify'}`,
    '',
    `Source: ${sourceLabel}`,
    `Status: ${verification.status.toUpperCase()}`,
    `Workspace: ${manifest.workspaceName || 'unknown'}`,
    `Exported at: ${manifest.exportedAt || 'unknown'}`,
    `Exported by: ${manifest.exportedBy || 'unknown'}`,
    `Archive format: ${manifest.archiveFormat || 'unknown'}`,
    `Files: ${verification.verifiedFiles}/${verification.fileCount} verified`,
    `Security: env files included = ${manifest.security?.envFilesIncluded === true ? 'yes' : 'no'}`,
  ];

  if (mode === 'inspect') {
    const totalSize = manifest.files.reduce((sum, file) => sum + file.size, 0);
    lines.push(`Total manifest size: ${formatBytes(totalSize)}`);
    lines.push('');
    lines.push('Files:');
    for (const file of manifest.files.slice(0, 100)) {
      lines.push(`- ${file.path} (${formatBytes(file.size)})`);
    }
    if (manifest.files.length > 100) {
      lines.push(`- ... ${manifest.files.length - 100} more file(s)`);
    }
  }

  if (mode === 'doctor') {
    lines.push('');
    lines.push('Readiness checks:');
    lines.push(`- Integrity: ${verification.status === 'passed' ? 'passed' : 'failed'}`);
    lines.push(
      `- Checksums: ${verification.missingChecksumFiles.length === 0 ? 'complete' : 'incomplete'}`
    );
    lines.push(
      `- Unexpected entries: ${verification.extraArchiveEntries.length === 0 ? 'none' : verification.extraArchiveEntries.length}`
    );
    lines.push(
      `- Secret posture: ${manifest.security?.envFilesIncluded === true ? 'review required' : 'safe default'}`
    );
  }

  if (issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of issues) {
      lines.push(`- ${issue}`);
    }
  }

  return lines;
}

export function registerWorkspaceSelectionCommands(options: {
  logger: Logger;
  getWorkspaceExplorer: () => WorkspaceExplorerLike | undefined;
  getProjectExplorer: () => ProjectExplorerLike | undefined;
  getModuleExplorer: () => ModuleExplorerLike | undefined;
}): vscode.Disposable[] {
  const { logger, getWorkspaceExplorer, getProjectExplorer, getModuleExplorer } = options;

  const pickArchiveSource = async (): Promise<ArchiveSource | undefined> => {
    const source = await vscode.window.showQuickPick(
      [
        {
          label: '$(file-zip) Local archive',
          description: 'Inspect a .rapidkit-archive.zip file from disk',
          value: 'local',
        },
        {
          label: '$(cloud-download) Remote archive URL',
          description: 'Download to a temporary file before inspection',
          value: 'remote',
        },
      ],
      {
        title: 'Workspace Archive Source',
        placeHolder: 'Choose archive source',
        ignoreFocusOut: true,
      }
    );

    if (!source) {
      return undefined;
    }

    if (source.value === 'local') {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Select Archive',
        title: 'Select Workspai Workspace Archive',
        filters: {
          'Workspai Archive': ['zip'],
          'All Files': ['*'],
        },
      });
      if (!result?.[0]) {
        return undefined;
      }
      return {
        archivePath: result[0].fsPath,
        sourceLabel: result[0].fsPath,
        cleanupPaths: [],
      };
    }

    const archiveUrl = await vscode.window.showInputBox({
      title: 'Workspace Archive URL',
      prompt: 'Paste a HTTPS/HTTP .rapidkit-archive.zip URL',
      placeHolder: 'https://example.com/team-workspace.rapidkit-archive.zip',
      ignoreFocusOut: true,
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'Archive URL is required.';
        }
        try {
          const parsed = new URL(trimmed);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:'
            ? undefined
            : 'Use a HTTPS or HTTP URL.';
        } catch {
          return 'Enter a valid URL.';
        }
      },
    });

    if (!archiveUrl) {
      return undefined;
    }

    const downloaded = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Downloading workspace archive...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 10, message: 'Fetching archive...' });
        const result = await downloadWorkspaceArchiveToTemp({ url: archiveUrl.trim() });
        progress.report({ increment: 90, message: 'Download complete.' });
        return result;
      }
    );

    return {
      archivePath: downloaded.archivePath,
      sourceLabel: downloaded.finalUrl,
      cleanupPaths: [downloaded.tempRoot],
    };
  };

  const runArchiveAction = async (action: WorkspaceArchiveAction): Promise<void> => {
    let archiveSource: ArchiveSource | undefined;
    try {
      archiveSource = await pickArchiveSource();
      if (!archiveSource) {
        return;
      }

      const verification = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Workspace Archive: ${action}`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 40, message: 'Reading archive manifest...' });
          const result = verifyWorkspaceArchive({ archivePath: archiveSource!.archivePath });
          progress.report({ increment: 60, message: 'Integrity checks complete.' });
          return result;
        }
      );

      const lines = buildArchiveReportLines({
        sourceLabel: archiveSource.sourceLabel,
        verification,
        mode: action,
      });
      const output = vscode.window.createOutputChannel('Workspai: Workspace Archive');
      output.clear();
      output.appendLine(lines.join('\n'));
      output.show(true);

      const passed = verification.status === 'passed';
      const message =
        action === 'inspect'
          ? `Archive inspected: ${verification.fileCount} file(s) in manifest.`
          : passed
            ? `Archive ${action === 'doctor' ? 'doctor' : 'verification'} passed: ${verification.verifiedFiles}/${verification.fileCount} file(s).`
            : `Archive ${action === 'doctor' ? 'doctor' : 'verification'} found issues.`;

      if (passed || action === 'inspect') {
        vscode.window.showInformationMessage(message, 'Show Report').then((choice) => {
          if (choice === 'Show Report') {
            output.show(true);
          }
        });
      } else {
        vscode.window.showWarningMessage(message, 'Show Report').then((choice) => {
          if (choice === 'Show Report') {
            output.show(true);
          }
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Workspace archive ${action} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      for (const cleanupPath of archiveSource?.cleanupPaths || []) {
        await fs.remove(cleanupPath).catch(() => undefined);
      }
    }
  };

  return [
    vscode.commands.registerCommand('workspai.refreshWorkspaces', () => {
      getWorkspaceExplorer()?.refresh();
    }),

    vscode.commands.registerCommand('workspai.refreshProjects', () => {
      const projectExplorer = getProjectExplorer();
      const moduleExplorer = getModuleExplorer();

      projectExplorer?.refresh();
      moduleExplorer?.refresh();

      if (WelcomePanel.currentPanel) {
        const selectedProject = projectExplorer?.getSelectedProject?.();
        if (selectedProject) {
          const selectedWorkspace = getWorkspaceExplorer()?.getSelectedWorkspace?.();
          const workspacePath =
            (typeof selectedProject.workspacePath === 'string' && selectedProject.workspacePath) ||
            selectedWorkspace?.path;
          const workspaceName =
            (workspacePath
              ? getWorkspaceExplorer()?.getWorkspaceByPath(workspacePath)?.name
              : undefined) || selectedWorkspace?.name;

          WelcomePanel.updateWithProject(selectedProject.path, selectedProject.name, {
            workspacePath,
            workspaceName,
          });
        }
      }
    }),

    vscode.commands.registerCommand('workspai.selectWorkspace', async (workspacePath: string) => {
      logger.info('selectWorkspace command with path:', workspacePath);

      if (!workspacePath) {
        vscode.window.showErrorMessage('Invalid workspace path');
        return;
      }

      const workspaceExplorer = getWorkspaceExplorer();
      const projectExplorer = getProjectExplorer();

      if (workspaceExplorer) {
        const selectedWorkspace = workspaceExplorer.getWorkspaceByPath(workspacePath);
        if (selectedWorkspace) {
          await workspaceExplorer.selectWorkspace(selectedWorkspace);
        } else {
          logger.warn('Workspace not found for path:', workspacePath);
          vscode.window.showWarningMessage('Workspace not found');
        }
      }

      if (projectExplorer && workspaceExplorer) {
        const selectedWorkspace = workspaceExplorer.getWorkspaceByPath(workspacePath);
        if (selectedWorkspace) {
          projectExplorer.setWorkspace(selectedWorkspace);
        }
      }

      try {
        const catalogService = ModulesCatalogService.getInstance();
        await catalogService.invalidateCache(workspacePath);
      } catch (error) {
        logger.warn('Workspace catalog cache invalidation failed', {
          code: 'WORKSPACE_CATALOG_INVALIDATE_FAILED',
          workspacePath,
          error: error instanceof Error ? error.message : String(error),
          isRecoverable: true,
        });
      }

      await vscode.commands.executeCommand('setContext', 'workspai.workspaceSelected', true);
      await vscode.commands.executeCommand('setContext', 'workspai:noProjects', false);

      if (WelcomePanel.currentPanel) {
        await WelcomePanel.refreshWorkspaceStatus();
        WelcomePanel.refreshRecentWorkspaces();
      }
    }),

    vscode.commands.registerCommand('workspai.addWorkspace', async () => {
      await getWorkspaceExplorer()?.addWorkspace();
    }),

    vscode.commands.registerCommand('workspai.importWorkspace', async () => {
      await getWorkspaceExplorer()?.importWorkspace();
    }),

    vscode.commands.registerCommand('workspai.workspaceArchive', async () => {
      const selected = await vscode.window.showQuickPick(
        [
          {
            label: '$(search) Inspect archive',
            description: 'Show manifest, producer, security posture, and file list',
            value: 'inspect' as WorkspaceArchiveAction,
          },
          {
            label: '$(verified) Verify archive',
            description: 'Check manifest entries, SHA-256 checksums, and unexpected files',
            value: 'verify' as WorkspaceArchiveAction,
          },
          {
            label: '$(pulse) Doctor archive',
            description: 'Run readiness guidance before import or handoff',
            value: 'doctor' as WorkspaceArchiveAction,
          },
        ],
        {
          title: 'Workspace Archive',
          placeHolder: 'Choose archive operation',
          ignoreFocusOut: true,
        }
      );

      if (selected) {
        await runArchiveAction(selected.value);
      }
    }),

    vscode.commands.registerCommand('workspai.workspaceArchiveInspect', async () => {
      await runArchiveAction('inspect');
    }),

    vscode.commands.registerCommand('workspai.workspaceArchiveVerify', async () => {
      await runArchiveAction('verify');
    }),

    vscode.commands.registerCommand('workspai.workspaceArchiveDoctor', async () => {
      await runArchiveAction('doctor');
    }),

    vscode.commands.registerCommand('workspai.removeWorkspace', async (item: unknown) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        const workspaceExplorer = getWorkspaceExplorer();
        if (workspaceExplorer) {
          const workspace = workspaceExplorer.getWorkspaceByPath(workspacePath);
          if (workspace) {
            await workspaceExplorer.removeWorkspace(workspace);
            WelcomePanel.refreshRecentWorkspaces();
          }
        }
      }
    }),

    vscode.commands.registerCommand('workspai.exportWorkspace', async (item: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const workspace = resolveWorkspaceFromItem(item, workspaceExplorer);

      if (workspace && workspaceExplorer) {
        await workspaceExplorer.exportWorkspace(workspace);
      }
    }),

    vscode.commands.registerCommand('workspai.workspaceTerminal', async (item: unknown) => {
      const workspaceExplorer = getWorkspaceExplorer();
      const workspace = resolveWorkspaceFromItem(item, workspaceExplorer);
      if (!workspace?.path) {
        vscode.window.showWarningMessage('Select a workspace first.');
        return;
      }

      openTerminal({
        name: `Workspai: ${workspace.name || 'Workspace'}`,
        cwd: workspace.path,
      });
      logger.info('Opened terminal for workspace:', workspace.path);
    }),

    vscode.commands.registerCommand('workspai.discoverWorkspaces', async () => {
      await getWorkspaceExplorer()?.autoDiscover();
    }),

    vscode.commands.registerCommand('workspai.selectProject', async (item: unknown) => {
      const projectExplorer = getProjectExplorer();
      const moduleExplorer = getModuleExplorer();
      const workspaceExplorer = getWorkspaceExplorer();
      const project = resolveProjectFromItem(item);

      if (project?.path && projectExplorer) {
        projectExplorer.setSelectedProject(project);
        logger.info('Project selected:', project.name);

        const workspacePathFromProject =
          typeof project?.workspacePath === 'string' ? project.workspacePath : undefined;
        const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace?.();
        const resolvedWorkspacePath = workspacePathFromProject || selectedWorkspace?.path;
        const resolvedWorkspaceName =
          (resolvedWorkspacePath
            ? workspaceExplorer?.getWorkspaceByPath(resolvedWorkspacePath)?.name
            : undefined) || selectedWorkspace?.name;

        WelcomePanel.updateWithProject(project.path, project.name, {
          workspacePath: resolvedWorkspacePath,
          workspaceName: resolvedWorkspaceName,
        });
        moduleExplorer?.setProjectPath(project.path, project.type);
      }
    }),

    vscode.commands.registerCommand('workspai.openWorkspaceFolder', async (item: unknown) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        await openWorkspaceFolder(workspacePath);
      }
    }),

    vscode.commands.registerCommand('workspai.openWorkspace', async (item: unknown) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        await openWorkspace(workspacePath);
      }
    }),

    vscode.commands.registerCommand('workspai.copyWorkspacePath', async (item: unknown) => {
      const workspacePath = resolveWorkspacePathFromItem(item);
      if (workspacePath && typeof workspacePath === 'string') {
        await copyWorkspacePath(workspacePath);
      }
    }),
  ];
}
