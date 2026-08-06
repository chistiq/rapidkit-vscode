/**
 * Create Project Command
 * Interactive wizard for creating a new Workspai project
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
import { ProjectWizard } from '../ui/wizards/projectWizard';
import type { ScaffoldFramework } from '../core/scaffoldKits';
import { isFrontendScaffoldKit } from '../core/scaffoldKits';
import { gateCompatibleCliVersion } from '../core/cliVersionGate';
import { gateCreateFrontendCli } from '../core/rapidkitCliCapabilities';
import { Logger } from '../utils/logger';
import { WorkspaceManager } from '../core/workspaceManager';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { runCommandsInTerminal } from '../utils/terminalExecutor';
import {
  MANAGED_DEFAULT_WORKSPACE_NAME,
  hasWorkspaceRootMarkers,
  resolveCanonicalWorkspacePath,
  resolveExplorerFolderContext,
} from '../core/workspacePaths';

type CliExecutionResult = {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

export type CreateProjectCommandOptions = {
  suppressPostCreatePrompt?: boolean;
  explorerFolderPath?: string;
  /** Chat-first flows report progress in their own UI. */
  silent?: boolean;
};

export async function createProjectCommand(
  selectedWorkspacePath?: string,
  preselectedFramework?: ScaffoldFramework,
  projectName?: string,
  kitName?: string,
  options?: CreateProjectCommandOptions
) {
  const logger = Logger.getInstance();
  logger.info('Create Project command initiated', {
    preselectedFramework,
    projectName,
    kitName,
    explorerFolderPath: options?.explorerFolderPath,
  });

  try {
    let workspaceRoot: string | undefined;
    let outputParentPath: string | undefined;
    let isStandaloneMode = false;
    let explorerResolved = false;

    if (options?.explorerFolderPath) {
      explorerResolved = true;
      const explorerContext = resolveExplorerFolderContext(options.explorerFolderPath);
      outputParentPath = explorerContext.outputParentPath;

      if (explorerContext.isAlreadyManagedProject) {
        const action = await vscode.window.showWarningMessage(
          `"${path.basename(explorerContext.folderPath)}" is already a Workspai-managed project. Scaffold a sibling from the parent folder, or adopt it into a workspace.`,
          'Adopt with RapidKit',
          'Cancel'
        );
        if (action === 'Adopt with RapidKit') {
          await vscode.commands.executeCommand(
            'workspai.adoptWithRapidkit',
            vscode.Uri.file(explorerContext.folderPath)
          );
        }
        return;
      }

      if (explorerContext.workspaceRoot) {
        workspaceRoot = explorerContext.workspaceRoot;
      } else {
        workspaceRoot = explorerContext.outputParentPath;
        isStandaloneMode = true;
      }
    }

    if (!explorerResolved && selectedWorkspacePath) {
      // Check if the selected workspace path actually exists
      const workspaceExists = await fs.pathExists(selectedWorkspacePath);

      if (!workspaceExists) {
        logger.warn('Selected workspace path does not exist:', selectedWorkspacePath);

        // Show warning and ask user what to do
        const action = await vscode.window.showWarningMessage(
          `⚠️ Selected workspace no longer exists: ${path.basename(selectedWorkspacePath)}`,
          'Choose New Location',
          'Recreate Workspace',
          'Cancel'
        );

        if (action === 'Recreate Workspace') {
          // Recreate the workspace
          logger.info('Recreating workspace:', selectedWorkspacePath);
          const parentPath = path.dirname(selectedWorkspacePath);
          const workspaceName = path.basename(selectedWorkspacePath);

          await fs.ensureDir(parentPath);

          const { WorkspaiCLI } = await import('../core/rapidkitCLI.js');
          const cli = new WorkspaiCLI();

          await cli.createWorkspace({
            name: workspaceName,
            parentPath: parentPath,
            skipGit: false,
          });

          // Marker file is created by npm package with standard format
          workspaceRoot = selectedWorkspacePath;
          logger.info('Workspace recreated successfully');
          vscode.window.showInformationMessage(`✅ Recreated workspace: ${workspaceName}`, 'OK');
        } else if (action === 'Choose New Location') {
          // Let user proceed to location selection
          selectedWorkspacePath = undefined; // Reset to trigger location prompt
        } else {
          logger.info('Project creation cancelled by user');
          return;
        }
      } else {
        // Use the provided workspace path (from UI or selected workspace)
        workspaceRoot = selectedWorkspacePath;
        if (!outputParentPath) {
          outputParentPath = workspaceRoot;
        }
      }
    }

    if (!explorerResolved && (!selectedWorkspacePath || typeof workspaceRoot === 'undefined')) {
      // Check if currently in a RapidKit workspace
      const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
      const isInRapidKitWorkspace = currentWorkspace?.uri.fsPath.includes('.rapidkit');

      if (isInRapidKitWorkspace && currentWorkspace) {
        // Already in RapidKit workspace, use it
        workspaceRoot = currentWorkspace.uri.fsPath;
        logger.info('Using current RapidKit workspace:', workspaceRoot);
      } else {
        // Ask user for location preference
        const locationChoice = await vscode.window.showQuickPick(
          [
            {
              label: '$(home) Default Location',
              description: 'Recommended for quick start',
              detail: '~/.workspai/workspaces/',
              value: 'default',
            },
            {
              label: '$(folder-opened) Custom Location',
              description: 'Choose your own directory',
              detail: 'Select where to create the project',
              value: 'custom',
            },
          ],
          {
            placeHolder: 'Where do you want to create the project?',
            ignoreFocusOut: true,
          }
        );

        if (!locationChoice) {
          logger.info('Project creation cancelled - no location selected');
          return;
        }

        if (locationChoice.value === 'custom') {
          // User wants to choose custom location
          const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Location',
            title: 'Select location for project',
            defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Projects')),
          });

          if (!folderUri || folderUri.length === 0) {
            logger.info('Project creation cancelled - no folder selected');
            return;
          }

          workspaceRoot = folderUri[0].fsPath;
          logger.info('Using custom location:', workspaceRoot);

          // Check if custom location is a RapidKit workspace, if not treat as standalone location
          const hasRapidkitMarker = hasWorkspaceRootMarkers(workspaceRoot);

          if (!hasRapidkitMarker) {
            logger.info('Custom location is not a workspace - project will be created standalone');
            // Note: Projects created outside workspaces will prompt via npm package
          }

          // Register custom workspace in manager so it persists across restarts
          const manager = WorkspaceManager.getInstance();
          const registered = await manager.addWorkspace(workspaceRoot);
          if (registered) {
            logger.info('Custom workspace registered in manager:', workspaceRoot);
          }
        } else {
          // Default location - no workspace exists yet
          // Give user 3 options: Create workspace first, standalone project, or cancel
          const workspaceChoice = await vscode.window.showQuickPick(
            [
              {
                label: '$(folder) Create Workspace First',
                description: 'Recommended',
                detail: 'Create a workspace to organize multiple projects',
                value: 'workspace',
              },
              {
                label: '$(file-directory) Create Standalone Project',
                description: 'Without workspace',
                detail: 'Create project directly in ~/.workspai/workspaces/',
                value: 'standalone',
              },
              {
                label: '$(x) Cancel',
                description: '',
                detail: 'Go back',
                value: 'cancel',
              },
            ],
            {
              placeHolder: 'No workspace found. What would you like to do?',
              ignoreFocusOut: true,
            }
          );

          if (!workspaceChoice || workspaceChoice.value === 'cancel') {
            logger.info('Project creation cancelled by user');
            return;
          }

          if (workspaceChoice.value === 'workspace') {
            // Create workspace first, then ask if user wants to create project
            logger.info('User chose to create workspace first');

            // Execute create workspace command
            await vscode.commands.executeCommand('workspai.createWorkspace');

            // After workspace creation, ask if they want to continue with project
            const continueWithProject = await vscode.window.showInformationMessage(
              '✅ Workspace created! Would you like to create a project inside it now?',
              'Yes',
              'Later'
            );

            if (continueWithProject === 'Yes') {
              // Re-run this command to create project in the new workspace
              return await createProjectCommand(undefined, preselectedFramework);
            } else {
              logger.info('User chose to create project later');
              return;
            }
          } else if (workspaceChoice.value === 'standalone') {
            // Create standalone project without workspace
            logger.info('User chose standalone project mode');
            isStandaloneMode = true;
            workspaceRoot = resolveCanonicalWorkspacePath(MANAGED_DEFAULT_WORKSPACE_NAME);

            // Ensure directory exists
            await fs.ensureDir(workspaceRoot);
            logger.info('Using standalone location:', workspaceRoot);
          }
        }
      }
    }

    // Ensure workspaceRoot is defined before proceeding
    if (!workspaceRoot) {
      logger.error('Workspace root is undefined');
      vscode.window.showErrorMessage('Failed to determine workspace location');
      return;
    }

    if (!outputParentPath) {
      outputParentPath = workspaceRoot;
    }

    const outputParentAbs = path.resolve(outputParentPath);
    const workspacePathAbs = path.resolve(workspaceRoot);

    // Show wizard
    const wizard = new ProjectWizard();
    const config = await wizard.show(preselectedFramework, projectName, kitName);

    if (!config) {
      logger.info('Project creation cancelled by user');
      return;
    }

    logger.info('Project config from wizard:', JSON.stringify(config));

    if (isFrontendScaffoldKit(config.kit)) {
      const versionAllowed = await gateCompatibleCliVersion({
        cwd: outputParentAbs,
        featureLabel: 'Create Frontend Project',
      });
      if (!versionAllowed) {
        return;
      }
      const allowed = await gateCreateFrontendCli('Create Frontend Project', {
        cwd: outputParentAbs,
      });
      if (!allowed) {
        return;
      }
    }

    const runCreateProject = async (
      progress: Pick<vscode.Progress<{ increment?: number; message?: string }>, 'report'>
    ) => {
      progress.report({ increment: 0, message: 'Initializing...' });

      try {
        const { WorkspaiCLI } = await import('../core/rapidkitCLI.js');
        const cli = new WorkspaiCLI();

        progress.report({ increment: 20, message: 'Running Workspai CLI...' });

        let result: CliExecutionResult;
        let projectPath: string;

        if (isStandaloneMode) {
          logger.info('Creating standalone project at:', outputParentAbs, 'name:', config.name);

          result = await cli.createProject({
            name: config.name,
            kit: config.kit,
            parentPath: outputParentAbs,
            skipInstall: false,
          });

          projectPath = path.join(outputParentAbs, config.name);
        } else {
          logger.info(
            'Creating project in workspace:',
            workspacePathAbs,
            'parent:',
            outputParentAbs,
            'name:',
            config.name
          );

          result = await cli.createProjectInWorkspace({
            name: config.name,
            kit: config.kit,
            workspacePath: workspacePathAbs,
            outputParentPath: outputParentAbs !== workspacePathAbs ? outputParentAbs : undefined,
            skipInstall: false,
          });

          projectPath = path.join(outputParentAbs, config.name);
        }

        const exitCode = (result as { exitCode?: number }).exitCode ?? 1;
        if (exitCode !== 0) {
          const stderr = (result as { stderr?: string }).stderr ?? '';
          const stdout = (result as { stdout?: string }).stdout ?? '';
          logger.error('workspai create project failed', { exitCode, stderr, stdout });
          throw new Error(
            stderr.trim() || stdout.trim() || `workspai create project exited with code ${exitCode}`
          );
        }

        progress.report({ increment: 70, message: 'Verifying project...' });

        // Wait for file system (Poetry/lock can be slow)
        for (let i = 0; i < 15; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (await fs.pathExists(projectPath)) {
            break;
          }
          if (i === 14) {
            throw new Error(
              `Project was not created at ${projectPath}. Check Output > Workspai for CLI errors.`
            );
          }
        }

        logger.info('Project created successfully at:', projectPath);

        progress.report({ increment: 90, message: 'Refreshing workspace...' });

        // Refresh views
        await vscode.commands.executeCommand('workspai.refreshProjects');

        // Keep the extension registry aligned with Workspai CLI.
        // Standalone creation uses the managed default workspace root.
        if (!isStandaloneMode) {
          const manager = WorkspaceManager.getInstance();
          const workspaces = manager.getWorkspaces();
          const isRegistered = workspaces.some((ws) => ws.path === workspacePathAbs);

          if (!isRegistered) {
            await manager.addWorkspace(workspacePathAbs);
            logger.info('Registered new workspace in manager:', workspacePathAbs);
          } else {
            await manager.updateWorkspace(workspacePathAbs);
          }

          await vscode.commands.executeCommand('workspai.refreshWorkspaces');
        } else {
          const manager = WorkspaceManager.getInstance();
          const workspace = await manager.addWorkspace(outputParentAbs);
          if (workspace) {
            await manager.updateWorkspace(workspace.path);
          }
          await vscode.commands.executeCommand('workspai.refreshWorkspaces');
          await vscode.commands.executeCommand('workspai.selectWorkspace', outputParentAbs);
          await vscode.commands.executeCommand('workspai.refreshProjects');
          logger.info('Standalone project created in managed workspace:', outputParentAbs);
        }

        progress.report({ increment: 100, message: 'Done!' });

        const extensionContext = (globalThis as { extensionContext?: vscode.ExtensionContext })
          .extensionContext;
        if (workspacePathAbs && !isStandaloneMode) {
          await WelcomePanel.notifyProjectOnboarded(
            {
              workspacePath: workspacePathAbs,
              workspaceName: path.basename(workspacePathAbs),
              projectPath,
              projectName: config.name,
              triggeredBy: 'add',
            },
            extensionContext
          );
        }

        // Show success with enhanced actions
        const openAction = '📂 Open in Editor';
        const terminalAction = '⚡ Open Terminal';
        const addModulesAction = '🧩 Add Modules';
        const docsAction = '📖 View Docs';

        const modeLabel = isStandaloneMode ? 'standalone project' : 'workspace project';
        const handleProjectPostCreateSelection = async (selected: string | undefined) => {
          if (selected === openAction) {
            const projectUri = vscode.Uri.file(projectPath);
            await vscode.commands.executeCommand('vscode.openFolder', projectUri, {
              forceNewWindow: false,
            });
          } else if (selected === terminalAction) {
            runCommandsInTerminal({
              name: `Workspai - ${config.name}`,
              cwd: projectPath,
              commands: ['# Run: rapidkit init && rapidkit dev'],
            });
          } else if (selected === addModulesAction) {
            await vscode.commands.executeCommand('workspai.addModule', projectPath);
          } else if (selected === docsAction) {
            await vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.dev/learn'));
          }
        };

        if (options?.silent) {
          // Caller owns progress UX, for example the Workspai chat tab.
        } else if (options?.suppressPostCreatePrompt) {
          void vscode.window
            .showInformationMessage(
              `✅ ${config.name} (${modeLabel}) created successfully!`,
              { modal: false },
              openAction,
              terminalAction,
              addModulesAction,
              docsAction
            )
            .then((selected) => handleProjectPostCreateSelection(selected));
        } else {
          const selected = await vscode.window.showInformationMessage(
            `✅ ${config.name} (${modeLabel}) created successfully!`,
            { modal: false },
            openAction,
            terminalAction,
            addModulesAction,
            docsAction
          );
          await handleProjectPostCreateSelection(selected);
        }

        // Refresh welcome page if it's open
        const context = (globalThis as { extensionContext?: unknown }).extensionContext;
        if (context) {
          WelcomePanel.refreshRecentWorkspaces();
        }
      } catch (error: unknown) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to create project:', {
          message: errorObj.message,
          stack: errorObj.stack,
        });

        const errorMessage = error instanceof Error ? error.message : String(error);
        if (options?.silent) {
          throw errorObj;
        }
        const helpAction = 'Get Help';
        const selected = await vscode.window.showErrorMessage(
          `Failed to create project: ${errorMessage}`,
          helpAction,
          'Close'
        );

        if (selected === helpAction) {
          await vscode.env.openExternal(
            vscode.Uri.parse('https://www.workspai.dev/learn/workspace-doctor')
          );
        }
      }
    };

    if (options?.silent) {
      await runCreateProject({ report: () => undefined });
    } else {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating ${config.name} project`,
          cancellable: false,
        },
        runCreateProject
      );
    }
  } catch (error) {
    logger.error('Error in createProjectCommand', error);
    if (options?.silent) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    vscode.window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
