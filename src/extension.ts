/**
 * Workspai VS Code Extension
 * Main extension entry point
 */

import * as vscode from 'vscode';
import { runningServers } from './core/runningServers';
import {
  resolveWorkspacePathForEvidenceTerminal,
  shouldRefreshEvidenceOnTerminalClose,
} from './core/workspaceIntelligenceRuntime';
import { setWorkspaceEvidenceRefreshHandler } from './core/workspaceIntelligenceProgressRunner';
import { presentCliVersionGate, resolveLinkedCliVersion } from './core/cliVersionGate';
import { syncWalkthroughEvidenceContext } from './core/walkthroughEvidenceContext';
import { ensureInstalledAt } from './core/ttfvBridge';
import { registerModuleExplorerReload } from './core/moduleExplorerRuntime';
import { ActionsWebviewProvider } from './ui/webviews/actionsWebviewProvider';
import { WorkspaceExplorerProvider } from './ui/treeviews/workspaceExplorer';
import {
  ProjectExplorerProvider,
  ProjectTreeItem,
  setExtensionPath,
} from './ui/treeviews/projectExplorer';
import { getSelectedProjectPath, setSelectedProjectPath } from './core/selectedProject';
import { ModuleExplorerProvider } from './ui/treeviews/moduleExplorer';
import { DoctorEvidenceProvider } from './ui/treeviews/doctorEvidenceProvider';
import {
  buildDoctorIssueAdvisorQuestion,
  buildDoctorIssueCopilotQuestion,
  buildDoctorIssueStudioPrompt,
  resolveDoctorIssueHandoff,
} from './core/doctorIssueHandoff';
import { sendEvidenceToCopilot } from './core/sendToCopilot';
import { WorkspaceContractGraphProvider } from './ui/treeviews/workspaceContractGraphProvider';
import { checkAndNotifyUpdates } from './utils/updateChecker';
// templateExplorer removed in v0.4.3 (redundant with npm package)
import { registerExplorerFolderCommands } from './commands/explorerFolderCommands';
import { registerCoreCommands } from './commands/coreCommands';
import { registerFileManagementCommands } from './commands/fileManagement';
import { registerProjectContextAndLogCommands } from './commands/projectContextAndLogs';
import { registerProjectLifecycleCommands } from './commands/projectLifecycle';
import { showWelcomeCommand } from './commands/showWelcome';
import { showIncidentStudioNextCommand } from './commands/incidentStudioNext';
import { registerWorkspaceSelectionCommands } from './commands/workspaceSelection';
import { registerWorkspaceOperationsCommands } from './commands/workspaceOperations';
import { registerWorkspaceIntelligenceCommands } from './commands/workspaceIntelligence';
import { registerInfraOperationsCommands } from './commands/infraOperations';
import { registerModuleMaintenanceCommands } from './commands/moduleMaintenance';
import { WorkspaiStatusBar } from './ui/statusBar';
import { ConfigurationManager } from './core/configurationManager';
import { WorkspaceDetector } from './core/workspaceDetector';
import { Logger } from './utils/logger';
import { WorkspaiCodeActionsProvider } from './providers/codeActionsProvider';
import { WorkspaiCompletionProvider } from './providers/completionProvider';
import { WorkspaiHoverProvider } from './providers/hoverProvider';
import { WorkspaceUsageTracker } from './utils/workspaceUsageTracker';
import {
  WORKSPAI_AI_FLOWS_ONBOARDING_DETAIL,
  WORKSPAI_AI_FLOWS_ONBOARDING_HEADLINE,
} from './core/workspaiAiNarrative';
import { WelcomePanel } from './ui/panels/welcomePanel';
import { clearLegacyWorkspaceGraphState } from './ui/panels/welcomePanelChatBrainLifecycle';
import { ModulesCatalogService } from './core/modulesCatalogService';
import { runGatedRapidkitCommandsInTerminal } from './core/gatedRapidkitTerminal';
import { ExamplesService } from './core/examplesService';
import { KitsService } from './core/kitsService';
import { registerAIDebuggerCommand } from './commands/aiDebugger';
import { registerWorkspaceBrainCommand } from './commands/workspaceBrain';
import { registerAIFreeFeatureCommands } from './commands/aiFreeFeatures';
import { WorkspaceMemoryService } from './core/workspaceMemoryService';
import { registerWorkspaiChatParticipant } from './commands/chatParticipant';
import { registerModelCacheConfigListener } from './core/aiModelSelection';
import { WorkspaceManager } from './core/workspaceManager';
import { PROJECT_REFRESH_WATCH_PATTERNS } from './core/projectRefreshContract';
import {
  buildWorkspaceShareBundleDashboardSummary,
  parseWorkspaceShareBundle,
} from './utils/workspaceShareBundle';
import { WorkspaiWorkspace } from './types';

