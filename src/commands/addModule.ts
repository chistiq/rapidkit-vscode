/**
 * Add Module Command
 * Add a module to an existing Workspai project via npx --yes --package rapidkit rapidkit add module <module-slug>
 * Requires an active/selected project: right-click project in Projects panel, or open project folder.
 *
 * Project target is never persisted: it is always derived from current context at invocation time
 * (command arg from context menu, or current workspace folder). Switching projects updates the target.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { Logger } from '../utils/logger';
import { WorkspaiModule } from '../types';
import { WorkspaiCLI } from '../core/rapidkitCLI';
import { ModulesCatalogService } from '../core/modulesCatalogService';
import { getSelectedProjectPath } from '../core/selectedProject';
import { checkPythonEnvironment, getPythonErrorMessage } from '../utils/pythonChecker';
import { findWorkspaceRoot } from '../utils/findWorkspace';
import { refreshModuleExplorerStates } from '../extension';
import { MODULES } from '../data/modules';

const NO_PROJECT_MESSAGE =
  '⚠️ No project selected!\n\n' +
  'To add a module:\n' +
  '1. Click on a project in the **Workspai** Projects sidebar\n' +
  '2. The project name will show a ✓ checkmark when selected\n' +
  '3. Right-click the project and choose **Add Module**\n\n' +
  'Or open your project folder in VS Code.';

/** First arg: WorkspaiModule (from module tree), projectPath (string, from createProject), or TreeItem with project.path (from project context menu). */
export async function addModuleCommand(
  moduleOrProjectPath?: WorkspaiModule | string | { project?: { path: string } }
) {
  const logger = Logger.getInstance();
  logger.info('Add Module command initiated', moduleOrProjectPath);

  try {
    let projectPath: string | undefined;
    let module: WorkspaiModule | undefined;

    if (typeof moduleOrProjectPath === 'string') {
      projectPath = moduleOrProjectPath;
    } else if (moduleOrProjectPath && typeof moduleOrProjectPath === 'object') {
      if ('project' in moduleOrProjectPath && moduleOrProjectPath.project?.path) {
        projectPath = moduleOrProjectPath.project.path;
      } else if ('id' in moduleOrProjectPath && 'displayName' in moduleOrProjectPath) {
        module = moduleOrProjectPath as WorkspaiModule;
      }
    }

    projectPath = await resolveProjectPath(projectPath);
    if (!projectPath) {
      const action = await vscode.window.showWarningMessage(
        NO_PROJECT_MESSAGE,
        { modal: true },
        '🔍 Open Projects Panel',
        'Cancel'
      );

      if (action === '🔍 Open Projects Panel') {
        await vscode.commands.executeCommand('rapidkitProjects.focus');
      }
      return;
    }

    // Skip Python pre-flight check - npm CLI will use workspace venv
    // The workspace's .venv has rapidkit-core installed, system Python may not
    logger.debug('Skipping Python pre-flight check - using workspace environment');

    // Track if module was provided upfront (from webview) or needs to be selected
    const moduleProvidedUpfront = !!module;

    if (!module) {
      const workspacePath = path.dirname(projectPath);
      const selectedModule = await showModulePicker(workspacePath);
      if (!selectedModule) {
        return;
      }
      module = selectedModule;
    }

    // Only show confirmation if module was NOT provided upfront
    // (i.e., from webview modal where user already confirmed)
    if (!moduleProvidedUpfront) {
      const projectName = path.basename(projectPath);
      const relativePath = vscode.workspace.asRelativePath(projectPath, false);
      const displayPath = relativePath !== projectPath ? relativePath : projectPath;

      const choice = await vscode.window.showQuickPick(['Add', 'Cancel'], {
        title: `Add module to project?`,
        placeHolder: `Adding "${module!.displayName}" to "${projectName}" (${displayPath})`,
        ignoreFocusOut: true,
      });
      if (choice !== 'Add') {
        return;
      }
    }

    // Only show dependency warning if module was NOT provided upfront
    // (webview modal already shows dependencies)
    if (!moduleProvidedUpfront && module.dependencies.length > 0) {
      const deps = module.dependencies.join(', ');
      const proceed = await vscode.window.showWarningMessage(
        `This module requires: ${deps}. Continue?`,
        'Yes',
        'No'
      );
      if (proceed !== 'Yes') {
        return;
      }
    }

    const cli = new WorkspaiCLI();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Adding module: ${module.displayName}`,
        cancellable: false,
      },
      async (progress) => {
        const projectName = path.basename(projectPath!);
        progress.report({
          increment: 0,
          message: `Installing to: ${projectName}`,
        });

        try {
          // Find workspace root if project is in a workspace
          // npm package needs to run from project directory and will auto-detect workspace
          const workspaceRoot = await findWorkspaceRoot(projectPath!);
          logger.debug('Workspace detection', { projectPath, workspaceRoot });

          progress.report({
            increment: 20,
            message: `Running rapidkit add module...`,
          });

          // Use slug if available (from module data), fallback to id
          const moduleSlug = resolveModuleSlug(module!);
          const result = (await cli.addModule(projectPath!, moduleSlug)) as {
            exitCode?: number;
            stdout?: string;
            stderr?: string;
          };
          const exitCode = result.exitCode ?? 1;

          if (exitCode !== 0) {
            const stderr = result.stderr ?? result.stdout ?? '';
            logger.error('rapidkit add module failed', { exitCode, stderr, workspaceRoot });

            // Provide helpful error messages for common issues
            let errorMessage: string;
            let showSetupGuide = false;

            if (
              stderr.includes('ensurepip') ||
              stderr.includes('python3-venv') ||
              stderr.includes('python3.13-venv')
            ) {
              errorMessage = getPythonErrorMessage(await checkPythonEnvironment());
              showSetupGuide = true;
            } else if (
              stderr.includes('No module named rapidkit') ||
              stderr.includes('No module named')
            ) {
              errorMessage =
                'RapidKit core engine not found in the project environment.\n\n' +
                'This usually means:\n' +
                '  • The workspace was not properly initialized\n' +
                "  • The project's virtual environment is missing or corrupted\n\n" +
                'Try recreating the workspace or project.';
              showSetupGuide = true;
            } else if (stderr.includes('ModuleNotFoundError')) {
              errorMessage =
                'Python module dependency error.\n\n' +
                'The project environment may be corrupted. Try:\n' +
                "  1. Delete the project's .venv folder\n" +
                '  2. Run "rapidkit init" in the project directory';
            } else if (stderr.trim()) {
              errorMessage = `Failed to add module:\n\n${stderr}`;
            } else {
              errorMessage = 'Failed to add module. Check the output for details.';
            }

            if (showSetupGuide) {
              const setupAction = 'View Setup Guide';
              const selected = await vscode.window.showErrorMessage(
                errorMessage,
                { modal: false },
                setupAction
              );

              if (selected === setupAction) {
                await vscode.env.openExternal(
                  vscode.Uri.parse('https://www.workspai.com/docs/troubleshooting/python')
                );
              }
            } else {
              vscode.window.showErrorMessage(errorMessage);
            }

            return;
          }

          progress.report({ increment: 100, message: 'Done!' });

          // Auto-close the progress notification after a brief delay
          await new Promise((resolve) => setTimeout(resolve, 800));

          const viewDocsAction = '📖 View Module Docs';
          const addMoreAction = '➕ Add Another Module';
          const projectName = path.basename(projectPath!);

          const selected = await vscode.window.showInformationMessage(
            `✅ Module "${module!.displayName}" added to "${projectName}" successfully!`,
            { modal: false },
            viewDocsAction,
            addMoreAction
          );

          // Refresh all project views and module states
          await vscode.commands.executeCommand('workspai.refreshProjects');
          await refreshModuleExplorerStates();

          // Refresh Welcome Panel to update installed modules list
          const { WelcomePanel } = await import('../ui/panels/welcomePanel.js');
          await WelcomePanel.refreshWorkspaceStatus();

          if (selected === viewDocsAction) {
            await vscode.env.openExternal(
              vscode.Uri.parse(`https://www.workspai.com/docs/modules/${module!.id}`)
            );
          } else if (selected === addMoreAction) {
            await vscode.commands.executeCommand('workspai.addModule', projectPath);
          }
        } catch (error) {
          logger.error('Failed to add module', error);
          vscode.window.showErrorMessage(
            `Failed to add module: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );
  } catch (error) {
    logger.error('Error in addModuleCommand', error);
    vscode.window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Resolve project path only when a project is already active/selected.
 * - If path was passed (context menu or after create), use it.
 * - If user selected a project in the Projects panel, use that path.
 * - If exactly one workspace folder is open and it is a RapidKit project, treat as active.
 * - Otherwise do NOT prompt for folder: user must select/activate a project first.
 */
async function resolveProjectPath(givenPath?: string): Promise<string | undefined> {
  if (givenPath) {
    return givenPath;
  }

  // First check if user has selected a project in the tree view
  const selectedProject = (await vscode.commands.executeCommand('workspai.getSelectedProject')) as {
    path?: unknown;
  } | null;
  const selectedProjectPath =
    selectedProject && typeof selectedProject.path === 'string' ? selectedProject.path : undefined;
  if (selectedProjectPath && (await fs.pathExists(selectedProjectPath))) {
    return selectedProjectPath;
  }

  // Then check the panel selection (legacy)
  const fromPanel = getSelectedProjectPath();
  if (fromPanel && (await fs.pathExists(fromPanel))) {
    return fromPanel;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  if (folders.length === 1) {
    const single = folders[0].uri.fsPath;
    if (await isWorkspaiProject(single)) {
      return single;
    }
    return undefined;
  }
  const rapidKitFolders = [];
  for (const f of folders) {
    if (await isWorkspaiProject(f.uri.fsPath)) {
      rapidKitFolders.push(f);
    }
  }
  if (rapidKitFolders.length === 0) {
    return undefined;
  }
  if (rapidKitFolders.length === 1) {
    return rapidKitFolders[0].uri.fsPath;
  }
  return undefined;
}

async function isWorkspaiProject(dirPath: string): Promise<boolean> {
  const rapidkitDir = path.join(dirPath, '.rapidkit');
  const pyproject = path.join(dirPath, 'pyproject.toml');
  const packageJson = path.join(dirPath, 'package.json');
  if (await fs.pathExists(rapidkitDir)) {
    return true;
  }
  if (await fs.pathExists(pyproject)) {
    return true;
  }
  if (await fs.pathExists(packageJson)) {
    try {
      const pkg = await fs.readJson(packageJson);
      if (pkg.dependencies?.['@nestjs/core']) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function resolveModuleSlug(module: WorkspaiModule): string {
  const candidate = (module as WorkspaiModule & { slug?: unknown }).slug;
  if (typeof candidate === 'string' && candidate.trim().length > 0) {
    return candidate;
  }
  return module.id;
}

async function showModulePicker(workspacePath?: string): Promise<WorkspaiModule | undefined> {
  let moduleData = MODULES;
  try {
    const catalog = await ModulesCatalogService.getInstance().getModulesCatalog(workspacePath);
    if (catalog.modules.length) {
      moduleData = catalog.modules;
    }
  } catch {
    // fall back to static list
  }

  const modules: WorkspaiModule[] = moduleData.map((m) => ({
    id: m.id,
    name: m.id,
    displayName: m.name,
    version: m.version,
    description: m.description,
    category: m.category,
    status: m.status as WorkspaiModule['status'],
    tags: m.tags || [],
    dependencies: m.dependencies || [],
    installed: false,
  }));

  const selected = await vscode.window.showQuickPick(
    modules.map((m) => ({
      label: `$(extensions) ${m.displayName}`,
      description: `v${m.version}`,
      detail: m.description,
      module: m,
    })),
    {
      placeHolder: 'Select a module to add',
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );

  return selected?.module;
}
