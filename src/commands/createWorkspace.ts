/**
 * Create Workspace Command
 * Interactive wizard for creating a new Workspai workspace
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceWizard } from '../ui/wizards/workspaceWizard';
import { Logger } from '../utils/logger';
import { parseRapidKitError, formatErrorMessage, logDetailedError } from '../utils/errorParser';
import { CreateWorkspaceOptions, WorkspaiCLI } from '../core/rapidkitCLI';
import { WorkspaceManager } from '../core/workspaceManager';
import { isFirstTimeSetup, showFirstTimeSetupMessage } from '../utils/firstTimeSetup';
import { updateWorkspaceMetadata } from '../utils/workspaceMarker';
import { WelcomePanel } from '../ui/panels/welcomePanel';
import { isPoetryInstalledCached } from '../utils/poetryHelper';
import { checkPythonEnvironmentCached } from '../utils/pythonChecker';
import { runCommandsInTerminal, runShellCommandInTerminal } from '../utils/terminalExecutor';

type InstallMethod = 'poetry' | 'venv' | 'pipx' | 'auto';
type BootstrapProfile = NonNullable<CreateWorkspaceOptions['profile']>;
type PolicyMode = 'warn' | 'strict' | 'disabled';
type DependencySharing = 'isolated' | 'shared';

type PythonEnvironmentCheck = {
  available: boolean;
  meetsMinimumVersion: boolean;
  venvSupport: boolean;
  version?: string;
  error?: string;
};

type WorkspaceModalConfig = {
  name: string;
  initGit?: boolean;
  profile?: BootstrapProfile;
  installMethod?: InstallMethod;
  policyMode?: PolicyMode;
  dependencySharing?: DependencySharing;
};

type WorkspaceCreationConfig = {
  name: string;
  path: string;
  initGit: boolean;
  profile?: BootstrapProfile;
  installMethod?: InstallMethod;
  policyMode?: PolicyMode;
  dependencySharing?: DependencySharing;
};

function isWorkspaceModalConfig(value: unknown): value is WorkspaceModalConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<WorkspaceModalConfig>;
  return typeof candidate.name === 'string' && candidate.name.trim().length > 0;
}

export async function createWorkspaceCommand(workspaceName?: string | Record<string, unknown>) {
  const logger = Logger.getInstance();
  const PYTHON_REQUIRED_PROFILES = new Set(['python-only', 'polyglot', 'enterprise']);
  logger.info(
    'Create Workspace command initiated',
    workspaceName ? `with name: ${workspaceName}` : ''
  );

  try {
    // Show progress notification while checking system requirements
    let pythonCheck: PythonEnvironmentCheck = {
      available: false,
      meetsMinimumVersion: false,
      venvSupport: false,
    };
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Preparing workspace creation',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0, message: 'Checking system requirements...' });

        // Check Python 3.10+ BEFORE Poetry (Python is more fundamental)
        logger.info('Checking for Python 3.10+ installation...');

        // Check if cache available
        const { requirementCache } = await import('../utils/requirementCache.js');
        const cacheStats = requirementCache.getStats();
        const pythonCached = cacheStats.pythonCached;

        progress.report({
          increment: 30,
          message: pythonCached ? 'Checking Python (cached)...' : 'Checking Python installation...',
        });

        pythonCheck = await checkPythonEnvironmentCached();

        if (!pythonCheck.available) {
          logger.error('Python not installed');
          progress.report({ increment: 100, message: 'Python not found' });
        }
      }
    );

    // Python checks are advisory here. We enforce/confirm later based on selected profile.
    if (!pythonCheck.available) {
      logger.warn('Python not detected in pre-check; continuing with profile-aware flow');
    } else if (!pythonCheck.meetsMinimumVersion) {
      logger.warn(
        `Python version ${pythonCheck.version} is below minimum; continuing with profile-aware flow`
      );
    } else if (!pythonCheck.venvSupport) {
      logger.warn('Python venv support missing in pre-check; continuing with profile-aware flow');
    } else {
      logger.info(`Python ${pythonCheck.version} is available with venv support`);
    }

    const modalConfig = isWorkspaceModalConfig(workspaceName) ? workspaceName : null;
    const modalInstallMethod = modalConfig?.installMethod as
      | 'poetry'
      | 'venv'
      | 'pipx'
      | 'auto'
      | undefined;
    const isModalFlow = Boolean(modalConfig?.name);

    // ── Install-method resolution: poetry (preferred) → fallback chain → venv ──
    // Poetry is NEVER a hard requirement. If missing, we offer auto-install via
    // pipx, or a pure venv workspace which is fully equivalent in functionality.
    let chosenInstallMethod: 'poetry' | 'venv' | 'pipx' = 'venv';
    let hasPoetry = false;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Checking Poetry installation',
        cancellable: false,
      },
      async (progress) => {
        const { requirementCache } = await import('../utils/requirementCache.js');
        const cacheStats = requirementCache.getStats();
        const poetryCached = cacheStats.poetryCached;
        progress.report({
          increment: 0,
          message: poetryCached ? 'Verifying Poetry (cached)...' : 'Verifying Poetry...',
        });
        logger.info('Checking for Poetry installation...');
        hasPoetry = await isPoetryInstalledCached();
        progress.report({
          increment: 100,
          message: hasPoetry ? 'Poetry found' : 'Poetry not found — checking fallback options...',
        });
      }
    );

    if (hasPoetry) {
      chosenInstallMethod = 'poetry';
      logger.info('Poetry is installed — using poetry install method');
    } else {
      if (isModalFlow) {
        if (modalInstallMethod && modalInstallMethod !== 'auto') {
          if (modalInstallMethod === 'poetry') {
            chosenInstallMethod = 'venv';
            logger.warn(
              'Modal requested poetry, but Poetry is not installed — using venv fallback without extra prompt'
            );
          } else {
            chosenInstallMethod = modalInstallMethod;
            logger.info(`Modal install method respected: ${modalInstallMethod}`);
          }
        } else {
          chosenInstallMethod = 'venv';
          logger.info('Modal auto install method with missing Poetry — using venv fallback');
        }
      }

      if (isModalFlow) {
        logger.info('Modal flow detected — skipping interactive Poetry prompt');
      } else {
        logger.warn('Poetry not installed — offering smart fallback');

        // Detect whether pipx is available for automatic Poetry installation
        let hasPipx = false;
        try {
          const { execa } = await import('execa');
          await execa('pipx', ['--version'], { timeout: 3000 });
          hasPipx = true;
        } catch {
          try {
            const { execa } = await import('execa');
            await execa('python3', ['-m', 'pipx', '--version'], { timeout: 3000 });
            hasPipx = true;
          } catch {
            hasPipx = false;
          }
        }

        type PickItem = vscode.QuickPickItem & { value: string };

        const choices: PickItem[] = [
          ...(hasPipx
            ? [
                {
                  label: '$(zap) Auto-install Poetry via pipx',
                  description: 'Recommended — installs Poetry globally then creates workspace',
                  detail: 'Runs: pipx install poetry',
                  value: 'auto-poetry',
                },
              ]
            : []),
          {
            label: '$(package) Use Python venv instead',
            description: 'No extra tools needed — pip + venv (equivalent functionality)',
            detail: 'Workspace is fully functional without Poetry. You can add it later.',
            value: 'venv',
          },
          {
            label: '$(tools) Open Setup Panel',
            description: 'Guide me through manual Poetry / pipx installation',
            detail: 'Workspace creation will be cancelled. Opens the setup wizard.',
            value: 'setup',
          },
        ];

        const pick = await vscode.window.showQuickPick(choices, {
          placeHolder: 'Poetry is not installed. How would you like to proceed?',
          title: '⚙️ Workspace Install Method',
          ignoreFocusOut: true,
        });

        if (!pick) {
          logger.info('User cancelled workspace creation at install method selection');
          return;
        }

        if (pick.value === 'auto-poetry') {
          logger.info('Auto-installing Poetry via pipx...');
          const installCommands =
            process.platform === 'win32'
              ? ['python -m pipx install poetry', 'echo ✅ Poetry installed successfully']
              : ['pipx install poetry', 'echo "✅ Poetry installed successfully"'];
          runCommandsInTerminal({
            name: 'Workspai: Install Poetry',
            commands: installCommands,
          });

          const confirm = await vscode.window.showInformationMessage(
            'Installing Poetry via pipx...\n\nWait until the terminal shows\n"✅ Poetry installed successfully", then click Continue.',
            { modal: true },
            'Continue',
            'Skip — use venv instead'
          );

          if (!confirm || confirm === 'Skip — use venv instead') {
            chosenInstallMethod = 'venv';
            logger.info('User skipped Poetry auto-install — using venv fallback');
          } else {
            const { requirementCache } = await import('../utils/requirementCache.js');
            requirementCache.invalidateAll();
            hasPoetry = await isPoetryInstalledCached();
            chosenInstallMethod = hasPoetry ? 'poetry' : 'venv';
            logger.info(
              hasPoetry
                ? 'Poetry confirmed after auto-install — using poetry'
                : 'Poetry still not detected — falling back to venv'
            );
          }
        } else if (pick.value === 'venv') {
          chosenInstallMethod = 'venv';
          logger.info('User selected venv install method');
        } else {
          // Open Setup Panel and abort workspace creation
          vscode.commands.executeCommand('workspai.openSetup');
          return;
        }
      }
    }

    logger.info(`Proceeding with workspace creation (install method: ${chosenInstallMethod})`);

    // Check if this is first-time setup and show guidance (only if name not provided from modal)
    if (!workspaceName) {
      const isFirstTime = await isFirstTimeSetup();
      if (isFirstTime) {
        logger.info('First-time setup detected, showing guidance');
        const shouldContinue = await showFirstTimeSetupMessage();
        if (!shouldContinue) {
          logger.info('User cancelled first-time setup');
          return;
        }
      }
    }

    // Get workspace configuration
    let config: WorkspaceCreationConfig;

    if (workspaceName) {
      if (isWorkspaceModalConfig(workspaceName)) {
        // Full config object sent from the webview modal
        logger.info('Using full config from webview modal:', workspaceName.name);
        const defaultPath = path.join(os.homedir(), 'Workspai', 'rapidkits');
        config = {
          name: workspaceName.name,
          path: path.join(defaultPath, workspaceName.name),
          initGit: workspaceName.initGit !== undefined ? workspaceName.initGit : true,
          profile: workspaceName.profile || 'minimal',
          installMethod: workspaceName.installMethod || 'auto',
          policyMode: workspaceName.policyMode || 'warn',
          dependencySharing: workspaceName.dependencySharing || 'isolated',
        };
      } else {
        // Legacy: plain name string (from command palette or internal calls)
        logger.info('Using provided workspace name:', workspaceName);
        const defaultPath = path.join(os.homedir(), 'Workspai', 'rapidkits');
        config = {
          name: workspaceName as string,
          path: path.join(defaultPath, workspaceName as string),
          initGit: true,
        };
      }
    } else {
      // Show wizard to collect user input
      const wizard = new WorkspaceWizard();
      const wizardConfig = await wizard.show();

      if (!wizardConfig) {
        logger.info('Workspace creation cancelled by user');
        return;
      }

      config = {
        name: wizardConfig.name,
        path: wizardConfig.path,
        initGit: wizardConfig.initGit,
        profile: wizardConfig.profile,
        installMethod: wizardConfig.installMethod,
        policyMode: wizardConfig.policyMode,
        dependencySharing: wizardConfig.dependencySharing,
      };
    }

    // Honour install method explicitly chosen in the wizard (overrides auto-detection)
    if (config.installMethod && config.installMethod !== 'auto') {
      logger.info(`Wizard override: install method → ${config.installMethod}`);
      chosenInstallMethod = config.installMethod as 'poetry' | 'venv' | 'pipx';
    }

    // Profile-aware Python enforcement: only gate Python-required profiles.
    const selectedProfile = (config.profile || 'minimal') as string;
    const requiresPython = PYTHON_REQUIRED_PROFILES.has(selectedProfile);
    const pythonReady =
      !!pythonCheck?.available && !!pythonCheck?.meetsMinimumVersion && !!pythonCheck?.venvSupport;

    if (requiresPython && !pythonReady) {
      const issueDetails = !pythonCheck?.available
        ? 'Python 3.10+ was not detected on this system.'
        : !pythonCheck?.meetsMinimumVersion
          ? `Python ${pythonCheck?.version ?? 'unknown'} detected, but 3.10+ is required.`
          : pythonCheck?.error || 'Python venv support is missing.';

      const choice = await vscode.window.showWarningMessage(
        `⚠️ Profile "${selectedProfile}" typically needs Python tooling.\n\n` +
          `${issueDetails}\n\n` +
          `Continue anyway? RapidKit CLI can auto-fallback to a compatible profile if needed.`,
        { modal: true },
        'Continue',
        'Open Setup',
        'Cancel'
      );

      if (choice === 'Open Setup') {
        await vscode.commands.executeCommand('workspai.openSetup');
        return;
      }

      if (choice !== 'Continue') {
        logger.info('User cancelled workspace creation at Python profile confirmation');
        return;
      }

      logger.warn(
        `Proceeding with Python-required profile ${selectedProfile} despite missing prerequisites; npm CLI fallback may adjust profile.`
      );
    }

    // Execute with progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Creating Workspai workspace',
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 0,
          message: 'Initializing... (First time setup may take 30-60 seconds)',
        });

        try {
          const cli = new WorkspaiCLI();

          progress.report({ increment: 10, message: 'Preparing workspace directory...' });

          // Don't create the workspace directory here - let npm package handle it
          // Only ensure parent directory exists so npm package can create the workspace
          const parentDir = path.dirname(config.path);
          await fs.ensureDir(parentDir);
          logger.info('Parent directory ensured:', parentDir);

          // Pre-flight: detect partial/broken workspace (dir exists but no marker).
          // A partial workspace would cause the CLI to fail with "already exists" without
          // creating a valid workspace — give the user a clear choice.
          const dirAlreadyExists = await fs.pathExists(config.path);
          const markerAlreadyExists = await fs.pathExists(
            path.join(config.path, '.rapidkit-workspace')
          );
          if (dirAlreadyExists && !markerAlreadyExists) {
            const choice = await vscode.window.showWarningMessage(
              `⚠️ Directory "${config.name}" already exists but is not a valid Workspai workspace.\n\n` +
                `This may be a partial or failed previous creation.\n\n` +
                `What would you like to do?`,
              { modal: true },
              'Replace (delete & recreate)',
              'Cancel'
            );
            if (choice === 'Replace (delete & recreate)') {
              await fs.remove(config.path);
              logger.info(`Removed partial directory: ${config.path}`);
            } else {
              logger.info('User cancelled workspace creation at partial-dir prompt');
              return;
            }
          }

          // Check if it's a default location (~/Workspai/rapidkits/<name>)
          const homeDir = os.homedir();
          const defaultWorkspacePath = path.join(homeDir, 'Workspai', 'rapidkits', config.name);
          const isDefaultLocation = config.path === defaultWorkspacePath;

          if (isDefaultLocation) {
            // Use npm package directly for default location
            progress.report({
              increment: 20,
              message: 'Setting up RapidKit CLI (downloading if needed)...',
            });

            // Idempotency: if the workspace marker already exists (prior run or
            // Windows 'directory already exists' false-positive), skip the CLI
            // call entirely and treat this as a silent success.
            const preexistingMarker = path.join(config.path, '.rapidkit-workspace');
            const workspacePreexists = await fs.pathExists(preexistingMarker);
            if (workspacePreexists) {
              logger.info(
                `Workspace "${config.name}" already exists — skipping CLI creation (idempotent)`
              );
            }
            const createResult = workspacePreexists
              ? { exitCode: 0, stdout: '', stderr: '' }
              : await cli.createWorkspace({
                  name: config.name,
                  parentPath: path.dirname(config.path),
                  skipGit: !config.initGit,
                  installMethod: chosenInstallMethod,
                  profile: config.profile,
                });

            // Check if creation was successful
            if (createResult.exitCode !== 0) {
              // Log detailed error information
              logDetailedError(
                createResult.stderr || '',
                createResult.stdout || '',
                createResult.exitCode
              );

              // Parse error for user-friendly message
              const parsedError = parseRapidKitError(
                createResult.stderr || '',
                createResult.stdout || ''
              );

              if (parsedError.canFallback) {
                logger.warn(`Workspace creation failed: ${parsedError.type} - offering fallback`);

                // Show informative message with fallback options
                const actions = ['View Details'];
                if (parsedError.type === 'core_missing') {
                  actions.unshift('Create Basic Workspace', 'Use Demo Mode');
                } else if (parsedError.canRetry) {
                  actions.unshift('Retry');
                }
                actions.push('Cancel');

                const choice = await vscode.window.showWarningMessage(
                  `⚠️ ${parsedError.title}\n\n${parsedError.message}\n\n` +
                    `⚠️ Fallback Option Available:\n` +
                    `• Creates basic workspace structure (marker + README)\n` +
                    `• Does NOT include Poetry setup or CLI tools\n` +
                    `• You'll need to install rapidkit npm package to create projects`,
                  { modal: true },
                  ...actions
                );

                if (choice === 'Create Basic Workspace') {
                  // Create basic workspace structure manually
                  await createBasicWorkspace(config.path, config.name, config.initGit);
                  logger.info('Basic workspace created as fallback');

                  // Show post-creation notification with action items
                  const installAction = 'Install npm Package';
                  const openReadme = 'Open README';
                  const selected = await vscode.window.showWarningMessage(
                    `⚠️ Basic Workspace Created\n\n` +
                      `This is a minimal workspace. To create projects:\n\n` +
                      `1️⃣ Install: npm install -g rapidkit\n` +
                      `2️⃣ Create projects with Extension commands\n\n` +
                      `⚠️ Note: Some features require rapidkit-core (not yet on PyPI)`,
                    installAction,
                    openReadme,
                    'OK'
                  );

                  if (selected === installAction) {
                    // Open terminal with install command
                    runShellCommandInTerminal({
                      name: 'Install RapidKit',
                      command: 'npm',
                      args: ['install', '-g', 'rapidkit'],
                    });
                  } else if (selected === openReadme) {
                    const readmePath = path.join(config.path, 'README.md');
                    const doc = await vscode.workspace.openTextDocument(readmePath);
                    await vscode.window.showTextDocument(doc);
                  }

                  // Don't throw, continue to finalization
                } else if (choice === 'Use Demo Mode') {
                  vscode.window.showInformationMessage(
                    '💡 Demo Mode\n\n' +
                      'You can create standalone projects without a workspace using the npm package.\n\n' +
                      'Use "Workspai: Create Project" from the command palette to get started.'
                  );
                  return;
                } else if (choice === 'Retry') {
                  // Retry the same operation
                  return createWorkspaceCommand();
                } else if (choice === 'View Details') {
                  // Show detailed error in output panel
                  const output = vscode.window.createOutputChannel('Workspai Error');
                  output.clear();
                  output.appendLine(`# ${parsedError.title}\n`);
                  output.appendLine(parsedError.message);
                  output.appendLine(`\n## Suggestions\n${parsedError.suggestion}`);
                  output.appendLine(`\n## Technical Details\n`);
                  output.appendLine(`Exit Code: ${createResult.exitCode}`);
                  if (createResult.stderr) {
                    output.appendLine(`\nSTDERR:\n${createResult.stderr}`);
                  }
                  if (createResult.stdout) {
                    output.appendLine(`\nSTDOUT:\n${createResult.stdout}`);
                  }
                  output.show();
                  return;
                } else {
                  throw new Error('Workspace creation cancelled');
                }
              } else {
                // Non-recoverable error
                throw new Error(formatErrorMessage(parsedError));
              }
            }
          } else {
            // For custom paths, create directly in the target directory
            // IMPORTANT: Don't create in default location and move - this breaks virtualenv shebangs!
            progress.report({
              increment: 20,
              message: 'Setting up RapidKit CLI (downloading if needed)...',
            });

            const createResult = await cli.createWorkspace({
              name: config.name,
              parentPath: path.dirname(config.path), // Use actual parent path, not default
              skipGit: !config.initGit,
              installMethod: chosenInstallMethod,
              profile: config.profile,
            });

            // Check if creation was successful
            if (createResult.exitCode !== 0) {
              // Idempotency: same pre-flight check for custom paths.
              const customMarker = path.join(config.path, '.rapidkit-workspace');
              if (await fs.pathExists(customMarker)) {
                logger.info(
                  `Workspace "${config.name}" already exists at custom path — idempotent success`
                );
              } else {
                const stderr = createResult.stderr || createResult.stdout || '';
                logger.error('Workspace creation failed', {
                  exitCode: createResult.exitCode,
                  stderr,
                });

                throw new Error(`Workspace creation failed: ${stderr || 'Unknown error'}`);
              }
            }

            logger.info('Workspace created directly at custom path (no move needed)');
          }

          logger.info('Workspace creation via npm package completed');

          progress.report({ increment: 50, message: 'Finalizing workspace...' });

          // Note: We skip detailed validation here because:
          // 1. npm package already validates during creation
          // 2. Poetry venvs may not be immediately ready for inspection
          // 3. The marker file existence is sufficient proof of successful creation

          logger.info('Workspace creation successful (validation skipped - npm handles it)');

          progress.report({ increment: 65, message: 'Verifying workspace...' });

          // Verify workspace was created
          const workspaceExists = await fs.pathExists(config.path);
          if (!workspaceExists) {
            throw new Error(`Workspace directory not created at ${config.path}`);
          }

          // Check for workspace marker (.rapidkit directory)
          const rapidkitDir = path.join(config.path, '.rapidkit');
          const rapidkitDirExists = await fs.pathExists(rapidkitDir);

          if (!rapidkitDirExists) {
            logger.warn('Workspace created but .rapidkit directory not found');
          }

          // Apply wizard-specified policy mode and dependency sharing to .rapidkit files
          // using canonical npm/CLI keys:
          // - mode
          // - dependency_sharing_mode
          if (rapidkitDirExists) {
            try {
              const policiesPath = path.join(rapidkitDir, 'policies.yml');
              const effectiveMode = config.policyMode === 'strict' ? 'strict' : 'warn';
              const effectiveDependencySharingMode =
                config.dependencySharing === 'shared' ? 'shared-runtime-caches' : 'isolated';

              if (await fs.pathExists(policiesPath)) {
                let content = await fs.readFile(policiesPath, 'utf-8');

                if (/^\s*mode:\s*(warn|strict)\s*$/m.test(content)) {
                  content = content.replace(
                    /^\s*mode:\s*(warn|strict)\s*$/m,
                    `mode: ${effectiveMode}`
                  );
                } else {
                  content += `\nmode: ${effectiveMode}`;
                }

                if (/^\s*dependency_sharing_mode:\s*[a-zA-Z-]+\s*$/m.test(content)) {
                  content = content.replace(
                    /^\s*dependency_sharing_mode:\s*[a-zA-Z-]+\s*$/m,
                    `dependency_sharing_mode: ${effectiveDependencySharingMode}`
                  );
                } else {
                  content += `\ndependency_sharing_mode: ${effectiveDependencySharingMode}`;
                }

                if (!content.endsWith('\n')) {
                  content += '\n';
                }

                await fs.writeFile(policiesPath, content, 'utf-8');
              } else {
                await fs.writeFile(
                  policiesPath,
                  [
                    'version: "1.0"',
                    `mode: ${effectiveMode}`,
                    `dependency_sharing_mode: ${effectiveDependencySharingMode}`,
                    'rules:',
                    '  enforce_workspace_marker: true',
                    '  enforce_toolchain_lock: false',
                    '  disallow_untrusted_tool_sources: false',
                    '',
                  ].join('\n'),
                  'utf-8'
                );
              }

              logger.info(
                `Policy settings written: mode=${effectiveMode}, dependency_sharing_mode=${effectiveDependencySharingMode}`
              );
            } catch (writeErr) {
              logger.warn('Could not write extra wizard options to .rapidkit files', writeErr);
              // Non-fatal: workspace is still fully usable
            }
          }

          // Verify workspace marker exists (created by npm package)
          const markerPath = path.join(config.path, '.rapidkit-workspace');
          if (!(await fs.pathExists(markerPath))) {
            logger.warn('Workspace marker not found - npm package should have created it');
          } else {
            // Add VS Code metadata to the marker
            const { getExtensionVersion } = await import('../utils/constants.js');
            await updateWorkspaceMetadata(config.path, {
              vscode: {
                extensionVersion: getExtensionVersion(),
                createdViaExtension: true,
                lastOpenedAt: new Date().toISOString(),
                openCount: 1,
              },
            });
            logger.info('Workspace marker verified and VS Code metadata added');
          }

          progress.report({ increment: 80, message: 'Registering workspace...' });

          // Add workspace to manager
          const workspaceManager = WorkspaceManager.getInstance();
          await workspaceManager.addWorkspace(config.path);

          progress.report({ increment: 90, message: 'Refreshing views...' });

          // Wait for file system sync
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Refresh workspace explorer
          await vscode.commands.executeCommand('workspai.refreshWorkspaces');

          progress.report({ increment: 100, message: 'Complete!' });

          // Check if this was a fallback workspace
          const fallbackMarkerPath = path.join(config.path, '.rapidkit-workspace');
          let isFallback = false;
          try {
            const markerData = await fs.readJSON(fallbackMarkerPath);
            isFallback = markerData.fallbackMode === true;
          } catch {
            // Marker doesn't exist or invalid
          }

          // Show success message with appropriate actions
          const openAction = 'Open Workspace';
          const docsAction = 'View Docs';
          const installNpmAction = isFallback ? 'Install npm Package' : null;

          const actions = [openAction, docsAction];
          if (installNpmAction) {
            actions.unshift(installNpmAction);
          }
          actions.push('Close');

          let message =
            `✅ Workspace "${config.name}" created successfully!\n\n` +
            `📁 Location: ${config.path}\n`;

          if (isFallback) {
            message +=
              `\n⚠️ Note: This is a basic workspace (fallback mode)\n` +
              `To create projects, install: npm install -g rapidkit\n` +
              `See README.md for full setup instructions`;
          } else {
            message += `💡 Tip: Add projects with \`rapidkit create\` or use Extension commands`;
          }

          const selected = await vscode.window.showInformationMessage(message, ...actions);

          if (selected === 'Install npm Package') {
            // Open terminal with install command
            runShellCommandInTerminal({
              name: 'Install RapidKit',
              command: 'npm',
              args: ['install', '-g', 'rapidkit'],
            });

            // Also open README for reference
            const readmePath = path.join(config.path, 'README.md');
            if (await fs.pathExists(readmePath)) {
              const doc = await vscode.workspace.openTextDocument(readmePath);
              await vscode.window.showTextDocument(doc, { preview: false });
            }
          } else if (selected === openAction) {
            const workspaceUri = vscode.Uri.file(config.path);
            await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, {
              forceNewWindow: false,
            });
          } else if (selected === docsAction) {
            await vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.com/docs'));
          }

          // Refresh welcome page if it's open and start governance onboarding chain
          const context = (globalThis as { extensionContext?: vscode.ExtensionContext })
            .extensionContext;
          if (context) {
            void WelcomePanel.notifyWorkspaceGovernanceChain(
              config.path,
              config.name,
              'create',
              context
            );
          } else {
            WelcomePanel.refreshRecentWorkspaces();
          }
        } catch (error) {
          logger.error('Failed to create workspace', error);

          const errorMessage = error instanceof Error ? error.message : String(error);
          const helpAction = 'Get Help';
          const selected = await vscode.window.showErrorMessage(
            `Failed to create workspace: ${errorMessage}`,
            helpAction,
            'Close'
          );

          if (selected === helpAction) {
            await vscode.env.openExternal(
              vscode.Uri.parse('https://www.workspai.com/docs/troubleshooting')
            );
          }
        }
      }
    );
  } catch (error) {
    logger.error('Error in createWorkspaceCommand', error);
    vscode.window.showErrorMessage(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create a basic workspace structure when RapidKit Core is not available
 * This fallback creates a structure compatible with npm package workspace
 * Should be as close as possible to the real workspace structure
 */
