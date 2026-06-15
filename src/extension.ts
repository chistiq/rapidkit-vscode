/**
 * Workspai VS Code Extension
 * Main extension entry point
 */

import * as vscode from 'vscode';
import path from 'path';
import { ActionsWebviewProvider } from './ui/webviews/actionsWebviewProvider';
import { WorkspaceExplorerProvider } from './ui/treeviews/workspaceExplorer';
import {
  ProjectExplorerProvider,
  ProjectTreeItem,
  setExtensionPath,
} from './ui/treeviews/projectExplorer';
import { setSelectedProjectPath } from './core/selectedProject';
import { ModuleExplorerProvider } from './ui/treeviews/moduleExplorer';
import {
  DoctorEvidenceProvider,
  type DoctorIssueAIContext,
  type ProjectEvidence,
} from './ui/treeviews/doctorEvidenceProvider';
import { WorkspaceContractGraphProvider } from './ui/treeviews/workspaceContractGraphProvider';
import { checkAndNotifyUpdates } from './utils/updateChecker';
// templateExplorer removed in v0.4.3 (redundant with npm package)
import { registerCoreCommands } from './commands/coreCommands';
import { registerFileManagementCommands } from './commands/fileManagement';
import { registerProjectContextAndLogCommands } from './commands/projectContextAndLogs';
import { registerProjectLifecycleCommands } from './commands/projectLifecycle';
import { showWelcomeCommand } from './commands/showWelcome';
import { showIncidentStudioNextCommand } from './commands/incidentStudioNext';
import { registerWorkspaceSelectionCommands } from './commands/workspaceSelection';
import { registerWorkspaceOperationsCommands } from './commands/workspaceOperations';
import { registerInfraOperationsCommands } from './commands/infraOperations';
import { registerModuleMaintenanceCommands } from './commands/moduleMaintenance';
import { WorkspaiStatusBar } from './ui/statusBar';
import { ConfigurationManager } from './core/configurationManager';
import { WorkspaceDetector } from './core/workspaceDetector';
import { Logger } from './utils/logger';
import { WorkspaiCodeActionsProvider } from './providers/codeActionsProvider';
import { WorkspaiArchitectureCodeLensProvider } from './providers/architectureLensCodeLensProvider';
import { WorkspaiArchitectureInlineDecorationController } from './providers/architectureLensInlineDecorationController';
import { WorkspaiCompletionProvider } from './providers/completionProvider';
import { WorkspaiHoverProvider } from './providers/hoverProvider';
import { WorkspaceUsageTracker } from './utils/workspaceUsageTracker';
import { WelcomePanel } from './ui/panels/welcomePanel';
import { ModulesCatalogService } from './core/modulesCatalogService';
import { runRapidkitCommandsInTerminal } from './utils/terminalExecutor';
import { ExamplesService } from './core/examplesService';
import { KitsService } from './core/kitsService';
import { registerAIDebuggerCommand } from './commands/aiDebugger';
import { registerWorkspaceBrainCommand } from './commands/workspaceBrain';
import { registerAIFreeFeatureCommands } from './commands/aiFreeFeatures';
import { WorkspaceMemoryService } from './core/workspaceMemoryService';
import { registerWorkspaiChatParticipant } from './commands/chatParticipant';
import { registerModelCacheConfigListener } from './core/aiModelSelection';
import {
  buildWorkspaceShareBundleDashboardSummary,
  parseWorkspaceShareBundle,
} from './utils/workspaceShareBundle';
import { WorkspaiWorkspace } from './types';

let statusBar: WorkspaiStatusBar;
let actionsWebviewProvider: ActionsWebviewProvider;
let workspaceExplorer: WorkspaceExplorerProvider;
let projectExplorer: ProjectExplorerProvider;
let moduleExplorer: ModuleExplorerProvider;
let doctorEvidenceExplorer: DoctorEvidenceProvider;
let workspaceContractGraphExplorer: WorkspaceContractGraphProvider;
let architectureInlineDecorations: WorkspaiArchitectureInlineDecorationController;
// templateExplorer removed