let statusBar: WorkspaiStatusBar;
let actionsWebviewProvider: ActionsWebviewProvider;
let secondaryActionsWebviewProvider: ActionsWebviewProvider;
let workspaceExplorer: WorkspaceExplorerProvider;
let projectExplorer: ProjectExplorerProvider;
let moduleExplorer: ModuleExplorerProvider;
let doctorEvidenceExplorer: DoctorEvidenceProvider;
let workspaceContractGraphExplorer: WorkspaceContractGraphProvider;
// templateExplorer removed

const PROJECT_WATCHER_REFRESH_DEBOUNCE_MS = 250;
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
  const record = value as Record<string, unknown>;
  const nested = value as AIContextItem;
  if (nested.workspace || nested.project || nested.module) {
    return nested;
  }
  const projectPath = typeof record.projectPath === 'string' ? record.projectPath : undefined;
  const projectName = typeof record.projectName === 'string' ? record.projectName : undefined;
  const projectType = typeof record.projectType === 'string' ? record.projectType : undefined;
  const flatPath = typeof record.path === 'string' ? record.path : undefined;
  const flatName = typeof record.name === 'string' ? record.name : undefined;
  const workspacePath =
    typeof record.workspacePath === 'string'
      ? record.workspacePath
      : !projectPath && !projectName && !projectType
        ? flatPath
        : undefined;
  const workspaceName =
    typeof record.workspaceName === 'string'
      ? record.workspaceName
      : !projectPath && !projectName && !projectType
        ? flatName
        : undefined;
  if (!workspacePath && !workspaceName && !projectPath && !projectName) {
    return nested;
  }
  return {
    workspace:
      workspacePath || workspaceName
        ? {
            name: workspaceName,
            path: workspacePath,
          }
        : undefined,
    project:
      projectPath || projectName
        ? {
            name: projectName,
            path: projectPath,
            type: projectType,
            workspacePath,
          }
        : undefined,
  };
}

function revealWorkspaceAdvisorForScope(input: {
  workspace?: AIContextWorkspace | null;
  project?: AIContextProject | null;
  initialQuestion?: string;
  editorIssue?: Record<string, unknown>;
  source?: string;
  trigger?: string;
}): void {
  void secondaryActionsWebviewProvider?.revealSecondaryTab('impact', {
    workspace: input.workspace
      ? {
          name: input.workspace.name,
          path: input.workspace.path,
          workspaceRootPath: input.workspace.path,
        }
      : null,
    project: input.project
      ? {
          name: input.project.name,
          path: input.project.path,
          type: input.project.type,
          workspacePath: input.project.workspacePath,
        }
      : null,
    initialQuestion: input.initialQuestion,
    ...(input.editorIssue ? { editorIssue: input.editorIssue } : {}),
    source: input.source ?? 'extension-command',
    trigger: input.trigger ?? 'workspace-advisor',
  });
}

