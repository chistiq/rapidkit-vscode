/**
 * Welcome Panel - React Version
 * Uses React for webview UI with postMessage communication
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { buildWelcomePanelHtmlContent } from './welcomePanelHtmlContent';
import { detectProjectTypeFromPath } from './welcomePanelProjectTypeDetection';
import { resolveProjectCapabilitiesPayload } from '../../core/projectCapabilityBridge';
import {
  clearProjectCapabilityContext,
  syncProjectCapabilityContext,
} from '../../core/projectCapabilityContext';
import type { ScaffoldFramework } from '../../core/scaffoldKits';
import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import { type ProjectSystemGraphWatcherHandle } from '../../core/systemGraphIndexer';
import { MODULES, ModuleData } from '../../data/modules';
import { runningServers } from '../../core/runningServers';
import type { WorkspaceExplorerProvider } from '../treeviews/workspaceExplorer';
import type { ProjectExplorerProvider } from '../treeviews/projectExplorer';
import {
  createDoctorTelemetryRefreshController,
  type DashboardEvidenceRefreshContext,
} from './doctorTelemetryRefresh';
import { type WebviewFromExtensionMessage } from '../../contracts/webviewProtocol';
import type { DashboardEvidenceCardId } from '../../contracts/dashboardEvidenceCards.js';
import { SetupPanel } from './setupExperiencePanel.js';
import { readAIActionRegistry } from '../../core/aiActionRegistry';
import { AIActionContract, AIActionOperation } from '../../core/aiActionContract';
import { ProjectSelectionSequence } from './projectSelectionSequence';
import { type IncidentResumeSnapshot } from './incidentStudioResume';
import {
  exportReleaseReadinessCommanderFromPayload,
  exportSandboxSimulationEvidenceFromPayload,
} from './incidentStudioEnterpriseExportBridge';
import { type DoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import { readInstalledModulesFromProject } from './welcomePanelInstalledModules';
import {
  buildWorkspaceProjectCandidatesForPanel,
  resolveScopedProjectForPanel,
} from './welcomePanelProjectDiscoveryBindings';
import { inferFrameworkFromWorkspace } from './welcomePanelFrameworkInference';
import {
  resolveWelcomePanelTelemetryWorkspacePath,
  resolveDashboardSessionWorkspacePath as resolveDashboardSessionWorkspacePathForPanel,
  trackWelcomePanelStudioEvent,
} from './welcomePanelStudioTelemetry';
import { saveDashboardIncidentStudioSession } from './welcomePanelIncidentSessionPersistence';
import { handleAiChatQuery, type ChatBrainQueryHost } from './welcomePanelChatBrainQuery';
import {
  handleAiChatExecuteAction,
  type ChatBrainExecuteActionHost,
} from './welcomePanelChatBrainExecuteAction';
import { buildWorkspaceGraphSnapshot } from './welcomePanelWorkspaceGraphSnapshot';
import type { AiModalMessageHost } from './welcomePanelAiModalMessages';
import type { ReadyMessageHost } from './welcomePanelReadyMessages';
import type { CreationNavigationMessageHost } from './welcomePanelCreationNavigationMessages';
import type { RecentWorkspacesHost } from './welcomePanelRecentWorkspaces';
import {
  executeDashboardContractCommand,
  type DashboardCommandHost,
} from './welcomePanelDashboardCommands';
import { sendDashboardEvidence, type DashboardEvidenceHost } from './welcomePanelDashboardEvidence';
import {
  beginGovernanceChainForWorkspace,
  type DashboardOpsChainHost,
} from './welcomePanelDashboardOpsChain';
import type { DashboardLifecycleMessageHost } from './welcomePanelDashboardLifecycleMessages';
import { refreshModulesCatalog, type ModulesCatalogHost } from './welcomePanelModulesCatalog';
import type { DashboardShortcutMessageHost } from './welcomePanelDashboardShortcutMessages';
import type { AnalyzeReportMessageHost } from './welcomePanelAnalyzeReportMessages';
import type { WorkspaiSettingsMessageHost } from './welcomePanelWorkspaiSettingsMessages';
import type { AiCreationDispatchHost } from './welcomePanelAiCreationMessages';
import {
  sendWelcomePanelInitialData,
  type BootstrapPayloadHost,
} from './welcomePanelBootstrapPayload';
import type { WorkspaceSelectionMessageHost } from './welcomePanelWorkspaceSelectionMessages';
import { type ChatBrainLifecycleHost } from './welcomePanelChatBrainLifecycle';
import {
  tryDispatchIncidentStudioWebviewMessage,
  type IncidentStudioWebviewMessageHost,
} from './welcomePanelIncidentStudioMessages';
import {
  dispatchWelcomePanelWebviewMessage,
  runWelcomePanelOptionalMessageLane,
  type WelcomePanelWebviewMessageDispatchHost,
} from './welcomePanelWebviewMessageDispatch';
import {
  getWelcomePanelRecentWorkspaces,
  postWelcomePanelUiPreferences,
  readWelcomePanelUiPreferences,
  refreshWelcomePanelModulesCatalog,
  sendWelcomePanelAvailableKits,
  sendWelcomePanelExampleWorkspaces,
  sendWelcomePanelIncidentStudioTelemetry,
  sendWelcomePanelModulesCatalog,
  sendWelcomePanelRecentWorkspaces,
  sendWelcomePanelWorkspaiSettings,
  sendWelcomePanelWorkspaceStatus,
  sendWelcomePanelWorkspaceToolStatus,
} from './welcomePanelBootstrapSenders';
import {
  dispatchDashboardAIActionContractCommand,
  dispatchDashboardStudioAction,
  dispatchDashboardStudioMessage,
  postDashboardStudioAIActionRegistry,
  syncDashboardStudioLatestAIAction,
} from './welcomePanelDashboardStudioDispatch';
import type { DashboardStudioHost } from './welcomePanelDashboardStudio';
import { buildDashboardStudioHost } from './welcomePanelDashboardStudioHost';
import {
  buildWelcomePanelAnalyzeReportMessageHost,
  buildWelcomePanelDashboardCommandHost,
  buildWelcomePanelDashboardEvidenceHost,
  buildWelcomePanelDashboardLifecycleMessageHost,
  buildWelcomePanelDashboardOpsChainHost,
  buildWelcomePanelDashboardShortcutMessageHost,
  buildWelcomePanelModulesCatalogHost,
  getSelectedWorkspaceInfoFromExplorer,
  type WelcomePanelDashboardHostFactoryBindings,
} from './welcomePanelDashboardHostFactories';
import { registerWelcomePanelDoctorEvidenceWatcher } from './welcomePanelDoctorEvidenceWatcher';
import {
  postWelcomePanelAIStreamDoneOnce,
  postWelcomePanelChatBrainWebviewMessage,
  postWelcomePanelWebviewMessage,
  trackWelcomePanelAiQueryRequestStart,
} from './welcomePanelWebviewMessaging';
import {
  buildWelcomePanelAiCreationDispatchHost,
  buildWelcomePanelAiModalMessageHost,
  buildWelcomePanelAiModalQueryHost,
  buildWelcomePanelBootstrapPayloadHost,
  buildWelcomePanelCreationNavigationMessageHost,
  buildWelcomePanelExampleWorkspacesHost,
  buildWelcomePanelReadyMessageHost,
  buildWelcomePanelRecentWorkspacesHost,
  buildWelcomePanelWorkspaiSettingsMessageHost,
  buildWelcomePanelWorkspaceSelectionMessageHost,
  type WelcomePanelAiModalHostFactoryBindings,
  type WelcomePanelMessageHostFactoryBindings,
} from './welcomePanelMessageHostFactories';
import {
  buildWelcomePanelChatBrainApplyPatchHost,
  buildWelcomePanelChatBrainContextHost,
  buildWelcomePanelChatBrainExecuteActionHost,
  buildWelcomePanelChatBrainLifecycleHost,
  buildWelcomePanelChatBrainQueryHost,
  buildWelcomePanelDoctorMessageHost,
  buildWelcomePanelIncidentMemoryBridgeHost,
  buildWelcomePanelIncidentReproPackHost,
  buildWelcomePanelIncidentStudioMessageHost,
  buildWelcomePanelStructuredIncidentPromptHost,
  buildWelcomePanelWorkspaceGraphSnapshotHost,
  type WelcomePanelChatBrainHostFactoryBindings,
} from './welcomePanelChatBrainHostFactories';
import { type IncidentWorkspaceGraphSnapshot } from './welcomePanel.shared.js';

type MessagePayload = Record<string, unknown>;
export class WelcomePanel {
  public static currentPanel: WelcomePanel | undefined;
  private static _dashboardPanel: WelcomePanel | undefined;
  private static _pendingDashboardFullRefreshPath: string | undefined;
  private static _pendingDashboardEvidencePatch:
    | {
        workspacePath: string;
        cardIds: readonly DashboardEvidenceCardId[];
        projectPath?: string;
        projectName?: string;
      }
    | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _aiQueryTokenSource?: vscode.CancellationTokenSource;
  private _activeAIQueryRequestId?: number;
  private static _selectedProject: {
    name: string;
    path: string;
    type?: string;
    workspacePath?: string;
    workspaceName?: string;
  } | null = null;
  private static _projectSelectionSequence = new ProjectSelectionSequence();
  private _modulesCatalog: ModuleData[] = MODULES;
  private _runningStudioActionId: string | null = null;
  private _runningDashboardAIActionOperation: AIActionOperation | null = null;
  private _latestDashboardAIActionContract: AIActionContract | null = null;
  private _latestDashboardAIActionId: string | null = null;
  private static _workspaceExplorer: WorkspaceExplorerProvider | undefined;
  private static _projectExplorer: ProjectExplorerProvider | undefined;
  /** Framework name queued to open as a modal after the webview becomes ready */
  private static _pendingModal: string | null = null;
  private static _pendingAICreateMode: 'workspace' | 'project' = 'workspace';
  /** Module data queued to show as install modal after webview becomes ready */
  private static _pendingModuleModal: ModuleData | null = null;
  /** Whether the webview has fired its first 'ready' event for the current panel instance */
  private _isReady = false;
  /** Workspace share bundle dashboard payload queued until webview is ready */
  private static _pendingWorkspaceShareDashboardOpen: {
    summary: {
      sourceFile: string;
      workspaceName: string;
      workspaceProfile?: string;
      generatedAt?: string;
      schemaVersion: string;
      projectCount: number;
      runtimes: string[];
      doctorEvidenceIncluded: boolean;
      healthTotals: {
        passed: number;
        warnings: number;
        errors: number;
      };
    };
  } | null = null;
  /** Setup tab switch queued until dashboard webview is ready */
  private static _pendingSetupTabOpen = false;
  /** Dashboard section switch queued until dashboard webview is ready */
  private static _pendingDashboardSectionOpen:
    | 'overview'
    | 'repair'
    | 'evidence'
    | 'operate'
    | 'console'
    | 'catalog'
    | null = null;
  /** Cached extension context so static methods can open the panel */
  private static _extensionContext: vscode.ExtensionContext | undefined;

  /**
   * Open the welcome panel and immediately trigger the Create Project modal
   * for the given framework. Safe to call whether the panel is open or not.
   */
  public static openProjectModal(
    context: vscode.ExtensionContext,
    framework: ScaffoldFramework
  ): void {
    // Dashboard-scoped modal: always target dashboard panel if available.
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._postWebviewMessage('openProjectModal', { framework });
      return;
    }
    WelcomePanel._pendingModal = framework;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and immediately trigger the Create Workspace modal.
   * Safe to call whether the panel is open or not.
   */
  /**
   * Open the welcome panel and immediately show the module install modal.
   * Safe to call whether the panel is open or not.
   */
  public static showModuleInstallModal(moduleData: ModuleData): void {
    const context = WelcomePanel._extensionContext;
    if (!context) {
      return;
    }
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._postWebviewMessage('openModuleInstallModal', moduleData);
      return;
    }
    WelcomePanel._pendingModuleModal = moduleData;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and immediately show the AI assistant modal for a given context.
   */
  public static showAIModal(
    context: vscode.ExtensionContext,
    aiContext: import('../../core/aiService').AIModalContext
  ): void {
    WelcomePanel._extensionContext = context;
    void vscode.commands.executeCommand('workspai.openWorkspaceAdvisor', {
      workspace: {
        name: aiContext.type === 'workspace' ? aiContext.name : undefined,
        path:
          aiContext.workspaceRootPath ||
          (aiContext.type === 'workspace' ? aiContext.path : undefined),
      },
      project:
        aiContext.type === 'project' || aiContext.projectRootPath
          ? {
              name: aiContext.type === 'project' ? aiContext.name : undefined,
              path:
                aiContext.projectRootPath ||
                (aiContext.type === 'project' ? aiContext.path : undefined),
              type: aiContext.framework,
              workspacePath: aiContext.workspaceRootPath,
            }
          : undefined,
      source: 'legacy-ai-modal-bridge',
      trigger: 'show-ai-modal',
      prefillQuestion: aiContext.prefillQuestion,
      prefillMode: aiContext.prefillMode,
    });
  }

  public static openWorkspaceModal(context: vscode.ExtensionContext): void {
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._postWebviewMessage('openWorkspaceModal');
      return;
    }
    WelcomePanel._pendingModal = '__workspace__';
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and immediately show the AI Create modal (workspace mode).
   * Called from the sidebar Workspai "Create with AI" button.
   */
  public static openAICreateModal(
    context: vscode.ExtensionContext,
    mode: 'workspace' | 'project' = 'workspace'
  ): void {
    WelcomePanel._pendingAICreateMode = mode;
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      const selectedWs =
        mode === 'project' ? WelcomePanel._workspaceExplorer?.getSelectedWorkspace() : undefined;
      WelcomePanel._dashboardPanel._postWebviewMessage('openAICreateModal', {
        mode,
        targetWorkspaceName: selectedWs?.name,
        targetWorkspacePath: selectedWs?.path,
      });
      return;
    }
    WelcomePanel._pendingModal = '__ai_create__';
    WelcomePanel.createOrShow(context);
  }

  /**
   * @deprecated Dashboard no longer hosts Incident Studio. Routes to the Workspai secondary sidebar.
   */
  public static openIncidentStudio(
    _context: vscode.ExtensionContext,
    data: {
      workspacePath: string;
      workspaceName?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      initialQuery?: string;
      composerHandoff?: 'prefill' | 'submit';
      studioMode?: 'investigate' | 'verify' | 'prepare';
      source?: string;
      trigger?: string;
    }
  ): void {
    void WelcomePanel._routeStudioToSecondarySidebar(data);
  }

  private static _routeStudioToSecondarySidebar(data: {
    workspacePath: string;
    workspaceName?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    initialQuery?: string;
    composerHandoff?: 'prefill' | 'submit';
    studioMode?: 'investigate' | 'verify' | 'prepare';
    source?: string;
    trigger?: string;
  }): Thenable<unknown> {
    return vscode.commands.executeCommand('workspai.openIncidentStudio', {
      workspace: {
        path: data.workspacePath,
        name: data.workspaceName,
      },
      project: data.projectPath
        ? {
            path: data.projectPath,
            name: data.projectName,
            type: data.projectType,
            workspacePath: data.workspacePath,
          }
        : undefined,
      initialTask: data.initialQuery,
      initialQuery: data.initialQuery,
      composerHandoff: data.composerHandoff,
      studioMode: data.studioMode,
      source: data.source ?? 'dashboard',
      trigger: data.trigger ?? 'open-studio',
    });
  }

  /**
   * Focus dashboard tab if already open; otherwise open a new dashboard tab.
   */
  public static getReadyDashboardPanel(): WelcomePanel | undefined {
    return WelcomePanel._dashboardPanel?._isReady ? WelcomePanel._dashboardPanel : undefined;
  }

  /** Bootstrap dashboard host for shared chat brain without stealing focus when possible. */
  public static ensureDashboardPanel(context: vscode.ExtensionContext): void {
    WelcomePanel._extensionContext = context;
    if (WelcomePanel._dashboardPanel) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      return;
    }
    WelcomePanel.createOrShow(context, { reveal: false });
  }

  public static openDashboardTab(context: vscode.ExtensionContext): void {
    if (WelcomePanel._dashboardPanel) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._postWebviewMessage('setActiveView', { view: 'dashboard' });
      return;
    }

    WelcomePanel.createOrShow(context, {
      title: 'Workspai Dashboard',
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  public static openDashboardSectionTab(
    context: vscode.ExtensionContext,
    section: 'overview' | 'repair' | 'evidence' | 'operate' | 'console' | 'catalog'
  ): void {
    WelcomePanel._extensionContext = context;
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._postWebviewMessage('setActiveView', {
        view: 'dashboard',
        dashboardSection: section,
      });
      return;
    }

    WelcomePanel._pendingDashboardSectionOpen = section;
    if (WelcomePanel._dashboardPanel) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      return;
    }

    WelcomePanel.createOrShow(context, {
      title: 'Workspai Dashboard',
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  /**
   * Focus dashboard tab and switch to embedded Setup Center.
   */
  public static openSetupTab(context: vscode.ExtensionContext): void {
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._postWebviewMessage('setActiveView', { view: 'setup' });
      SetupPanel.bootstrapEmbedded(context, WelcomePanel._dashboardPanel._panel.webview);
      return;
    }

    if (WelcomePanel._dashboardPanel) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._pendingSetupTabOpen = true;
      return;
    }

    WelcomePanel.createOrShow(context, {
      title: 'Workspai Dashboard',
      viewColumn: vscode.ViewColumn.Active,
    });
    WelcomePanel._pendingSetupTabOpen = true;
  }

  /**
   * Open the welcome panel and show imported workspace share bundle summary on the dashboard.
   */
  public static openWorkspaceShareDashboard(
    context: vscode.ExtensionContext,
    data: {
      summary: {
        sourceFile: string;
        workspaceName: string;
        workspaceProfile?: string;
        generatedAt?: string;
        schemaVersion: string;
        projectCount: number;
        runtimes: string[];
        doctorEvidenceIncluded: boolean;
        healthTotals: {
          passed: number;
          warnings: number;
          errors: number;
        };
      };
    }
  ): void {
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._postWebviewMessage('openWorkspaceShareDashboard', data);
      return;
    }
    WelcomePanel._pendingWorkspaceShareDashboardOpen = data;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Set workspace explorer reference (called from extension.ts)
   */
  public static setWorkspaceExplorer(explorer: WorkspaceExplorerProvider) {
    WelcomePanel._workspaceExplorer = explorer;
  }

  public static setProjectExplorer(explorer: ProjectExplorerProvider) {
    WelcomePanel._projectExplorer = explorer;
  }

  /**
   * Lightweight analysis-selection sync from dashboard/studio — updates sidebar state
   * without stealing focus or triggering heavy catalog/evidence refresh.
   */
  public static async syncAnalysisSelectionFromWebview(data: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeMode?: 'workspace' | 'project';
  }): Promise<void> {
    if (data.scopeMode !== 'project' || !data.projectPath) {
      return;
    }

    const projectPath = data.projectPath.trim();
    const projectName =
      typeof data.projectName === 'string' && data.projectName.trim().length > 0
        ? data.projectName.trim()
        : path.basename(projectPath);
    const projectType =
      data.projectType === 'fastapi' ||
      data.projectType === 'nestjs' ||
      data.projectType === 'go' ||
      data.projectType === 'springboot' ||
      data.projectType === 'dotnet'
        ? data.projectType
        : undefined;

    const resolvedWorkspacePath =
      typeof data.workspacePath === 'string' && data.workspacePath.trim().length > 0
        ? data.workspacePath.trim()
        : WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path;

    const existingProject = WelcomePanel._projectExplorer?.getSelectedProject();
    const project: import('../../types').WorkspaiProject =
      existingProject?.path === projectPath
        ? existingProject
        : {
            name: projectName,
            path: projectPath,
            type: projectType ?? 'unknown',
            kit: 'unknown',
            modules: [],
            isValid: true,
            workspacePath: resolvedWorkspacePath,
          };

    WelcomePanel._selectedProject = project;
    WelcomePanel._projectExplorer?.setSelectedProject(project);
    const { setSelectedProjectPath } = await import('../../core/selectedProject.js');
    setSelectedProjectPath(project.path);
    await syncProjectCapabilityContext({
      projectPath: project.path,
      projectType: project.type,
    });

    const panel = WelcomePanel.currentPanel;
    if (!panel?._isReady) {
      return;
    }

    panel._postWebviewMessage('updateWorkspaceStatus', {
      hasWorkspace: Boolean(resolvedWorkspacePath),
      hasProjectSelected: true,
      workspacePath: resolvedWorkspacePath,
      workspaceName:
        resolvedWorkspacePath && WelcomePanel._workspaceExplorer
          ? WelcomePanel._workspaceExplorer.getWorkspaceByPath(resolvedWorkspacePath)?.name
          : undefined,
      projectName,
      projectPath,
      projectType,
      source: 'analysis-sync',
    });
    panel._postWebviewMessage('setActiveView', {
      view: 'dashboard',
      dashboardSection: 'console',
    });
  }

  /**
   * Sync dashboard/studio project selection when the user picks a project in the sidebar tree.
   */
  public static async syncProjectSelectionFromSidebar(
    project: import('../../types').WorkspaiProject
  ): Promise<void> {
    const projectPath = project.path?.trim();
    if (!projectPath) {
      return;
    }

    const resolvedWorkspacePath =
      project.workspacePath?.trim() ||
      WelcomePanel._projectExplorer?.getSelectedWorkspace()?.path ||
      WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path;

    const existingProject = WelcomePanel._projectExplorer?.getSelectedProject();
    const normalized: import('../../types').WorkspaiProject =
      existingProject?.path === projectPath
        ? existingProject
        : {
            ...project,
            workspacePath: resolvedWorkspacePath,
          };

    WelcomePanel._selectedProject = normalized;
    WelcomePanel._projectExplorer?.setSelectedProject(normalized);
    const { setSelectedProjectPath } = await import('../../core/selectedProject.js');
    setSelectedProjectPath(normalized.path);
    await syncProjectCapabilityContext({
      projectPath: normalized.path,
      projectType: normalized.type,
    });

    const panel = WelcomePanel.currentPanel;
    if (!panel?._isReady) {
      return;
    }

    panel._postWebviewMessage('updateWorkspaceStatus', {
      hasWorkspace: Boolean(resolvedWorkspacePath),
      hasProjectSelected: true,
      workspacePath: resolvedWorkspacePath,
      workspaceName:
        resolvedWorkspacePath && WelcomePanel._workspaceExplorer
          ? WelcomePanel._workspaceExplorer.getWorkspaceByPath(resolvedWorkspacePath)?.name
          : undefined,
      projectName: normalized.name,
      projectPath: normalized.path,
      projectType: normalized.type,
      source: 'sidebar-sync',
    });
    panel._postWebviewMessage('setActiveView', {
      view: 'dashboard',
      dashboardSection: 'console',
    });
  }

  public static async listWorkspaceProjectsForWebview(
    workspacePath: string
  ): Promise<Array<{ path: string; name: string; type?: string }>> {
    const normalizedPath = workspacePath.trim();
    if (!normalizedPath) {
      return [];
    }

    const explorer = WelcomePanel._projectExplorer;
    const selectedWorkspace = explorer?.getSelectedWorkspace();
    if (selectedWorkspace?.path === normalizedPath && explorer) {
      const projects = await explorer.ensureProjectsLoaded();
      return projects.map((project) => ({
        path: project.path,
        name: project.name,
        type: project.type,
      }));
    }

    return [];
  }

  public static setExtensionContext(context: vscode.ExtensionContext) {
    WelcomePanel._extensionContext = context;
  }

  /**
   * Called from extension.ts when user selects a project in the sidebar tree view
   */
  public static async updateWithProject(
    projectPath: string,
    projectName: string,
    options?: {
      workspacePath?: string;
      workspaceName?: string;
    }
  ) {
    console.log('[WelcomePanel] updateWithProject called:', projectName, projectPath);

    const selectionVersion = WelcomePanel._projectSelectionSequence.begin();

    const projectType = await detectProjectTypeFromPath(projectPath);
    if (!WelcomePanel._projectSelectionSequence.isCurrent(selectionVersion)) {
      return;
    }

    const selectedWorkspace = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
    const explicitWorkspacePath =
      typeof options?.workspacePath === 'string' && options.workspacePath.trim().length > 0
        ? options.workspacePath.trim()
        : undefined;
    const explicitWorkspaceName =
      typeof options?.workspaceName === 'string' && options.workspaceName.trim().length > 0
        ? options.workspaceName.trim()
        : undefined;

    let resolvedWorkspacePath: string | undefined;
    let resolvedWorkspaceName: string | undefined;

    if (explicitWorkspacePath && isWorkspacePathAncestor(explicitWorkspacePath, projectPath)) {
      resolvedWorkspacePath = explicitWorkspacePath;
      resolvedWorkspaceName = explicitWorkspaceName;
    }

    if (
      !resolvedWorkspacePath &&
      selectedWorkspace?.path &&
      isWorkspacePathAncestor(selectedWorkspace.path, projectPath)
    ) {
      resolvedWorkspacePath = selectedWorkspace.path;
      resolvedWorkspaceName = selectedWorkspace.name;
    }

    if (!resolvedWorkspacePath) {
      const parent = path.dirname(projectPath);
      if (parent && parent !== projectPath) {
        resolvedWorkspacePath = parent;
        resolvedWorkspaceName = path.basename(parent);
      }
    }

    if (!resolvedWorkspaceName && resolvedWorkspacePath) {
      resolvedWorkspaceName =
        (selectedWorkspace?.path === resolvedWorkspacePath ? selectedWorkspace.name : undefined) ||
        explicitWorkspaceName ||
        path.basename(resolvedWorkspacePath);
    }

    WelcomePanel._selectedProject = {
      name: projectName,
      path: projectPath,
      type: projectType ?? undefined,
      workspacePath: resolvedWorkspacePath,
      workspaceName: resolvedWorkspaceName,
    };

    const { setSelectedProjectPath } = await import('../../core/selectedProject.js');
    setSelectedProjectPath(projectPath);
    if (WelcomePanel._projectExplorer) {
      WelcomePanel._projectExplorer.setSelectedProject({
        name: projectName,
        path: projectPath,
        type: (projectType ?? 'unknown') as import('../../types').WorkspaiProjectType,
        kit: 'unknown',
        modules: [],
        isValid: true,
        workspacePath: resolvedWorkspacePath,
      });
    }

    if (WelcomePanel.currentPanel) {
      const currentPanel = WelcomePanel.currentPanel;
      const [installedModules, projectCapabilities] = await Promise.all([
        readInstalledModulesFromProject(projectPath),
        resolveProjectCapabilitiesPayload(projectPath),
      ]);
      if (
        !WelcomePanel._projectSelectionSequence.isCurrent(selectionVersion) ||
        WelcomePanel.currentPanel !== currentPanel
      ) {
        return;
      }
      console.log('[WelcomePanel] Found', installedModules.length, 'installed modules');

      // Check if server is running and extract port
      let isRunning = false;
      let runningPort: number | undefined;
      const runningTerminal = runningServers.get(projectPath);
      if (runningTerminal) {
        isRunning = true;
        // Extract port from terminal name like "🚀 project [:8001]"
        const match = runningTerminal.name.match(/:([0-9]+)/);
        if (match) {
          runningPort = parseInt(match[1], 10);
          console.log('[WelcomePanel] Server running on port:', runningPort);
        }
      }

      // Detect project type for UI adaptation (e.g., hide modules for Go)
      currentPanel._postWebviewMessage('updateWorkspaceStatus', {
        hasWorkspace: true,
        hasProjectSelected: true,
        workspaceName: resolvedWorkspaceName,
        workspacePath: resolvedWorkspacePath,
        projectName,
        projectPath,
        projectType: projectType ?? undefined,
        installedModules,
        projectCapabilities,
        isRunning,
        runningPort,
      });
      await syncProjectCapabilityContext({
        projectPath,
        projectType: projectType ?? undefined,
      });
      console.log('[WelcomePanel] ✅ Workspace status sent to webview');

      // Refresh modules catalog to get correct versions for the new project
      if (
        !WelcomePanel._projectSelectionSequence.isCurrent(selectionVersion) ||
        WelcomePanel.currentPanel !== currentPanel
      ) {
        return;
      }

      await currentPanel._refreshModulesCatalog();
      console.log('[WelcomePanel] ✅ Modules catalog refreshed for project switch');
      void currentPanel._sendDashboardEvidence();
    } else {
      console.log('[WelcomePanel] ❌ No currentPanel - stored for later');
    }
  }

  /**
   * Clear selected project
   */
  public static clearSelectedProject() {
    console.log('[WelcomePanel] clearSelectedProject called');
    WelcomePanel._projectSelectionSequence.begin();
    WelcomePanel._selectedProject = null;
    void clearProjectCapabilityContext();

    if (WelcomePanel.currentPanel) {
      const selectedWorkspace = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
      WelcomePanel.currentPanel._postWebviewMessage('updateWorkspaceStatus', {
        hasWorkspace: Boolean(selectedWorkspace),
        hasProjectSelected: false,
        workspaceName: selectedWorkspace?.name,
        workspacePath: selectedWorkspace?.path,
        installedModules: [],
      });
      void WelcomePanel.currentPanel._sendDashboardEvidence();
    }
  }

  /**
   * Refresh recent workspaces list in React panel
   */
  public static refreshRecentWorkspaces() {
    if (WelcomePanel.currentPanel) {
      WelcomePanel.currentPanel._sendRecentWorkspaces();
    }
  }

  /**
   * After a workspace is onboarded (import, create, add, clone, AI-create), kick off the
   * governance ops chain on the dashboard and refresh recent workspace evidence.
   */
  public static async notifyWorkspaceGovernanceChain(
    workspacePath: string,
    workspaceName: string | undefined,
    triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add',
    context?: vscode.ExtensionContext
  ): Promise<void> {
    WelcomePanel.refreshRecentWorkspaces();
    if (!WelcomePanel._dashboardPanel && context) {
      WelcomePanel.openDashboardTab(context);
    }
    const dashboardPanel = WelcomePanel._dashboardPanel;
    if (!dashboardPanel) {
      return;
    }
    await dashboardPanel._beginGovernanceChainForWorkspace(
      workspacePath,
      workspaceName,
      triggeredBy
    );
  }

  /**
   * After a project is created, imported, or adopted, refresh dashboard evidence and
   * run the workspace governance chain scoped to the new project.
   */
  public static async notifyProjectOnboarded(
    input: {
      workspacePath: string;
      workspaceName?: string;
      projectPath: string;
      projectName?: string;
      triggeredBy: 'import' | 'add';
    },
    context?: vscode.ExtensionContext
  ): Promise<void> {
    WelcomePanel.refreshRecentWorkspaces();
    if (!WelcomePanel._dashboardPanel && context) {
      WelcomePanel.openDashboardTab(context);
    }

    await WelcomePanel.updateWithProject(
      input.projectPath,
      input.projectName ?? path.basename(input.projectPath),
      {
        workspacePath: input.workspacePath,
      }
    );

    const dashboardPanel = WelcomePanel._dashboardPanel;
    if (dashboardPanel) {
      await dashboardPanel._sendDashboardEvidence({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        projectName: input.projectName,
      });
      await dashboardPanel._beginGovernanceChainForWorkspace(
        input.workspacePath,
        input.workspaceName,
        input.triggeredBy === 'import' ? 'import' : 'add'
      );
      return;
    }

    if (WelcomePanel.currentPanel) {
      await WelcomePanel.currentPanel._sendDashboardEvidence({
        workspacePath: input.workspacePath,
        projectPath: input.projectPath,
        projectName: input.projectName,
      });
    }
  }

  /**
   * @deprecated Use notifyWorkspaceGovernanceChain
   */
  public static async notifyWorkspaceImported(
    workspacePath: string,
    workspaceName?: string
  ): Promise<void> {
    await WelcomePanel.notifyWorkspaceGovernanceChain(workspacePath, workspaceName, 'import');
  }

  /**
   * Refresh workspace status (installed modules) after module installation
   */
  public static async refreshWorkspaceStatus(options?: {
    forceCapabilityRefresh?: boolean;
    workspaceOverride?: { name?: string; path: string } | null;
  }) {
    if (WelcomePanel.currentPanel) {
      await WelcomePanel.currentPanel._sendWorkspaceStatus(options);
      // Also refresh modules catalog to get latest versions
      await WelcomePanel.currentPanel._refreshModulesCatalog();
    }
  }

  public static async refreshDashboardForWorkspaceSelection() {
    const dashboardPanel = WelcomePanel._dashboardPanel;
    if (!dashboardPanel) {
      return;
    }

    await dashboardPanel._sendRecentWorkspaces();
    await dashboardPanel._sendWorkspaceStatus();
    await dashboardPanel._refreshModulesCatalog();
    await dashboardPanel._sendDashboardEvidence();
  }

  public static async refreshDashboardForWorkspacePath(workspacePath: string) {
    const dashboardPanel = WelcomePanel._dashboardPanel;
    if (!dashboardPanel) {
      WelcomePanel._pendingDashboardFullRefreshPath = workspacePath;
      return;
    }

    await dashboardPanel._sendRecentWorkspaces();
    await dashboardPanel._sendWorkspaceStatus({
      workspaceOverride: {
        path: workspacePath,
        name: path.basename(workspacePath),
      },
    });
    await dashboardPanel._refreshModulesCatalog();
    await dashboardPanel._sendDashboardEvidence({ workspacePath, refreshMode: 'full' });
  }

  public static async refreshDashboardEvidenceCards(input: {
    workspacePath: string;
    cardIds: readonly DashboardEvidenceCardId[];
    projectPath?: string;
    projectName?: string;
  }): Promise<void> {
    const dashboardPanel = WelcomePanel._dashboardPanel;
    if (!dashboardPanel) {
      WelcomePanel._pendingDashboardEvidencePatch = input;
      return;
    }

    await dashboardPanel._sendDashboardEvidence({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      projectName: input.projectName,
      cardIds: [...input.cardIds],
      refreshMode: 'patch',
    });
  }

  private static async flushPendingDashboardRefresh(_panel: WelcomePanel): Promise<void> {
    const pendingPath = WelcomePanel._pendingDashboardFullRefreshPath;
    const pendingPatch = WelcomePanel._pendingDashboardEvidencePatch;
    WelcomePanel._pendingDashboardFullRefreshPath = undefined;
    WelcomePanel._pendingDashboardEvidencePatch = undefined;

    if (pendingPath) {
      await WelcomePanel.refreshDashboardForWorkspacePath(pendingPath);
      return;
    }

    if (pendingPatch) {
      await WelcomePanel.refreshDashboardEvidenceCards(pendingPatch);
    }
  }

  private _getSelectedWorkspaceInfo(): { name: string; path: string } | null {
    return getSelectedWorkspaceInfoFromExplorer(() =>
      WelcomePanel._workspaceExplorer?.getSelectedWorkspace()
    );
  }

  private _dashboardHostBindings(): WelcomePanelDashboardHostFactoryBindings {
    return {
      context: this._context,
      getWorkspaceExplorerSelectedWorkspace: () =>
        WelcomePanel._workspaceExplorer?.getSelectedWorkspace(),
      getSelectedProject: () => WelcomePanel._selectedProject,
      getFallbackWorkspacePath: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      getModulesCatalog: () => this._modulesCatalog,
      setModulesCatalog: (modules) => {
        this._modulesCatalog = modules;
      },
      getRecentWorkspaces: () => this._getRecentWorkspaces(),
      beginEvidenceSendGeneration: () => ++this._dashboardEvidenceSendGeneration,
      isCurrentEvidenceSendGeneration: (generation) =>
        generation === this._dashboardEvidenceSendGeneration,
      postWebviewMessage: (command, data, options) =>
        this._postWebviewMessage(command, data, options),
      executeDashboardContractCommand: (command, data) =>
        this._executeDashboardContractCommand(command, data),
      sendWorkspaceToolStatus: () => this._sendWorkspaceToolStatus(),
      resolveTelemetryWorkspacePath: () => this._resolveTelemetryWorkspacePath(),
      refreshWorkspaceStatus: () => WelcomePanel.refreshWorkspaceStatus(),
      refreshExampleWorkspaces: () => this._sendExampleWorkspaces(),
      showAiModal: (context, aiContext) => WelcomePanel.showAIModal(context, aiContext),
    };
  }

  private _dashboardOpsChainHost(): DashboardOpsChainHost {
    return buildWelcomePanelDashboardOpsChainHost(this._dashboardHostBindings(), () =>
      this._dashboardEvidenceHost()
    );
  }

  private _dashboardLifecycleMessageHost(): DashboardLifecycleMessageHost {
    return buildWelcomePanelDashboardLifecycleMessageHost(this._dashboardHostBindings(), () =>
      this._dashboardEvidenceHost()
    );
  }

  private _analyzeReportMessageHost(): AnalyzeReportMessageHost {
    return buildWelcomePanelAnalyzeReportMessageHost(this._dashboardHostBindings());
  }

  private _dashboardShortcutMessageHost(): DashboardShortcutMessageHost {
    return buildWelcomePanelDashboardShortcutMessageHost(this._dashboardHostBindings());
  }

  private _modulesCatalogHost(): ModulesCatalogHost {
    return buildWelcomePanelModulesCatalogHost(this._dashboardHostBindings());
  }

  private _dashboardEvidenceHost(): DashboardEvidenceHost {
    return buildWelcomePanelDashboardEvidenceHost(this._dashboardHostBindings(), () =>
      this._dashboardOpsChainHost()
    );
  }

  private _dashboardCommandHost(): DashboardCommandHost {
    return buildWelcomePanelDashboardCommandHost(this._dashboardHostBindings(), () =>
      this._dashboardEvidenceHost()
    );
  }

  private async _executeDashboardContractCommand(
    command: string,
    data?: Record<string, unknown>
  ): Promise<boolean> {
    return executeDashboardContractCommand(this._dashboardCommandHost(), command, data);
  }

  private _projectDiscoveryBindings() {
    return { workspaceExplorer: WelcomePanel._workspaceExplorer };
  }

  private _studioTelemetryBindings() {
    return {
      selectedProject: WelcomePanel._selectedProject,
      selectedWorkspacePath: WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path,
      workspaceFolders: vscode.workspace.workspaceFolders,
    };
  }

  private async _buildWorkspaceProjectCandidatesBlock(
    workspacePath: string,
    doctorSnapshot?: DoctorEvidenceSnapshot
  ): Promise<string | undefined> {
    return buildWorkspaceProjectCandidatesForPanel(
      workspacePath,
      this._projectDiscoveryBindings(),
      doctorSnapshot
    );
  }

  private async _resolveScopedProjectForWorkspace(options?: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    doctorSnapshot?: DoctorEvidenceSnapshot;
  }): Promise<{ name: string; path: string; type?: string } | null> {
    return resolveScopedProjectForPanel(this._projectDiscoveryBindings(), options);
  }

  private _context: vscode.ExtensionContext;
  private _chatBrainQueryTokenSource?: vscode.CancellationTokenSource;
  private _chatBrainReplyWebview?: vscode.Webview;
  private _activeChatBrainRequestId?: string;
  private _activeChatBrainConversationId?: string;
  private _chatBrainInFlightRequestIds = new Set<string>();
  private _chatBrainCompletedRequestIds = new Set<string>();
  private _chatBrainConversations = new Map<
    string,
    {
      workspacePath?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      startedAt: number;
      lastActivityAt: number;
      phase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
      // Analytics dimensions
      queryCount: number;
      actionCount: number;
      verifyPassedAt?: number;
      repeatedIncidentDetected?: boolean;
      framework?: string;
      scopeMode?: 'workspace' | 'project';
      importedIncidentReplay?: {
        packId: string;
        actionType: string;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        likelyFailureMode?: string;
        verifyChecklist: string[];
        blockedReasons: string[];
        relatedFiles: string[];
        importedFrom?: string;
      };
      // Last AI response text (populated after each _handleAiChatQuery call)
      lastActionResponseText?: string;
      // Scope-gate state from latest action used to fail-close command apply routes.
      lastScopeKnown?: boolean;
      lastUnknownScopeMutationBlocked?: boolean;
    }
  >();
  private _pendingImportedIncidentReplayByWorkspace = new Map<
    string,
    {
      packId: string;
      actionType: string;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      likelyFailureMode?: string;
      verifyChecklist: string[];
      blockedReasons: string[];
      relatedFiles: string[];
      importedFrom?: string;
    }
  >();
  private _incidentResumeByWorkspace = new Map<string, IncidentResumeSnapshot>();
  /** Per-workspace system graph watchers for incremental refresh on file change. */
  private _systemGraphWatcherByPath = new Map<string, ProjectSystemGraphWatcherHandle>();
  private _dashboardEvidenceSendGeneration = 0;
  private _doctorTelemetryRefreshController = createDoctorTelemetryRefreshController({
    onRefresh: (context) => {
      void this._sendDashboardEvidence(context);
      return this._sendIncidentStudioTelemetry(context?.workspacePath);
    },
    onError: (error) => {
      console.warn('[WelcomePanel] Doctor telemetry refresh failed:', error);
    },
  });
  private _inFlightAIQueryRequestIds = new Set<number>();
  private _completedAIQueryRequestIds: number[] = [];

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this._panel = panel;
    this._context = context;

    registerWelcomePanelDoctorEvidenceWatcher(this._disposables, (filePath) => {
      this._doctorTelemetryRefreshController.schedule(filePath);
    });

    // Set webview content
    this._panel.webview.html = buildWelcomePanelHtmlContent(context, this._panel.webview);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (rawMessage: unknown) => {
        await dispatchWelcomePanelWebviewMessage(this._webviewMessageDispatchHost(), rawMessage);
      },
      null,
      this._disposables
    );

    // Clean up when panel is closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _trackAIQueryRequestStart(requestId: number): void {
    trackWelcomePanelAiQueryRequestStart(
      {
        inFlightAIQueryRequestIds: this._inFlightAIQueryRequestIds,
        completedAIQueryRequestIds: this._completedAIQueryRequestIds,
      },
      requestId
    );
  }

  private _webviewMessageDispatchHost(): WelcomePanelWebviewMessageDispatchHost {
    return {
      context: this._context,
      webview: this._panel.webview,
      runOptionalMessageLane: (laneName, lane) =>
        runWelcomePanelOptionalMessageLane(laneName, lane),
      getDashboardCommandHost: () => this._dashboardCommandHost(),
      getDashboardLifecycleMessageHost: () => this._dashboardLifecycleMessageHost(),
      getModulesCatalogHost: () => this._modulesCatalogHost(),
      getDashboardShortcutMessageHost: () => this._dashboardShortcutMessageHost(),
      getAnalyzeReportMessageHost: () => this._analyzeReportMessageHost(),
      getAiModalMessageHost: () => this._aiModalMessageHost(),
      getWorkspaiSettingsMessageHost: () => this._workspaiSettingsMessageHost(),
      getWorkspaceSelectionMessageHost: () => this._workspaceSelectionMessageHost(),
      getIncidentStudioMessageHost: () => this._incidentStudioMessageHost(),
      getReadyMessageHost: () => this._readyMessageHost(),
      getCreationNavigationMessageHost: () => this._creationNavigationMessageHost(),
      getAiCreationDispatchHost: () => this._aiCreationDispatchHost(),
    };
  }

  private _messageHostBindings(): WelcomePanelMessageHostFactoryBindings {
    return {
      context: this._context,
      webview: this._panel.webview,
      postWebviewMessage: (command, data) => this._postWebviewMessage(command, data),
      markPanelReady: () => {
        this._isReady = true;
        void WelcomePanel.flushPendingDashboardRefresh(this);
      },
      takePendingFrameworkModal: () => {
        const pending = WelcomePanel._pendingModal;
        WelcomePanel._pendingModal = null;
        return pending;
      },
      getPendingAICreateMode: () => WelcomePanel._pendingAICreateMode,
      getAICreateTargetWorkspace: () => {
        if (WelcomePanel._pendingAICreateMode !== 'project') {
          return undefined;
        }
        const selectedWs = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
        return selectedWs ? { name: selectedWs.name, path: selectedWs.path } : undefined;
      },
      takePendingModuleModal: () => {
        const pending = WelcomePanel._pendingModuleModal;
        WelcomePanel._pendingModuleModal = null;
        return pending;
      },
      takePendingWorkspaceShareDashboardOpen: () => {
        const pending = WelcomePanel._pendingWorkspaceShareDashboardOpen;
        WelcomePanel._pendingWorkspaceShareDashboardOpen = null;
        return pending;
      },
      takePendingSetupTabOpen: () => {
        const pending = WelcomePanel._pendingSetupTabOpen;
        WelcomePanel._pendingSetupTabOpen = false;
        return pending;
      },
      takePendingDashboardSectionOpen: () => {
        const pending = WelcomePanel._pendingDashboardSectionOpen;
        WelcomePanel._pendingDashboardSectionOpen = null;
        return pending;
      },
      openSetupTab: (context) => WelcomePanel.openSetupTab(context),
      openDashboardTab: (context) => WelcomePanel.openDashboardTab(context),
      getSelectedWorkspacePath: () => WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path,
      getSelectedWorkspaceInfo: () => this._getSelectedWorkspaceInfo(),
      getSelectedProject: () => WelcomePanel._selectedProject,
      setSelectedProject: (project) => {
        WelcomePanel._selectedProject = project;
      },
      listWorkspaceProjectsForWebview: (workspacePath) =>
        WelcomePanel.listWorkspaceProjectsForWebview(workspacePath),
      updateWithProject: (projectPath, projectName, options) =>
        WelcomePanel.updateWithProject(projectPath, projectName, options),
      syncAnalysisSelectionFromWebview: (data) =>
        WelcomePanel.syncAnalysisSelectionFromWebview(data),
      getRecentWorkspaces: () => this._getRecentWorkspaces(),
      sendAvailableKits: () => this._sendAvailableKits(),
      sendModulesCatalog: () => this._sendModulesCatalog(),
      sendWorkspaiSettings: (preferredModelOverride) =>
        this._sendWorkspaiSettings(preferredModelOverride),
      sendDashboardEvidence: () => this._sendDashboardEvidence(),
      sendUiPreferences: (workspacePath) => this._sendUiPreferences(workspacePath),
      sendRecentWorkspaces: () => this._sendRecentWorkspaces(),
      sendExampleWorkspaces: () => this._sendExampleWorkspaces(),
      beginGovernanceChainForWorkspace: (workspacePath, workspaceName, triggeredBy) =>
        this._beginGovernanceChainForWorkspace(workspacePath, workspaceName, triggeredBy),
      runOptionalMessageLane: (laneName, lane) =>
        runWelcomePanelOptionalMessageLane(laneName, lane),
      refreshDashboardForWorkspaceSelection: () =>
        WelcomePanel.refreshDashboardForWorkspaceSelection(),
    };
  }

  private _aiModalHostBindings(): WelcomePanelAiModalHostFactoryBindings {
    return {
      context: this._context,
      getModulesCatalog: () => this._modulesCatalog,
      refreshModulesCatalog: () => refreshModulesCatalog(this._modulesCatalogHost()),
      getAiQueryTokenSource: () => this._aiQueryTokenSource,
      setAiQueryTokenSource: (value) => {
        this._aiQueryTokenSource = value;
      },
      getActiveAiQueryRequestId: () => this._activeAIQueryRequestId,
      setActiveAiQueryRequestId: (value) => {
        this._activeAIQueryRequestId = value;
      },
      trackAIQueryRequestStart: (requestId) => this._trackAIQueryRequestStart(requestId),
      postAIStreamDoneOnce: (requestId, error) => this._postAIStreamDoneOnce(requestId, error),
      postWebviewMessage: (command, data) => this._postWebviewMessage(command, data),
      getIncidentMemoryBridgeHost: () => this._incidentMemoryBridgeHost(),
    };
  }

  private _chatBrainHostBindings(): WelcomePanelChatBrainHostFactoryBindings {
    return {
      context: this._context,
      webview: this._panel.webview,
      getSelectedProject: () => WelcomePanel._selectedProject,
      getSelectedWorkspaceInfo: () => this._getSelectedWorkspaceInfo(),
      resolveTelemetryWorkspacePath: () => this._resolveTelemetryWorkspacePath(),
      resolveDashboardSessionWorkspacePath: (data) =>
        this._resolveDashboardSessionWorkspacePath(data),
      postWebviewMessage: (command, data) => this._postWebviewMessage(command, data),
      postChatBrainWebviewMessage: (message) => this._postChatBrainWebviewMessage(message),
      resolveChatBrainWebview: () => this._chatBrainReplyWebview ?? this._panel.webview,
      routeStudioToSecondarySidebar: async (data) => {
        await WelcomePanel._routeStudioToSecondarySidebar(data);
      },
      trackStudioEvent: (eventName, workspacePath, properties) =>
        this._trackStudioEvent(eventName, workspacePath, properties),
      inferFrameworkFromWorkspace: (workspacePath) =>
        this._inferFrameworkFromWorkspace(workspacePath),
      buildWorkspaceProjectCandidatesBlock: (workspacePath, doctorSnapshot) =>
        this._buildWorkspaceProjectCandidatesBlock(workspacePath, doctorSnapshot),
      resolveScopedProjectForWorkspace: (options) =>
        this._resolveScopedProjectForWorkspace(options),
      getWorkspaceGraphSnapshot: (options) => this._getWorkspaceGraphSnapshot(options),
      getUiPreferences: (workspacePath) => this._getUiPreferences(workspacePath),
      runOptionalMessageLane: (laneName, lane) =>
        runWelcomePanelOptionalMessageLane(laneName, lane),
      syncDashboardLatestAIAction: (registry) => this._syncDashboardLatestAIAction(registry),
      postDashboardAIActionRegistry: (registry) => this._postDashboardAIActionRegistry(registry),
      saveDashboardIncidentStudioSession: (data) =>
        this._handleSaveDashboardIncidentStudioSession(data),
      handleDashboardStudioMessage: (data) => this._handleDashboardStudioMessage(data),
      handleDashboardStudioAction: (data) => this._handleDashboardStudioAction(data),
      handleDashboardAIActionContractCommand: (data) =>
        this._handleDashboardAIActionContractCommand(data),
      isDashboardStudioSidebarOnly: () =>
        vscode.workspace.getConfiguration('workspai').get<boolean>('studio.sidebarOnly', true),
      handleAiChatQuery: (data, requestId) =>
        this._handleAiChatQuery(data as MessagePayload, requestId),
      handleAiChatExecuteAction: (data, requestId) =>
        this._handleAiChatExecuteAction(data as MessagePayload, requestId),
      handleExportSandboxSimulationEvidence: (data, requestId) =>
        this._handleExportSandboxSimulationEvidence(data as MessagePayload, requestId),
      handleExportReleaseReadinessCommander: (data, requestId) =>
        this._handleExportReleaseReadinessCommander(data as MessagePayload, requestId),
      chatBrainConversations: this._chatBrainConversations,
      chatBrainInFlightRequestIds: this._chatBrainInFlightRequestIds,
      chatBrainCompletedRequestIds: this._chatBrainCompletedRequestIds,
      chatBrainQueryTokenSource: this._chatBrainQueryTokenSource,
      setChatBrainQueryTokenSource: (value) => {
        this._chatBrainQueryTokenSource = value;
      },
      activeChatBrainRequestId: this._activeChatBrainRequestId,
      setActiveChatBrainRequestId: (value) => {
        this._activeChatBrainRequestId = value;
      },
      activeChatBrainConversationId: this._activeChatBrainConversationId,
      setActiveChatBrainConversationId: (value) => {
        this._activeChatBrainConversationId = value;
      },
      incidentResumeByWorkspace: this._incidentResumeByWorkspace,
      pendingImportedIncidentReplayByWorkspace: this._pendingImportedIncidentReplayByWorkspace,
      systemGraphWatcherByPath: this._systemGraphWatcherByPath,
      setLatestDashboardAIAction: (contract, actionId) => {
        this._latestDashboardAIActionContract = contract;
        this._latestDashboardAIActionId = actionId;
      },
    };
  }

  private _dashboardStudioHost(): DashboardStudioHost {
    return buildDashboardStudioHost({
      context: this._context,
      webview: this._panel.webview,
      getSelectedProjectPath: () => WelcomePanel._selectedProject?.path,
      getSelectedProjectName: () => WelcomePanel._selectedProject?.name,
      getSelectedProjectType: () => WelcomePanel._selectedProject?.type,
      postWebviewMessage: (command, data, meta) => this._postWebviewMessage(command, data, meta),
      getRunningStudioActionId: () => this._runningStudioActionId,
      setRunningStudioActionId: (value) => {
        this._runningStudioActionId = value;
      },
      getRunningDashboardAIActionOperation: () => this._runningDashboardAIActionOperation,
      setRunningDashboardAIActionOperation: (value) => {
        this._runningDashboardAIActionOperation = value;
      },
      getLatestDashboardAIActionContract: () => this._latestDashboardAIActionContract,
      getLatestDashboardAIActionId: () => this._latestDashboardAIActionId,
      setLatestDashboardAIAction: (contract, actionId) => {
        this._latestDashboardAIActionContract = contract;
        this._latestDashboardAIActionId = actionId;
      },
    });
  }

  private _structuredIncidentPromptHost() {
    return buildWelcomePanelStructuredIncidentPromptHost(this._chatBrainHostBindings(), () =>
      this._incidentMemoryBridgeHost()
    );
  }

  private _workspaceGraphSnapshotHost() {
    return buildWelcomePanelWorkspaceGraphSnapshotHost(this._chatBrainHostBindings(), () =>
      this._incidentMemoryBridgeHost()
    );
  }

  private _aiModalQueryHost() {
    return buildWelcomePanelAiModalQueryHost(this._aiModalHostBindings());
  }

  private _aiModalMessageHost(): AiModalMessageHost {
    return buildWelcomePanelAiModalMessageHost(this._aiModalHostBindings(), () =>
      this._aiModalQueryHost()
    );
  }

  private _recentWorkspacesHost(): RecentWorkspacesHost {
    return buildWelcomePanelRecentWorkspacesHost();
  }

  private _workspaiSettingsMessageHost(): WorkspaiSettingsMessageHost {
    return buildWelcomePanelWorkspaiSettingsMessageHost(this._messageHostBindings());
  }

  private _aiCreationDispatchHost(): AiCreationDispatchHost {
    return buildWelcomePanelAiCreationDispatchHost(this._messageHostBindings());
  }

  private _readyMessageHost(): ReadyMessageHost {
    return buildWelcomePanelReadyMessageHost(this._messageHostBindings(), () =>
      sendWelcomePanelInitialData(this._bootstrapPayloadHost())
    );
  }

  private _creationNavigationMessageHost(): CreationNavigationMessageHost {
    return buildWelcomePanelCreationNavigationMessageHost(this._messageHostBindings());
  }

  private _bootstrapPayloadHost(): BootstrapPayloadHost {
    return buildWelcomePanelBootstrapPayloadHost(this._messageHostBindings());
  }

  private _exampleWorkspacesHost() {
    return buildWelcomePanelExampleWorkspacesHost(this._messageHostBindings());
  }

  private _workspaceSelectionMessageHost(): WorkspaceSelectionMessageHost {
    return buildWelcomePanelWorkspaceSelectionMessageHost(this._messageHostBindings(), () =>
      this._exampleWorkspacesHost()
    );
  }

  private _doctorMessageHost() {
    return buildWelcomePanelDoctorMessageHost(this._chatBrainHostBindings());
  }

  private _incidentMemoryBridgeHost() {
    return buildWelcomePanelIncidentMemoryBridgeHost(this._chatBrainHostBindings());
  }

  private _chatBrainContextHost() {
    return buildWelcomePanelChatBrainContextHost(this._chatBrainHostBindings());
  }

  private _chatBrainApplyPatchHost() {
    return buildWelcomePanelChatBrainApplyPatchHost(this._chatBrainHostBindings());
  }

  private _incidentReproPackHost() {
    return buildWelcomePanelIncidentReproPackHost(this._chatBrainHostBindings(), () =>
      this._incidentMemoryBridgeHost()
    );
  }

  private _chatBrainLifecycleHost(): ChatBrainLifecycleHost {
    return buildWelcomePanelChatBrainLifecycleHost(this._chatBrainHostBindings());
  }

  private _chatBrainQueryHost(): ChatBrainQueryHost {
    return buildWelcomePanelChatBrainQueryHost(
      this._chatBrainHostBindings(),
      () => this._structuredIncidentPromptHost(),
      () => this._incidentMemoryBridgeHost(),
      () => this._chatBrainContextHost()
    );
  }

  private _chatBrainExecuteActionHost(): ChatBrainExecuteActionHost {
    return buildWelcomePanelChatBrainExecuteActionHost(
      this._chatBrainHostBindings(),
      () => this._incidentMemoryBridgeHost(),
      () => this._chatBrainQueryHost()
    );
  }

  private _incidentStudioMessageHost(): IncidentStudioWebviewMessageHost {
    return buildWelcomePanelIncidentStudioMessageHost(
      this._chatBrainHostBindings(),
      () => this._doctorMessageHost(),
      () => this._chatBrainLifecycleHost(),
      () => this._chatBrainApplyPatchHost(),
      () => this._incidentReproPackHost()
    );
  }

  private async _handleDashboardStudioAction(data: unknown): Promise<void> {
    await dispatchDashboardStudioAction(this._dashboardStudioHost(), data);
  }

  private _postDashboardAIActionRegistry(
    registry: Awaited<ReturnType<typeof readAIActionRegistry>>
  ): void {
    postDashboardStudioAIActionRegistry(this._dashboardStudioHost(), registry);
  }

  private async _handleDashboardStudioMessage(data: unknown): Promise<void> {
    await dispatchDashboardStudioMessage(this._dashboardStudioHost(), data);
  }

  private async _handleDashboardAIActionContractCommand(data: unknown): Promise<void> {
    await dispatchDashboardAIActionContractCommand(this._dashboardStudioHost(), data);
  }

  private _syncDashboardLatestAIAction(
    registry: Awaited<ReturnType<typeof readAIActionRegistry>>
  ): void {
    syncDashboardStudioLatestAIAction(this._dashboardStudioHost(), registry);
  }

  private _postAIStreamDoneOnce(requestId?: number, error?: string): void {
    postWelcomePanelAIStreamDoneOnce(
      this._panel.webview,
      {
        inFlightAIQueryRequestIds: this._inFlightAIQueryRequestIds,
        completedAIQueryRequestIds: this._completedAIQueryRequestIds,
      },
      requestId,
      error
    );
  }

  private async _beginGovernanceChainForWorkspace(
    workspacePath: string,
    workspaceName: string | undefined,
    triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add'
  ): Promise<void> {
    await beginGovernanceChainForWorkspace(
      this._dashboardOpsChainHost(),
      workspacePath,
      workspaceName,
      triggeredBy
    );
  }

  private async _sendDashboardEvidence(context?: DashboardEvidenceRefreshContext | string) {
    await sendDashboardEvidence(this._dashboardEvidenceHost(), context);
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    options?: {
      title?: string;
      viewColumn?: vscode.ViewColumn;
      reveal?: boolean;
    }
  ) {
    const shouldReveal = options?.reveal !== false;

    if (WelcomePanel._dashboardPanel) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      if (shouldReveal) {
        WelcomePanel._dashboardPanel._panel.reveal();
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'rapidkitWelcomeReact',
      options?.title ?? 'Workspai Dashboard',
      options?.viewColumn ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      }
    );

    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'workspai.svg');

    const createdPanel = new WelcomePanel(panel, context);
    WelcomePanel._dashboardPanel = createdPanel;
    WelcomePanel.currentPanel = createdPanel;
  }

  private async _sendWorkspaceToolStatus() {
    await sendWelcomePanelWorkspaceToolStatus(this._bootstrapPayloadHost());
  }

  private _resolveTelemetryWorkspacePath(): string | undefined {
    return resolveWelcomePanelTelemetryWorkspacePath(this._studioTelemetryBindings());
  }

  private _resolveDashboardSessionWorkspacePath(data: unknown): string | undefined {
    return resolveDashboardSessionWorkspacePathForPanel(this._studioTelemetryBindings(), data);
  }

  private async _handleSaveDashboardIncidentStudioSession(data: unknown) {
    const workspacePath = this._resolveDashboardSessionWorkspacePath(data);
    await saveDashboardIncidentStudioSession(this._context, workspacePath || '', data);
  }

  private _trackStudioEvent(
    command: string,
    workspacePath?: string,
    properties?: Record<string, unknown>
  ) {
    trackWelcomePanelStudioEvent(
      this._studioTelemetryBindings(),
      command,
      workspacePath,
      properties
    );
  }

  private async _inferFrameworkFromWorkspace(workspacePath: string): Promise<string> {
    return inferFrameworkFromWorkspace(
      {
        resolveScopedProjectForWorkspace: (options) =>
          this._resolveScopedProjectForWorkspace(options),
      },
      workspacePath
    );
  }

  private async _getWorkspaceGraphSnapshot(
    options?: Parameters<typeof buildWorkspaceGraphSnapshot>[1]
  ): Promise<IncidentWorkspaceGraphSnapshot> {
    return buildWorkspaceGraphSnapshot(this._workspaceGraphSnapshotHost(), options);
  }

  private _postWebviewMessage<C extends string, D = unknown>(
    command: C,
    data?: D,
    options?: {
      meta?: WebviewFromExtensionMessage<C, D>['meta'];
      error?: unknown;
      webview?: vscode.Webview;
    }
  ): void {
    postWelcomePanelWebviewMessage(this._panel.webview, command, data, options);
  }

  private _postChatBrainWebviewMessage(message: WebviewFromExtensionMessage): void {
    postWelcomePanelChatBrainWebviewMessage(
      this._panel.webview,
      this._chatBrainReplyWebview,
      message
    );
  }

  public async dispatchExternalChatBrainMessage(
    command: string,
    data: unknown,
    requestId: string | undefined,
    replyWebview: vscode.Webview
  ): Promise<void> {
    this._chatBrainReplyWebview = replyWebview;
    try {
      await tryDispatchIncidentStudioWebviewMessage(
        this._incidentStudioMessageHost(),
        command,
        data,
        {
          protocolRequestId: requestId,
          chatCloseTracksLifecycle: false,
        }
      );
    } finally {
      this._chatBrainReplyWebview = undefined;
    }
  }

  private async _handleAiChatQuery(data: MessagePayload, requestId?: string) {
    await handleAiChatQuery(this._chatBrainQueryHost(), data, requestId);
  }

  private async _handleAiChatExecuteAction(data: MessagePayload, requestId?: string) {
    await handleAiChatExecuteAction(this._chatBrainExecuteActionHost(), data, requestId);
  }

  private async _handleExportSandboxSimulationEvidence(
    data: MessagePayload,
    requestId?: string
  ): Promise<void> {
    await exportSandboxSimulationEvidenceFromPayload(
      this._context,
      data,
      requestId,
      this._chatBrainReplyWebview ?? this._panel.webview
    );
  }

  private async _handleExportReleaseReadinessCommander(
    data: MessagePayload,
    requestId?: string
  ): Promise<void> {
    await exportReleaseReadinessCommanderFromPayload(
      this._context,
      data,
      requestId,
      this._chatBrainReplyWebview ?? this._panel.webview
    );
  }

  private async _sendIncidentStudioTelemetry(
    explicitWorkspacePath?: string,
    explicitProjectPath?: string,
    forceRefresh = false
  ) {
    await sendWelcomePanelIncidentStudioTelemetry(this._panel.webview, {
      context: this._context,
      workspacePath: explicitWorkspacePath || this._resolveTelemetryWorkspacePath(),
      projectPath: explicitProjectPath,
      forceRefresh,
    });
  }

  private _getUiPreferences(workspacePath?: string) {
    return readWelcomePanelUiPreferences(this._context, {
      workspacePath,
      telemetryWorkspacePath: this._resolveTelemetryWorkspacePath() || 'global',
    });
  }

  private _sendUiPreferences(workspacePath?: string) {
    postWelcomePanelUiPreferences(this._panel.webview, this._context, workspacePath);
  }

  private async _sendWorkspaiSettings(preferredModelOverride?: string) {
    await sendWelcomePanelWorkspaiSettings(
      this._context,
      (command, data) => this._postWebviewMessage(command, data),
      preferredModelOverride
    );
  }

  private async _sendRecentWorkspaces() {
    await sendWelcomePanelRecentWorkspaces(this._bootstrapPayloadHost());
  }

  private async _sendExampleWorkspaces() {
    await sendWelcomePanelExampleWorkspaces(this._bootstrapPayloadHost());
  }

  private async _sendAvailableKits() {
    await sendWelcomePanelAvailableKits(this._modulesCatalogHost());
  }

  private async _sendModulesCatalog() {
    await sendWelcomePanelModulesCatalog(this._modulesCatalogHost());
  }

  private async _refreshModulesCatalog(options?: { forceRefresh?: boolean }): Promise<void> {
    await refreshWelcomePanelModulesCatalog(this._modulesCatalogHost(), options);
  }

  private async _sendWorkspaceStatus(options?: {
    forceCapabilityRefresh?: boolean;
    workspaceOverride?: { name?: string; path: string } | null;
  }) {
    await sendWelcomePanelWorkspaceStatus(this._bootstrapPayloadHost(), options);
  }

  private _getRecentWorkspaces() {
    return getWelcomePanelRecentWorkspaces(this._recentWorkspacesHost());
  }

  public dispose() {
    if (WelcomePanel.currentPanel === this) {
      WelcomePanel.currentPanel = undefined;
    }
    if (WelcomePanel._dashboardPanel === this) {
      WelcomePanel._dashboardPanel = undefined;
    }

    this._aiQueryTokenSource?.cancel();
    this._aiQueryTokenSource?.dispose();
    this._aiQueryTokenSource = undefined;
    this._activeAIQueryRequestId = undefined;

    for (const watcher of this._systemGraphWatcherByPath.values()) {
      watcher.dispose();
    }
    this._systemGraphWatcherByPath.clear();

    this._doctorTelemetryRefreshController.dispose();

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