const PROJECT_WATCHER_REFRESH_DEBOUNCE_MS = 250;
const PROJECT_REFRESH_WATCH_PATTERNS = [
  '**/pyproject.toml',
  '**/requirements.txt',
  '**/package.json',
  '**/go.mod',
  '**/pom.xml',
  '**/build.gradle',
  '**/build.gradle.kts',
  '**/settings.gradle',
  '**/settings.gradle.kts',
  '**/composer.json',
  '**/Cargo.toml',
  '**/mix.exs',
  '**/Gemfile',
];
const AI_ONBOARDING_VERSION_KEY = 'workspai.aiOnboarding.versionShown';
const AI_ONBOARDING_VERSION = '0.20.0-ai-ux-tour-1';
const AI_ONBOARDING_TOAST_VARIANT_KEY = 'workspai.aiOnboarding.toastVariant';

type AIFollowupToastVariant = 'control' | 'compact';

type AIContextWorkspace = {
  name?: string;
  path?: string;
};

type AIContextProject = {
  name?: string;
  path?: string;
  type?: string;
  workspacePath?: string;
};

type AIContextModule = {
  displayName?: string;
  name?: string;
  slug?: string;
  id?: string;
  description?: string;
};

type AIContextItem = {
  workspace?: AIContextWorkspace;
  project?: AIContextProject;
  module?: AIContextModule;
  preferredDisplayMode?: unknown;
  preferredArchitectureLensView?: unknown;
};

function asAIContextItem(value: unknown): AIContextItem | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return value as AIContextItem;
}

function asWorkspaiWorkspace(value: unknown): WorkspaiWorkspace | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<WorkspaiWorkspace>;
  if (typeof candidate.name !== 'string' || typeof candidate.path !== 'string') {
    return null;
  }

  const mode = candidate.mode === 'demo' || candidate.mode === 'full' ? candidate.mode : 'full';
  const projects = Array.isArray(candidate.projects) ? candidate.projects : [];

  return {
    ...candidate,
    name: candidate.name,
    path: candidate.path,
    mode,
    projects,
  } as WorkspaiWorkspace;
}

function parseUriListToFsPaths(uriList: string): string[] {
  return uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith('#'))
    .map((line) => {
      try {
        return vscode.Uri.parse(line).fsPath;
      } catch {
        return undefined;
      }
    })
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

// Track running dev servers per project (exported for ProjectExplorer)
export const runningServers: Map<string, vscode.Terminal> = new Map();

async function getFollowupToastVariant(
  context: vscode.ExtensionContext
): Promise<AIFollowupToastVariant> {
  const existing = context.globalState.get<AIFollowupToastVariant>(AI_ONBOARDING_TOAST_VARIANT_KEY);
  if (existing === 'control' || existing === 'compact') {
    return existing;
  }

  const picked: AIFollowupToastVariant = Math.random() < 0.5 ? 'control' : 'compact';
  await context.globalState.update(AI_ONBOARDING_TOAST_VARIANT_KEY, picked);
  return picked;
}