function revealStudioForScope(input: {
  workspace?: AIContextWorkspace | null;
  project?: AIContextProject | null;
  initialTask?: string;
  composerHandoff?: 'prefill' | 'submit';
  studioMode?: 'investigate' | 'verify' | 'prepare';
  editorIssue?: Record<string, unknown>;
  source?: string;
  trigger?: string;
  blockerHandoff?: Record<string, unknown>;
}): void {
  void secondaryActionsWebviewProvider?.revealSecondaryTab('studio', {
    workspace: input.workspace
      ? {
          name: input.workspace.name,
          path: input.workspace.path,
          workspaceRootPath: input.workspace.path,
        }
      : null,
    project: input.project
      ? {
          name: input.project.name,
          path: input.project.path,
          type: input.project.type,
          workspacePath: input.project.workspacePath,
        }
      : null,
    initialTask: input.initialTask,
    composerHandoff: input.composerHandoff,
    studioMode: input.studioMode,
    ...(input.editorIssue ? { editorIssue: input.editorIssue } : {}),
    source: input.source ?? 'extension-command',
    trigger: input.trigger ?? 'studio',
    ...(input.blockerHandoff ? { blockerHandoff: input.blockerHandoff } : {}),
  });
}

function buildSecondaryScopePayload(input: {
  workspace?: AIContextWorkspace | null;
  project?: AIContextProject | null;
  source?: string;
  trigger?: string;
}): Record<string, unknown> {
  return {
    workspace: input.workspace
      ? {
          name: input.workspace.name,
          path: input.workspace.path,
          workspaceRootPath: input.workspace.path,
        }
      : null,
    project: input.project
      ? {
          name: input.project.name,
          path: input.project.path,
          type: input.project.type,
          workspacePath: input.project.workspacePath,
        }
      : null,
    source: input.source ?? 'extension-command',
    trigger: input.trigger ?? 'secondary-tab',
  };
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

function refreshStatusBarAmbientTruth(workspace: WorkspaiWorkspace | null): void {
  if (!statusBar) {
    return;
  }
  const workspaceName = workspace?.name;
  statusBar.updateAmbientTruth({ workspaceName });
  if (!workspace?.path) {
    return;
  }
  void resolveLinkedCliVersion(workspace.path)
    .then((cliVersion) => {
      const currentWorkspace = workspaceExplorer?.getSelectedWorkspace();
      if (currentWorkspace?.path !== workspace.path) {
        return;
      }
      statusBar.updateAmbientTruth({ workspaceName, cliVersion: cliVersion ?? undefined });
    })
    .catch((error) => {
      console.warn('[Workspai] Failed to refresh status bar CLI version', error);
    });
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

// Track running dev servers per project (see core/runningServers.ts)

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
    if (config.get('showWelcomeOnStartup', true)) {
      // The dashboard owns day-0 AI discovery when it opens on startup. Avoid
      // stacking a toast on top of the Welcome surface while still recording
      // this version as discovered through the in-dashboard Create/Advisor/Studio
      // paths.
      await context.globalState.update(AI_ONBOARDING_VERSION_KEY, AI_ONBOARDING_VERSION);
      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.onboarding.primary.dashboard_discovery',
        undefined,
        { forced: force }
      );
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
    `${WORKSPAI_AI_FLOWS_ONBOARDING_HEADLINE}\n\n` +
    `${WORKSPAI_AI_FLOWS_ONBOARDING_DETAIL}\n\n` +
    '• AI Flows: smart routing into debug, planning, or memory actions\n' +
    '• Telemetry: usage snapshot with 24h/7d/all filters\n' +
    '• Reset Data: clear telemetry for current workspace\n\n' +
    'You can access these from Workspai, Command Palette, and workspace/project context menus.';

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

const WORKSPACE_DETECTION_DISMISSED_KEY = 'workspai.workspaceDetection.dismissedPaths';

async function promptToRegisterDetectedWorkspaceRoots(
  context: vscode.ExtensionContext,
  workspaceExplorerProvider: WorkspaceExplorerProvider | undefined,
  logger: Logger
): Promise<void> {
  const detector = WorkspaceDetector.getInstance();
  const manager = WorkspaceManager.getInstance();
  await manager.loadWorkspaces();

  const registeredPaths = new Set(manager.getWorkspaces().map((workspace) => workspace.path));
  const dismissedPaths = new Set(
    context.globalState.get<string[]>(WORKSPACE_DETECTION_DISMISSED_KEY) ?? []
  );
  const candidates = (await detector.detectWorkspaceRoots()).filter(
    (workspace) => !registeredPaths.has(workspace.path) && !dismissedPaths.has(workspace.path)
  );

  if (candidates.length === 0) {
    return;
  }

  const candidate = candidates[0];
  const addAction = 'Add to Workspai';
  const notNowAction = 'Not now';
  const choice = await vscode.window.showInformationMessage(
    `Workspai workspace detected: ${candidate.name}. Add it to Workspai?`,
    addAction,
    notNowAction
  );

  if (choice === notNowAction) {
    await context.globalState.update(WORKSPACE_DETECTION_DISMISSED_KEY, [
      ...new Set([...dismissedPaths, candidate.path]),
    ]);
    return;
  }

  if (choice !== addAction) {
    return;
  }

  const workspace = await manager.addWorkspace(candidate.path);
  if (!workspace) {
    void vscode.window.showWarningMessage(
      `Workspai could not register ${candidate.name}. Open Setup to inspect the workspace marker.`
    );
    return;
  }

  await workspaceExplorerProvider?.refresh();
  await workspaceExplorerProvider?.selectWorkspace(workspace);
  logger.info(`Registered detected Workspai workspace: ${candidate.path}`);
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
  logger.info('Workspai extension is activating...');

  // Older builds persisted full workspace graphs in VS Code globalState,
  // inflating renderer synchronization on every activation. Graphs are now
  // held in a bounded in-memory cache, so remove the legacy payloads eagerly.
  await clearLegacyWorkspaceGraphState(context);

  // Record first-ever activation timestamp for Time-to-First-Value (roadmap 2.9).
  void ensureInstalledAt(context);

  const { warmRapidkitNpmPackageResolution } = await import('./utils/platformCapabilities.js');
  void warmRapidkitNpmPackageResolution();

  // Store context globally for access from commands
  (globalThis as { extensionContext?: vscode.ExtensionContext }).extensionContext = context;

  // Set extension path for custom icons
  setExtensionPath(context.extensionPath);

  try {
    // Register commands FIRST - these MUST succeed
    logger.info('Activation: registering commands');

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
      ...registerWorkspaceIntelligenceCommands({
        logger,
        getWorkspaceExplorer: () => workspaceExplorer,
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
      ...registerExplorerFolderCommands(),
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
        revealWorkspaceAdvisorForScope({
          workspace: ws,
          source: 'activitybar',
          trigger: 'ai-for-workspace',
        });
      }),
      // Edit / create workspace memory — writes canonical .workspai metadata.
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
        const memUri = vscode.Uri.file(await memSvc.resolveMemoryPath(ws.path));
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
        const ws = contextItem?.workspace || workspaceExplorer?.getSelectedWorkspace();
        revealWorkspaceAdvisorForScope({
          workspace: ws,
          project: {
            name: project.name,
            path: project.path,
            type: project.type,
            workspacePath: project.workspacePath || ws?.path,
          },
          source: 'activitybar',
          trigger: 'ai-for-project',
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
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const initialTask =
          typeof record.initialTask === 'string'
            ? record.initialTask
            : typeof record.initialQuery === 'string'
              ? record.initialQuery
              : typeof record.task === 'string'
                ? record.task
                : undefined;
        const composerHandoff =
          record.composerHandoff === 'prefill' || record.composerHandoff === 'submit'
            ? record.composerHandoff
            : undefined;
        const studioMode =
          record.studioMode === 'verify' || record.studioMode === 'prepare'
            ? record.studioMode
            : record.studioMode === 'investigate'
              ? 'investigate'
              : undefined;
        const isEditorCodeAction = record.source === 'code-action';
        const project =
          contextItem?.project ||
          (isEditorCodeAction ? undefined : projectExplorer?.getSelectedProject());
        const ws =
          contextItem?.workspace ||
          (isEditorCodeAction ? undefined : workspaceExplorer?.getSelectedWorkspace());
        revealStudioForScope({
          workspace: ws,
          project: project
            ? {
                name: project.name,
                path: project.path,
                type: project.type,
                workspacePath: project.workspacePath || ws?.path,
              }
            : null,
          initialTask,
          composerHandoff,
          studioMode,
          editorIssue:
            record.editorIssue && typeof record.editorIssue === 'object'
              ? (record.editorIssue as Record<string, unknown>)
              : undefined,
          source: typeof record.source === 'string' ? record.source : 'activitybar',
          trigger: typeof record.trigger === 'string' ? record.trigger : 'open-studio',
          blockerHandoff:
            record.blockerHandoff && typeof record.blockerHandoff === 'object'
              ? (record.blockerHandoff as Record<string, unknown>)
              : undefined,
        });
      }),
      vscode.commands.registerCommand('workspai.openCreateWithAI', (item?: unknown) => {
        const contextItem = asAIContextItem(item);
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const ws = contextItem?.workspace || workspaceExplorer?.getSelectedWorkspace();
        const project = contextItem?.project || projectExplorer?.getSelectedProject();
        const createMode =
          record.mode === 'project' || record.mode === 'workspace'
            ? (record.mode as 'project' | 'workspace')
            : undefined;

        // Never bootstrap the managed default workspace before opening UI — creation
        // handlers call ensureManagedDefaultWorkspace() when the user confirms.
        void secondaryActionsWebviewProvider?.revealSecondaryTab('create', {
          ...buildSecondaryScopePayload({
            workspace: ws,
            project: project
              ? {
                  name: project.name,
                  path: project.path,
                  type: project.type,
                  workspacePath: project.workspacePath || ws?.path,
                }
              : null,
            source: typeof record.source === 'string' ? record.source : 'activitybar',
            trigger: typeof record.trigger === 'string' ? record.trigger : 'open-create-with-ai',
          }),
          createMode,
          useDefaultWorkspace: record.useDefaultWorkspace === true,
        });
      }),
      vscode.commands.registerCommand('workspai.openWorkspaceAdvisor', (item?: unknown) => {
        const contextItem = asAIContextItem(item);
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const initialQuestion =
          typeof record.initialQuestion === 'string'
            ? record.initialQuestion
            : typeof record.prefillQuestion === 'string'
              ? record.prefillQuestion
              : undefined;
        const isEditorCodeAction = record.source === 'code-action';
        const ws =
          contextItem?.workspace ||
          (isEditorCodeAction ? undefined : workspaceExplorer?.getSelectedWorkspace());
        const project =
          contextItem?.project ||
          (isEditorCodeAction ? undefined : projectExplorer?.getSelectedProject());
        revealWorkspaceAdvisorForScope({
          workspace: ws,
          project: project
            ? {
                name: project.name,
                path: project.path,
                type: project.type,
                workspacePath: project.workspacePath || ws?.path,
              }
            : null,
          initialQuestion,
          editorIssue:
            record.editorIssue && typeof record.editorIssue === 'object'
              ? (record.editorIssue as Record<string, unknown>)
              : undefined,
          source: typeof record.source === 'string' ? record.source : 'activitybar',
          trigger: typeof record.trigger === 'string' ? record.trigger : 'open-workspace-advisor',
        });
      }),
      vscode.commands.registerCommand('workspai.openDashboardSection', (item?: unknown) => {
        const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const section =
          record.section === 'repair' ||
          record.section === 'evidence' ||
          record.section === 'operate' ||
          record.section === 'console' ||
          record.section === 'catalog'
            ? record.section
            : 'overview';
        WelcomePanel.openDashboardSectionTab(context, section);
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
      // AI-powered workspace creation — triggered from the sidebar Workspai panel
      vscode.commands.registerCommand('workspai.openAICreateWorkspace', () => {
        void secondaryActionsWebviewProvider?.revealSecondaryTab('create');
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

    logger.info('Activation: commands registered');

    // Listen for terminal close events to update running servers
    context.subscriptions.push(
      vscode.window.onDidCloseTerminal(async (closedTerminal) => {
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

        if (!shouldRefreshEvidenceOnTerminalClose(closedTerminal)) {
          return;
        }

        const workspacePath =
          resolveWorkspacePathForEvidenceTerminal(closedTerminal) ??
          workspaceExplorer?.getSelectedWorkspace()?.path;
        if (!workspacePath) {
          return;
        }

        logger.info(`Refreshing workspace evidence after terminal close: ${closedTerminal.name}`);
        doctorEvidenceExplorer?.refresh();
        workspaceContractGraphExplorer?.refresh();
        await WelcomePanel.refreshDashboardForWorkspacePath(workspacePath);
        await syncWalkthroughEvidenceContext(workspacePath, {
          context,
          extensionVersion: context.extension.packageJSON.version,
        });
      })
    );

    // Refresh the same evidence surfaces after a streamed (programmatic)
    // workspace intelligence run completes — the cli-log-event.v1 driven path
    // (roadmap 2.2) does not open a terminal, so it triggers refresh directly.
    setWorkspaceEvidenceRefreshHandler(async (workspacePath) => {
      logger.info(
        `Refreshing workspace evidence after streamed intelligence run: ${workspacePath}`
      );
      doctorEvidenceExplorer?.refresh();
      workspaceContractGraphExplorer?.refresh();
      await WelcomePanel.refreshDashboardForWorkspacePath(workspacePath);
      await syncWalkthroughEvidenceContext(workspacePath, {
        context,
        extensionVersion: context.extension.packageJSON.version,
      });
    });
    context.subscriptions.push({ dispose: () => setWorkspaceEvidenceRefreshHandler(undefined) });

    // Initialize configuration manager
    logger.info('Activation: initializing configuration manager');
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
    logger.info('Activation: checking default workspace');
    // NOTE: Do not auto-create default workspace - user should create workspace manually via command
    // await ensureDefaultWorkspace();

    // Initialize status bar
    logger.info('Activation: initializing status bar');
    statusBar = new WorkspaiStatusBar();
    context.subscriptions.push(statusBar);

    // Initialize tree view providers
    logger.info('Activation: initializing tree view providers');
    actionsWebviewProvider = new ActionsWebviewProvider(
      context.extensionUri,
      'activitybar',
      context
    );
    secondaryActionsWebviewProvider = new ActionsWebviewProvider(
      context.extensionUri,
      'secondary-sidebar',
      context
    );
    workspaceExplorer = new WorkspaceExplorerProvider();
    projectExplorer = new ProjectExplorerProvider();
    moduleExplorer = new ModuleExplorerProvider();
    registerModuleExplorerReload(() => moduleExplorer.reloadModuleStates());
    doctorEvidenceExplorer = new DoctorEvidenceProvider(
      () => workspaceExplorer?.getSelectedWorkspace()?.path ?? null,
      () => {
        const project = projectExplorer?.getSelectedProject();
        return typeof project?.path === 'string'
          ? project.path
          : (getSelectedProjectPath() ?? null);
      }
    );
    workspaceContractGraphExplorer = new WorkspaceContractGraphProvider(
      () => workspaceExplorer?.getSelectedWorkspace()?.path ?? null
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('workspai.getSelectedWorkspace', () => {
        return workspaceExplorer?.getSelectedWorkspace() ?? null;
      }),
      vscode.commands.registerCommand('workspai.getSelectedProject', () => {
        return projectExplorer?.getSelectedProject() ?? null;
      }),
      // Refresh dependent surfaces whenever workspace selection changes. This
      // command must be registered before the initial selection publish lane.
      vscode.commands.registerCommand('workspai.workspaceSelected', async (workspace: unknown) => {
        const selectedWorkspace = asWorkspaiWorkspace(workspace);
        refreshStatusBarAmbientTruth(selectedWorkspace);
        projectExplorer?.setWorkspace(selectedWorkspace);
        doctorEvidenceExplorer.refresh();
        workspaceContractGraphExplorer.refresh();
        secondaryActionsWebviewProvider?.refreshScope();
        await WelcomePanel.refreshDashboardForWorkspaceSelection();
        await syncWalkthroughEvidenceContext(selectedWorkspace?.path ?? null, {
          context,
          extensionVersion: context.extension.packageJSON.version,
        });
      })
    );

    // Set workspace explorer reference for WelcomePanel
    WelcomePanel.setWorkspaceExplorer(workspaceExplorer);
    WelcomePanel.setProjectExplorer(projectExplorer);
    WelcomePanel.setExtensionContext(context);

    // Register tree views
    logger.info('Activation: registering tree views');
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ActionsWebviewProvider.viewType,
        actionsWebviewProvider
      ),
      vscode.window.registerWebviewViewProvider(
        ActionsWebviewProvider.secondaryViewType,
        secondaryActionsWebviewProvider
      ),
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
      if (
        item &&
        item instanceof ProjectTreeItem &&
        item.project?.path &&
        (item.contextValue === 'project' || item.contextValue === 'project-running')
      ) {
        setSelectedProjectPath(item.project.path);
        moduleExplorer.setProjectPath(item.project.path, item.project.type);
        secondaryActionsWebviewProvider?.refreshScope();
        void WelcomePanel.syncProjectSelectionFromSidebar(item.project);
      }
    });
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('rapidkitModules', moduleExplorer)
    );
    try {
      context.subscriptions.push(
        vscode.window.registerTreeDataProvider('rapidkitDoctorEvidence', doctorEvidenceExplorer)
      );
    } catch (error) {
      logger.error('Failed to register Workspace Health tree provider', error);
    }
    try {
      context.subscriptions.push(
        vscode.window.registerTreeDataProvider(
          'rapidkitWorkspaceContractGraph',
          workspaceContractGraphExplorer
        )
      );
    } catch (error) {
      logger.error('Failed to register Contract Graph tree provider', error);
    }
    context.subscriptions.push(
      // Refresh evidence panel whenever workspace tree changes (fires right after selectedWorkspace is updated)
      workspaceExplorer.onDidChangeTreeData(() => {
        doctorEvidenceExplorer.refresh();
        workspaceContractGraphExplorer.refresh();
      }),
      projectExplorer.onDidChangeTreeData(() => {
        doctorEvidenceExplorer.refresh();
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
        await runGatedRapidkitCommandsInTerminal({
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
        await runGatedRapidkitCommandsInTerminal({
          name: `Workspai Doctor Fix - ${ws.name ?? ws.path}`,
          cwd: ws.path,
          commands: [['doctor', 'workspace', '--fix']],
        });
        // File watcher on doctor-last-run.json triggers refresh automatically
      }),
      vscode.commands.registerCommand(
        'workspai.doctorEvidence.sendIssueToAdvisor',
        async (item?: unknown) => {
          const handoff = resolveDoctorIssueHandoff(item);
          if (!handoff) {
            return;
          }
          revealWorkspaceAdvisorForScope({
            workspace: {
              name: handoff.workspaceName,
              path: handoff.workspacePath,
            },
            project: handoff.project
              ? {
                  name: handoff.project.name,
                  path: handoff.project.path,
                  type: handoff.project.framework,
                  workspacePath: handoff.workspacePath,
                }
              : null,
            initialQuestion: buildDoctorIssueAdvisorQuestion(handoff),
            source: 'workspace-health',
            trigger: 'doctor-issue-advisor',
          });
        }
      ),
      vscode.commands.registerCommand(
        'workspai.doctorEvidence.sendIssueToStudio',
        async (item?: unknown) => {
          const handoff = resolveDoctorIssueHandoff(item);
          if (!handoff) {
            return;
          }
          revealStudioForScope({
            workspace: {
              name: handoff.workspaceName,
              path: handoff.workspacePath,
            },
            project: handoff.project
              ? {
                  name: handoff.project.name,
                  path: handoff.project.path,
                  type: handoff.project.framework,
                  workspacePath: handoff.workspacePath,
                }
              : null,
            initialTask: buildDoctorIssueStudioPrompt(handoff),
            composerHandoff: 'prefill',
            studioMode: 'investigate',
            source: 'workspace-health',
            trigger: 'doctor-issue-studio',
          });
        }
      ),
      vscode.commands.registerCommand(
        'workspai.doctorEvidence.sendIssueToCopilot',
        async (item?: unknown) => {
          const handoff = resolveDoctorIssueHandoff(item);
          if (!handoff) {
            return;
          }
          await sendEvidenceToCopilot({
            workspacePath: handoff.workspacePath,
            workspaceName: handoff.workspaceName,
            projectPath: handoff.project?.path,
            projectName: handoff.project?.name,
            userQuestion: buildDoctorIssueCopilotQuestion(handoff),
          });
        }
      ),
      vscode.commands.registerCommand(
        'workspai.doctorEvidence.fixIssueWithAI',
        async (item?: unknown) => {
          await vscode.commands.executeCommand('workspai.doctorEvidence.sendIssueToAdvisor', item);
        }
      )
    );

    // Publish the initial workspace after the command and views are registered.
    // This keeps activation responsive even if workspace registry discovery is slow.
    void runOptionalActivationLane(logger, 'initial-workspace-selection', async () => {
      await workspaceExplorer.whenReady();
      await workspaceExplorer.publishSelectedWorkspaceContext();

      const cwd =
        workspaceExplorer?.getSelectedWorkspace()?.path ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      await presentCliVersionGate({ cwd });

      await syncWalkthroughEvidenceContext(cwd ?? null, {
        context,
        extensionVersion: context.extension.packageJSON.version,
      });
    });

    void runOptionalActivationLane(logger, 'detected-workspace-registration', async () => {
      await workspaceExplorer.whenReady();
      await promptToRegisterDetectedWorkspaceRoots(context, workspaceExplorer, logger);
    });

    // Register IntelliSense providers
    logger.info('Activation: registering IntelliSense providers');
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

    logger.info('Activation: IntelliSense providers registered');

    logger.info('Activation: Workspai command surface ready');
    statusBar.updateStatus('ready');

    // Check for Workspai CLI updates (non-blocking, runs in background).
    await runOptionalActivationLane(logger, 'update-check', async () => {
      checkAndNotifyUpdates(context).catch((err) => {
        logger.error('Update check failed', err);
      });
    });

    // Initialize workspace selection ASYNCHRONOUSLY (non-blocking)
    // This allows commands to be available immediately even if initialization fails
    (async () => {
      try {
        logger.info('Activation: initializing workspace selection');
        await workspaceExplorer.refresh();

        // Sync evidence panel with whatever workspace was auto-selected on load
        const initialWs = workspaceExplorer.getSelectedWorkspace();
        refreshStatusBarAmbientTruth(initialWs);
        doctorEvidenceExplorer.setWorkspacePath(initialWs?.path ?? null);
        workspaceContractGraphExplorer.setWorkspacePath(initialWs?.path ?? null);

        // Show welcome page on first activation
        logger.info('Activation: checking welcome page settings');
        const config = vscode.workspace.getConfiguration('workspai');

        // Always show welcome page on first activation or if configured
        // Setup wizard is now integrated into welcome page
        if (config.get('showWelcomeOnStartup', true)) {
          await showWelcomeCommand(context);
        }

        logger.info('Activation: initializing workspace usage tracker');
        const usageTracker = WorkspaceUsageTracker.getInstance();
        await usageTracker.initialize();

        logger.info('Activation: Workspai extension initialized');

        // Non-blocking: onboarding toast should not delay activation completion.
        void showAIFeatureOnboarding(context);

        registerProjectRefreshWatchers(context, config, () => {
          projectExplorer.refresh();
          void moduleExplorer.reloadModuleStates();
          doctorEvidenceExplorer.refresh();
          workspaceContractGraphExplorer.refresh();
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

export function deactivate() {
  Logger.getInstance().info('👋 Workspai extension is deactivating...');
  if (statusBar) {
    statusBar.dispose();
  }
  if (workspaceExplorer) {
    workspaceExplorer.dispose();
  }
}