async function createBasicWorkspace(workspacePath: string, name: string, initGit: boolean) {
  const logger = Logger.getInstance();

  try {
    // Ensure workspace directory exists
    await fs.ensureDir(workspacePath);

    // 1. Create .rapidkit directory
    const rapidkitDir = path.join(workspacePath, '.rapidkit');
    await fs.ensureDir(rapidkitDir);
    logger.info('Created .rapidkit directory');

    // 2. Create .rapidkit/config.json (same as npm package)
    const { getExtensionVersion } = await import('../utils/constants.js');
    const config = {
      workspace_name: name,
      author: 'user',
      rapidkit_version: getExtensionVersion(),
      created_at: new Date().toISOString(),
      type: 'workspace',
      fallbackMode: true, // Indicates fallback creation
    };
    await fs.writeJSON(path.join(rapidkitDir, 'config.json'), config, { spaces: 2 });
    logger.info('Created .rapidkit/config.json');

    // 3. Create .rapidkit-workspace marker (for Extension compatibility)
    const markerPath = path.join(workspacePath, '.rapidkit-workspace');
    const { MARKERS } = await import('../utils/constants.js');

    await fs.writeJSON(
      markerPath,
      {
        signature: MARKERS.WORKSPACE_SIGNATURE,
        createdBy: MARKERS.CREATED_BY_VSCODE,
        version: getExtensionVersion(),
        createdAt: new Date().toISOString(),
        name,
        engine: 'npm-fallback', // Indicates fallback mode but npm-compatible structure
        fallbackMode: true,
      },
      { spaces: 2 }
    );
    logger.info('Created .rapidkit-workspace marker');

    // 4. Create rapidkit CLI script (shell script for Unix)
    const cliScriptPath = path.join(workspacePath, 'rapidkit');
    const cliScript = `#!/usr/bin/env bash
#
# RapidKit CLI - Fallback workspace wrapper
# This workspace was created without RapidKit Python Core
#
# To use RapidKit features:
#   1. Install: npm install -g rapidkit
#   2. Run: npx rapidkit <command>
#

set -e

echo "⚠️  This is a fallback workspace created without RapidKit Core"
echo ""
echo "To create projects:"
echo "  1. Install npm package: npm install -g rapidkit"
echo "  2. Create project: npx rapidkit create project fastapi.standard my-api --yes --skip-install"
echo ""
echo "Or use VS Code Extension: 'Workspai: Create Project'"
echo ""
`;
    await fs.writeFile(cliScriptPath, cliScript, { mode: 0o755 });
    logger.info('Created rapidkit CLI script');

    // 4b. Create Windows launcher for parity on win32 environments
    const cliScriptCmdPath = path.join(workspacePath, 'rapidkit.cmd');
    const cliScriptCmd = `@echo off
  echo ⚠️  This is a fallback workspace created without RapidKit Core
  echo.
  echo To create projects:
  echo   1. Install npm package: npm install -g rapidkit
  echo   2. Create project: npx rapidkit create project fastapi.standard my-api --yes --skip-install
  echo.
  echo Or use VS Code Extension: "Workspai: Create Project"
  echo.
  `;
    await fs.writeFile(cliScriptCmdPath, cliScriptCmd, 'utf-8');
    logger.info('Created rapidkit.cmd launcher');

    // 5. Create README.md (comprehensive guide)
    const readmePath = path.join(workspacePath, 'README.md');
    const readmeContent = `# ${name}

> ⚠️ **NOTICE**: This workspace was created in **fallback mode** without RapidKit Python Core

## 🔄 Workspace Structure

This workspace follows the standard RapidKit structure but requires manual setup:

\`\`\`
${name}/
├── rapidkit              # CLI wrapper (requires npm package)
├── .rapidkit/            # Workspace configuration
│   └── config.json       # Workspace settings
├── .rapidkit-workspace   # Workspace marker (for VS Code Extension)
├── README.md             # This file
├── .gitignore            # Git ignore rules
└── [your-projects]/      # Add projects here
\`\`\`

## ⚠️ Limitations

**What Works:**
- ✅ Workspace detection in VS Code Extension
- ✅ RapidKit Core integration through global, pipx, or workspace-local install
- ✅ Workspace/project creation, import, doctor, archive, contract, snapshot, and release gates
- ✅ npm package integration

## 🚀 Quick Start

### Option 1: Use npm Package (Recommended)

1. **Install RapidKit npm package:**
   \`\`\`bash
   npm install -g rapidkit
   \`\`\`

2. **Verify installation:**
   \`\`\`bash
   rapidkit --version
   \`\`\`

3. **Create projects:**
   \`\`\`bash
   # FastAPI project
   npx rapidkit create project fastapi.standard my-api --yes --skip-install
   
   # NestJS project
   npx rapidkit create project nestjs.standard my-app --yes --skip-install

  # Go Fiber project
  npx rapidkit create project gofiber.standard my-go-api --yes --skip-install

  # Spring Boot project
  npx rapidkit create project springboot.standard billing-api --yes --skip-install

  # .NET Web API project
  npx rapidkit create project dotnet.webapi.clean dotnet-api --yes --skip-install
   \`\`\`

4. **Or use VS Code Extension:**
   - Open Command Palette (\`Ctrl+Shift+P\`)
   - Run: \`Workspai: Create Project\`
   - Select this workspace

### Option 2: Manual Project Setup

Create projects manually following standard structures:

**FastAPI Project:**
\`\`\`bash
mkdir my-api
cd my-api
poetry init --name my-api --python "^3.10"
poetry add fastapi uvicorn
# Add your code
\`\`\`

**NestJS Project:**
\`\`\`bash
npx @nestjs/cli new my-app
cd my-app
npm install
# Add your code
\`\`\`

**Spring Boot Project:**
\`\`\`bash
mkdir billing-api
cd billing-api
curl https://start.spring.io/starter.zip \\
  -d dependencies=web,actuator \\
  -d type=maven-project \\
  -d language=java \\
  -o starter.zip
unzip starter.zip && rm starter.zip
./mvnw spring-boot:run
\`\`\`

### Option 3: Wait for Full Release

When \`rapidkit-core\` is published to PyPI:

\`\`\`bash
# Install Python Core
pip install rapidkit-core

# Re-create workspace with full features
rapidkit ${name}

# Move projects to new workspace
mv ${name}/* new-workspace/
\`\`\`

## 📚 Available Templates

| Template | Stack | Description |
|----------|-------|-------------|
| \`fastapi.standard\` | Python + FastAPI | High-performance Python API |
| \`nestjs.standard\` | TypeScript + NestJS | Enterprise Node.js framework |
| \`gofiber.standard\` | Go + Fiber | High-performance Go API |
| \`gogin.standard\` | Go + Gin | Idiomatic Go REST API |
| \`springboot.standard\` | Java + Spring Boot | Enterprise Java API service |
| \`dotnet.webapi.clean\` | C# + .NET | Clean architecture Web API service |

## 🛠️ Commands

With npm package installed:

\`\`\`bash
# Create project in workspace
npx rapidkit create project <template> <name> --yes --skip-install

# Examples
npx rapidkit create project fastapi.standard my-api --yes --skip-install
npx rapidkit create project fastapi.ddd my-api --yes --skip-install
npx rapidkit create project nestjs.standard my-app --yes --skip-install
npx rapidkit create project gofiber.standard my-go-api --yes --skip-install
npx rapidkit create project gogin.standard my-gin-api --yes --skip-install
npx rapidkit create project springboot.standard billing-api --yes --skip-install
npx rapidkit create project dotnet.webapi.clean dotnet-api --yes --skip-install
\`\`\`

## 🆘 Need Help?

- 📖 Documentation: https://www.workspai.com/docs
- 💬 GitHub Issues: https://github.com/rapidkitlabs/rapidkit-vscode/issues
- 🔧 VS Code Extension: Run \`Workspai: Run System Check\`

## 🔄 Upgrade to Full Workspace

To upgrade when RapidKit Core becomes available:

1. **Install rapidkit-core:**
   \`\`\`bash
   pip install rapidkit-core
   \`\`\`

2. **Create new workspace:**
   \`\`\`bash
   rapidkit new-workspace
   \`\`\`

3. **Migrate projects:**
   \`\`\`bash
   mv ${name}/* new-workspace/
   \`\`\`

4. **Or continue using this workspace** with npm package

---

**Created:** ${new Date().toISOString()}  
**Mode:** Fallback (npm-compatible structure)  
**Created By:** VS Code Workspai Extension  
**Structure Version:** Compatible with rapidkit npm v0.16.x
`;
    await fs.writeFile(readmePath, readmeContent);
    logger.info('Created README.md');

    // 6. Create .gitignore (same as npm package)
    const gitignorePath = path.join(workspacePath, '.gitignore');
    const gitignoreContent = `# RapidKit workspace
.env
.env.*
!.env.example

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
.venv/
ENV/
build/
dist/
*.egg-info/

# Node
node_modules/
npm-debug.log
yarn-error.log
.npm/
.yarn/

# IDEs
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# RapidKit
.rapidkit/templates/
`;
    await fs.writeFile(gitignorePath, gitignoreContent);
    logger.info('Created .gitignore');

    // 7. Initialize git if requested (same as npm package)
    if (initGit) {
      try {
        const { execa } = await import('execa');
        await execa('git', ['init'], { cwd: workspacePath });
        await execa('git', ['add', '.'], { cwd: workspacePath });
        await execa('git', ['commit', '-m', 'Initial commit: Workspai workspace (fallback mode)'], {
          cwd: workspacePath,
        });
        logger.info('Initialized git repository');
      } catch (gitError) {
        logger.warn('Failed to initialize git:', gitError);
      }
    }

    logger.info('Basic workspace created successfully with npm-compatible structure');
  } catch (error) {
    logger.error('Failed to create basic workspace:', error);
    throw error;
  }
}