async function showAIFeatureOnboarding(
  context: vscode.ExtensionContext,
  options?: { force?: boolean }
): Promise<void> {
  const force = options?.force === true;
  const config = vscode.workspace.getConfiguration('workspai');

  if (!force) {
    const showOnboardingTips = config.get<boolean>('showOnboardingTips', true);
    if (!showOnboardingTips) {
      return;
    }

    const shownVersion = context.globalState.get<string>(AI_ONBOARDING_VERSION_KEY);
    if (shownVersion === AI_ONBOARDING_VERSION) {
      return;
    }
  }

  const openAIFlowsAction = 'Open AI Flows';
  const openTelemetryAction = 'Open Telemetry';
  const openDashboardAction = 'Open Dashboard';
  const dontShowAgainAction = "Don't show again";
  const quickStartAction = 'Open AI Flows now';

  const message =
    'New AI workflow shortcuts are available:\n\n' +
    '• AI Flows: smart routing into debug, planning, or memory actions\n' +
    '• Telemetry: usage snapshot with 24h/7d/all filters\n' +
    '• Reset Data: clear telemetry for current workspace\n\n' +
    'You can access these from Quick Actions, Command Palette, and workspace/project context menus.';

  await WorkspaceUsageTracker.getInstance().trackCommandEvent(
    'workspai.onboarding.primary.shown',
    undefined,
    { forced: force }
  );

  const selected = await vscode.window.showInformationMessage(
    message,
    { modal: false },
    openAIFlowsAction,
    openTelemetryAction,
    openDashboardAction,
    dontShowAgainAction
  );

  if (!force) {
    await context.globalState.update(AI_ONBOARDING_VERSION_KEY, AI_ONBOARDING_VERSION);
  }

  if (selected === openAIFlowsAction) {
    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.onboarding.primary.action',
      undefined,
      { action: 'open-ai-flows', forced: force }
    );
    await vscode.commands.executeCommand('workspai.aiOrchestrate');
    return;
  }

  if (selected === openTelemetryAction) {
    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.onboarding.primary.action',
      undefined,
      { action: 'open-telemetry', forced: force }
    );
    await vscode.commands.executeCommand('workspai.showTelemetrySummary');
    return;
  }

  if (selected === openDashboardAction) {
    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.onboarding.primary.action',
      undefined,
      { action: 'open-dashboard', forced: force }
    );
    await vscode.commands.executeCommand('workspai.showWelcome');
    return;
  }

  if (selected === dontShowAgainAction) {
    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.onboarding.primary.action',
      undefined,
      { action: 'dont-show-again', forced: force }
    );
    await config.update('showOnboardingTips', false, vscode.ConfigurationTarget.Global);
    return;
  }

  if (selected === undefined) {
    const variant = await getFollowupToastVariant(context);
    const followupMessage =
      variant === 'compact'
        ? 'Quick start: use AI Flows to jump directly into guided workflows.'
        : 'Tip: Start with AI Flows for the fastest path from intent to action.';

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.onboarding.followup.shown',
      undefined,
      { variant, forced: force }
    );

    const quickStart = await vscode.window.showInformationMessage(
      followupMessage,
      quickStartAction
    );

    if (quickStart === quickStartAction) {
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.onboarding.followup.action',
        undefined,
        { action: 'open-ai-flows', variant, forced: force }
      );
      await vscode.commands.executeCommand('workspai.aiOrchestrate');
      return;
    }

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.onboarding.followup.action',
      undefined,
      { action: 'dismissed', variant, forced: force }
    );
  }
}

async function runOptionalActivationLane(
  logger: Logger,
  laneName: string,
  lane: () => Promise<void> | void
): Promise<void> {
  try {
    await lane();
  } catch (error) {
    logger.warn(`[Activation Lane: ${laneName}] failed (non-critical)`, error);
  }
}

function registerProjectRefreshWatchers(
  context: vscode.ExtensionContext,
  config: vscode.WorkspaceConfiguration,
  onRefresh: () => void
): void {
  const fileWatchers = PROJECT_REFRESH_WATCH_PATTERNS.map((pattern) =>
    vscode.workspace.createFileSystemWatcher(pattern, false, false, false)
  );

  let projectRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleProjectRefresh = () => {
    if (!config.get('autoRefresh', true)) {
      return;
    }
    if (projectRefreshTimer) {
      clearTimeout(projectRefreshTimer);
    }
    projectRefreshTimer = setTimeout(() => {
      projectRefreshTimer = null;
      onRefresh();
    }, PROJECT_WATCHER_REFRESH_DEBOUNCE_MS);
  };

  for (const watcher of fileWatchers) {
    watcher.onDidCreate(scheduleProjectRefresh);
    watcher.onDidChange(scheduleProjectRefresh);
    watcher.onDidDelete(scheduleProjectRefresh);
  }

  context.subscriptions.push({
    dispose: () => {
      if (projectRefreshTimer) {
        clearTimeout(projectRefreshTimer);
        projectRefreshTimer = null;
      }
    },
  });

  context.subscriptions.push(...fileWatchers);
}

export async function activate(context: vscode.ExtensionContext) {
  const logger = Logger.getInstance();
  logger.info('🚀 Workspai extension is activating...');

  // Store context globally for access from commands
  (globalThis as { extensionContext?: vscode.ExtensionContext }).extensionContext = context;

  // Set extension path for custom icons
  setExtensionPath(context.extensionPath);

  try {
    // Register commands FIRST - these MUST succeed
    logger.info('Step 1: Registering commands...');

    context.subscriptions.push(
      ...registerCoreCommands({
        context,
        logger,
        getWorkspaceExplorer: () => workspaceExplorer,
        getProjectExplorer: () => projectExplorer,
      }),
      ...registerWorkspaceSelectionCommands({
        logger,
        getWorkspaceExplorer: () => workspaceExplorer,
        getProjectExplorer: () => projectExplorer,
        getModuleExplorer: () => moduleExplorer,
      }),
      ...registerWorkspaceOperationsCommands({
        logger,
        getWorkspaceExplorer: () => workspaceExplorer,
        context,
      }),
      ...registerInfraOperationsCommands({
        logger,
        getWorkspaceExplorer: () => workspaceExplorer,
      }),
      ...registerModuleMaintenanceCommands({
        logger,
        getProjectExplorer: () => projectExplorer,
      }),
      ...registerProjectContextAndLogCommands(),
      ...registerProjectLifecycleCommands({
        logger,
        runningServers,
        getProjectExplorer: () => projectExplorer,
      }),
      ...registerFileManagementCommands({
        logger,
        getProjectExplorer: () => projectExplorer,
      }),
      registerAIDebuggerCommand(context),
      registerWorkspaceBrainCommand(context),
      ...registerAIFreeFeatureCommands(context)
    );

    // Chat participant — @workspai in the VS Code Chat panel
    registerWorkspaiChatParticipant(context);

    // Invalidate model selection cache immediately when user changes preferred model
    registerModelCacheConfigListener(context);

    // AI context commands — triggered from tree view inline buttons
    context.subscriptions.push(
      vscode.commands.registerCommand('workspai.aiForWorkspace', (item?: unknown) => {
        const contextItem = asAIContextItem(item);
        const ws = contextItem?.workspace || workspaceExplorer?.getSelectedWorkspace();
        if (!ws || typeof ws.name !== 'string' || typeof ws.path !== 'string') {
          vscode.window.showWarningMessage('Select a workspace first.');
          return;
        }
        WelcomePanel.showAIModal(context, {
          type: 'workspace',
          name: ws.name,
          path: ws.path,
        });
      }),
      // Edit / create workspace memory — opens .rapidkit/workspace-memory.json
      vscode.commands.registerCommand('workspai.editWorkspaceMemory', async (item?: unknown) => {
        const contextItem = asAIContextItem(item);
        const ws = contextItem?.workspace || workspaceExplorer?.getSelectedWorkspace();
        if (!ws || typeof ws.path !== 'string') {
          vscode.window.showWarningMessage('Select a workspace first.');
          return;
        }
        const memSvc = WorkspaceMemoryService.getInstance();
        if (!(await memSvc.hasMemory(ws.path))) {
          // Seed with a template so the user has something to start from
          await memSvc.writeTemplate(ws.path);
        }
        const memUri = vscode.Uri.file(path.join(ws.path, '.rapidkit', 'workspace-memory.json'));
        await vscode.window.showTextDocument(memUri, { preview: false });
        vscode.window.showInformationMessage(
          'Edit your workspace memory — the AI will include it in every prompt.',
          'OK'
        );
      }),
      vscode.commands.registerCommand('workspai.aiForProject', (item?: unknown) => {
        const contextItem = asAIContextItem(item);
        const project = contextItem?.project || projectExplorer?.getSelectedProject();
        if (!project || typeof project.name !== 'string') {
          vscode.window.showWarningMessage('Select a project first.');
          return;
        }
        WelcomePanel.showAIModal(context, {
          type: 'project',
          name: project.name,
          path: project.path,
          framework: project.type,
        });
      }),
      vscode.commands.registerCommand('workspai.aiForModule', (item?: unknown) => {
        const contextItem = asAIContextItem(item);
        const mod = contextItem?.module;
        const project = projectExplorer?.getSelectedProject();
        WelcomePanel.showAIModal(context, {
          type: 'module',
          name: mod?.displayName || mod?.name || 'Module',
          path: project?.path,
          framework: project?.type,
          moduleSlug: mod?.slug || mod?.id,
          moduleDescription: mod?.description,
        });
      }),
      vscode.commands.registerCommand('workspai.openIncidentStudio', (item?: unknown) => {
        const contextItem = asAIContextItem(item);
        const workspaceFromItem = contextItem?.workspace;
        const projectFromItem = contextItem?.project;

        const selectedWorkspace = workspaceExplorer?.getSelectedWorkspace();

        const workspacePath =
          (typeof workspaceFromItem?.path === 'string' && workspaceFromItem.path) ||
          (typeof projectFromItem?.workspacePath === 'string' && projectFromItem.workspacePath) ||
          (typeof selectedWorkspace?.path === 'string' && selectedWorkspace.path);

        const workspaceName =
          (typeof workspaceFromItem?.name === 'string' && workspaceFromItem.name) ||
          (typeof selectedWorkspace?.name === 'string' && selectedWorkspace.name) ||
          (typeof projectFromItem?.name === 'string' ? projectFromItem.name : undefined);

        if (!workspacePath) {
          vscode.window.showWarningMessage('Select a workspace first.');
          return;
        }

        const selectedProject = projectExplorer?.getSelectedProject?.();
        const resolvedProjectPath =
          (typeof projectFromItem?.path === 'string' && projectFromItem.path) ||
          (typeof selectedProject?.path === 'string' ? selectedProject.path : undefined);
        const resolvedProjectName =
          (typeof projectFromItem?.name === 'string' && projectFromItem.name) ||
          (typeof selectedProject?.name === 'string' ? selectedProject.name : undefined);

        const resolvedProjectType =
          (typeof projectFromItem?.type === 'string' && projectFromItem.type) ||
          (typeof selectedProject?.type === 'string' ? selectedProject.type : undefined);

        WelcomePanel.openIncidentStudio(context, {
          workspacePath,
          workspaceName: workspaceName || path.basename(workspacePath),
          projectPath: resolvedProjectPath,
          projectName: resolvedProjectName,
          projectType: resolvedProjectType,
        });
      }),
      vscode.commands.registerCommand('workspai.importWorkspaceShareBundle', async () => {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            JSON: ['json'],
            'All Files': ['*'],
          },
          openLabel: 'Import Share Bundle',
          title: 'Select workspace share bundle (share-bundle.json)',
        });

        const fileUri = picked?.[0];
        if (!fileUri) {
          return;
        }

        try {
          const rawBuffer = await vscode.workspace.fs.readFile(fileUri);
          const rawText = Buffer.from(rawBuffer).toString('utf8');
          const bundle = parseWorkspaceShareBundle(rawText);
          const summary = buildWorkspaceShareBundleDashboardSummary(bundle, fileUri.fsPath);

          WelcomePanel.openWorkspaceShareDashboard(context, { summary });

          await WorkspaceUsageTracker.getInstance().trackCommandEvent(
            'workspai.workspace.share_bundle_imported',
            undefined,
            {
              schemaVersion: summary.schemaVersion,
              projectCount: summary.projectCount,
              runtimes: summary.runtimes.join(','),
            }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to import workspace share bundle: ${message}`);
        }
      }),
      // AI-powered workspace creation — triggered from sidebar Quick Actions panel
      vscode.commands.registerCommand('workspai.openAICreateWorkspace', () => {
        WelcomePanel.openAICreateModal(context, 'workspace');
      }),
      // AI-powered project creation — triggered from Projects panel title button
      vscode.commands.registerCommand('workspai.aiCreateProject', () => {
        WelcomePanel.openAICreateModal(context, 'project');
      }),
      // Quick switch workspace via QuickPick
      vscode.commands.registerCommand('workspai.quickSwitchWorkspace', () => {
        workspaceExplorer.quickSwitch();
      }),
      // Manual trigger for onboarding tips/tour
      vscode.commands.registerCommand('workspai.showAIFeatureOnboarding', async () => {
        await showAIFeatureOnboarding(context, { force: true });
      }),
      // Canonical Incident Studio — legacy Next command aliases here for compatibility
      vscode.commands.registerCommand('workspai.incidentStudioNext', async () => {
        await showIncidentStudioNextCommand(context, workspaceExplorer, projectExplorer);
      })
    );

    logger.info('✅ Commands registered successfully');

    // Listen for terminal close events to update running servers
    context.subscriptions.push(
      vscode.window.onDidCloseTerminal((closedTerminal) => {
        // Find and remove from runningServers
        for (const [projectPath, terminal] of runningServers.entries()) {
          if (terminal === closedTerminal) {
            runningServers.delete(projectPath);
            logger.info(`Terminal closed for project: ${projectPath}`);
            // Refresh tree to update icons
            projectExplorer?.refresh();
            break;
          }
        }
      })
    );

    // Initialize configuration manager
    logger.info('Step 2: Initializing configuration manager...');
    const configManager = ConfigurationManager.getInstance();
    await configManager.initialize(context);

    await runOptionalActivationLane(logger, 'workspace-detection', async () => {
      // Deferred to background so sidebar renders immediately.
      WorkspaceDetector.getInstance()
        .detectRapidKitProjects()
        .catch((err) => logger.warn('Workspace detection failed (non-critical):', err));
    });

    await runOptionalActivationLane(logger, 'modules-catalog-init', async () => {
      ModulesCatalogService.initialize(context);
    });

    await runOptionalActivationLane(logger, 'examples-service-init', async () => {
      ExamplesService.initialize(context);
    });

    await runOptionalActivationLane(logger, 'kits-service-init', async () => {
      KitsService.initialize(context);
    });

    // Ensure default workspace is registered
    logger.info('Step 3.5: Checking default workspace...');
    // NOTE: Do not auto-create default workspace - user should create workspace manually via command
    // await ensureDefaultWorkspace();

    // Initialize status bar
    logger.info('Step 4: Initializing status bar...');
    statusBar = new WorkspaiStatusBar();
    context.subscriptions.push(statusBar);

    // Initialize tree view providers
    logger.info('Step 5: Initializing tree view providers...');
    actionsWebviewProvider = new ActionsWebviewProvider(context.extensionUri);
    workspaceExplorer = new WorkspaceExplorerProvider();
    projectExplorer = new ProjectExplorerProvider();
    moduleExplorer = new ModuleExplorerProvider();
    doctorEvidenceExplorer = new DoctorEvidenceProvider(
      () => workspaceExplorer?.getSelectedWorkspace()?.path ?? null
    );
    workspaceContractGraphExplorer = new WorkspaceContractGraphProvider(
      () => workspaceExplorer?.getSelectedWorkspace()?.path ?? null
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('workspai.getSelectedWorkspace', () => {
        return projectExplorer?.getSelectedWorkspace() ?? null;
      }),
      vscode.commands.registerCommand('workspai.getSelectedProject', () => {
        return projectExplorer?.getSelectedProject() ?? null;
      })
    );

    // Set workspace explorer reference for WelcomePanel
    WelcomePanel.setWorkspaceExplorer(workspaceExplorer);
    WelcomePanel.setProjectExplorer(projectExplorer);
    WelcomePanel.setExtensionContext(context);

    // Register tree views
    logger.info('Step 6: Registering tree views...');
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('rapidkitActionsWebview', actionsWebviewProvider),
      vscode.window.registerTreeDataProvider('rapidkitWorkspaces', workspaceExplorer)
    );
    const projectsDropController: vscode.TreeDragAndDropController<ProjectTreeItem> = {
      dragMimeTypes: [],
      dropMimeTypes: ['text/uri-list'],
      handleDrag: async () => {
        // Drag export is intentionally disabled; this controller is for import-only drops.
      },
      handleDrop: async (_target, dataTransfer) => {
        const uriListItem = dataTransfer.get('text/uri-list');
        if (!uriListItem) {
          return;
        }

        const droppedPaths = parseUriListToFsPaths(await uriListItem.asString());
        if (droppedPaths.length === 0) {
          return;
        }

        await vscode.commands.executeCommand('workspai.importProject', {
          source: 'drag-drop',
          droppedPaths,
        });
      },
    };

    const projectsTreeView = vscode.window.createTreeView('rapidkitProjects', {
      treeDataProvider: projectExplorer,
      dragAndDropController: projectsDropController,
    });
    context.subscriptions.push(projectsTreeView);
    projectsTreeView.onDidChangeSelection((e) => {
      const item = e.selection[0];
      if (item && item instanceof ProjectTreeItem && item.project?.path) {
        setSelectedProjectPath(item.project.path);
        // Update Module Explorer to show installed modules for this project
        moduleExplorer.setProjectPath(item.project.path, item.project.type);
      }
    });
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('rapidkitModules', moduleExplorer),
      vscode.window.registerTreeDataProvider('rapidkitDoctorEvidence', doctorEvidenceExplorer),
      vscode.window.registerTreeDataProvider(
        'rapidkitWorkspaceContractGraph',
        workspaceContractGraphExplorer
      ),
      // Refresh evidence panel whenever workspace tree changes (fires right after selectedWorkspace is updated)
      workspaceExplorer.onDidChangeTreeData(() => {
        doctorEvidenceExplorer.refresh();
        workspaceContractGraphExplorer.refresh();
      })
    );

    // Doctor Evidence commands
    context.subscriptions.push(
      vscode.commands.registerCommand('workspai.doctorEvidence.refresh', () => {
        doctorEvidenceExplorer.refresh();
      }),
      vscode.commands.registerCommand('workspai.workspaceContractGraph.refresh', () => {
        workspaceContractGraphExplorer.refresh();
      }),
      vscode.commands.registerCommand('workspai.doctorEvidence.rerun', async () => {
        const ws = workspaceExplorer.getSelectedWorkspace();
        if (!ws) {
          vscode.window.showWarningMessage('Select a workspace first.');
          return;
        }
        runRapidkitCommandsInTerminal({
          name: `Workspai Doctor - ${ws.name ?? ws.path}`,
          cwd: ws.path,
          commands: [['doctor', 'workspace']],
        });
        // File watcher on doctor-last-run.json triggers refresh automatically
      }),
      vscode.commands.registerCommand('workspai.doctorEvidence.autofix', async () => {
        const ws = workspaceExplorer.getSelectedWorkspace();
        if (!ws) {
          vscode.window.showWarningMessage('Select a workspace first.');
          return;
        }
        runRapidkitCommandsInTerminal({
          name: `Workspai Doctor Fix - ${ws.name ?? ws.path}`,
          cwd: ws.path,
          commands: [['doctor', 'workspace', '--fix']],
        });
        // File watcher on doctor-last-run.json triggers refresh automatically
      }),
      vscode.commands.registerCommand(
        'workspai.doctorEvidence.fixIssueWithAI',
        async (issue: string, project: ProjectEvidence, aiContext?: DoctorIssueAIContext) => {
          if (!issue) {
            return;
          }
          const framework = project?.framework ?? 'unknown';
          const projectName = project?.name ?? 'project';
          const structuredContext = {
            issue,
            project: {
              name: projectName,
              path: project?.path,
              framework,
              depsInstalled: project?.depsInstalled,
              fixCommands: project?.fixCommands ?? [],
            },
            workspace: {
              name: aiContext?.workspaceName,
              generatedAt: aiContext?.generatedAt,
              healthScore: aiContext?.healthScore,
              versions: aiContext?.systemVersions,
            },
          };
          const prefillQuestion = [
            `Project: ${projectName} (${framework})`,
            `Issue detected by Workspai Doctor:`,
            issue,
            project?.fixCommands?.length
              ? `Suggested fix commands:\n${project.fixCommands.map((c) => `  ${c}`).join('\n')}`
              : '',
            `Doctor evidence (structured JSON):\n${JSON.stringify(structuredContext, null, 2)}`,
          ]
            .filter(Boolean)
            .join('\n');

          WelcomePanel.showAIModal(context, {
            type: 'project',
            name: projectName,
            path: project?.path,
            framework: framework === 'unknown' ? undefined : framework,
            prefillQuestion,
            prefillMode: 'debug',
          });
        }
      ),
      // Refresh evidence panel whenever workspace selection changes
      vscode.commands.registerCommand('workspai.workspaceSelected', async (workspace: unknown) => {
        projectExplorer?.setWorkspace(asWorkspaiWorkspace(workspace));
        doctorEvidenceExplorer.refresh();
        workspaceContractGraphExplorer.refresh();
        await WelcomePanel.refreshDashboardForWorkspaceSelection();
      })
    );

    // Register IntelliSense providers
    logger.info('Step 7: Registering IntelliSense providers...');
    context.subscriptions.push(
      // Code actions for configuration files + AI debug for source files
      vscode.languages.registerCodeActionsProvider(
        [
          { pattern: '**/.rapidkitrc.json' },
          { pattern: '**/rapidkit.json' },
          { pattern: '**/module.yaml' },
          { language: 'python' },
          { language: 'typescript' },
          { language: 'javascript' },
          { language: 'go' },
          { language: 'typescriptreact' },
          { language: 'javascriptreact' },
        ],
        new WorkspaiCodeActionsProvider(),
        {
          providedCodeActionKinds: WorkspaiCodeActionsProvider.providedCodeActionKinds,
        }
      ),

      vscode.languages.registerCodeLensProvider(
        [
          { language: 'python' },
          { language: 'typescript' },
          { language: 'javascript' },
          { language: 'go' },
          { language: 'java' },
          { language: 'typescriptreact' },
          { language: 'javascriptreact' },
        ],
        new WorkspaiArchitectureCodeLensProvider()
      ),

      // Completion provider
      vscode.languages.registerCompletionItemProvider(
        [
          { pattern: '**/.rapidkitrc.json' },
          { pattern: '**/rapidkit.json' },
          { pattern: '**/module.yaml' },
        ],
        new WorkspaiCompletionProvider(),
        '"',
        ':',
        ' '
      ),

      // Hover provider
      vscode.languages.registerHoverProvider(
        [
          { pattern: '**/.rapidkitrc.json' },
          { pattern: '**/rapidkit.json' },
          { pattern: '**/module.yaml' },
        ],
        new WorkspaiHoverProvider()
      )
    );

    architectureInlineDecorations = new WorkspaiArchitectureInlineDecorationController();
    context.subscriptions.push(architectureInlineDecorations);

    logger.info('Step 8: IntelliSense providers registered');

    logger.info('✅ Workspai commands registered successfully!');
    statusBar.updateStatus('ready');

    // Check for rapidkit npm updates (non-blocking, runs in background)
    await runOptionalActivationLane(logger, 'update-check', async () => {
      checkAndNotifyUpdates(context).catch((err) => {
        logger.error('Update check failed', err);
      });
    });

    // Initialize workspace selection ASYNCHRONOUSLY (non-blocking)
    // This allows commands to be available immediately even if initialization fails
    (async () => {
      try {
        logger.info('Step 9: Initializing workspace selection...');
        await workspaceExplorer.refresh();

        // Sync evidence panel with whatever workspace was auto-selected on load
        const initialWs = workspaceExplorer.getSelectedWorkspace();
        doctorEvidenceExplorer.setWorkspacePath(initialWs?.path ?? null);
        workspaceContractGraphExplorer.setWorkspacePath(initialWs?.path ?? null);

        // Show welcome page on first activation
        logger.info('Step 10: Checking welcome page settings...');
        const config = vscode.workspace.getConfiguration('workspai');

        // Always show welcome page on first activation or if configured
        // Setup wizard is now integrated into welcome page
        if (config.get('showWelcomeOnStartup', true)) {
          await showWelcomeCommand(context);
        }

        // Step 11: Initialize workspace usage tracking
        logger.info('Step 11: Initializing workspace usage tracker...');
        const usageTracker = WorkspaceUsageTracker.getInstance();
        await usageTracker.initialize();

        // Step 12: Show AI feature onboarding tips (once per version unless forced)
        logger.info('Step 12: Checking AI onboarding tips...');
        await showAIFeatureOnboarding(context);

        logger.info('✅ Workspai extension initialized successfully!');

        registerProjectRefreshWatchers(context, config, () => {
          projectExplorer.refresh();
        });
      } catch (error) {
        logger.error('Error during async initialization:', error);
      }
    })();
  } catch (error) {
    logger.error('Failed to activate Workspai extension', error);
    vscode.window.showErrorMessage(
      `Failed to activate Workspai extension: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function refreshModuleExplorerStates(): Promise<void> {
  if (moduleExplorer) {
    await moduleExplorer.reloadModuleStates();
  }
}

export function deactivate() {
  Logger.getInstance().info('👋 Workspai extension is deactivating...');
  if (statusBar) {
    statusBar.dispose();
  }
  if (workspaceExplorer) {
    workspaceExplorer.dispose();
  }
}
