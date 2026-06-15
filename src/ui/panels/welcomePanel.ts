/**
 * Welcome Panel - React Version
 * Uses React for webview UI with postMessage communication
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { openWorkspacePath } from '../../utils/workspacePathNavigation';
import { WorkspaceManager } from '../../core/workspaceManager';
import { ModulesCatalogService } from '../../core/modulesCatalogService';
import { CoreVersionService } from '../../core/coreVersionService';
import { resolveCatalogWorkspaceRoot } from '../../utils/coreRuntimeResolver';
import { ExamplesService } from '../../core/examplesService';
import { KitsService } from '../../core/kitsService';
import { WorkspaceMemoryService } from '../../core/workspaceMemoryService';
import { getGitDiffStat } from '../../core/aiProjectContextUtils';
import { readLanguageModelResponseText } from '../../core/languageModelResponse';
import {
  openWorkspaiExtensionSettings,
  readWorkspaiSettings,
  setWorkspaiAIProvider,
  setWorkspaiCustomAIConfig,
  setWorkspaiPreferredModel,
  setWorkspaiThemeMode,
} from '../../core/workspaiSettingsBridge';
import {
  clearCustomAIAPIKey,
  askConfiguredAIProvider,
  getAIProviderStatus,
  runConfiguredAIProviderHealthCheck,
  setCustomAIAPIKey,
} from '../../core/aiProviderService';
import type { AIOutputScenario } from '../../core/aiOutputQuality';
import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import { buildArchitectureGroundingForPromptAsync } from '../../core/aiArchitectureGrounding';
import type { AIModalContext } from '../../core/aiService';
import { buildModuleListForPrompt, getWorkspaceAwareLiveModules } from '../../core/aiService';
import {
  indexProjectSystemGraph,
  queryProjectSystemGraphImpact,
  scoreSystemGraphImpactDeterministic,
  buildImpactScoreContractV1,
  type ImpactScoreContractV1,
  createProjectSystemGraphWatcher,
  type ProjectSystemGraphWatcherHandle,
} from '../../core/systemGraphIndexer';
import { runSandboxSimulation, type SandboxVerifyCommand } from '../../core/sandboxSimulation';
import { buildVerifyPackPlan, toVerifyPackCommandStrings } from '../../core/verifyPackProfiles';
import {
  extractPatchesFromAiResponse,
  applyPatches,
  type MultiFilePatchResult,
} from '../../core/patchApplyEngine';
import { evaluateIncidentC07Gates } from '../../core/incidentC07Integration';
import {
  evaluateWorkspaiContractRuntime,
  type WorkspaiContractRuntimeEvidence,
} from '../../core/workspaiContractRuntime';
import { MODULES, ModuleData } from '../../data/modules';
import { runningServers } from '../../extension';
import { run } from '../../utils/exec';
import {
  buildRapidkitDisplayCommand,
  getWorkspaceVenvRapidkitCandidates,
} from '../../utils/platformCapabilities';
import { isPoetryInstalledCached } from '../../utils/poetryHelper';
import { checkPythonEnvironmentCached } from '../../utils/pythonChecker';
import { runCommandsInTerminal, runShellCommandInTerminal } from '../../utils/terminalExecutor';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import type { WorkspaceExplorerProvider } from '../treeviews/workspaceExplorer';
import type { ProjectExplorerProvider } from '../treeviews/projectExplorer';
import {
  createDoctorTelemetryRefreshController,
  type DashboardEvidenceRefreshContext,
} from './doctorTelemetryRefresh';
import { SetupPanel } from './setupExperiencePanel.js';
import {
  buildDashboardEvidenceBundle,
  resolveCardForReportKind,
} from '../../core/dashboardEvidenceBridge';
import {
  appendDashboardActivity,
  clearDashboardActivity,
  finalizeDashboardActivityFromReport,
  getDashboardActivityLog,
  resolveDashboardCommandActivity,
} from '../../core/dashboardActivityBridge';
import { resolveDashboardCommandContract } from '../../core/dashboardCommandContracts';
import {
  advanceDashboardOpsChain,
  blockDashboardOpsChain,
  filterOpsChainForWorkspace,
  getDashboardOpsChain,
  getNextOpsChainCommand,
  startDashboardOpsChain,
  clearDashboardOpsChain,
} from '../../core/dashboardOpsChainBridge';
import { resolveReportBinding } from '../../core/dashboardReportRegistry';
import { routeIncidentActionTypeFromMessage, type RoutingResult } from './incidentRouting';
import {
  findIncidentNavigatorSelection,
  resolveIncidentNavigatorTargetPath,
} from './incidentNavigatorTarget';
import { buildIncidentPredictiveWarning } from './incidentPredictiveWarning';
import { buildSyncSystemGraphSnapshot } from './incidentStudioSyncGraph';
import { buildIncidentLifecycleMetrics } from './incidentConversationMetrics';
import {
  analyzeReportExists,
  loadAnalyzeReport,
  runWorkspaceAnalyze,
  type AnalyzeReport,
} from './incidentStudioAnalyze';
import { getLatestRunnableAIAction, readAIActionRegistry } from '../../core/aiActionRegistry';
import { AIActionContract, AIActionOperation } from '../../core/aiActionContract';
import {
  buildIncidentStudioEvidenceContext,
  renderIncidentStudioEvidencePrompt,
} from '../../core/incidentStudioEvidenceContext';
import {
  getStudioActionRegistryEntryById,
  isStudioActionId,
  type StudioActionId,
} from '../../core/studioActionCommands';
import { ProjectSelectionSequence } from './projectSelectionSequence';
import { buildIncidentResumeSnapshot, type IncidentResumeSnapshot } from './incidentStudioResume';
import {
  buildIncidentMemoryEnrichmentSuggestion,
  buildIncidentMemoryPromptHint,
  buildIncidentMemoryReuseSnapshot,
  detectRepeatedIncident,
  mergeIncidentReplayLearningIntoMemory,
  prependIncidentMemoryReuseBlock,
  shouldAttachIncidentMemoryReuse,
} from './incidentStudioMemory';
import {
  assessVerifyCompleteness,
  buildIncidentFirstResponseRules,
  classifyIncidentActionPolicy,
  isIncidentActionAllowlisted,
  labelDiagnosisConfidence,
} from './incidentStudioPromptPolicy';
import {
  buildIncidentReplayQuery,
  buildLinkSafeExportBundle,
  parseImportedReproBundle,
  toLinkSafePath,
} from './incidentReproPackUtils';
import {
  deriveIncidentVerifyCommandPack,
  derivePredictionConfidenceBand,
  isIncidentRollbackProtectedPath,
  normalizeIncidentRollbackApprovalMode,
  normalizeIncidentRollbackProtectedPaths,
} from './welcomePanelIncidentPolicy';
import {
  buildChatBrainFallbackBoard,
  deriveChatBrainFailureCode,
  isRetryableChatBrainError,
} from './welcomePanelChatBrainFallback';
import { getIncidentPrimaryCtaExperimentVariant } from './welcomePanelTelemetryExperiment';
import { readIncidentStudioUiPreferences } from './incidentStudioUiPreferencesBridge';
import {
  handleIncidentStudioSetUiPreference,
  postIncidentStudioTelemetry,
  postIncidentStudioUiPreferences,
  resolveIncidentStudioTelemetry,
} from './incidentStudioTelemetryBridge';
import { dispatchIncidentStudioInlineCommand } from './incidentStudioInlineCommandBridge';
import { shouldRefreshStabilizationLoopAfterStudioAction } from './incidentStudioStabilizationLoopBridge';
import {
  dispatchIncidentStudioShipLoopStepMessage,
  refreshIncidentStudioShipLoopSurfaces,
} from './incidentStudioShipLoopBridge';
import { postIncidentStudioShipEvidence } from './incidentStudioShipEvidenceBridge';
import {
  exportReleaseReadinessCommanderFromPayload,
  exportSandboxSimulationEvidenceFromPayload,
} from './incidentStudioEnterpriseExportBridge';
import { runPostPatchShipLoopRefresh } from './incidentStudioPatchReverifyBridge';
import {
  readDoctorEvidenceSnapshot,
  type DoctorEvidenceSnapshot,
} from './incidentStudioDoctorEvidence';
import {
  executeStudioActionById,
  type StudioActionExecutionResult,
} from './incidentStudioActionBridge';
import {
  appendApprovalAuditEvent,
  postSessionToWebview,
  readIncidentStudioSession,
  replaceChatMessages,
  replaceExecutionTranscripts,
  replaceProofEvents,
  writeIncidentStudioSession,
  type IncidentStudioApprovalAuditEvent,
  type IncidentStudioChatMessage,
  type IncidentStudioExecutionTranscript,
  type IncidentStudioProofEvent,
  type IncidentStudioSessionPhase,
} from './incidentStudioSessionPersistenceBridge';
import {
  buildStudioAIActionResult,
  executeGovernedAIActionOperation,
  formatAIActionRegistryWebviewPayload,
  publishStudioAIActionContractFromText,
} from './incidentStudioAIActionBridge';
import {
  extractVerifyCommandCandidatesFromText,
  toSandboxVerifyCommands,
} from './welcomePanelSandboxVerify';
import {
  buildWorkspaceProjectCandidatesBlock,
  resolveScopedProjectForWorkspace,
} from './welcomePanelProjectDiscovery.js';
import { resolveTelemetryWorkspacePath } from './welcomePanelTelemetryWorkspace.js';
import {
  trackChatBrainRequestStart,
  trackChatBrainRequestComplete,
} from './welcomePanelChatBrainTracking.js';
import {
  asRecord,
  extractFirstJsonArray,
  isConversationMessageEntry,
  normalizeRequestedModelId,
  safeErrorMessage,
  type IncidentMemoryInfluenceAuditEntry,
  type IncidentWorkspaceGraphSnapshot,
} from './welcomePanel.shared.js';

type MessagePayload = Record<string, unknown>;
type ExampleWorkspaceDescriptor = {
  id?: string;
  name: string;
  title: string;
  cloneUrl?: string;
};
type ModuleInfoPayload = ModuleData & Record<string, unknown>;
const DEFAULT_AI_MODULE_SUGGEST_TIMEOUT_MS = 20_000;
const MIN_AI_MODULE_SUGGEST_TIMEOUT_MS = 1_000;
const MAX_AI_MODULE_SUGGEST_TIMEOUT_MS = 60_000;

function getAIModuleSuggestTimeoutMs(): number {
  const configured = vscode.workspace
    .getConfiguration('workspai')
    .get<number>('commandTimeoutMs', DEFAULT_AI_MODULE_SUGGEST_TIMEOUT_MS);

  if (typeof configured !== 'number' || !Number.isFinite(configured)) {
    return DEFAULT_AI_MODULE_SUGGEST_TIMEOUT_MS;
  }

  return Math.max(
    MIN_AI_MODULE_SUGGEST_TIMEOUT_MS,
    Math.min(MAX_AI_MODULE_SUGGEST_TIMEOUT_MS, Math.round(configured))
  );
}

export class WelcomePanel {
  public static currentPanel: WelcomePanel | undefined;
  private static _dashboardPanel: WelcomePanel | undefined;
  private static _incidentPanel: WelcomePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _panelRole: 'dashboard' | 'incident';
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
  /** AI modal context queued to show after webview becomes ready */
  private static _pendingAIModal: import('../../core/aiService').AIModalContext | null = null;
  /** Incident Studio open request queued until webview is ready */
  private static _pendingIncidentStudioOpen: {
    workspacePath: string;
    workspaceName?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    initialQuery?: string;
    preferredDisplayMode?: 'lite' | 'full';
    preferredArchitectureLensView?: 'tree' | 'dependency' | 'runtime';
  } | null = null;
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
  /** Cached extension context so static methods can open the panel */
  private static _extensionContext: vscode.ExtensionContext | undefined;

  /**
   * Open the welcome panel and immediately trigger the Create Project modal
   * for the given framework. Safe to call whether the panel is open or not.
   */
  public static openProjectModal(
    context: vscode.ExtensionContext,
    framework: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet'
  ): void {
    // Dashboard-scoped modal: always target dashboard panel if available.
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'openProjectModal',
        data: { framework },
      });
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
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'openModuleInstallModal',
        data: moduleData,
      });
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
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'openAIModal',
        data: aiContext,
      });
      return;
    }
    WelcomePanel._pendingAIModal = aiContext;
    WelcomePanel.createOrShow(context);
  }

  public static openWorkspaceModal(context: vscode.ExtensionContext): void {
    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._panel.webview.postMessage({ command: 'openWorkspaceModal' });
      return;
    }
    WelcomePanel._pendingModal = '__workspace__';
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and immediately show the AI Create modal (workspace mode).
   * Called from the sidebar Quick Actions "Create with AI" button.
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
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'openAICreateModal',
        data: {
          mode,
          targetWorkspaceName: selectedWs?.name,
          targetWorkspacePath: selectedWs?.path,
        },
      });
      return;
    }
    WelcomePanel._pendingModal = '__ai_create__';
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open the welcome panel and jump directly to Incident Studio analysis.
   */
  public static openIncidentStudio(
    context: vscode.ExtensionContext,
    data: {
      workspacePath: string;
      workspaceName?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      initialQuery?: string;
      preferredDisplayMode?: 'lite' | 'full';
      preferredArchitectureLensView?: 'tree' | 'dependency' | 'runtime';
    }
  ): void {
    if (WelcomePanel._incidentPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._incidentPanel;
      WelcomePanel._incidentPanel._panel.reveal();
      WelcomePanel._incidentPanel._panel.webview.postMessage({
        command: 'openIncidentStudio',
        data,
      });
      return;
    }

    if (WelcomePanel._dashboardPanel?._isReady) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      WelcomePanel._dashboardPanel._panel.reveal();
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'openIncidentStudio',
        data,
      });
      return;
    }
    WelcomePanel._pendingIncidentStudioOpen = data;
    WelcomePanel.createOrShow(context);
  }

  /**
   * Open Incident Studio in a dedicated tab, keeping the current dashboard tab available.
   */
  public static openIncidentStudioInNewTab(
    context: vscode.ExtensionContext,
    data: {
      workspacePath: string;
      workspaceName?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      initialQuery?: string;
      preferredDisplayMode?: 'lite' | 'full';
      preferredArchitectureLensView?: 'tree' | 'dependency' | 'runtime';
    }
  ): void {
    if (WelcomePanel._incidentPanel) {
      WelcomePanel.currentPanel = WelcomePanel._incidentPanel;
      WelcomePanel._incidentPanel._panel.reveal();

      if (WelcomePanel._incidentPanel._isReady) {
        WelcomePanel._incidentPanel._panel.webview.postMessage({
          command: 'openIncidentStudio',
          data,
        });
      } else {
        WelcomePanel._pendingIncidentStudioOpen = data;
      }
      return;
    }

    WelcomePanel._pendingIncidentStudioOpen = data;
    WelcomePanel.createOrShow(context, {
      forceNew: true,
      title: 'Workspai Incident Studio',
      viewColumn: vscode.ViewColumn.Active,
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
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'setActiveView',
        data: { view: 'dashboard' },
      });
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
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'setActiveView',
        data: { view: 'setup' },
      });
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
      WelcomePanel._dashboardPanel._panel.webview.postMessage({
        command: 'openWorkspaceShareDashboard',
        data,
      });
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

    const panel = WelcomePanel.currentPanel;
    if (!panel?._isReady) {
      return;
    }

    panel._panel.webview.postMessage({
      command: 'updateWorkspaceStatus',
      data: {
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
      },
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

    const projectType = await WelcomePanel._detectProjectTypeStatic(projectPath);
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

    if (WelcomePanel.currentPanel) {
      const currentPanel = WelcomePanel.currentPanel;
      const installedModules = await WelcomePanel._readInstalledModules(projectPath);
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
      currentPanel._panel.webview.postMessage({
        command: 'updateWorkspaceStatus',
        data: {
          hasWorkspace: true,
          hasProjectSelected: true,
          workspaceName: resolvedWorkspaceName,
          workspacePath: resolvedWorkspacePath,
          projectName,
          projectPath,
          projectType: projectType ?? undefined,
          installedModules,
          isRunning,
          runningPort,
        },
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
      if (currentPanel._panelRole === 'dashboard') {
        void currentPanel._sendDashboardEvidence();
      }
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

    if (WelcomePanel.currentPanel) {
      const selectedWorkspace = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
      WelcomePanel.currentPanel._panel.webview.postMessage({
        command: 'updateWorkspaceStatus',
        data: {
          hasWorkspace: Boolean(selectedWorkspace),
          hasProjectSelected: false,
          workspaceName: selectedWorkspace?.name,
          workspacePath: selectedWorkspace?.path,
          installedModules: [],
        },
      });
      if (WelcomePanel.currentPanel._panelRole === 'dashboard') {
        void WelcomePanel.currentPanel._sendDashboardEvidence();
      }
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
  public static async refreshWorkspaceStatus() {
    if (WelcomePanel.currentPanel) {
      await WelcomePanel.currentPanel._sendWorkspaceStatus();
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
  }

  private _getSelectedWorkspaceInfo(): { name: string; path: string } | null {
    const ws = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
    if (!ws) {
      return null;
    }
    return { name: ws.name, path: ws.path };
  }

  private _getSelectedProjectCommandContext(): {
    workspace?: { name?: string; path?: string };
    project: {
      name?: string;
      path: string;
      type?: string;
      workspacePath?: string;
    };
  } | null {
    const selectedProject = WelcomePanel._selectedProject;
    if (!selectedProject?.path) {
      vscode.window.showWarningMessage('Select a project first.');
      return null;
    }

    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const workspacePath =
      selectedWorkspace?.path ||
      selectedProject.workspacePath ||
      (selectedProject.path ? path.dirname(selectedProject.path) : undefined);

    return {
      workspace: selectedWorkspace
        ? {
            name: selectedWorkspace.name,
            path: selectedWorkspace.path,
          }
        : workspacePath
          ? {
              name: selectedProject.workspaceName || path.basename(workspacePath),
              path: workspacePath,
            }
          : undefined,
      project: {
        name: selectedProject.name,
        path: selectedProject.path,
        type: selectedProject.type,
        workspacePath,
      },
    };
  }

  private _getDashboardWorkspacePayload(
    command: string,
    data?: Record<string, unknown>
  ): ({ path: string; name?: string } & Record<string, unknown>) | null {
    const contract = resolveDashboardCommandContract(command);
    const explicitPath = typeof data?.path === 'string' && data.path.trim() ? data.path.trim() : '';
    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const workspacePath = explicitPath || selectedWorkspace?.path || '';
    const workspaceName =
      (typeof data?.name === 'string' && data.name.trim()) ||
      selectedWorkspace?.name ||
      (workspacePath ? path.basename(workspacePath) : undefined);

    if (contract?.requiresWorkspace && !workspacePath) {
      vscode.window.showWarningMessage('Select a workspace first.');
      return null;
    }

    return workspacePath ? { ...data, path: workspacePath, name: workspaceName } : null;
  }

  private _getDashboardProjectPayload(command: string): { projectPath: string } | null {
    const contract = resolveDashboardCommandContract(command);
    const selectedProject = WelcomePanel._selectedProject;
    if (contract?.requiresProject && !selectedProject?.path) {
      vscode.window.showWarningMessage('Select a project in the sidebar first.');
      return null;
    }

    return selectedProject?.path ? { projectPath: selectedProject.path } : null;
  }

  private _failDashboardContractCommand(command: string, reason: string): boolean {
    void vscode.window.showWarningMessage(reason);
    if (this._panelRole === 'dashboard') {
      this._panel.webview.postMessage({
        command: 'dashboardCommandFailed',
        data: { command, reason },
      });
    }
    return false;
  }

  private async _executeDashboardContractCommand(
    command: string,
    data?: Record<string, unknown>
  ): Promise<boolean> {
    const contract = resolveDashboardCommandContract(command);
    if (!contract?.vscodeCommand) {
      return false;
    }

    if (contract.scope === 'module' || contract.payloadKind === 'module-maintenance') {
      const projectPayload = this._getDashboardProjectPayload(command);
      if (!projectPayload || !WelcomePanel._selectedProject) {
        return this._failDashboardContractCommand(
          command,
          'Select a project before running module maintenance commands.'
        );
      }
      const moduleSlug = typeof data?.moduleSlug === 'string' ? data.moduleSlug : undefined;
      await vscode.commands.executeCommand(contract.vscodeCommand, {
        ...contract.payloadDefaults,
        project: WelcomePanel._selectedProject,
        ...projectPayload,
        moduleSlug,
        module: moduleSlug ? { slug: moduleSlug } : undefined,
        preferNonInteractive: true,
      });
      await WelcomePanel.refreshWorkspaceStatus();
      return true;
    }

    if (contract.payloadKind === 'project-context') {
      const contextItem = this._getSelectedProjectCommandContext();
      if (!contextItem) {
        return this._failDashboardContractCommand(
          command,
          'Select a project before running this dashboard command.'
        );
      }
      await vscode.commands.executeCommand(contract.vscodeCommand, {
        ...contextItem,
        ...contract.payloadDefaults,
        ...data,
      });
      return true;
    }

    if (contract.payloadKind === 'project-path' || contract.requiresProject) {
      const projectPayload = this._getDashboardProjectPayload(command);
      if (!projectPayload) {
        return this._failDashboardContractCommand(
          command,
          'Select a project before running this dashboard command.'
        );
      }
      await vscode.commands.executeCommand(contract.vscodeCommand, {
        ...contract.payloadDefaults,
        ...projectPayload,
      });
      return true;
    }

    if (contract.payloadKind === 'workspace' || contract.requiresWorkspace) {
      const workspacePayload = this._getDashboardWorkspacePayload(command, data);
      if (!workspacePayload) {
        return this._failDashboardContractCommand(
          command,
          'Select a workspace before running this dashboard command.'
        );
      }
      await vscode.commands.executeCommand(contract.vscodeCommand, {
        ...contract.payloadDefaults,
        ...workspacePayload,
      });
      return true;
    }

    await vscode.commands.executeCommand(contract.vscodeCommand);
    return true;
  }

  private async _buildWorkspaceProjectCandidatesBlock(
    workspacePath: string,
    doctorSnapshot?: DoctorEvidenceSnapshot
  ): Promise<string | undefined> {
    return buildWorkspaceProjectCandidatesBlock(
      workspacePath,
      {
        workspaceExplorer: WelcomePanel._workspaceExplorer,
        detectProjectType: async (projectPath: string) =>
          (await WelcomePanel._detectProjectTypeStatic(projectPath)) || undefined,
        readInstalledModules: (projectPath: string) =>
          WelcomePanel._readInstalledModules(projectPath),
      },
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
    return resolveScopedProjectForWorkspace(options || {}, {
      workspaceExplorer: WelcomePanel._workspaceExplorer,
      detectProjectType: async (projectPath: string) =>
        (await WelcomePanel._detectProjectTypeStatic(projectPath)) || undefined,
      readInstalledModules: (projectPath: string) =>
        WelcomePanel._readInstalledModules(projectPath),
    });
  }

  /**
   * Read installed modules from registry.json
   */
  private static async _readInstalledModules(
    projectPath: string
  ): Promise<{ slug: string; version: string; display_name: string }[]> {
    try {
      const primaryRegistryPath = path.join(projectPath, 'registry.json');
      const legacyRegistryPath = path.join(projectPath, '.rapidkit', 'registry.json');

      const primaryExists = await fs.pathExists(primaryRegistryPath);
      const legacyExists = await fs.pathExists(legacyRegistryPath);

      const registryPath = primaryExists ? primaryRegistryPath : legacyRegistryPath;
      const exists = primaryExists || legacyExists;

      if (exists) {
        const content = await fs.readFile(registryPath, 'utf-8');
        const registry = JSON.parse(content);
        return registry.installed_modules || [];
      }
    } catch (error) {
      console.error('[WelcomePanel] Error reading registry.json:', error);
    }
    return [];
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

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    panelRole: 'dashboard' | 'incident' = 'dashboard'
  ) {
    this._panel = panel;
    this._panelRole = panelRole;
    this._context = context;

    this._registerDoctorEvidenceWatcher();

    // Set webview content
    this._panel.webview.html = this._getHtmlContent(context);

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        const protocolRequestId =
          typeof message?.meta?.requestId === 'string'
            ? message.meta.requestId
            : typeof message?.data?.requestId === 'string'
              ? message.data.requestId
              : undefined;
        if (
          this._panelRole === 'dashboard' &&
          SetupPanel.isSetupCommand(message?.command) &&
          (await SetupPanel.handleEmbeddedMessage(this._context, this._panel.webview, message))
        ) {
          return;
        }
        switch (message.command) {
          case 'ready':
            // Mark this panel instance as ready so static callers can post directly.
            this._isReady = true;
            // Send initial data to webview
            this._sendInitialData();
            // If a modal was queued (e.g. triggered from sidebar), open it now — post
            // directly without a delay because the webview just confirmed it is ready.
            if (WelcomePanel._pendingModal) {
              const pending = WelcomePanel._pendingModal;
              WelcomePanel._pendingModal = null;
              if (pending === '__workspace__') {
                this._panel.webview.postMessage({ command: 'openWorkspaceModal' });
              } else if (pending === '__ai_create__') {
                const selectedWs =
                  WelcomePanel._pendingAICreateMode === 'project'
                    ? WelcomePanel._workspaceExplorer?.getSelectedWorkspace()
                    : undefined;
                this._panel.webview.postMessage({
                  command: 'openAICreateModal',
                  data: {
                    mode: WelcomePanel._pendingAICreateMode,
                    targetWorkspaceName: selectedWs?.name,
                    targetWorkspacePath: selectedWs?.path,
                  },
                });
              } else {
                this._panel.webview.postMessage({
                  command: 'openProjectModal',
                  data: { framework: pending },
                });
              }
            }
            // If a module install modal was queued (e.g. triggered from sidebar), open it now
            if (WelcomePanel._pendingModuleModal) {
              const moduleData = WelcomePanel._pendingModuleModal;
              WelcomePanel._pendingModuleModal = null;
              this._panel.webview.postMessage({
                command: 'openModuleInstallModal',
                data: moduleData,
              });
            }
            // If an AI modal was queued (triggered from tree view inline button), open it now
            if (WelcomePanel._pendingAIModal) {
              const aiCtx = WelcomePanel._pendingAIModal;
              WelcomePanel._pendingAIModal = null;
              this._panel.webview.postMessage({
                command: 'openAIModal',
                data: aiCtx,
              });
            }
            // If Incident Studio open was queued, switch the webview directly.
            if (WelcomePanel._pendingIncidentStudioOpen) {
              const incidentData = WelcomePanel._pendingIncidentStudioOpen;
              WelcomePanel._pendingIncidentStudioOpen = null;
              this._panel.webview.postMessage({
                command: 'openIncidentStudio',
                data: incidentData,
              });
            }
            if (WelcomePanel._pendingWorkspaceShareDashboardOpen) {
              const shareData = WelcomePanel._pendingWorkspaceShareDashboardOpen;
              WelcomePanel._pendingWorkspaceShareDashboardOpen = null;
              this._panel.webview.postMessage({
                command: 'openWorkspaceShareDashboard',
                data: shareData,
              });
            }
            if (WelcomePanel._pendingSetupTabOpen) {
              WelcomePanel._pendingSetupTabOpen = false;
              this._panel.webview.postMessage({
                command: 'setActiveView',
                data: { view: 'setup' },
              });
              SetupPanel.bootstrapEmbedded(this._context, this._panel.webview);
            }
            break;
          case 'createWorkspace':
            // Close the modal immediately — don't block on command execution
            this._panel.webview.postMessage({
              command: 'setCreatingWorkspace',
              data: { isLoading: false },
            });
            // Fire and forget — notifications/progress run in background
            if (message.data?.name) {
              vscode.commands.executeCommand('workspai.createWorkspace', message.data);
            } else {
              vscode.commands.executeCommand('workspai.createWorkspace');
            }
            break;
          case 'openWorkspaceModal':
            this._panel.webview.postMessage({ command: 'openWorkspaceModal' });
            break;
          case 'createFastAPIProject':
            // Close project modal immediately
            this._panel.webview.postMessage({ command: 'closeProjectModal' });
            if (message.data?.name) {
              vscode.commands.executeCommand('workspai.createFastAPIProject', message.data.name);
            } else {
              vscode.commands.executeCommand('workspai.createFastAPIProject');
            }
            break;
          case 'createNestJSProject':
            // Close project modal immediately
            this._panel.webview.postMessage({ command: 'closeProjectModal' });
            if (message.data?.name) {
              vscode.commands.executeCommand('workspai.createNestJSProject', message.data.name);
            } else {
              vscode.commands.executeCommand('workspai.createNestJSProject');
            }
            break;
          case 'createProjectWithKit':
            // New handler for kit-aware project creation from modal
            if (message.data?.name && message.data?.framework && message.data?.kit) {
              console.log('[WelcomePanel] Creating project with kit:', message.data);
              // Close modal immediately
              this._panel.webview.postMessage({ command: 'closeProjectModal' });

              // Get selected workspace path
              let workspacePath: string | undefined;
              if (WelcomePanel._workspaceExplorer) {
                const selectedWorkspace = WelcomePanel._workspaceExplorer.getSelectedWorkspace();
                workspacePath = selectedWorkspace?.path;
              }

              // Fire and forget
              (async () => {
                const { createProjectCommand } = await import('../../commands/createProject.js');
                await createProjectCommand(
                  workspacePath,
                  message.data.framework,
                  message.data.name,
                  message.data.kit
                );
              })();
            }
            break;
          case 'openSetup':
            WelcomePanel.openSetupTab(this._context);
            break;
          case 'openDashboardTab':
            WelcomePanel.openDashboardTab(this._context);
            break;
          case 'focusProjectExplorer':
            await vscode.commands.executeCommand('rapidkitProjects.focus');
            break;
          case 'requestWorkspaceProjects': {
            const workspacePath =
              (typeof message.data?.workspacePath === 'string' && message.data.workspacePath) ||
              WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path;
            if (!workspacePath) {
              break;
            }
            const projects = await WelcomePanel.listWorkspaceProjectsForWebview(workspacePath);
            this._panel.webview.postMessage({
              command: 'workspaceProjects',
              data: { workspacePath, projects },
            });
            break;
          }
          case 'syncAnalysisSelection':
            await WelcomePanel.syncAnalysisSelectionFromWebview({
              workspacePath:
                typeof message.data?.workspacePath === 'string'
                  ? message.data.workspacePath
                  : undefined,
              projectPath:
                typeof message.data?.projectPath === 'string'
                  ? message.data.projectPath
                  : undefined,
              projectName:
                typeof message.data?.projectName === 'string'
                  ? message.data.projectName
                  : undefined,
              projectType:
                typeof message.data?.projectType === 'string'
                  ? message.data.projectType
                  : undefined,
              scopeMode:
                message.data?.scopeMode === 'project' || message.data?.scopeMode === 'workspace'
                  ? message.data.scopeMode
                  : undefined,
            });
            break;
          case 'openIncidentStudioTab': {
            const selectedWorkspace = WelcomePanel._workspaceExplorer?.getSelectedWorkspace();
            const workspacePath =
              (typeof message.data?.workspacePath === 'string' && message.data.workspacePath) ||
              (typeof selectedWorkspace?.path === 'string' ? selectedWorkspace.path : undefined);

            if (!workspacePath) {
              vscode.window.showWarningMessage('Select or open a workspace first.');
              break;
            }

            await vscode.commands.executeCommand('workspai.openIncidentStudio', {
              workspace: {
                path: workspacePath,
                name:
                  (typeof message.data?.workspaceName === 'string' && message.data.workspaceName) ||
                  (typeof selectedWorkspace?.name === 'string'
                    ? selectedWorkspace.name
                    : undefined),
              },
              project:
                typeof message.data?.projectPath === 'string'
                  ? {
                      path: message.data.projectPath,
                      name:
                        typeof message.data?.projectName === 'string'
                          ? message.data.projectName
                          : undefined,
                      type:
                        typeof message.data?.projectType === 'string'
                          ? message.data.projectType
                          : undefined,
                      workspacePath,
                    }
                  : undefined,
              preferredDisplayMode: 'full',
              preferredArchitectureLensView:
                message.data?.preferredArchitectureLensView === 'tree' ||
                message.data?.preferredArchitectureLensView === 'dependency' ||
                message.data?.preferredArchitectureLensView === 'runtime'
                  ? message.data.preferredArchitectureLensView
                  : undefined,
            });
            break;
          }
          case 'runAnalyze': {
            const workspacePath =
              typeof message.data?.workspacePath === 'string' ? message.data.workspacePath : '';
            const workspaceName =
              typeof message.data?.workspaceName === 'string'
                ? message.data.workspaceName
                : 'Unknown Workspace';
            if (!workspacePath.trim()) {
              vscode.window.showWarningMessage('Workspace path is required to run analyze.');
              break;
            }
            await runWorkspaceAnalyze({ workspacePath, workspaceName });
            const { report, error } = loadAnalyzeReport({ workspacePath, workspaceName });
            this._panel.webview.postMessage({
              command: 'reportLoaded',
              data: report,
              error,
            });
            this._panel.webview.postMessage({
              command: 'reportExistsResult',
              exists: Boolean(report),
              workspacePath,
            });
            break;
          }
          case 'checkReportExists': {
            const workspacePath =
              typeof message.data?.workspacePath === 'string' ? message.data.workspacePath : '';
            const exists = workspacePath.trim() ? analyzeReportExists(workspacePath) : false;
            this._panel.webview.postMessage({
              command: 'reportExistsResult',
              exists,
              workspacePath,
            });
            break;
          }
          case 'loadReport': {
            const workspacePath =
              typeof message.data?.workspacePath === 'string' ? message.data.workspacePath : '';
            const workspaceName =
              typeof message.data?.workspaceName === 'string'
                ? message.data.workspaceName
                : 'Unknown Workspace';
            const { report, error } = loadAnalyzeReport({ workspacePath, workspaceName });
            this._panel.webview.postMessage({
              command: 'reportLoaded',
              data: report,
              error,
            });
            break;
          }
          case 'revealEvidence': {
            const evidencePath = typeof message.data?.path === 'string' ? message.data.path : '';
            const workspacePath =
              typeof message.data?.workspacePath === 'string' ? message.data.workspacePath : '';

            if (!evidencePath.trim() || !workspacePath.trim()) {
              vscode.window.showWarningMessage('Evidence path is not available.');
              break;
            }

            try {
              await openWorkspacePath({ workspacePath, path: evidencePath });
            } catch (error) {
              vscode.window.showErrorMessage(
                `Unable to open workspace path: ${error instanceof Error ? error.message : String(error)}`
              );
            }
            break;
          }
          case 'loadAIActionRegistry': {
            const workspacePath =
              typeof message.data?.workspacePath === 'string' ? message.data.workspacePath : '';
            if (!workspacePath.trim()) {
              this._panel.webview.postMessage({
                command: 'aiActionRegistryLoaded',
                data: { updatedAt: new Date().toISOString(), entries: [] },
              });
              break;
            }
            const registry = await readAIActionRegistry(workspacePath);
            this._syncDashboardLatestAIAction(registry);
            this._postDashboardAIActionRegistry(registry);
            break;
          }
          case 'loadIncidentStudioSession': {
            const workspacePath = this._resolveDashboardSessionWorkspacePath(message.data);
            if (workspacePath) {
              await postSessionToWebview(this._panel.webview, workspacePath, this._context);
            }
            break;
          }
          case 'saveIncidentStudioSession': {
            await this._handleSaveDashboardIncidentStudioSession(message.data);
            break;
          }
          case 'studioMessage': {
            await this._handleDashboardStudioMessage(message.data);
            break;
          }
          case 'runStudioAction': {
            await this._handleDashboardStudioAction(message.data);
            break;
          }
          case 'runAIActionContractCommand': {
            await this._handleDashboardAIActionContractCommand(message.data);
            break;
          }
          case 'copyText': {
            const text = typeof message.data?.text === 'string' ? message.data.text : '';
            if (text.trim()) {
              await vscode.env.clipboard.writeText(text);
              vscode.window.showInformationMessage('Copied to clipboard.');
            }
            break;
          }
          case 'debugWithAI':
            await vscode.commands.executeCommand('workspai.debugWithAI');
            break;
          case 'workspaceBrain':
            await vscode.commands.executeCommand('workspai.workspaceBrain');
            break;
          case 'aiSuggestModules': {
            await this._runOptionalMessageLane('aiSuggestModules', async () => {
              await this._handleAISuggestModulesMessage(message.data);
            });
            break;
          }
          case 'aiGetModels': {
            // Return the list of language models available in this VS Code instance
            const panel = this._panel;
            try {
              const { listAvailableModels } = await import('../../core/aiService.js');
              const models = await listAvailableModels();
              panel.webview.postMessage({ command: 'aiModelsList', data: { models } });
            } catch {
              panel.webview.postMessage({ command: 'aiModelsList', data: { models: [] } });
            }
            break;
          }
          case 'requestWorkspaiSettings': {
            await this._sendWorkspaiSettings();
            break;
          }
          case 'setPreferredModel': {
            const modelId =
              typeof message.data?.modelId === 'string' ? message.data.modelId : 'auto';
            const preferredModel = await setWorkspaiPreferredModel(modelId);
            await this._sendWorkspaiSettings(preferredModel);
            break;
          }
          case 'setThemeMode': {
            const mode = typeof message.data?.mode === 'string' ? message.data.mode : 'auto';
            await setWorkspaiThemeMode(mode);
            await this._sendWorkspaiSettings();
            break;
          }
          case 'setAIProvider': {
            const provider =
              typeof message.data?.provider === 'string' ? message.data.provider : 'vscode-lm';
            await setWorkspaiAIProvider(provider);
            await this._sendWorkspaiSettings();
            break;
          }
          case 'setCustomAIConfig': {
            await setWorkspaiCustomAIConfig({
              baseUrl: typeof message.data?.baseUrl === 'string' ? message.data.baseUrl : undefined,
              model: typeof message.data?.model === 'string' ? message.data.model : undefined,
            });
            await this._sendWorkspaiSettings();
            break;
          }
          case 'setCustomAIAPIKey': {
            const apiKey = typeof message.data?.apiKey === 'string' ? message.data.apiKey : '';
            await setCustomAIAPIKey(this._context, apiKey);
            await this._sendWorkspaiSettings();
            break;
          }
          case 'clearCustomAIAPIKey': {
            await clearCustomAIAPIKey(this._context);
            await this._sendWorkspaiSettings();
            break;
          }
          case 'testAIProvider': {
            const result = await runConfiguredAIProviderHealthCheck(this._context);
            this._panel.webview.postMessage({
              command: 'aiProviderHealthCheck',
              data: result,
            });
            await this._sendWorkspaiSettings();
            break;
          }
          case 'openWorkspaiExtensionSettings': {
            await openWorkspaiExtensionSettings();
            break;
          }
          case 'aiCancelQuery': {
            await this._runOptionalMessageLane('aiCancelQuery', () => {
              this._handleAICancelQueryMessage(message.data);
            });
            break;
          }
          case 'aiQuery': {
            await this._runOptionalMessageLane('aiQuery', async () => {
              await this._handleAIQueryMessage(message.data);
            });
            break;
          }
          case 'aiParseCreation': {
            await this._runOptionalMessageLane('aiParseCreation', async () => {
              await this._handleAIParseCreationMessage(message.data);
            });
            break;
          }
          case 'aiCreateConfirm': {
            // Execute workspace + project creation from AI plan
            const plan = message.data;
            if (!plan) {
              break;
            }
            const panel = this._panel;
            panel.webview.postMessage({ command: 'aiCreationStarted' });
            try {
              if (plan.type === 'workspace') {
                // Create workspace with the AI-resolved config
                const wsConfig = {
                  name: plan.workspaceName,
                  profile: plan.profile,
                  installMethod: plan.installMethod ?? 'auto',
                  initGit: true,
                  policyMode: 'warn',
                  dependencySharing: 'isolated',
                };
                await vscode.commands.executeCommand('workspai.createWorkspace', wsConfig);

                // Compute the expected workspace path (always created under ~/Workspai/rapidkits/<name>)
                const os = await import('os');
                const wsPath = path.join(os.homedir(), 'Workspai', 'rapidkits', plan.workspaceName);
                const wsExists = await fs.pathExists(wsPath);

                if (wsExists && plan.projectName) {
                  // Workspace was created — now create the first project inside it.
                  // Notify the UI that the workspace stage is complete BEFORE attempting
                  // project creation so the user always knows their workspace exists even
                  // if the project step fails.
                  panel.webview.postMessage({
                    command: 'aiCreationProgress',
                    data: { stage: 'workspace_done', workspacePath: wsPath },
                  });
                  try {
                    const { createProjectCommand } =
                      await import('../../commands/createProject.js');
                    await createProjectCommand(wsPath, plan.framework, plan.projectName, plan.kit);
                  } catch (projErr) {
                    // Workspace is intact — only project creation failed.
                    // Send a partial-success rather than a generic top-level error so the
                    // user knows exactly what happened and can retry from the sidebar.
                    const projErrMsg = projErr instanceof Error ? projErr.message : String(projErr);
                    panel.webview.postMessage({
                      command: 'aiCreationDone',
                      data: {
                        plan,
                        workspaceCreated: true,
                        projectError: projErrMsg,
                        workspacePath: wsPath,
                      },
                    });
                    return;
                  }
                }

                panel.webview.postMessage({
                  command: 'aiCreationDone',
                  data: { plan, workspaceCreated: wsExists },
                });
                if (wsExists) {
                  void this._beginGovernanceChainForWorkspace(
                    wsPath,
                    plan.workspaceName,
                    'ai-create'
                  );
                }
              } else {
                // Project-only creation (inside existing selected workspace).
                // Prefer the workspace path that was captured when the modal opened (passed from
                // the webview via plan.targetWorkspacePath) so we don't silently create in a
                // different workspace if the user changed the sidebar selection while the modal
                // was open.
                const typedPlan = plan as { targetWorkspacePath?: unknown };
                const workspacePath: string | undefined =
                  (typeof typedPlan.targetWorkspacePath === 'string'
                    ? typedPlan.targetWorkspacePath
                    : undefined) || WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path;
                const { createProjectCommand } = await import('../../commands/createProject.js');
                await createProjectCommand(
                  workspacePath,
                  plan.framework,
                  plan.projectName,
                  plan.kit
                );
                panel.webview.postMessage({ command: 'aiCreationDone', data: { plan } });
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              panel.webview.postMessage({ command: 'aiCreationError', data: { error: errMsg } });
              panel.webview.postMessage({
                command: 'aiCreationThinking',
                data: { thinking: false },
              });
            }
            break;
          }
          case 'refreshWorkspaces':
            CoreVersionService.getInstance().clearCache();
            this._sendRecentWorkspaces();
            break;
          case 'getUiPreferences':
            postIncidentStudioUiPreferences(
              this._panel.webview,
              this._context,
              typeof message.data?.workspacePath === 'string'
                ? message.data.workspacePath
                : WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path
            );
            break;
          case 'setUiPreference':
            if (message.data?.key) {
              await handleIncidentStudioSetUiPreference(
                this._panel.webview,
                this._context,
                String(message.data.key),
                message.data.value,
                {
                  workspacePath:
                    typeof message.data.workspacePath === 'string'
                      ? message.data.workspacePath
                      : undefined,
                  resolveWorkspacePath: () =>
                    WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path,
                }
              );
            }
            break;
          case 'cloneExample':
            if (message.data) {
              await this._cloneExample(message.data);
            }
            break;
          case 'updateExample':
            if (message.data) {
              await this._updateExample(message.data);
            }
            break;
          case 'openWorkspaceFolder':
            if (message.data?.path) {
              await vscode.commands.executeCommand('workspai.openWorkspace', {
                path: message.data.path,
              });
            }
            break;
          case 'selectWorkspace':
            if (message.data) {
              await vscode.commands.executeCommand('workspai.selectWorkspace', message.data);
              await WelcomePanel.refreshDashboardForWorkspaceSelection();
            }
            break;
          case 'removeWorkspace':
            if (message.data) {
              await vscode.commands.executeCommand('workspai.removeWorkspace', message.data);
            }
            break;
          case 'refreshModules':
            await this._refreshModulesCatalog({ forceRefresh: true });
            break;
          case 'dashboardPerf':
            console.info('[WelcomePanel] dashboard performance', message.data);
            break;
          case 'requestWorkspaceToolStatus':
            await this._sendWorkspaceToolStatus();
            break;
          case 'requestDashboardEvidence':
            await this._sendDashboardEvidence({
              workspacePath:
                typeof message.data?.workspacePath === 'string'
                  ? message.data.workspacePath
                  : undefined,
              projectPath:
                typeof message.data?.projectPath === 'string'
                  ? message.data.projectPath
                  : undefined,
              projectName:
                typeof message.data?.projectName === 'string'
                  ? message.data.projectName
                  : undefined,
              reportPath:
                typeof message.data?.reportPath === 'string' ? message.data.reportPath : undefined,
            });
            break;
          case 'clearDashboardActivity':
            await clearDashboardActivity(this._context);
            await this._sendDashboardEvidence();
            break;
          case 'dismissDashboardOpsChain':
            await clearDashboardOpsChain(this._context);
            await this._sendDashboardEvidence();
            break;
          case 'trackDashboardCommand': {
            const command =
              typeof message.data?.command === 'string' ? message.data.command.trim() : '';
            if (command.length > 0) {
              const resolved = resolveDashboardCommandActivity(command);
              await appendDashboardActivity(this._context, {
                command,
                label: resolved.label,
                scope: resolved.scope,
              });
              await this._sendDashboardEvidence();
            }
            break;
          }
          case 'requestAvailableKits':
            await this._sendAvailableKits();
            break;
          case 'requestIncidentStudioTelemetry':
            await postIncidentStudioTelemetry(this._panel.webview, {
              context: this._context,
              workspacePath:
                typeof message.data?.workspacePath === 'string'
                  ? message.data.workspacePath
                  : this._resolveTelemetryWorkspacePath(),
              projectPath:
                typeof message.data?.projectPath === 'string'
                  ? message.data.projectPath
                  : undefined,
              forceRefresh: message.data?.forceRefresh === true,
            });
            break;
          case 'requestIncidentStudioShipEvidence':
            await postIncidentStudioShipEvidence(this._panel.webview, {
              workspacePath:
                typeof message.data?.workspacePath === 'string'
                  ? message.data.workspacePath
                  : this._resolveTelemetryWorkspacePath(),
              projectPath:
                typeof message.data?.projectPath === 'string'
                  ? message.data.projectPath
                  : WelcomePanel._selectedProject?.path,
              requestId: protocolRequestId,
            });
            break;
          case 'runShipLoopStep': {
            const workspacePath =
              typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim()
                ? message.data.workspacePath.trim()
                : this._getSelectedWorkspaceInfo()?.path;
            if (!workspacePath) {
              break;
            }
            const workspaceName =
              this._getSelectedWorkspaceInfo()?.name ||
              path.basename(workspacePath) ||
              workspacePath;
            await dispatchIncidentStudioShipLoopStepMessage({
              payload: message.data,
              webview: this._panel.webview,
              context: this._context,
              workspace: { workspacePath, workspaceName },
              requestId: protocolRequestId,
            });
            break;
          }
          case 'aiChatStart':
            await this._handleAiChatStart(message.data, protocolRequestId);
            break;
          case 'aiChatSyncWorkspace':
            await this._handleAiChatSyncWorkspace(message.data, protocolRequestId);
            break;
          case 'aiChatQuery':
            await this._handleAiChatQuery(message.data, protocolRequestId);
            break;
          case 'aiChatExecuteAction':
            await this._handleAiChatExecuteAction(message.data, protocolRequestId);
            break;
          case 'aiChatApplyPatch':
            await this._handleApplyPatch(message.data, protocolRequestId);
            break;
          case 'exportIncidentReproPack':
            await this._handleExportIncidentReproPack(message.data, protocolRequestId);
            break;
          case 'exportSandboxSimulationEvidence':
            await this._handleExportSandboxSimulationEvidence(message.data, protocolRequestId);
            break;
          case 'exportReleaseReadinessCommander':
            await this._handleExportReleaseReadinessCommander(message.data, protocolRequestId);
            break;
          case 'importIncidentReproPack':
            await this._handleImportIncidentReproPack(protocolRequestId);
            break;
          case 'incidentPredictionAccepted': {
            const conversationId =
              typeof message.data?.conversationId === 'string'
                ? message.data.conversationId
                : undefined;
            const conv = conversationId
              ? this._chatBrainConversations.get(conversationId)
              : undefined;
            const explicitWorkspacePath =
              typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim()
                ? message.data.workspacePath.trim()
                : undefined;

            this._trackStudioEvent(
              'workspai.studio.prediction_accepted',
              explicitWorkspacePath || conv?.workspacePath,
              {
                conversationId,
                warningId:
                  typeof message.data?.warningId === 'string' ? message.data.warningId : undefined,
                predictionKey:
                  typeof message.data?.predictionKey === 'string'
                    ? message.data.predictionKey
                    : undefined,
                framework: conv?.framework ?? 'unknown',
              }
            );
            break;
          }
          case 'aiChatFeedback':
            await this._handleAiChatFeedback(message.data, protocolRequestId);
            break;
          case 'aiChatClose': {
            const conversationId = message.data?.conversationId;
            if (typeof conversationId === 'string') {
              const conv = this._chatBrainConversations.get(conversationId);
              if (conv) {
                const resumeSnapshot = buildIncidentResumeSnapshot(conv);
                if (resumeSnapshot) {
                  this._incidentResumeByWorkspace.set(resumeSnapshot.workspacePath, resumeSnapshot);
                }

                const lifecycleMetrics = buildIncidentLifecycleMetrics(conv, Date.now());

                if (lifecycleMetrics.resolved) {
                  // ── Analytics: incident_loop_completed ───────────────────
                  this._trackStudioEvent('workspai.studio.loop_completed', conv.workspacePath, {
                    framework: conv.framework ?? 'unknown',
                    durationMs: lifecycleMetrics.durationMs,
                    queryCount: lifecycleMetrics.queryCount,
                    actionCount: lifecycleMetrics.actionCount,
                    projectPath: conv.projectPath,
                    timeToVerifyMs: lifecycleMetrics.timeToVerifyMs,
                  });
                } else if (lifecycleMetrics.hasExchange) {
                  // ── Analytics: incident_abandoned ─────────────────────────
                  this._trackStudioEvent('workspai.studio.abandoned', conv.workspacePath, {
                    framework: conv.framework ?? 'unknown',
                    durationMs: lifecycleMetrics.durationMs,
                    queryCount: lifecycleMetrics.queryCount,
                    actionCount: lifecycleMetrics.actionCount,
                    projectPath: conv.projectPath,
                  });
                }

                this._chatBrainConversations.delete(conversationId);
              }
            }
            break;
          }
          case 'installModule': {
            if (message.data) {
              // Construct full module object like stable welcomePanel does
              const moduleData = message.data;
              const moduleObj = {
                id: moduleData.id,
                displayName: moduleData.display_name || moduleData.name,
                description: moduleData.description || '',
                category: moduleData.category || 'unknown',
                status: moduleData.status || 'stable',
                tags: moduleData.tags || [],
                dependencies: moduleData.dependencies || [],
                installed: false,
                slug: moduleData.slug || `unknown/${moduleData.id}`,
              };
              await vscode.commands.executeCommand('workspai.addModule', moduleObj);
            }
            break;
          }
          case 'showModuleDetails':
            if (message.data) {
              const moduleData = this._resolveModuleDetailsInput(message.data);
              if (moduleData) {
                await this._showModuleDetails(moduleData);
              } else {
                console.error('Module not found:', message.data);
              }
            }
            break;
          case 'openDocs':
            await vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.com/docs'));
            break;
          case 'openGitHub':
            await vscode.env.openExternal(vscode.Uri.parse('https://github.com/rapidkit/rapidkit'));
            break;
          case 'openMarketplace':
            await vscode.env.openExternal(
              vscode.Uri.parse(
                'https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit'
              )
            );
            break;
          case 'openUrl':
            if (message.data?.url) {
              await vscode.env.openExternal(vscode.Uri.parse(message.data.url));
            }
            break;
          case 'upgradeCore':
            if (message.data?.path) {
              const workspacePath = message.data.path;
              const targetVersion = message.data.version;

              // Detect if workspace has venv
              const venvPath = path.join(workspacePath, '.venv');
              const hasVenv = await fs.pathExists(venvPath);

              runCommandsInTerminal({
                name: `Upgrade RapidKit Core`,
                cwd: workspacePath,
                commands: [hasVenv ? 'poetry update rapidkit-core' : 'pipx upgrade rapidkit-core'],
              });

              vscode.window.showInformationMessage(
                `Upgrading RapidKit Core${targetVersion ? ` to v${targetVersion}` : ''}...`,
                'OK'
              );
            }
            break;

          case 'checkWorkspaceHealth':
            console.log('[WelcomePanel] Check Workspace Health requested for:', message.data?.path);
            await this._executeDashboardContractCommand('checkWorkspaceHealth', message.data);
            break;

          case 'exportWorkspace':
            console.log('[WelcomePanel] Export Workspace requested for:', message.data?.path);
            await this._executeDashboardContractCommand('exportWorkspace', message.data);
            break;
          case 'importWorkspace':
            await this._executeDashboardContractCommand('importWorkspace', message.data);
            break;
          case 'importProject':
            await this._executeDashboardContractCommand('importProject', message.data);
            break;
          case 'quickSwitchWorkspace':
            await this._executeDashboardContractCommand('quickSwitchWorkspace', message.data);
            break;
          case 'workspaceTerminal':
            await this._executeDashboardContractCommand('workspaceTerminal', message.data);
            break;
          case 'workspaceBootstrap':
            await this._executeDashboardContractCommand('workspaceBootstrap', message.data);
            break;
          case 'workspaceSetup':
            await this._executeDashboardContractCommand('workspaceSetup', message.data);
            break;
          case 'workspaceSync':
            await this._executeDashboardContractCommand('workspaceSync', message.data);
            break;
          case 'workspaceFoundationEnsure':
            await this._executeDashboardContractCommand('workspaceFoundationEnsure', message.data);
            break;
          case 'workspaceReadiness':
            await this._executeDashboardContractCommand('workspaceReadiness', message.data);
            break;
          case 'workspacePipeline':
            await this._executeDashboardContractCommand('workspacePipeline', message.data);
            break;
          case 'mirrorStatus':
            await this._executeDashboardContractCommand('mirrorStatus', message.data);
            break;
          case 'mirrorSync':
            await this._executeDashboardContractCommand('mirrorSync', message.data);
            break;
          case 'cacheStatus':
            await this._executeDashboardContractCommand('cacheStatus', message.data);
            break;
          case 'workspaceInfra':
            await this._executeDashboardContractCommand('workspaceInfra', message.data);
            break;
          case 'workspaceRunInit':
            await this._executeDashboardContractCommand('workspaceRunInit', message.data);
            break;
          case 'workspaceRunTest':
            await this._executeDashboardContractCommand('workspaceRunTest', message.data);
            break;
          case 'workspaceRunBuild':
            await this._executeDashboardContractCommand('workspaceRunBuild', message.data);
            break;
          case 'workspaceRunStart':
            await this._executeDashboardContractCommand('workspaceRunStart', message.data);
            break;
          case 'workspaceAnalyze':
            await this._executeDashboardContractCommand('workspaceAnalyze', message.data);
            break;
          case 'workspaceAutopilotRelease':
            await this._executeDashboardContractCommand('workspaceAutopilotRelease', message.data);
            break;
          case 'workspaceSnapshot':
            await this._executeDashboardContractCommand('workspaceSnapshot', message.data);
            break;
          case 'workspaceSnapshotCreate':
            await this._executeDashboardContractCommand('workspaceSnapshotCreate', message.data);
            break;
          case 'workspaceSnapshotList':
            await this._executeDashboardContractCommand('workspaceSnapshotList', message.data);
            break;
          case 'workspaceSnapshotInspect':
            await this._executeDashboardContractCommand('workspaceSnapshotInspect', message.data);
            break;
          case 'workspaceSnapshotRestore':
            await this._executeDashboardContractCommand('workspaceSnapshotRestore', message.data);
            break;
          case 'workspaceContract':
            await vscode.commands.executeCommand('workspai.workspaceContract');
            break;
          case 'workspaceContractInit':
            await this._executeDashboardContractCommand('workspaceContractInit', message.data);
            break;
          case 'workspaceContractInspect':
            await this._executeDashboardContractCommand('workspaceContractInspect', message.data);
            break;
          case 'workspaceContractGraph':
            await this._executeDashboardContractCommand('workspaceContractGraph', message.data);
            break;
          case 'workspaceContractVerify':
            await this._executeDashboardContractCommand('workspaceContractVerify', message.data);
            break;
          case 'workspaceArchive':
            await this._executeDashboardContractCommand('workspaceArchive', message.data);
            break;
          case 'workspaceArchiveInspect':
            await this._executeDashboardContractCommand('workspaceArchiveInspect', message.data);
            break;
          case 'workspaceArchiveDoctor':
            await this._executeDashboardContractCommand('workspaceArchiveDoctor', message.data);
            break;
          case 'workspaceArchiveVerify':
            await this._executeDashboardContractCommand('workspaceArchiveVerify', message.data);
            break;
          case 'workspaceShare':
            await this._executeDashboardContractCommand('workspaceShare', message.data);
            break;
          case 'workspaceImportShare':
            await vscode.commands.executeCommand('workspai.importWorkspaceShareBundle');
            break;
          case 'workspacePolicyShow':
            await this._executeDashboardContractCommand('workspacePolicyShow', message.data);
            break;
          case 'aiForWorkspace':
            WelcomePanel.showAIModal(WelcomePanel._extensionContext!, {
              type: 'workspace',
              name: message.data?.workspaceName || 'Workspace',
              path: message.data?.workspacePath,
            });
            break;
          case 'aiForModule':
            WelcomePanel.showAIModal(WelcomePanel._extensionContext!, {
              type: 'module',
              name: message.data?.moduleName || 'Module',
              moduleSlug: message.data?.moduleSlug,
            });
            break;
          case 'aiFixPreviewLite':
            await vscode.commands.executeCommand('workspai.aiFixPreviewLite', {
              source: 'dashboard',
              trigger: 'card_click',
            });
            break;
          case 'aiChangeImpactLite':
            await vscode.commands.executeCommand('workspai.aiChangeImpactLite', {
              source: 'dashboard',
              trigger: 'card_click',
            });
            break;
          case 'aiTerminalBridge':
            await vscode.commands.executeCommand('workspai.aiTerminalBridge', {
              source: 'dashboard',
              trigger: 'card_click',
            });
            break;
          case 'aiWorkspaceMemoryWizard':
            await vscode.commands.executeCommand('workspai.aiWorkspaceMemoryWizard', {
              source: 'dashboard',
              trigger: 'incident_studio',
            });
            break;
          case 'runDoctorChecks':
            await this._runOptionalMessageLane('runDoctorChecks', async () => {
              await this._handleRunDoctorMessage(message.data, 'check');
            });
            break;
          case 'runDoctorFix':
            await this._runOptionalMessageLane('runDoctorFix', async () => {
              await this._handleRunDoctorMessage(message.data, 'fix');
            });
            break;
          case 'viewComplianceReport':
            {
              const explicitWorkspacePath =
                typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim()
                  ? message.data.workspacePath.trim()
                  : undefined;
              const selectedWorkspace = this._getSelectedWorkspaceInfo();
              const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
              const workspaceName =
                (typeof message.data?.workspaceName === 'string' &&
                  message.data.workspaceName.trim()) ||
                selectedWorkspace?.name ||
                (workspacePath ? path.basename(workspacePath) : undefined);

              if (!workspacePath) {
                vscode.window.showWarningMessage('Select a workspace first.');
                break;
              }

              await vscode.commands.executeCommand('workspai.checkWorkspaceHealth', {
                workspace: {
                  path: workspacePath,
                  name: workspaceName,
                },
                preferredAction: 'compliance',
              });

              this._trackStudioEvent('workspai.studio.action_executed', workspacePath, {
                actionType: 'view-compliance-report',
                workspaceName: workspaceName || path.basename(workspacePath),
              });
            }
            break;
          case 'viewProjectDoctorReport':
            await this._runOptionalMessageLane('viewProjectDoctorReport', async () => {
              await this._handleViewProjectDoctorReportMessage(message.data);
            });
            break;
          case 'openIncidentNavigatorTarget':
            await this._runOptionalMessageLane('openIncidentNavigatorTarget', async () => {
              await this._handleOpenIncidentNavigatorTargetMessage(message.data);
            });
            break;
          case 'runIncidentInlineCommand':
            await this._runOptionalMessageLane('runIncidentInlineCommand', async () => {
              await dispatchIncidentStudioInlineCommand({
                payload: message.data,
                webview: this._panel.webview,
                requestId: protocolRequestId,
                resolveWorkspacePath: () => {
                  const explicitWorkspacePath =
                    typeof message.data?.workspacePath === 'string' &&
                    message.data.workspacePath.trim()
                      ? message.data.workspacePath.trim()
                      : undefined;
                  return explicitWorkspacePath || this._getSelectedWorkspaceInfo()?.path;
                },
                resolveProjectPath: () => WelcomePanel._selectedProject?.path,
                resolveTelemetry: (workspacePath) =>
                  resolveIncidentStudioTelemetry({
                    context: this._context,
                    workspacePath,
                  }),
                enrichTelemetry: (workspacePath) => ({
                  source: 'incident_studio',
                  ctaVariant: getIncidentPrimaryCtaExperimentVariant(workspacePath || 'global'),
                }),
                onMissingCommand: () => {
                  vscode.window.showWarningMessage('No command provided to run.');
                },
                refreshStabilizationLoop: async () => {
                  const workspacePath =
                    typeof message.data?.workspacePath === 'string' &&
                    message.data.workspacePath.trim()
                      ? message.data.workspacePath.trim()
                      : this._getSelectedWorkspaceInfo()?.path;
                  if (!workspacePath) {
                    return;
                  }
                  await refreshIncidentStudioShipLoopSurfaces({
                    webview: this._panel.webview,
                    context: this._context,
                    workspacePath,
                    projectPath: WelcomePanel._selectedProject?.path,
                  });
                },
              });
            });
            break;
          case 'projectTerminal':
            await this._executeDashboardContractCommand('projectTerminal', message.data);
            break;
          case 'projectInit':
            await this._executeDashboardContractCommand('projectInit', message.data);
            break;
          case 'projectDev':
            await this._executeDashboardContractCommand('projectDev', message.data);
            break;
          case 'projectStop':
            await this._executeDashboardContractCommand('projectStop', message.data);
            break;
          case 'projectTest':
            await this._executeDashboardContractCommand('projectTest', message.data);
            break;
          case 'projectDoctor':
            await this._executeDashboardContractCommand('projectDoctor', message.data);
            break;
          case 'projectArchitecture':
            await this._executeDashboardContractCommand('projectArchitecture', message.data);
            break;
          case 'projectIncident':
            await this._executeDashboardContractCommand('projectIncident', message.data);
            break;
          case 'projectAI':
            await this._executeDashboardContractCommand('projectAI', message.data);
            break;
          case 'projectRelease':
            await this._executeDashboardContractCommand('projectRelease', message.data);
            break;
          case 'projectImpact':
            await this._executeDashboardContractCommand('projectImpact', message.data);
            break;
          case 'projectBrowser':
            await this._executeDashboardContractCommand('projectBrowser', message.data);
            break;
          case 'projectBuild':
            await this._executeDashboardContractCommand('projectBuild', message.data);
            break;
          case 'projectLint':
            await this._executeDashboardContractCommand('projectLint', message.data);
            break;
          case 'projectFormat':
            await this._executeDashboardContractCommand('projectFormat', message.data);
            break;
          case 'moduleDiff':
          case 'moduleRollback':
          case 'moduleUninstall':
          case 'moduleUpgrade':
          case 'moduleCheckpoint': {
            await this._executeDashboardContractCommand(message.command, message.data);
            break;
          }
        }
      },
      null,
      this._disposables
    );

    // Clean up when panel is closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _trackAIQueryRequestStart(requestId: number): void {
    this._inFlightAIQueryRequestIds.add(requestId);
  }

  private _trackAIQueryRequestComplete(requestId: number): void {
    this._inFlightAIQueryRequestIds.delete(requestId);
    if (!this._completedAIQueryRequestIds.includes(requestId)) {
      this._completedAIQueryRequestIds.push(requestId);
      if (this._completedAIQueryRequestIds.length > 240) {
        this._completedAIQueryRequestIds.splice(0, this._completedAIQueryRequestIds.length - 240);
      }
    }
  }

  private async _handleDashboardStudioAction(data: unknown): Promise<void> {
    const actionId =
      typeof data === 'object' && data !== null && 'actionId' in data
        ? String((data as any).actionId)
        : '';
    const workspacePath =
      typeof data === 'object' && data !== null && 'workspacePath' in data
        ? String((data as any).workspacePath || '')
        : '';
    const workspaceName =
      typeof data === 'object' && data !== null && 'workspaceName' in data
        ? String((data as any).workspaceName || 'Current Workspace')
        : 'Current Workspace';

    if (!isStudioActionId(actionId)) {
      vscode.window.showWarningMessage(
        `Unknown Studio action blocked: ${actionId || 'missing action'}`
      );
      return;
    }
    if (!workspacePath.trim()) {
      vscode.window.showWarningMessage('Workspace path is required to run Studio action.');
      return;
    }
    if (this._runningStudioActionId) {
      const detail = `Another Studio action is already running: ${this._runningStudioActionId}`;
      this._postDashboardStudioActionStatus(actionId, 'failed', detail);
      vscode.window.showWarningMessage(detail);
      return;
    }
    if (this._runningDashboardAIActionOperation) {
      const detail = `An AI action operation is already running: ${this._runningDashboardAIActionOperation}`;
      this._postDashboardStudioActionStatus(actionId, 'failed', detail);
      vscode.window.showWarningMessage(detail);
      return;
    }
    const studioActionId = actionId as StudioActionId;
    const actionDefinition = getStudioActionRegistryEntryById(studioActionId);

    const workspace = { workspacePath, workspaceName };
    const seed = {
      source: 'incident-studio-vnext-dashboard',
      trigger: actionId,
      action: {
        title: actionDefinition.title,
        scope: actionDefinition.scope,
        stability: actionDefinition.stability,
        summary: actionDefinition.summary,
      },
      workspace: { path: workspacePath, name: workspaceName },
    };

    try {
      this._runningStudioActionId = actionId;
      this._postDashboardStudioActionStatus(actionId, 'started');
      const lensSeed =
        actionDefinition.actionType === 'fix' || actionDefinition.actionType === 'impact'
          ? {
              ...seed,
              seed:
                actionDefinition.actionType === 'fix'
                  ? 'Use the current workspace evidence and selected editor context to produce a fix lens. Do not apply changes.'
                  : 'Use the current workspace evidence and selected editor context to produce an impact lens. Do not apply changes.',
            }
          : seed;
      const { refreshedReport, actionResult } = await executeStudioActionById(
        this._context,
        workspace,
        studioActionId,
        lensSeed
      );

      this._panel.webview.postMessage({
        command: 'reportLoaded',
        data: refreshedReport,
        error: refreshedReport ? null : 'Report file not found',
      });
      this._panel.webview.postMessage({
        command: 'reportExistsResult',
        exists: Boolean(refreshedReport),
        workspacePath,
      });
      if (shouldRefreshStabilizationLoopAfterStudioAction(actionId)) {
        await refreshIncidentStudioShipLoopSurfaces({
          webview: this._panel.webview,
          context: this._context,
          workspacePath,
          projectPath: WelcomePanel._selectedProject?.path,
        });
      }
      const registry = await readAIActionRegistry(workspacePath);
      this._postDashboardAIActionRegistry(registry);
      this._postDashboardStudioActionStatus(
        actionId,
        actionResult?.gatePassed === false ? 'failed' : 'completed',
        actionResult?.summary,
        this._buildDashboardStudioActionResult({
          actionId,
          workspacePath,
          report: refreshedReport,
          registry,
          fallbackSummary: actionResult?.summary,
          status: actionResult?.gatePassed === false ? 'failed' : 'completed',
          gatePassed: actionResult?.gatePassed,
          source: 'studio-action',
          executionTranscript: actionResult?.executionTranscript,
        })
      );
    } catch (error) {
      const { report } = loadAnalyzeReport(workspace);
      this._postDashboardStudioActionStatus(
        actionId,
        'failed',
        error instanceof Error ? error.message : String(error),
        this._buildDashboardStudioActionResult({
          actionId,
          workspacePath,
          report,
          fallbackSummary: error instanceof Error ? error.message : String(error),
          status: 'failed',
          gatePassed: false,
          source: 'studio-action',
        })
      );
      vscode.window.showErrorMessage(
        `Studio action failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this._runningStudioActionId = null;
    }
  }

  private _postDashboardAIActionRegistry(
    registry: Awaited<ReturnType<typeof readAIActionRegistry>>
  ): void {
    this._panel.webview.postMessage({
      command: 'aiActionRegistryLoaded',
      data: formatAIActionRegistryWebviewPayload(registry),
    });
  }

  private _buildDashboardStudioActionResult(params: {
    actionId: string;
    workspacePath: string;
    report?: AnalyzeReport | null;
    reportError?: string | null;
    registry?: Awaited<ReturnType<typeof readAIActionRegistry>> | null;
    fallbackSummary?: string;
    status?: 'started' | 'completed' | 'failed';
    gatePassed?: boolean;
    source?: 'studio-action' | 'ai-action' | 'ship-loop' | 'inline-command';
    executionTranscript?: StudioActionExecutionResult['executionTranscript'];
  }): Record<string, unknown> {
    return buildStudioAIActionResult({
      actionId: params.actionId,
      workspacePath: params.workspacePath,
      report: params.report,
      reportError: params.reportError,
      registry: params.registry,
      fallbackSummary: params.fallbackSummary,
      status: params.status,
      gatePassed: params.gatePassed,
      source: params.source,
      executionTranscript: params.executionTranscript,
    });
  }

  private _postDashboardStudioActionStatus(
    actionId: string,
    status: 'started' | 'completed' | 'failed',
    detail?: string,
    result?: Record<string, unknown>
  ): void {
    const actionDefinition = isStudioActionId(actionId)
      ? getStudioActionRegistryEntryById(actionId)
      : null;
    const label = actionDefinition?.title || actionId.replace(/-/g, ' ');
    const headline =
      status === 'started'
        ? `Studio action started: ${label}`
        : status === 'completed'
          ? `Studio action completed: ${label}`
          : `Studio action failed: ${label}`;
    this._panel.webview.postMessage({
      command: 'studioAssistantMessage',
      data: {
        role: 'assistant',
        content: [headline, detail].filter(Boolean).join('\n\n'),
        provider: 'studio-action-bridge',
      },
    });
    this._panel.webview.postMessage({
      command: 'studioActionStatus',
      data: {
        actionId,
        actionTitle: actionDefinition?.title,
        actionSummary: actionDefinition?.summary,
        status,
        detail,
        result,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  private async _handleDashboardStudioMessage(data: unknown): Promise<void> {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as any).message)
        : '';
    const workspacePath =
      typeof data === 'object' && data !== null && 'workspacePath' in data
        ? String((data as any).workspacePath || '')
        : '';
    const workspaceName =
      typeof data === 'object' && data !== null && 'workspaceName' in data
        ? String((data as any).workspaceName || 'Current Workspace')
        : 'Current Workspace';

    if (!message.trim()) {
      return;
    }
    if (!workspacePath.trim()) {
      vscode.window.showWarningMessage('Workspace path is required for Studio AI.');
      return;
    }

    try {
      const status = await getAIProviderStatus(this._context);
      if (!status.ready) {
        this._panel.webview.postMessage({
          command: 'studioAssistantMessage',
          data: {
            role: 'assistant',
            content: `AI provider is not ready: ${status.reason || 'provider setup required'}. Configure it from Workspai Settings, or run deterministic Studio actions first.`,
            provider: status.provider,
          },
        });
        return;
      }

      const { report } = loadAnalyzeReport({ workspacePath, workspaceName });
      const evidenceContext = await buildIncidentStudioEvidenceContext({
        workspacePath,
        workspaceName,
        analyzeReport: report,
      });
      const { text, provider } = await askConfiguredAIProvider(this._context, [
        {
          role: 'user',
          content: [
            'You are Workspai Incident Studio. Be concise, evidence-aware, and never claim changes were applied unless a tool result proves it.',
            'When you propose a fix, impact review, or verification action, append one fenced JSON block matching schemaVersion "workspai.ai-action.v1". Keep paths workspace-relative. Set requiresApproval to true. Fix actions must include verificationCommands and rollbackPlan.',
            `Workspace: ${workspaceName} (${workspacePath})`,
            renderIncidentStudioEvidencePrompt(evidenceContext),
            `User request:\n${message}`,
          ].join('\n\n'),
        },
      ]);
      const persisted = await publishStudioAIActionContractFromText({
        workspacePath,
        text,
        provider,
        postMessage: (command, payload) => {
          this._panel.webview.postMessage({ command, data: payload });
        },
      });
      this._latestDashboardAIActionContract = persisted.activeContract;
      this._latestDashboardAIActionId = persisted.activeActionId;

      this._panel.webview.postMessage({
        command: 'studioAssistantMessage',
        data: {
          role: 'assistant',
          content: text,
          provider,
        },
      });
    } catch (error) {
      this._panel.webview.postMessage({
        command: 'studioAssistantMessage',
        data: {
          role: 'assistant',
          content: `AI provider failed: ${error instanceof Error ? error.message : String(error)}`,
          provider: 'ai-provider',
        },
      });
    }
  }

  private async _handleDashboardAIActionContractCommand(data: unknown): Promise<void> {
    const operation =
      typeof data === 'object' && data !== null && 'operation' in data
        ? String((data as any).operation)
        : '';
    const workspacePath =
      typeof data === 'object' && data !== null && 'workspacePath' in data
        ? String((data as any).workspacePath || '')
        : '';
    const workspaceName =
      typeof data === 'object' && data !== null && 'workspaceName' in data
        ? String((data as any).workspaceName || 'Current Workspace')
        : 'Current Workspace';
    const requestedActionId =
      typeof data === 'object' && data !== null && 'actionId' in data
        ? String((data as any).actionId || '')
        : '';

    if (operation !== 'apply' && operation !== 'verify' && operation !== 'rollback') {
      vscode.window.showWarningMessage(`Unknown AI action operation: ${operation || 'missing'}`);
      return;
    }
    if (!workspacePath.trim()) {
      vscode.window.showWarningMessage('Workspace path is required to run AI action.');
      return;
    }

    await executeGovernedAIActionOperation(
      this._context,
      {
        operation: operation as AIActionOperation,
        requestedActionId,
        workspacePath,
        workspaceName,
        activeContract: this._latestDashboardAIActionContract,
        activeActionId: this._latestDashboardAIActionId,
      },
      {
        postActionStatus: (actionId, status, detail, result) =>
          this._postDashboardStudioActionStatus(actionId, status, detail, result),
        postAssistantMessage: (content, provider) => {
          this._panel.webview.postMessage({
            command: 'studioAssistantMessage',
            data: { role: 'assistant', content, provider },
          });
        },
        postRegistry: (registry) => {
          this._syncDashboardLatestAIAction(registry);
          this._postDashboardAIActionRegistry(registry);
        },
        refreshReports: () => {
          const { report, error } = loadAnalyzeReport({ workspacePath, workspaceName });
          this._panel.webview.postMessage({ command: 'reportLoaded', data: report, error });
        },
        assertNotRunning: () => {
          if (this._runningStudioActionId) {
            return {
              ok: false,
              reason: `A Studio action is already running: ${this._runningStudioActionId}`,
            };
          }
          if (this._runningDashboardAIActionOperation) {
            return {
              ok: false,
              reason: `Another AI action operation is already running: ${this._runningDashboardAIActionOperation}`,
            };
          }
          return { ok: true };
        },
        setRunning: (nextOperation) => {
          this._runningDashboardAIActionOperation = nextOperation;
        },
        refreshStabilizationLoop: () =>
          refreshIncidentStudioShipLoopSurfaces({
            webview: this._panel.webview,
            context: this._context,
            workspacePath,
            projectPath: WelcomePanel._selectedProject?.path,
          }),
      }
    );
  }

  private _syncDashboardLatestAIAction(
    registry: Awaited<ReturnType<typeof readAIActionRegistry>>
  ): void {
    const latest = getLatestRunnableAIAction(registry);
    this._latestDashboardAIActionContract = latest?.contract || null;
    this._latestDashboardAIActionId = latest?.id || null;
    if (latest) {
      this._panel.webview.postMessage({
        command: 'studioActionContract',
        data: {
          actionId: latest.id,
          contract: latest.contract,
          validation: latest.validation,
          provider: latest.provider,
          rawJson: latest.rawJson,
        },
      });
    }
  }

  private _postAIStreamDoneOnce(requestId?: number, error?: string): void {
    if (typeof requestId === 'number') {
      if (this._completedAIQueryRequestIds.includes(requestId)) {
        return;
      }
      this._trackAIQueryRequestComplete(requestId);
      this._panel.webview.postMessage({
        command: 'aiStreamDone',
        data: error ? { error, requestId } : { requestId },
      });
      return;
    }

    this._panel.webview.postMessage({ command: 'aiStreamDone' });
  }

  private async _runOptionalMessageLane(
    laneName: string,
    lane: () => Promise<void> | void
  ): Promise<void> {
    try {
      await lane();
    } catch (error) {
      console.warn(`[WelcomePanel] Message lane failed (${laneName})`, error);
    }
  }

  private async _handleAISuggestModulesMessage(messageData: unknown): Promise<void> {
    const payload = asRecord(messageData);
    const fw = typeof payload?.framework === 'string' ? payload.framework : undefined;
    const pn = typeof payload?.projectName === 'string' ? payload.projectName : undefined;
    if (!fw) {
      return;
    }

    const panel = this._panel;
    if (fw !== 'fastapi' && fw !== 'nestjs') {
      panel.webview.postMessage({
        command: 'aiModuleSuggestions',
        data: {
          loading: false,
          suggestions: [],
          error: 'AI module suggestions are available only for FastAPI and NestJS projects.',
        },
      });
      return;
    }

    try {
      const { selectModelWithPreference } = await import('../../core/aiService.js');
      const { model, modelId } = await selectModelWithPreference();
      panel.webview.postMessage({
        command: 'aiModuleSuggestions',
        data: { loading: true, modelId },
      });

      if (!this._modulesCatalog.length) {
        await this._refreshModulesCatalog();
      }
      const moduleList = this._modulesCatalog.length
        ? this._modulesCatalog
            .map((m) => {
              const tags =
                m.tags && m.tags.length ? ` | tags: ${m.tags.slice(0, 4).join(', ')}` : '';
              return `- ${m.slug}: ${m.description || m.name} | category: ${m.category} | status: ${m.status}${tags}`;
            })
            .join('\n')
        : '(module list not available)';

      const prompt = `You are a Workspai assistant. Recommend the top 5 most useful Workspai modules for a ${fw} project named "${pn || 'my-project'}".
Available modules:
${moduleList}

Reply ONLY with a JSON array of objects like: [{"slug": "free/auth/core", "reason": "short reason"}]
Use ONLY slugs from the list above. Prefer modules that fit the framework and avoid deprecated or invented slugs.
No markdown, no explanation outside the JSON.`;

      const requestTokenSource = new vscode.CancellationTokenSource();
      const requestTimeoutMs = getAIModuleSuggestTimeoutMs();
      const timeoutHandle = setTimeout(() => {
        requestTokenSource.cancel();
      }, requestTimeoutMs);

      let parsed: unknown = [];
      try {
        const response = await model.sendRequest(
          [vscode.LanguageModelChatMessage.User(prompt)],
          {},
          requestTokenSource.token
        );

        const raw = await readLanguageModelResponseText(response, requestTokenSource.token);

        if (requestTokenSource.token.isCancellationRequested) {
          throw new Error(`AI module suggestion timed out after ${requestTimeoutMs}ms.`);
        }

        const rawJsonArray = extractFirstJsonArray(raw);
        if (rawJsonArray) {
          try {
            parsed = JSON.parse(rawJsonArray);
          } catch {
            parsed = [];
          }
        }
      } finally {
        clearTimeout(timeoutHandle);
        requestTokenSource.dispose();
      }

      const allowedSlugs = new Set(this._modulesCatalog.map((m) => m.slug));
      const suggestions = Array.isArray(parsed)
        ? parsed
            .filter(
              (item): item is { slug: string; reason?: string } =>
                item && typeof item === 'object' && typeof item.slug === 'string'
            )
            .map((item) => ({
              slug: item.slug.trim(),
              reason:
                typeof item.reason === 'string' && item.reason.trim()
                  ? item.reason.trim().slice(0, 180)
                  : 'Recommended for this project',
            }))
            .filter((item) => allowedSlugs.has(item.slug))
            .slice(0, 5)
        : [];
      panel.webview.postMessage({
        command: 'aiModuleSuggestions',
        data: { loading: false, modelId, suggestions },
      });
    } catch (err: unknown) {
      panel.webview.postMessage({
        command: 'aiModuleSuggestions',
        data: { loading: false, error: safeErrorMessage(err) || 'AI unavailable' },
      });
    }
  }

  private _handleAICancelQueryMessage(messageData: unknown): void {
    const payload = asRecord(messageData);
    const cancelRequestId = typeof payload?.requestId === 'number' ? payload.requestId : undefined;
    if (
      typeof cancelRequestId === 'number' &&
      typeof this._activeAIQueryRequestId === 'number' &&
      cancelRequestId !== this._activeAIQueryRequestId
    ) {
      return;
    }
    this._aiQueryTokenSource?.cancel();
    this._aiQueryTokenSource?.dispose();
    this._aiQueryTokenSource = undefined;
    const doneRequestId =
      typeof cancelRequestId === 'number' ? cancelRequestId : this._activeAIQueryRequestId;
    this._postAIStreamDoneOnce(doneRequestId);
    this._activeAIQueryRequestId = undefined;
  }

  private async _handleAIParseCreationMessage(messageData: unknown): Promise<void> {
    const payload = asRecord(messageData);
    const creationPrompt = typeof payload?.prompt === 'string' ? payload.prompt : undefined;
    const creationMode = payload?.mode === 'project' ? 'project' : 'workspace';
    const creationFw = typeof payload?.framework === 'string' ? payload.framework : undefined;

    if (!creationPrompt || creationPrompt === '__reset__') {
      this._panel.webview.postMessage({ command: 'aiCreationReset' });
      return;
    }

    const panel = this._panel;
    panel.webview.postMessage({ command: 'aiCreationThinking', data: { thinking: true } });
    try {
      const { parseCreationIntent } = await import('../../core/aiService.js');
      let workspacePath: string | undefined;
      if (WelcomePanel._selectedProject) {
        workspacePath =
          WelcomePanel._selectedProject.workspacePath ||
          path.dirname(WelcomePanel._selectedProject.path);
      } else if (WelcomePanel._workspaceExplorer) {
        workspacePath = WelcomePanel._workspaceExplorer.getSelectedWorkspace()?.path;
      } else if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
      ) {
        workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }
      const { plan, modelId, planSource } = await parseCreationIntent(
        creationPrompt,
        creationMode,
        creationFw,
        workspacePath,
        undefined,
        async (messages, token) => {
          const response = await askConfiguredAIProvider(this._context, messages, token);
          return {
            text: response.text,
            modelId: response.provider,
          };
        }
      );
      panel.webview.postMessage({ command: 'aiCreationPlan', data: { plan, modelId, planSource } });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ command: 'aiCreationError', data: { error: errMsg } });
    } finally {
      panel.webview.postMessage({
        command: 'aiCreationThinking',
        data: { thinking: false },
      });
    }
  }

  private async _handleAIQueryMessage(messageData: unknown): Promise<void> {
    const payload = asRecord(messageData);
    const mode = payload?.mode;
    const question = payload?.question;
    const aiCtx = payload?.context;
    const requestId = payload?.requestId;
    const history = payload?.history;
    const requestedModelIdRaw = payload?.modelId;

    const requestedModelId = normalizeRequestedModelId(requestedModelIdRaw);
    const panel = this._panel;
    const queryRequestId = typeof requestId === 'number' ? requestId : Date.now();
    this._trackAIQueryRequestStart(queryRequestId);
    const normalizedMode = mode === 'debug' ? 'debug' : 'ask';
    const normalizedQuestion = typeof question === 'string' ? question : '';
    const aiContext =
      aiCtx && typeof aiCtx === 'object'
        ? (aiCtx as import('../../core/aiService').AIModalContext)
        : undefined;
    const conversationHistory = Array.isArray(history)
      ? history.filter(isConversationMessageEntry).slice(-8)
      : [];

    const canTrackTelemetry =
      typeof (vscode.window as { createOutputChannel?: unknown }).createOutputChannel ===
      'function';

    const trackAIModalOutcome = async (
      result:
        | 'success'
        | 'empty'
        | 'prepare-error'
        | 'clarification-needed'
        | 'cancelled'
        | 'error',
      extraProps?: Record<string, unknown>
    ) => {
      if (!canTrackTelemetry) {
        return;
      }

      try {
        await WorkspaceUsageTracker.getInstance().trackCommandEvent(
          `workspai.aimodal.${normalizedMode}`,
          typeof aiContext?.path === 'string' ? aiContext.path : undefined,
          {
            source: 'ai-modal',
            result,
            hasPrompt: Boolean(normalizedQuestion.trim()),
            historyTurns: conversationHistory.length,
            ...extraProps,
          }
        );
      } catch {
        // Telemetry should never interrupt AI modal UX.
      }
    };

    if (!normalizedQuestion.trim() || !aiContext) {
      await trackAIModalOutcome('empty', {
        hasContext: Boolean(aiContext),
      });
      this._postAIStreamDoneOnce(queryRequestId);
      return;
    }

    this._aiQueryTokenSource?.cancel();
    this._aiQueryTokenSource?.dispose();
    const tokenSource = new vscode.CancellationTokenSource();
    this._aiQueryTokenSource = tokenSource;
    this._activeAIQueryRequestId = queryRequestId;
    let currentStage: 'prepare' | 'stream' = 'prepare';
    let chunkBuffer = '';
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let streamDoneSent = false;
    let fullAIResponse = '';

    const flushBufferedChunks = () => {
      if (chunkBuffer && !tokenSource.token.isCancellationRequested) {
        panel.webview.postMessage({
          command: 'aiChunkUpdate',
          data: { text: chunkBuffer, requestId: queryRequestId },
        });
      }
      chunkBuffer = '';
    };

    const stopFlushTimer = () => {
      if (flushTimer !== null) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
    };

    const sendDoneOnce = (error?: string) => {
      if (streamDoneSent) {
        return;
      }
      streamDoneSent = true;
      this._postAIStreamDoneOnce(queryRequestId, error);
    };

    try {
      const { streamAIResponse, prepareAIConversation, extractContractTelemetry } =
        await import('../../core/aiService.js');
      const { validateAIOutputQuality } = await import('../../core/aiOutputQuality.js');

      // Build doctor snapshot for the contract - best-effort, non-blocking
      const aiQueryDoctorSnapshot =
        aiContext?.path || aiContext?.workspaceRootPath
          ? await this._readDoctorEvidenceSnapshot(
              aiContext.workspaceRootPath ?? aiContext.path
            ).catch(() => undefined)
          : undefined;

      const prepared = await prepareAIConversation(
        normalizedMode,
        normalizedQuestion,
        aiContext,
        conversationHistory,
        aiQueryDoctorSnapshot ?? undefined
      );

      if (prepared.validation.clarificationNeeded) {
        const clarificationText =
          prepared.validation.clarificationReason ??
          `Context evidence is missing. Please select a workspace and run ${buildRapidkitDisplayCommand(['doctor', 'workspace'])}, then ask again.`;

        if (canTrackTelemetry) {
          try {
            await WorkspaceUsageTracker.getInstance().trackCommandEvent(
              'workspai.aimodal.clarification_gate',
              typeof aiContext?.path === 'string' ? aiContext.path : undefined,
              {
                source: 'ai-modal',
                mode: normalizedMode,
                missingFields: prepared.validation.missing,
              }
            );
          } catch {
            // Telemetry should never interrupt AI modal UX.
          }
        }

        panel.webview.postMessage({
          command: 'aiChunkUpdate',
          data: {
            text: `${clarificationText}\n\nPlease share the selected workspace/project path so I can continue with evidence-based guidance.`,
            requestId: queryRequestId,
          },
        });
        this._postAIStreamDoneOnce(queryRequestId);
        await trackAIModalOutcome('clarification-needed', {
          stage: 'prepare',
          missingFields: prepared.validation.missing,
        });
        return;
      }

      currentStage = 'stream';

      // Send contract telemetry to webview before streaming starts
      if (aiContext) {
        panel.webview.postMessage({
          command: 'aiContextContract',
          data: {
            requestId: queryRequestId,
            ...extractContractTelemetry(prepared.contract),
            persona_level: prepared.contract.persona,
            evidence_confidence: prepared.contract.evidence_confidence,
          },
        });
      }

      // Buffer chunks and flush to webview every 50 ms to avoid host-side batch delivery.
      flushTimer = setInterval(() => {
        flushBufferedChunks();
      }, 50);

      let modelId = '';
      if (readWorkspaiSettings().aiProvider === 'openai-compatible') {
        const providerResponse = await askConfiguredAIProvider(
          this._context,
          prepared.messages,
          tokenSource.token
        );
        modelId = providerResponse.provider;
        fullAIResponse += providerResponse.text;
        chunkBuffer += providerResponse.text;
        stopFlushTimer();
        flushBufferedChunks();
      } else {
        const streamResult = await streamAIResponse(
          prepared.messages,
          (chunk: { text: string; done: boolean }) => {
            if (chunk.text) {
              fullAIResponse += chunk.text;
              chunkBuffer += chunk.text;
            }
            if (chunk.done) {
              stopFlushTimer();
              flushBufferedChunks();
            }
          },
          tokenSource.token,
          requestedModelId
        );
        modelId = streamResult.modelId;
      }

      if (tokenSource.token.isCancellationRequested) {
        await trackAIModalOutcome('cancelled', { stage: 'after-stream' });
      } else {
        const qualityResult = validateAIOutputQuality(
          fullAIResponse,
          this._resolveAIOutputScenario(normalizedMode, normalizedQuestion, aiContext.type)
        );

        if (!qualityResult.isAcceptable) {
          const topViolations = qualityResult.violations
            .filter((violation) => violation.severity === 'error')
            .slice(0, 3)
            .map((violation) => `- ${violation.detail}`)
            .join('\n');

          if (topViolations) {
            panel.webview.postMessage({
              command: 'aiChunkUpdate',
              data: {
                text: `\n\n## Output Quality Gate\n${topViolations}\n\nNext safe step: ask me to regenerate with verification evidence, execution directory, and rollback path.`,
                requestId: queryRequestId,
              },
            });
          }

          if (canTrackTelemetry) {
            try {
              await WorkspaceUsageTracker.getInstance().trackCommandEvent(
                'workspai.aimodal.output_quality_gate',
                typeof aiContext?.path === 'string' ? aiContext.path : undefined,
                {
                  source: 'ai-modal',
                  mode: normalizedMode,
                  violationCount: qualityResult.violations.length,
                  topRules: qualityResult.violations.slice(0, 5).map((violation) => violation.rule),
                }
              );
            } catch {
              // Telemetry should never interrupt AI modal UX.
            }
          }
        }

        await trackAIModalOutcome('success', {
          modelId,
          outputQuality: qualityResult.isAcceptable ? 'accepted' : 'flagged',
        });
        sendDoneOnce();
      }

      // Notify the webview which model was used
      panel.webview.postMessage({
        command: 'aiModelUsed',
        data: { modelId, requestId: queryRequestId },
      });
    } catch (err) {
      if (tokenSource.token.isCancellationRequested) {
        await trackAIModalOutcome('cancelled', { stage: currentStage });
        if (this._activeAIQueryRequestId === queryRequestId) {
          sendDoneOnce();
        }
        return;
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      await trackAIModalOutcome(currentStage === 'prepare' ? 'prepare-error' : 'error', {
        error: errMsg.slice(0, 180),
        stage: currentStage,
      });

      sendDoneOnce(errMsg);
    } finally {
      stopFlushTimer();
      chunkBuffer = '';
      if (this._aiQueryTokenSource === tokenSource) {
        this._aiQueryTokenSource = undefined;
      }
      if (this._activeAIQueryRequestId === queryRequestId) {
        this._activeAIQueryRequestId = undefined;
      }
      tokenSource.dispose();
    }
  }

  private async _handleRunDoctorMessage(
    messageData: unknown,
    action: 'check' | 'fix'
  ): Promise<void> {
    const payload = asRecord(messageData);
    const rawProjectPath = payload?.projectPath;
    const explicitProjectPath =
      typeof rawProjectPath === 'string' && rawProjectPath.trim()
        ? rawProjectPath.trim()
        : undefined;
    const rawProjectName = payload?.projectName;
    const explicitProjectName =
      typeof rawProjectName === 'string' && rawProjectName.trim()
        ? rawProjectName.trim()
        : undefined;
    const rawWorkspacePath = payload?.workspacePath;
    const explicitWorkspacePath =
      typeof rawWorkspacePath === 'string' && rawWorkspacePath.trim()
        ? rawWorkspacePath.trim()
        : undefined;
    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
    const rawWorkspaceName = payload?.workspaceName;
    const workspaceName =
      (typeof rawWorkspaceName === 'string' && rawWorkspaceName.trim()) ||
      selectedWorkspace?.name ||
      (workspacePath ? path.basename(workspacePath) : undefined);

    if (!workspacePath) {
      vscode.window.showWarningMessage('Select a workspace first.');
      return;
    }

    if (explicitProjectPath) {
      const projectName = explicitProjectName || path.basename(explicitProjectPath);
      await vscode.commands.executeCommand('workspai.projectDoctor', {
        project: {
          path: explicitProjectPath,
          name: projectName,
        },
        preferredAction: action,
      });
      this._trackStudioEvent('workspai.studio.action_executed', workspacePath, {
        actionType: `doctor-project-${action}`,
        workspaceName: workspaceName || path.basename(workspacePath),
        projectName,
      });
      return;
    }

    await vscode.commands.executeCommand('workspai.checkWorkspaceHealth', {
      workspace: {
        path: workspacePath,
        name: workspaceName,
      },
      preferredAction: action,
    });
    this._trackStudioEvent('workspai.studio.action_executed', workspacePath, {
      actionType: `doctor-workspace-${action}`,
      workspaceName: workspaceName || path.basename(workspacePath),
    });
  }

  private async _handleOpenIncidentNavigatorTargetMessage(messageData: unknown): Promise<void> {
    const payload = asRecord(messageData);
    const rawPath = payload?.path;
    const targetPath = typeof rawPath === 'string' ? rawPath.trim() : '';
    const rawKind = payload?.kind;
    const targetKind = typeof rawKind === 'string' ? rawKind.trim() : 'file';
    const rawLabel = payload?.label;
    const targetLabel =
      typeof rawLabel === 'string' && rawLabel.trim() ? rawLabel.trim() : targetPath;
    const rawSymbol = payload?.symbolName;
    const targetSymbol =
      typeof rawSymbol === 'string' && rawSymbol.trim() ? rawSymbol.trim() : undefined;
    const rawStartLine = payload?.startLine;
    const rawTargetLine = Number(rawStartLine);
    const targetLine =
      Number.isFinite(rawTargetLine) && rawTargetLine > 0 ? Math.floor(rawTargetLine) : undefined;
    const rawWsPath = payload?.workspacePath;
    const explicitWorkspacePath =
      typeof rawWsPath === 'string' && rawWsPath.trim() ? rawWsPath.trim() : undefined;
    const rawProjPath = payload?.projectPath;
    const explicitProjectPath =
      typeof rawProjPath === 'string' && rawProjPath.trim() ? rawProjPath.trim() : undefined;
    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
    const projectPath =
      explicitProjectPath ||
      (WelcomePanel._selectedProject?.path &&
      isWorkspacePathAncestor(workspacePath, WelcomePanel._selectedProject.path)
        ? WelcomePanel._selectedProject.path
        : undefined);

    if (!targetPath) {
      vscode.window.showWarningMessage('No impact target was provided.');
      return;
    }

    const resolvedTargetPath = resolveIncidentNavigatorTargetPath({
      targetPath,
      workspacePath,
      projectPath,
    });

    if (!resolvedTargetPath) {
      vscode.window.showWarningMessage(`Could not resolve impact target: ${targetLabel}`);
      return;
    }

    if (!(await fs.pathExists(resolvedTargetPath))) {
      vscode.window.showWarningMessage(
        `Impact target is not available in this workspace: ${targetLabel}`
      );
      return;
    }

    const targetStat = await fs.stat(resolvedTargetPath);
    if (!targetStat.isFile()) {
      vscode.window.showWarningMessage(`Impact target is not an openable file: ${targetLabel}`);
      return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedTargetPath));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const selection = findIncidentNavigatorSelection(document.getText(), {
      symbolName: targetSymbol,
      startLine: targetLine,
    });
    if (selection) {
      const range = new vscode.Range(
        selection.line,
        selection.startCharacter,
        selection.line,
        selection.endCharacter
      );
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }

    if (workspacePath) {
      this._trackStudioEvent('workspai.studio.scope_navigator_opened', workspacePath, {
        targetKind: targetKind.slice(0, 40),
        targetLabel: targetLabel.slice(0, 180),
        ...(targetSymbol ? { targetSymbol: targetSymbol.slice(0, 180) } : {}),
      });
    }
  }

  private async _handleViewProjectDoctorReportMessage(messageData: unknown): Promise<void> {
    const payload = asRecord(messageData);
    const rawProjectPath = payload?.projectPath;
    const explicitProjectPath =
      typeof rawProjectPath === 'string' && rawProjectPath.trim()
        ? rawProjectPath.trim()
        : undefined;
    const rawProjectName = payload?.projectName;
    const explicitProjectName =
      typeof rawProjectName === 'string' && rawProjectName.trim()
        ? rawProjectName.trim()
        : undefined;
    const rawWorkspacePath = payload?.workspacePath;
    const explicitWorkspacePath =
      typeof rawWorkspacePath === 'string' && rawWorkspacePath.trim()
        ? rawWorkspacePath.trim()
        : undefined;

    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const workspacePath = explicitWorkspacePath || selectedWorkspace?.path;
    const selectedProject =
      WelcomePanel._selectedProject &&
      workspacePath &&
      isWorkspacePathAncestor(workspacePath, WelcomePanel._selectedProject.path)
        ? WelcomePanel._selectedProject
        : null;

    const projectPath = explicitProjectPath || selectedProject?.path;
    const projectName =
      explicitProjectName ||
      selectedProject?.name ||
      (projectPath ? path.basename(projectPath) : undefined);

    if (!projectPath) {
      vscode.window.showWarningMessage('Select a project first.');
      return;
    }

    const projectReportsDir = path.join(projectPath, '.rapidkit', 'reports');
    const workspaceReportsDir = workspacePath
      ? path.join(workspacePath, '.rapidkit', 'reports')
      : undefined;
    const reportCandidates = [
      path.join(projectReportsDir, 'doctor-project-last-run.json'),
      path.join(projectReportsDir, 'doctor-last-run.json'),
      ...(workspaceReportsDir
        ? [path.join(workspaceReportsDir, 'doctor-project-last-run.json')]
        : []),
    ];
    const reportPath = await (async () => {
      for (const candidate of reportCandidates) {
        if (await fs.pathExists(candidate)) {
          return candidate;
        }
      }
      return undefined;
    })();

    if (!reportPath) {
      const scopeLabel = projectName || path.basename(projectPath);
      vscode.window.showInformationMessage(
        `No project doctor report found for "${scopeLabel}". Run project checks first.`
      );
      return;
    }

    const reportData = await fs.readJSON(reportPath).catch(() => null);
    const output = vscode.window.createOutputChannel(
      `Workspai: Project Doctor — ${projectName || path.basename(projectPath)}`
    );
    output.clear();
    output.appendLine(
      `=== Project Doctor Report: ${projectName || path.basename(projectPath)} ===`
    );
    output.appendLine(`File: ${toLinkSafePath(reportPath)}`);
    output.appendLine('');

    if (reportData) {
      const score = reportData.healthScore;
      const total = Number(score?.total ?? 0);
      const passed = Number(score?.passed ?? 0);
      const warnings = Number(score?.warnings ?? 0);
      const errors = Number(score?.errors ?? 0);
      const percent = total > 0 ? Math.round((passed / total) * 100) : 0;

      const scopeLabel = reportData.summary?.scopeProvenance?.dominantScope || 'project-scoped';
      output.appendLine(`Generated: ${reportData.generatedAt || 'unknown'}`);
      output.appendLine(`Scope: ${scopeLabel}`);
      output.appendLine(`Health: ${percent}% (✅ ${passed} | ⚠️ ${warnings} | ❌ ${errors})`);

      const project = reportData.project;
      if (project && typeof project === 'object') {
        output.appendLine('');
        output.appendLine('--- Project ---');
        output.appendLine(`Name: ${project.name || projectName || 'unknown'}`);
        output.appendLine(`Path: ${toLinkSafePath(project.path || projectPath)}`);
        output.appendLine(`Framework: ${project.framework || 'unknown'}`);

        const issues = Array.isArray(project.issues)
          ? project.issues.filter((item: unknown) => typeof item === 'string')
          : [];
        output.appendLine(`Issues: ${issues.length}`);
        for (const issue of issues.slice(0, 20)) {
          output.appendLine(`  - ${issue}`);
        }

        const fixCommands = Array.isArray(project.fixCommands)
          ? project.fixCommands.filter((item: unknown) => typeof item === 'string')
          : [];
        if (fixCommands.length > 0) {
          output.appendLine('');
          output.appendLine('--- Suggested Fix Commands ---');
          for (const cmd of fixCommands.slice(0, 20)) {
            output.appendLine(`  - ${cmd}`);
          }
        }
      }
    } else {
      output.appendLine('(Could not parse project doctor report JSON)');
    }

    output.appendLine('');
    output.appendLine(`Reports directory: ${path.basename(projectPath)}/.rapidkit/reports`);
    output.show();

    if (workspacePath) {
      this._trackStudioEvent('workspai.studio.action_executed', workspacePath, {
        actionType: 'view-project-doctor-report',
        projectName: projectName || path.basename(projectPath),
      });
    }
  }

  private _registerDoctorEvidenceWatcher() {
    const watcher = vscode.workspace.createFileSystemWatcher(
      '**/.rapidkit/reports/**/*.json',
      false,
      false,
      true
    );

    const scheduleRefresh = (uri?: vscode.Uri) => {
      this._doctorTelemetryRefreshController.schedule(uri?.fsPath);
    };

    watcher.onDidCreate((uri) => scheduleRefresh(uri));
    watcher.onDidChange((uri) => scheduleRefresh(uri));
    watcher.onDidDelete((uri) => scheduleRefresh(uri));

    this._disposables.push(watcher);
  }

  private _resolveDashboardProjectContext(workspacePath?: string): {
    projectPath?: string;
    projectName?: string;
  } {
    const selectedProject = WelcomePanel._selectedProject;
    if (!selectedProject?.path) {
      return {};
    }
    if (workspacePath && !isWorkspacePathAncestor(workspacePath, selectedProject.path)) {
      return {};
    }
    return {
      projectPath: selectedProject.path,
      projectName: selectedProject.name,
    };
  }

  private async _runDashboardOpsChainCommand(
    command: string,
    workspacePath: string,
    workspaceName?: string
  ): Promise<void> {
    const payload = { path: workspacePath, name: workspaceName };
    const resolved = resolveDashboardCommandActivity(command);
    await appendDashboardActivity(this._context, {
      command,
      label: resolved.label,
      scope: resolved.scope,
    });

    const handled = await this._executeDashboardContractCommand(
      command,
      command === 'checkWorkspaceHealth' ? { ...payload, preferredAction: 'check' } : payload
    );
    if (!handled) {
      await blockDashboardOpsChain(
        this._context,
        workspacePath,
        `Could not dispatch ${command}. Select workspace/project context and retry.`
      );
      await this._sendDashboardEvidence({ workspacePath });
      return;
    }
  }

  private async _beginGovernanceChainForWorkspace(
    workspacePath: string,
    workspaceName: string | undefined,
    triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add'
  ): Promise<void> {
    if (this._panelRole !== 'dashboard') {
      return;
    }
    await startDashboardOpsChain(this._context, {
      workspacePath,
      workspaceName,
      triggeredBy,
    });
    const chain = getDashboardOpsChain(this._context);
    const firstCommand = getNextOpsChainCommand(chain);
    if (firstCommand) {
      await this._runDashboardOpsChainCommand(firstCommand, workspacePath, workspaceName);
    }
    await this._sendDashboardEvidence({ workspacePath });
  }

  private async _sendDashboardEvidence(context?: DashboardEvidenceRefreshContext | string) {
    if (this._panelRole !== 'dashboard') {
      return;
    }

    const normalizedContext: DashboardEvidenceRefreshContext | undefined =
      typeof context === 'string' ? { workspacePath: context } : context;

    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const selectedProject = WelcomePanel._selectedProject;
    const workspacePath =
      normalizedContext?.workspacePath ||
      selectedWorkspace?.path ||
      selectedProject?.workspacePath ||
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const projectContext =
      normalizedContext?.projectPath || normalizedContext?.projectName
        ? {
            projectPath: normalizedContext.projectPath,
            projectName: normalizedContext.projectName,
          }
        : this._resolveDashboardProjectContext(workspacePath);
    const recentWorkspaces = await this._getRecentWorkspaces();
    const hasActiveWorkspace = Boolean(selectedWorkspace?.path || selectedProject?.workspacePath);
    const recentWorkspaceCount = recentWorkspaces.length;
    const isFreshInstall = recentWorkspaceCount === 0 && !hasActiveWorkspace;

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath: projectContext.projectPath,
      projectName: projectContext.projectName,
    });

    if (normalizedContext?.reportPath) {
      const binding = resolveReportBinding(normalizedContext.reportPath);
      const card = binding
        ? resolveCardForReportKind(bundle, binding.kind, projectContext.projectPath)
        : undefined;
      if (card) {
        await finalizeDashboardActivityFromReport(
          this._context,
          normalizedContext.reportPath,
          card.status,
          card.blockers?.[0] ?? card.summary
        );
      }
    }

    const chainBefore = getDashboardOpsChain(this._context);
    const chainAfter =
      workspacePath && bundle.cards.length > 0
        ? await advanceDashboardOpsChain(this._context, bundle.cards, workspacePath)
        : chainBefore;

    if (
      chainAfter &&
      chainBefore &&
      chainAfter.status === 'running' &&
      chainAfter.currentStep !== chainBefore.currentStep &&
      workspacePath
    ) {
      const nextCommand = getNextOpsChainCommand(chainAfter);
      if (nextCommand) {
        await this._runDashboardOpsChainCommand(
          nextCommand,
          workspacePath,
          chainAfter.workspaceName ?? selectedWorkspace?.name
        );
      }
    }

    const activity = getDashboardActivityLog(this._context);
    const opsChain = filterOpsChainForWorkspace(getDashboardOpsChain(this._context), workspacePath);

    this._panel.webview.postMessage({
      command: 'dashboardEvidence',
      data: {
        workspacePath: bundle.workspacePath,
        projectPath: bundle.projectPath,
        projectName: bundle.projectName,
        cards: bundle.cards,
        activity,
        opsChain,
        onboarding: {
          isFreshInstall,
          recentWorkspaceCount,
          hasActiveWorkspace,
        },
      },
    });
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    options?: {
      forceNew?: boolean;
      title?: string;
      viewColumn?: vscode.ViewColumn;
      reveal?: boolean;
    }
  ) {
    const targetDashboard = !options?.forceNew;
    const shouldReveal = options?.reveal !== false;

    // If panel exists, show it
    if (targetDashboard && WelcomePanel._dashboardPanel) {
      WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      if (shouldReveal) {
        WelcomePanel._dashboardPanel._panel.reveal();
      }
      return;
    }
    if (!targetDashboard && WelcomePanel._incidentPanel) {
      WelcomePanel.currentPanel = WelcomePanel._incidentPanel;
      if (shouldReveal) {
        WelcomePanel._incidentPanel._panel.reveal();
      }
      return;
    }

    // Create new panel
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

    const panelRole: 'dashboard' | 'incident' = options?.forceNew ? 'incident' : 'dashboard';
    const createdPanel = new WelcomePanel(panel, context, panelRole);

    if (panelRole === 'dashboard') {
      WelcomePanel._dashboardPanel = createdPanel;
      WelcomePanel.currentPanel = createdPanel;
      return;
    }

    WelcomePanel._incidentPanel = createdPanel;
    WelcomePanel.currentPanel = createdPanel;
  }

  private _sendInitialData() {
    this._sendVersion();
    this._sendRecentWorkspaces();
    this._sendExampleWorkspaces();
    this._sendAvailableKits();
    this._sendModulesCatalog();
    this._sendWorkspaceStatus();
    this._sendWorkspaceToolStatus();
    this._sendUiPreferences();
    void this._sendWorkspaiSettings();
    void this._sendDashboardEvidence();
  }

  private async _sendWorkspaceToolStatus() {
    const python = await checkPythonEnvironmentCached();
    const poetryAvailable = await isPoetryInstalledCached();

    let pipxAvailable = false;
    const pipxCandidates: Array<{ command: string; args: string[] }> =
      process.platform === 'win32'
        ? [
            { command: 'python', args: ['-m', 'pipx', '--version'] },
            { command: 'py', args: ['-m', 'pipx', '--version'] },
            { command: 'pipx', args: ['--version'] },
          ]
        : [
            { command: 'pipx', args: ['--version'] },
            { command: 'python3', args: ['-m', 'pipx', '--version'] },
            { command: 'python', args: ['-m', 'pipx', '--version'] },
          ];

    for (const candidate of pipxCandidates) {
      try {
        const result = await run(candidate.command, candidate.args, {
          timeout: 3000,
          stdio: 'pipe',
        });
        if (result.exitCode === 0) {
          pipxAvailable = true;
          break;
        }
      } catch {
        continue;
      }
    }

    const venvAvailable = python.available && python.venvSupport;
    const preferredInstallMethod = poetryAvailable ? 'poetry' : pipxAvailable ? 'pipx' : 'venv';

    const probeBinaryWithFallbacks = async (
      primaryCmd: string,
      args: string[],
      fallbacks: string[] = []
    ): Promise<{ available: boolean; version: string | null; resolvedPath: string | null }> => {
      const candidates = [primaryCmd, ...fallbacks];
      for (const cmd of candidates) {
        try {
          const result = await run(cmd, args, { timeout: 4000, stdio: 'pipe' });
          if (result.exitCode === 0) {
            const raw = (result.stdout || result.stderr || '').trim();
            const versionMatch = raw.match(/(\d+[.\d]*)/);
            return {
              available: true,
              version: versionMatch?.[0] || null,
              resolvedPath: cmd,
            };
          }
        } catch {
          // try next
        }
      }
      return { available: false, version: null, resolvedPath: null };
    };

    const javaHome = process.env.JAVA_HOME?.trim();
    const mavenHome = (process.env.MAVEN_HOME || process.env.M2_HOME)?.trim();
    const gradleHome = process.env.GRADLE_HOME?.trim();
    const sdkmanBase = `${process.env.HOME || '~'}/.sdkman/candidates`;
    const sep = process.platform === 'win32' ? '\\' : '/';

    const javaFallbacks = [
      ...(javaHome ? [`${javaHome}${sep}bin${sep}java`] : []),
      '/usr/lib/jvm/temurin-21/bin/java',
      '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
      '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
      `${sdkmanBase}/java/current/bin/java`,
    ].filter(Boolean);

    const mavenFallbacks = [
      ...(mavenHome ? [`${mavenHome}${sep}bin${sep}mvn`] : []),
      `${sdkmanBase}/maven/current/bin/mvn`,
      '/usr/local/maven/bin/mvn',
    ].filter(Boolean);

    const gradleFallbacks = [
      ...(gradleHome ? [`${gradleHome}${sep}bin${sep}gradle`] : []),
      `${sdkmanBase}/gradle/current/bin/gradle`,
      '/usr/local/gradle/bin/gradle',
    ].filter(Boolean);

    const [javaResult, mavenResult, gradleResult, dotnetResult] = await Promise.all([
      probeBinaryWithFallbacks('java', ['-version'], javaFallbacks),
      probeBinaryWithFallbacks('mvn', ['--version'], mavenFallbacks),
      probeBinaryWithFallbacks('gradle', ['--version'], gradleFallbacks),
      probeBinaryWithFallbacks('dotnet', ['--version']),
    ]);

    const javaAvailable = javaResult.available;
    const mavenAvailable = mavenResult.available;
    const gradleAvailable = gradleResult.available;
    const dotnetAvailable = dotnetResult.available;

    this._panel.webview.postMessage({
      command: 'workspaceToolStatus',
      data: {
        pythonAvailable: python.available,
        venvAvailable,
        poetryAvailable,
        pipxAvailable,
        javaAvailable,
        mavenAvailable,
        gradleAvailable,
        dotnetAvailable,
        preferredInstallMethod,
      },
    });
  }

  private _resolveTelemetryWorkspacePath(): string | undefined {
    return resolveTelemetryWorkspacePath(
      WelcomePanel._selectedProject,
      WelcomePanel._workspaceExplorer?.getSelectedWorkspace()?.path,
      vscode.workspace.workspaceFolders
    );
  }

  private _resolveDashboardSessionWorkspacePath(data: unknown): string | undefined {
    const explicit =
      typeof data === 'object' && data !== null && 'workspacePath' in data
        ? String((data as { workspacePath?: unknown }).workspacePath || '').trim()
        : '';
    return explicit || this._resolveTelemetryWorkspacePath();
  }

  private _normalizeIncidentStudioSessionPhase(value: unknown): IncidentStudioSessionPhase {
    if (
      value === 'detect' ||
      value === 'diagnose' ||
      value === 'plan' ||
      value === 'verify' ||
      value === 'learn'
    ) {
      return value;
    }
    return 'detect';
  }

  private async _handleSaveDashboardIncidentStudioSession(data: unknown) {
    const workspacePath = this._resolveDashboardSessionWorkspacePath(data);
    if (!workspacePath?.trim()) {
      return;
    }

    const payload =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

    if (typeof payload.phase === 'string') {
      const session = readIncidentStudioSession(this._context, workspacePath);
      await writeIncidentStudioSession(this._context, workspacePath, {
        ...session,
        phase: this._normalizeIncidentStudioSessionPhase(payload.phase),
      });
    }

    const chatMessages = Array.isArray(payload.chatMessages)
      ? payload.chatMessages
      : Array.isArray(payload.messages)
        ? payload.messages
        : null;

    if (chatMessages) {
      await replaceChatMessages(
        this._context,
        workspacePath,
        chatMessages as IncidentStudioChatMessage[]
      );
    }

    if (Array.isArray(payload.approvalAuditEvents)) {
      const session = readIncidentStudioSession(this._context, workspacePath);
      await writeIncidentStudioSession(this._context, workspacePath, {
        ...session,
        approvalAuditEvents: payload.approvalAuditEvents as IncidentStudioApprovalAuditEvent[],
      });
    } else if (payload.approvalAuditEvent && typeof payload.approvalAuditEvent === 'object') {
      await appendApprovalAuditEvent(
        this._context,
        workspacePath,
        payload.approvalAuditEvent as Omit<IncidentStudioApprovalAuditEvent, 'id' | 'happenedAt'>
      );
    }

    if (Array.isArray(payload.proofEvents)) {
      await replaceProofEvents(
        this._context,
        workspacePath,
        payload.proofEvents as IncidentStudioProofEvent[]
      );
    }

    if (Array.isArray(payload.executionTranscripts)) {
      await replaceExecutionTranscripts(
        this._context,
        workspacePath,
        payload.executionTranscripts as IncidentStudioExecutionTranscript[]
      );
    }
  }

  private _trackStudioEvent(
    command: string,
    workspacePath?: string,
    properties?: Record<string, unknown>
  ) {
    const resolvedWorkspacePath = workspacePath || this._resolveTelemetryWorkspacePath();
    const experimentSeed = resolvedWorkspacePath || 'global';
    void WorkspaceUsageTracker.getInstance().trackCommandEvent(command, resolvedWorkspacePath, {
      source: 'incident_studio',
      ctaVariant: getIncidentPrimaryCtaExperimentVariant(experimentSeed),
      ...(properties || {}),
    });
  }

  private _emitArchitectureReasoningRuntimeEvents(input: {
    conversationId: string;
    actionId: string;
    actionType: string;
    workspacePath: string;
    framework?: string;
    wave2Contracts: {
      impactAssessment: {
        confidence: number;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
      };
      releaseGateEvidence: {
        scopeKnown: boolean;
        verifyPathPresent: boolean;
        rollbackPathPresent: boolean;
        blockedReasons: string[];
      };
      architectureTelemetry: {
        warningCount: number;
        warnings: string[];
        unknownScopeBlocked: boolean;
      };
    };
    verifySuccess: boolean;
  }) {
    const { wave2Contracts } = input;
    const warningCount = wave2Contracts.architectureTelemetry.warningCount;
    const unknownScopeBlocked = wave2Contracts.architectureTelemetry.unknownScopeBlocked;

    if (warningCount <= 0 && !unknownScopeBlocked) {
      return;
    }

    const commonProps = {
      conversationId: input.conversationId,
      actionId: input.actionId,
      actionType: input.actionType,
      framework: input.framework ?? 'unknown',
      riskLevel: wave2Contracts.impactAssessment.riskLevel,
      confidence: wave2Contracts.impactAssessment.confidence,
      warningCount,
      scopeKnown: wave2Contracts.releaseGateEvidence.scopeKnown,
      verifyPathPresent: wave2Contracts.releaseGateEvidence.verifyPathPresent,
      rollbackPathPresent: wave2Contracts.releaseGateEvidence.rollbackPathPresent,
      blockedReasonCount: wave2Contracts.releaseGateEvidence.blockedReasons.length,
    };

    if (warningCount > 0) {
      const warningSample = wave2Contracts.architectureTelemetry.warnings.slice(0, 2).join(' | ');

      this._trackStudioEvent('workspai.studio.architecture_warning_shown', input.workspacePath, {
        ...commonProps,
        warnings: warningSample,
      });

      this._trackStudioEvent('workspai.studio.architecture_warning_accepted', input.workspacePath, {
        ...commonProps,
        warnings: warningSample,
      });

      this._trackStudioEvent(
        input.verifySuccess
          ? 'workspai.studio.architecture_warning_falsified'
          : 'workspai.studio.architecture_breakage_prevented',
        input.workspacePath,
        {
          ...commonProps,
          warnings: warningSample,
          verifySuccess: input.verifySuccess,
        }
      );
    }

    if (unknownScopeBlocked) {
      const blockedReasonSample = wave2Contracts.releaseGateEvidence.blockedReasons
        .filter((reason) => /scope is unknown/i.test(reason))
        .slice(0, 2)
        .join(' | ');

      this._trackStudioEvent(
        'workspai.studio.architecture_unknown_scope_blocked',
        input.workspacePath,
        {
          ...commonProps,
          blockedReasons: blockedReasonSample,
        }
      );
    }
  }

  private async _inferFrameworkFromWorkspace(workspacePath: string): Promise<string> {
    const checks: Array<{ framework: string; file: string }> = [
      { framework: 'fastapi', file: path.join(workspacePath, 'src', 'main.py') },
      { framework: 'nestjs', file: path.join(workspacePath, 'src', 'main.ts') },
      { framework: 'go', file: path.join(workspacePath, 'go.mod') },
      { framework: 'springboot', file: path.join(workspacePath, 'pom.xml') },
      {
        framework: 'dotnet',
        file: path.join(workspacePath, `${path.basename(workspacePath)}.csproj`),
      },
      {
        framework: 'dotnet',
        file: path.join(workspacePath, `${path.basename(workspacePath)}.sln`),
      },
    ];

    for (const check of checks) {
      if (await fs.pathExists(check.file)) {
        return check.framework;
      }
    }

    try {
      const entries = await fs.readdir(workspacePath, { withFileTypes: true });
      if (
        entries.some(
          (entry) =>
            entry.isFile() && (entry.name.endsWith('.csproj') || entry.name.endsWith('.sln'))
        )
      ) {
        return 'dotnet';
      }
    } catch {
      // fall through to scoped project detection
    }

    const scopedProject = await this._resolveScopedProjectForWorkspace({ workspacePath });
    if (scopedProject && scopedProject.path !== workspacePath) {
      return this._inferFrameworkFromWorkspace(scopedProject.path);
    }

    return 'unknown';
  }

  private async _getWorkspaceGraphSnapshot(
    options?:
      | string
      | {
          workspacePath?: string;
          projectPath?: string;
          projectName?: string;
          projectType?: string;
          scopeIntent?: 'workspace' | 'project';
        }
  ): Promise<IncidentWorkspaceGraphSnapshot> {
    const resolvedWorkspacePath =
      (typeof options === 'string' ? options : options?.workspacePath) ||
      this._resolveTelemetryWorkspacePath();
    const tracker = WorkspaceUsageTracker.getInstance();
    const memoryService = WorkspaceMemoryService.getInstance();

    const doctorSnapshot = await this._readDoctorEvidenceSnapshot(resolvedWorkspacePath);

    const explicitProjectPath =
      typeof options === 'string' ? undefined : options?.projectPath?.trim();
    const explicitProjectName = typeof options === 'string' ? undefined : options?.projectName;
    const explicitProjectType = typeof options === 'string' ? undefined : options?.projectType;
    const scopeIntent = typeof options === 'string' ? 'workspace' : options?.scopeIntent;
    const isProjectScope = Boolean(explicitProjectPath) || scopeIntent === 'project';

    const selectedProject = isProjectScope
      ? await this._resolveScopedProjectForWorkspace({
          workspacePath: resolvedWorkspacePath,
          projectPath: explicitProjectPath,
          projectName: explicitProjectName,
          projectType: explicitProjectType,
          doctorSnapshot,
        })
      : null;
    const graphScanPath = selectedProject?.path || resolvedWorkspacePath;
    const workspaceFrameworkLabel = (() => {
      const frameworks = (doctorSnapshot?.frameworks || [])
        .map((item) =>
          String(item?.name || '')
            .trim()
            .toLowerCase()
        )
        .filter((name) => name.length > 0);
      const unique = Array.from(new Set(frameworks));
      if (unique.length === 0) {
        return 'unknown';
      }
      if (unique.length === 1) {
        return unique[0];
      }
      return 'mixed';
    })();
    const workspaceInstalledModules = (doctorSnapshot?.projects || [])
      .flatMap((project) => project.installedModules || [])
      .slice(0, 60);

    const [
      commandSummary,
      onboardingSummary,
      framework,
      workspaceMemory,
      gitDiffStat,
      installedModules,
    ] = await Promise.all([
      tracker.getCommandTelemetrySummary(resolvedWorkspacePath, 'last7d'),
      tracker.getOnboardingExperimentStats(resolvedWorkspacePath, 'last7d'),
      selectedProject?.path
        ? this._inferFrameworkFromWorkspace(selectedProject.path)
        : Promise.resolve(workspaceFrameworkLabel),
      resolvedWorkspacePath
        ? memoryService.readNearest(resolvedWorkspacePath)
        : Promise.resolve(undefined),
      graphScanPath ? getGitDiffStat(graphScanPath, 1500) : Promise.resolve(null),
      selectedProject
        ? WelcomePanel._readInstalledModules(selectedProject.path)
        : Promise.resolve(workspaceInstalledModules),
    ] as const);

    const hasWorkspaceMemory = Boolean(
      workspaceMemory?.context ||
      workspaceMemory?.conventions?.length ||
      workspaceMemory?.decisions?.length
    );
    const memoryPolicy = memoryService.resolvePolicy(workspaceMemory);
    const hasDoctorEvidence = Boolean(doctorSnapshot);
    const hasGitDiff = Boolean(gitDiffStat && !gitDiffStat.includes('unavailable'));
    const hasProjectScope = Boolean(selectedProject);
    const doctorGeneratedAt =
      doctorSnapshot && typeof doctorSnapshot.generatedAt === 'string'
        ? doctorSnapshot.generatedAt
        : undefined;

    const doctorHealth = (() => {
      if (!doctorSnapshot) {
        return undefined;
      }

      const doctorRecord = doctorSnapshot as Record<string, unknown>;
      const healthRecord =
        doctorRecord.health && typeof doctorRecord.health === 'object'
          ? (doctorRecord.health as Record<string, unknown>)
          : undefined;

      const passed = Number(healthRecord?.passed ?? doctorRecord.passed ?? 0);
      const warnings = Number(healthRecord?.warnings ?? doctorRecord.warnings ?? 0);
      const errors = Number(healthRecord?.errors ?? doctorRecord.errors ?? 0);
      const total = passed + warnings + errors;
      const percent = Number(
        healthRecord?.percent ?? (total > 0 ? Math.round((passed / total) * 100) : 0)
      );

      return {
        passed,
        warnings,
        errors,
        total,
        percent,
      };
    })();

    return {
      snapshotVersion: 'v1',
      workspace: {
        path: resolvedWorkspacePath,
        name: resolvedWorkspacePath ? path.basename(resolvedWorkspacePath) : undefined,
      },
      project: {
        framework,
        kit: selectedProject?.type || 'unknown',
        selectedProject,
      },
      topology: {
        modulesCount: installedModules.length,
        topModules: installedModules.map((module) => module.slug).slice(0, 5),
      },
      doctor: {
        hasEvidence: hasDoctorEvidence,
        generatedAt: doctorGeneratedAt,
        health: doctorHealth,
      },
      git: {
        diffStat:
          gitDiffStat || 'Git context unavailable (not a repository or git is not installed).',
        hasDiffContext: hasGitDiff,
      },
      memory: {
        context: workspaceMemory?.context,
        conventionsCount: workspaceMemory?.conventions?.length || 0,
        decisionsCount: workspaceMemory?.decisions?.length || 0,
        hasMemory: hasWorkspaceMemory,
        policyProfile: memoryPolicy.profile,
        sensitivity: memoryPolicy.sensitivity,
        localProcessingMode: memoryPolicy.localProcessingMode,
      },
      telemetry: {
        totalEvents: commandSummary?.totalEvents || 0,
        lastCommand: commandSummary?.lastCommand || null,
        onboardingFollowupClickThroughRate: onboardingSummary?.overallFollowupClickThroughRate || 0,
      },
      evidence: {
        hasDoctorEvidence,
        hasGitDiff,
        hasWorkspaceMemory,
        localProcessingMode: memoryPolicy.localProcessingMode,
        projectScoped: hasProjectScope,
      },
      completeness: hasDoctorEvidence && hasGitDiff ? 'fresh' : 'partial',
      lastUpdatedAt: Date.now(),
    };
  }

  private _postChatBrainWebviewMessage(message: unknown): void {
    (this._chatBrainReplyWebview ?? this._panel.webview).postMessage(message);
  }

  public async dispatchExternalChatBrainMessage(
    command: string,
    data: unknown,
    requestId: string | undefined,
    replyWebview: vscode.Webview
  ): Promise<void> {
    this._chatBrainReplyWebview = replyWebview;
    try {
      switch (command) {
        case 'aiChatStart':
          await this._handleAiChatStart(data, requestId);
          break;
        case 'aiChatSyncWorkspace':
          await this._handleAiChatSyncWorkspace(data, requestId);
          break;
        case 'aiChatQuery':
          await this._handleAiChatQuery(data as MessagePayload, requestId);
          break;
        case 'aiChatExecuteAction':
          await this._handleAiChatExecuteAction(data as MessagePayload, requestId);
          break;
        case 'aiChatApplyPatch':
          await this._handleApplyPatch(data as MessagePayload, requestId);
          break;
        case 'aiChatFeedback':
          await this._handleAiChatFeedback(data, requestId);
          break;
        case 'aiChatClose': {
          const conversationId =
            typeof (data as { conversationId?: unknown })?.conversationId === 'string'
              ? (data as { conversationId: string }).conversationId
              : undefined;
          if (conversationId) {
            this._chatBrainConversations.delete(conversationId);
          }
          break;
        }
        default:
          break;
      }
    } finally {
      this._chatBrainReplyWebview = undefined;
    }
  }

  private async _handleAiChatStart(data: unknown, requestId?: string) {
    const input = asRecord(data) || {};
    const resumeConversationId =
      typeof input.resumeConversationId === 'string' ? input.resumeConversationId : undefined;
    const conversationId = resumeConversationId || `conv-${Date.now()}`;

    const workspacePath = typeof input.workspacePath === 'string' ? input.workspacePath : undefined;
    const projectPath =
      typeof input.projectPath === 'string' && input.projectPath.trim()
        ? input.projectPath.trim()
        : undefined;
    const projectName =
      typeof input.projectName === 'string' && input.projectName.trim()
        ? input.projectName.trim()
        : undefined;
    const projectType =
      typeof input.projectType === 'string' && input.projectType.trim()
        ? input.projectType.trim()
        : undefined;
    const existingConversation = resumeConversationId
      ? this._chatBrainConversations.get(resumeConversationId)
      : undefined;

    const framework =
      existingConversation?.framework ||
      (projectPath
        ? await this._inferFrameworkFromWorkspace(projectPath)
        : workspacePath
          ? await this._inferFrameworkFromWorkspace(workspacePath)
          : undefined);

    const conversation = existingConversation || {
      workspacePath,
      projectPath,
      projectName,
      projectType,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      phase: 'detect' as const,
      history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
      queryCount: 0,
      actionCount: 0,
      repeatedIncidentDetected: false,
      framework,
      scopeMode:
        input.scopeMode === 'project' || input.scopeMode === 'workspace'
          ? input.scopeMode
          : projectPath
            ? 'project'
            : 'workspace',
      importedIncidentReplay: undefined,
    };

    conversation.workspacePath = workspacePath || conversation.workspacePath;
    conversation.projectPath = projectPath || conversation.projectPath;
    conversation.projectName = projectName || conversation.projectName;
    conversation.projectType = projectType || conversation.projectType;
    conversation.framework = framework;
    if (workspacePath) {
      const pendingImportedReplay =
        this._pendingImportedIncidentReplayByWorkspace.get(workspacePath);
      if (pendingImportedReplay) {
        conversation.importedIncidentReplay = pendingImportedReplay;
        this._pendingImportedIncidentReplayByWorkspace.delete(workspacePath);
      }
    }
    this._chatBrainConversations.set(conversationId, conversation);

    const inlineResumeSnapshot = buildIncidentResumeSnapshot(conversation);
    if (inlineResumeSnapshot) {
      this._incidentResumeByWorkspace.set(inlineResumeSnapshot.workspacePath, inlineResumeSnapshot);
    }

    const cachedResumeSnapshot = workspacePath
      ? this._incidentResumeByWorkspace.get(workspacePath)
      : undefined;
    const resumeSnapshot = inlineResumeSnapshot || cachedResumeSnapshot;
    const resumed = Boolean(existingConversation || (resumeConversationId && resumeSnapshot));

    // ── Analytics: incident_loop_started ─────────────────────────────────────
    this._trackStudioEvent('workspai.studio.loop_started', workspacePath, {
      framework: framework ?? 'unknown',
      resumed,
      projectPath: conversation.projectPath,
    });

    this._postChatBrainWebviewMessage({
      command: 'aiChatStarted',
      data: {
        conversationId,
        phase: conversation.phase,
        resumed,
        resumeSnapshot,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  private async _handleAiChatSyncWorkspace(data: unknown, requestId?: string) {
    const input = asRecord(data) || {};
    const workspacePath = typeof input.workspacePath === 'string' ? input.workspacePath : undefined;
    const explicitProjectPath =
      typeof input.projectPath === 'string' && input.projectPath.trim()
        ? input.projectPath.trim()
        : undefined;
    const explicitProjectName =
      typeof input.projectName === 'string' && input.projectName.trim()
        ? input.projectName.trim()
        : undefined;
    const explicitProjectType =
      typeof input.projectType === 'string' && input.projectType.trim()
        ? input.projectType.trim()
        : undefined;

    // If a stream is active for another workspace, cancel it before applying sync.
    const activeConversationId = this._activeChatBrainConversationId;
    const activeConversation = activeConversationId
      ? this._chatBrainConversations.get(activeConversationId)
      : undefined;
    if (
      this._chatBrainQueryTokenSource &&
      activeConversation?.workspacePath &&
      workspacePath &&
      activeConversation.workspacePath !== workspacePath
    ) {
      this._chatBrainQueryTokenSource.cancel();
      this._chatBrainQueryTokenSource.dispose();
      this._chatBrainQueryTokenSource = undefined;
      this._activeChatBrainRequestId = undefined;
      this._activeChatBrainConversationId = undefined;
    }

    const selectedProjectPath =
      explicitProjectPath ||
      (WelcomePanel._selectedProject &&
      isWorkspacePathAncestor(workspacePath, WelcomePanel._selectedProject.path)
        ? WelcomePanel._selectedProject.path
        : undefined);
    const cacheKey = `chat-brain-workspace-graph-${workspacePath || 'default'}-${selectedProjectPath || 'none'}`;
    const now = Date.now();
    const cacheTtl = 2 * 60 * 1000;
    const forceRefresh = input.forceRefresh === true;

    const postSyncedPayload = async (graph: IncidentWorkspaceGraphSnapshot, cacheHit: boolean) => {
      const systemGraphSnapshot = await buildSyncSystemGraphSnapshot({
        requestId,
        workspacePath: workspacePath || graph.workspace.path || '',
        projectPath: selectedProjectPath,
        graphSnapshot: graph,
      });

      this._postChatBrainWebviewMessage({
        command: 'aiChatWorkspaceSynced',
        data: {
          workspacePath,
          selectedProjectPath,
          snapshotVersion: String(graph.lastUpdatedAt || now),
          graph,
          systemGraphSnapshot,
          cacheHit,
        },
        meta: { requestId, version: 'v1' },
      });
    };

    const cached = this._context.globalState.get<{
      graph: IncidentWorkspaceGraphSnapshot;
      timestamp: number;
    }>(cacheKey);
    if (!forceRefresh && cached && now - cached.timestamp < cacheTtl) {
      await postSyncedPayload(cached.graph, true);
      return;
    }

    // Ensure a watcher is running for this workspace so file changes invalidate the cache.
    void this._ensureSystemGraphWatcher(workspacePath, cacheKey);

    const graph = await this._getWorkspaceGraphSnapshot({
      workspacePath,
      projectPath: selectedProjectPath,
      projectName: explicitProjectName,
      projectType: explicitProjectType,
      scopeIntent: selectedProjectPath ? 'project' : 'workspace',
    });
    await this._context.globalState.update(cacheKey, { graph, timestamp: now });

    await postSyncedPayload(graph, false);
  }

  private async _handleAiChatFeedback(data: unknown, requestId?: string): Promise<void> {
    const input = asRecord(data) || {};
    const conversationId =
      typeof input.conversationId === 'string' ? input.conversationId : undefined;
    const messageId =
      typeof input.messageId === 'string' ? input.messageId : `feedback-${Date.now()}`;
    const rating = input.rating === 'not-helpful' ? 'not-helpful' : 'helpful';
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : undefined;

    const conv = conversationId ? this._chatBrainConversations.get(conversationId) : undefined;
    const workspacePath =
      (typeof input.workspacePath === 'string' && input.workspacePath.trim()
        ? input.workspacePath.trim()
        : undefined) ?? conv?.workspacePath;

    if (conv) {
      conv.phase = rating === 'helpful' ? 'learn' : conv.phase === 'learn' ? 'verify' : conv.phase;
      conv.lastActivityAt = Date.now();
      this._chatBrainConversations.set(conversationId!, conv);
    }

    this._trackStudioEvent('workspai.studio.response_feedback', workspacePath, {
      conversationId,
      messageId,
      rating,
      note,
      framework: conv?.framework ?? 'unknown',
      projectPath: conv?.projectPath,
    });

    const uiPrefs = this._getUiPreferences(workspacePath);
    const confidence =
      rating === 'helpful'
        ? Math.min(95, (conv?.verifyPassedAt ? 85 : 70) + (note ? 5 : 0))
        : Math.max(25, 55);

    const nextActions =
      rating === 'helpful'
        ? uiPrefs.incidentAutoLearningPrompt
          ? ['Capture workspace memory from this fix', 'Run verification checks', 'Close incident']
          : ['Run verification checks', 'Close incident']
        : ['Clarify the failing behavior', 'Run doctor checks', 'Try a narrower verify command'];

    if (rating === 'helpful' && uiPrefs.incidentAutoLearningPrompt && workspacePath) {
      const memorySuggestion = buildIncidentMemoryEnrichmentSuggestion({
        verifySuccess: Boolean(conv?.verifyPassedAt),
        actionType: 'incident-feedback',
        verifyChecklist: ['User confirmed the assistant response was helpful.'],
      });
      if (memorySuggestion) {
        this._postChatBrainWebviewMessage({
          command: 'aiChatSuggestedQuestions',
          data: {
            conversationId,
            messageId: `feedback-learn-${Date.now()}`,
            questions: memorySuggestion.questions,
          },
          meta: { requestId, version: 'v1' },
        });
      }
    }

    this._postChatBrainWebviewMessage({
      command: 'aiChatDone',
      data: {
        conversationId,
        messageId,
        phase: rating === 'helpful' ? 'learn' : (conv?.phase ?? 'verify'),
        confidence,
        nextActions,
        feedbackAccepted: rating === 'helpful',
      },
      meta: { requestId, version: 'v1' },
    });
  }

  private _ensureSystemGraphWatcher(workspacePath: string | undefined, cacheKey: string): void {
    if (!workspacePath) {
      return;
    }
    if (this._systemGraphWatcherByPath.has(workspacePath)) {
      return;
    }
    // Start watcher in background; on any update, bust the globalState cache so
    // the next sync request re-indexes rather than serving a stale snapshot.
    void createProjectSystemGraphWatcher({
      workspacePath,
      useIncrementalCache: true,
      debounceMs: 300,
      onUpdate: (update) => {
        if (update.reason === 'initial') {
          return;
        }
        void this._context.globalState.update(cacheKey, undefined);
      },
    })
      .then((handle) => {
        if (!this._systemGraphWatcherByPath.has(workspacePath)) {
          this._systemGraphWatcherByPath.set(workspacePath, handle);
        } else {
          // Another call already registered a watcher while we were awaiting — dispose the duplicate.
          handle.dispose();
        }
      })
      .catch(() => {
        // Watcher creation is best-effort; panel remains functional without it.
      });
  }

  private _routeActionTypeFromMessage(message: string): RoutingResult {
    return routeIncidentActionTypeFromMessage(message);
  }

  private async _buildChatBrainAIContext(options?: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeIntent?: 'workspace' | 'project';
  }): Promise<import('../../core/aiService').AIModalContext> {
    const resolvedWorkspacePath = options?.workspacePath || this._resolveTelemetryWorkspacePath();
    const explicitProjectPath = options?.projectPath?.trim();
    const isProjectScope = Boolean(explicitProjectPath) || options?.scopeIntent === 'project';
    const selectedProject = isProjectScope
      ? await this._resolveScopedProjectForWorkspace({
          workspacePath: resolvedWorkspacePath,
          projectPath: explicitProjectPath,
          projectName: options?.projectName,
          projectType: options?.projectType,
        })
      : null;
    const selectedProjectBelongsToWorkspace = Boolean(selectedProject);
    const effectiveContextPath =
      selectedProjectBelongsToWorkspace && selectedProject
        ? selectedProject.path
        : resolvedWorkspacePath;
    const framework = selectedProjectBelongsToWorkspace
      ? selectedProject?.type ||
        (effectiveContextPath
          ? await this._inferFrameworkFromWorkspace(effectiveContextPath)
          : 'unknown')
      : resolvedWorkspacePath
        ? 'mixed'
        : 'unknown';

    return {
      type: selectedProjectBelongsToWorkspace ? 'project' : 'workspace',
      name:
        selectedProjectBelongsToWorkspace && selectedProject
          ? selectedProject.name || path.basename(selectedProject.path)
          : resolvedWorkspacePath
            ? path.basename(resolvedWorkspacePath)
            : 'Workspace',
      path: effectiveContextPath,
      framework,
      workspaceRootPath: resolvedWorkspacePath,
      projectRootPath:
        selectedProjectBelongsToWorkspace && selectedProject ? selectedProject.path : undefined,
    };
  }

  private async _buildProjectExecutionBlock(options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
  }): Promise<string | undefined> {
    if (!options.projectPath) {
      return undefined;
    }

    const projectPath = options.projectPath;
    const framework = options.projectType || (await this._inferFrameworkFromWorkspace(projectPath));
    const lines: string[] = ['PROJECT EXECUTION STATE:'];

    lines.push(`- Selected project: ${options.projectName || path.basename(projectPath)}`);
    lines.push(`- Project path: ${projectPath}`);
    lines.push(`- Framework: ${framework || 'unknown'}`);

    if (framework === 'springboot') {
      const hasPom = await fs.pathExists(path.join(projectPath, 'pom.xml'));
      const hasGradle =
        (await fs.pathExists(path.join(projectPath, 'build.gradle'))) ||
        (await fs.pathExists(path.join(projectPath, 'build.gradle.kts')));
      const hasMavenWrapper =
        (await fs.pathExists(path.join(projectPath, 'mvnw'))) ||
        (await fs.pathExists(path.join(projectPath, 'mvnw.cmd')));
      const hasGradleWrapper =
        (await fs.pathExists(path.join(projectPath, 'gradlew'))) ||
        (await fs.pathExists(path.join(projectPath, 'gradlew.bat')));

      lines.push(
        `- Build files: ${hasPom ? 'pom.xml ' : ''}${hasGradle ? 'gradle ' : ''}`.trim() ||
          '- Build files: none detected'
      );
      lines.push(
        `- Wrappers present: maven=${hasMavenWrapper ? 'yes' : 'no'}, gradle=${hasGradleWrapper ? 'yes' : 'no'}`
      );

      if (!hasMavenWrapper && !hasGradleWrapper) {
        lines.push(
          '- Launch blocker: no Maven Wrapper or Gradle Wrapper is present. `rapidkit dev` will require system Maven or Gradle.'
        );
        lines.push(
          '- If `rapidkit init` is quiet, treat it as a warm-up step and explicitly re-check wrappers/build-tool readiness before recommending `rapidkit dev`.'
        );
        lines.push(
          '- The next step is usually to install Maven 3.9+ or Gradle 8+, or generate and commit the wrapper in the selected project root.'
        );
      } else {
        lines.push(
          '- Expected launch flow: rapidkit init -> rapidkit dev -> verify startup logs or the service health endpoint.'
        );
      }
    }

    if (framework === 'fastapi') {
      const hasVenv = await fs.pathExists(path.join(projectPath, '.venv'));
      lines.push(`- Python environment present: ${hasVenv ? 'yes' : 'no'}`);
      if (!hasVenv) {
        lines.push(
          '- Launch blocker: no project virtual environment detected yet. Prioritize `rapidkit init` before `rapidkit dev`.'
        );
      }
    }

    if (framework === 'nestjs') {
      const hasNodeModules = await fs.pathExists(path.join(projectPath, 'node_modules'));
      lines.push(`- node_modules present: ${hasNodeModules ? 'yes' : 'no'}`);
      if (!hasNodeModules) {
        lines.push(
          '- Launch blocker: dependencies not installed yet. Prioritize `rapidkit init` or package-manager install before `rapidkit dev`.'
        );
      }
    }

    if (framework === 'go') {
      const hasGoMod = await fs.pathExists(path.join(projectPath, 'go.mod'));
      const hasGoSum = await fs.pathExists(path.join(projectPath, 'go.sum'));
      lines.push(`- go.mod present: ${hasGoMod ? 'yes' : 'no'}`);
      lines.push(`- go.sum present: ${hasGoSum ? 'yes' : 'no'}`);
      if (hasGoMod && !hasGoSum) {
        lines.push(
          '- Launch blocker: dependencies likely not downloaded yet. Prioritize `rapidkit init` or `go mod tidy` before `rapidkit dev`.'
        );
      }
    }

    lines.push(
      '- Optimize for the path to a running service: install deps -> init -> dev -> verify.'
    );
    lines.push('- `Verify command` must be an actual shell command or file check, never prose.');

    return lines.join('\n');
  }

  private _buildSuggestedQuestions(
    actionType: string,
    message: string,
    scopeIntent: 'workspace' | 'project' = 'workspace'
  ): string[] {
    const isProject = scopeIntent === 'project';
    const norm = message.toLowerCase();

    // ── specialist: DevOps / CI-CD ──────────────────────────────────────────
    if (
      actionType === 'doctor-fix' &&
      (norm.includes('ci/cd') ||
        norm.includes('pipeline') ||
        norm.includes('kubernetes') ||
        norm.includes('helm') ||
        norm.includes('dockerfile') ||
        norm.includes('docker compose'))
    ) {
      return isProject
        ? [
            'Show me the exact Dockerfile line causing this failure',
            'What environment variables are missing from my CI pipeline?',
            'Verify the deployment config is consistent with the doctor evidence',
          ]
        : [
            'Which services have CI/CD drift across this workspace?',
            'Show me cross-service pipeline config inconsistencies',
            'Generate a workspace-wide deployment health checklist',
          ];
    }

    // ── specialist: Database / schema ───────────────────────────────────────
    if (
      actionType === 'change-impact-lite' &&
      (norm.includes('schema') ||
        norm.includes('migration') ||
        norm.includes('sql') ||
        norm.includes('database') ||
        norm.includes('postgres') ||
        norm.includes('mysql') ||
        norm.includes('mongodb'))
    ) {
      return isProject
        ? [
            'What tables or collections does this migration touch?',
            'Generate a rollback SQL script for this schema change',
            'Which integration tests cover this migration path?',
          ]
        : [
            'Which services share this database schema dependency?',
            'Show cross-service migration order and risk',
            'Generate rollback steps for each affected service',
          ];
    }

    // ── specialist: Docs / readme / runbook ─────────────────────────────────
    if (
      actionType === 'workspace-memory-wizard' &&
      (norm.includes('docs') ||
        norm.includes('documentation') ||
        norm.includes('readme') ||
        norm.includes('runbook') ||
        norm.includes('adr'))
    ) {
      return isProject
        ? [
            'Generate a README section for the public API of this project',
            'What architecture decisions should I document for this project?',
            'Create a runbook entry for the most common failure in this service',
          ]
        : [
            'Generate a workspace topology overview for the README',
            'Which ADRs are missing across all workspace services?',
            'Create a cross-service runbook for the top shared failure mode',
          ];
    }

    // ── specialist: Architecture / risk / blast-radius ──────────────────────
    if (
      actionType === 'change-impact-lite' &&
      (norm.includes('architecture') ||
        norm.includes('blast radius') ||
        norm.includes('refactor plan') ||
        norm.includes('risk'))
    ) {
      return isProject
        ? [
            'Show me the safest order to make these changes in this project',
            'What rollback plan should I have for this refactor?',
            'Generate a test checklist scoped to the affected modules',
          ]
        : [
            'Which other services are coupled to the changes I am making?',
            'What is the safest multi-service rollout sequence?',
            'Generate a workspace-wide blast-radius rollback plan',
          ];
    }

    // ── standard action types ────────────────────────────────────────────────
    if (actionType === 'terminal-bridge' || /error|traceback|failed/i.test(norm)) {
      return isProject
        ? [
            'Show me which files I need to change to fix this',
            'Run impact analysis before applying the fix',
            'Add this issue to workspace memory so it never happens again',
          ]
        : [
            'Which workspace services are affected by this error?',
            'Show cross-service impact before applying the fix',
            'Add this failure pattern to workspace memory',
          ];
    }
    if (actionType === 'fix-preview-lite' || /fix|patch|bug/i.test(norm)) {
      return isProject
        ? [
            'What tests should I add to cover this fix?',
            'Check if this fix could break anything else in this project',
            'Apply this fix and verify with doctor checks',
          ]
        : [
            'Does this fix propagate a regression risk to other services?',
            'Generate a workspace-level test checklist for this patch',
            'Apply this fix and verify across all affected services',
          ];
    }
    if (actionType === 'change-impact-lite' || /impact|risk|refactor/i.test(norm)) {
      return isProject
        ? [
            'Show me the safest order to make these changes',
            'What rollback plan should I have?',
            'Generate a test checklist for this change',
          ]
        : [
            'Which services are at highest risk from this change?',
            'What is the safest cross-service rollout sequence?',
            'Generate a workspace-wide rollback checklist',
          ];
    }
    if (actionType === 'doctor-fix' || /doctor|health|issue/i.test(norm)) {
      return isProject
        ? [
            'Fix all remaining doctor issues automatically',
            'Explain why this issue happens in my project type',
            'Save this fix pattern to workspace memory',
          ]
        : [
            'Fix all workspace issues grouped by root cause',
            'Show me which services share the same failure pattern',
            'Save the workspace-wide fix pattern to memory',
          ];
    }
    if (/module|install|add service|database|auth/i.test(norm)) {
      return [
        'What configuration do I need after adding this?',
        'Show me how to test this module is working',
        'What other modules pair well with this one?',
      ];
    }
    if (actionType === 'release-readiness-commander' || /release|ship|go\/no-go/i.test(norm)) {
      return isProject
        ? [
            'Export the Go/No-Go artifact for team signoff',
            'Show me blocking reasons ranked by risk',
            'Generate the exact release-stop-gate command for this decision',
          ]
        : [
            'Export the workspace-level Go/No-Go artifact for all services',
            'Which services are blocking the workspace release?',
            'Generate release-stop-gate commands for each NO-GO service',
          ];
    }
    if (
      actionType === 'verify-pack-autopilot' ||
      /verify|proof|checklist|deterministic/i.test(norm)
    ) {
      return isProject
        ? [
            'Generate a deterministic verify command pack for this change',
            'Rank verification commands by confidence and execution scope',
            'Show blockers that still prevent a completion claim',
          ]
        : [
            'Generate a workspace-wide verify command pack',
            'Show per-service verify commands ranked by confidence',
            'List workspace blockers that prevent a completion claim',
          ];
    }
    return isProject
      ? [
          'Run a full project health check now',
          'Show me the next highest-priority action for this project',
          'Save this analysis to workspace memory',
        ]
      : [
          'Run a full workspace health check now',
          'Show me the next highest-priority workspace action',
          'Save this workspace analysis to memory',
        ];
  }

  private _getChatBrainPrimaryActionLabel(actionType: string, projectName?: string): string {
    const target = projectName ? ` for ${projectName}` : '';
    const labels: Record<string, string> = {
      orchestrate: projectName
        ? `Inspect launch blockers for ${projectName}`
        : 'Inspect workspace launch blockers',
      'terminal-bridge': `Analyze the failing command${target}`,
      'fix-preview-lite': `Preview the safest fix${target}`,
      'change-impact-lite': `Map blast radius before changes${target}`,
      'doctor-fix': `Run health diagnosis${target}`,
      'workspace-memory-wizard': 'Capture workspace memory',
      'recipe-pack': `Run the best guided workflow${target}`,
      'incident-repro-pack': `Build a reproducible incident pack${target}`,
      'apply-module-gen': `Generate module plan with verify path${target}`,
      'apply-debug-patch': `Preview patch with rollback plan${target}`,
      'inline-command': `Prepare safe command execution${target}`,
      'release-readiness-commander': 'Generate release Go/No-Go decision',
      'browser-smoke-test': `Run browser smoke verification${target}`,
      'verify-pack-autopilot': `Generate deterministic verify pack${target}`,
    };

    return labels[actionType] ?? `Continue safe investigation${target}`;
  }

  private _resolveAIOutputScenario(
    mode: 'ask' | 'debug',
    question: string,
    contextType?: string
  ): AIOutputScenario {
    const normalized = question.toLowerCase();

    if (/\b(release|ship|go\/no-go|go-no-go|deploy)\b/.test(normalized)) {
      return contextType === 'workspace' ? 'release-workspace' : 'release-project';
    }

    if (/\b(command failed|failing command|exit code|stderr|stdout|traceback)\b/.test(normalized)) {
      return 'command-failure';
    }

    return mode === 'debug' ? 'debug' : 'ask';
  }

  private _buildStructuredPromptAIModalContext(input: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeIntent?: 'workspace' | 'project';
  }): AIModalContext {
    const explicitProjectPath = input.projectPath?.trim();
    const isProjectScope = Boolean(explicitProjectPath) || input.scopeIntent === 'project';

    if (isProjectScope && explicitProjectPath) {
      return {
        type: 'project',
        name: input.projectName?.trim() || path.basename(explicitProjectPath),
        path: explicitProjectPath,
        framework: input.projectType,
        projectRootPath: explicitProjectPath,
        workspaceRootPath: input.workspacePath?.trim() || undefined,
      };
    }

    const workspacePath = input.workspacePath?.trim();
    return {
      type: 'workspace',
      name: workspacePath ? path.basename(workspacePath) : 'Workspace',
      path: workspacePath,
      workspaceRootPath: workspacePath,
    };
  }

  private async _buildStructuredIncidentPrompt(
    message: string,
    options?: {
      workspacePath?: string;
      projectPath?: string;
      projectName?: string;
      projectType?: string;
      scopeIntent?: 'workspace' | 'project';
    }
  ): Promise<string> {
    const resolvedWorkspacePath = options?.workspacePath || this._resolveTelemetryWorkspacePath();
    const doctorSnapshot = await this._readDoctorEvidenceSnapshot(resolvedWorkspacePath);
    const architectureGrounding = await buildArchitectureGroundingForPromptAsync(
      this._buildStructuredPromptAIModalContext({
        workspacePath: resolvedWorkspacePath,
        projectPath: options?.projectPath,
        projectName: options?.projectName,
        projectType: options?.projectType,
        scopeIntent: options?.scopeIntent,
      }),
      undefined
    );
    const liveModules = await getWorkspaceAwareLiveModules(resolvedWorkspacePath);
    const liveCatalogBlock =
      liveModules && liveModules.length > 0
        ? `LIVE MODULE CATALOG:\n${buildModuleListForPrompt(liveModules)}`
        : '';

    // Explicit project path or scopeIntent='project' → project-level analysis.
    // No project path and scopeIntent='workspace' (or omitted) → workspace-level analysis.
    // We do NOT auto-detect a project when the user is in workspace scope; doing so silently
    // collapses multi-project workspace reasoning into single-service focus.
    const explicitProjectPath = options?.projectPath?.trim() || undefined;
    const isProjectScope = Boolean(explicitProjectPath) || options?.scopeIntent === 'project';

    if (!isProjectScope) {
      // ── WORKSPACE-LEVEL ANALYSIS ────────────────────────────────────────────
      // Reason across ALL workspace projects: topology, shared health, cross-project risks,
      // workspace memory, and workspace-wide KPI state.
      const projectCandidatesBlock = resolvedWorkspacePath
        ? await this._buildWorkspaceProjectCandidatesBlock(resolvedWorkspacePath, doctorSnapshot)
        : undefined;
      const workspaceArchitectureBlock = this._buildWorkspaceArchitectureBlock(
        doctorSnapshot,
        resolvedWorkspacePath
      );
      const workspaceResponseRules = [
        'SCOPE: This is a workspace-level analysis. Reason across ALL projects in the workspace topology — do not collapse focus onto a single service.',
        'EVIDENCE INTEGRITY: Use only facts from the WORKSPACE ARCHITECTURE block. Do not invent project names, paths, or issue counts.',
        'Do not assume fastapi.standard/nestjs.standard when analyze lists framework=python or kit unknown — state the gap and recommend create/import project first.',
        'Do not recommend Docker/K8s/uvicorn deploy for minimal workspaces without Dockerfile and application entrypoint.',
        'CROSS-PROJECT REASONING: Identify which projects share dependencies, configs, or failure modes. Surface topology-level risks explicitly.',
        'WORKSPACE HEALTH: Lead with the overall workspace health score and how issues are distributed across projects.',
        'If all projects are healthy, confirm that explicitly and suggest a proactive workspace-level improvement (e.g., memory capture, topology snapshot).',
        'If multiple projects share a root cause (same framework issue, missing deps, config drift), name the shared pattern and address it once.',
        'Do NOT recommend project-specific commands as the primary answer unless workspace health shows a single-project bottleneck that clearly dominates.',
        'PRIORITY: Rank recommendations by workspace-wide impact, not per-project severity in isolation.',
        'CLARITY: Keep total response length to 8-12 lines. No markdown tables. No fenced code blocks unless user explicitly asks.',
        'COMMANDS: Recommended Action and Verification must each contain exactly one deterministic command in plain text.',
        'CONFIDENCE: If a claim depends on inferred/partial evidence, add a single short assumption line.',
      ];

      return [
        message,
        '',
        ...(projectCandidatesBlock ? [projectCandidatesBlock, ''] : []),
        workspaceArchitectureBlock,
        '',
        ...(liveCatalogBlock ? [liveCatalogBlock, ''] : []),
        architectureGrounding,
        '',
        ...workspaceResponseRules,
        '',
        'Respond using this exact structure and headings:',
        'Workspace Status: <health score — e.g. "85% — 17 passed, 2 warnings, 1 error | 3 project(s)">',
        'Priority Issues: <max 3 bullets; if all healthy, write "No critical issues detected across all projects">',
        'Cross-Project Risks: <shared dependencies, config drift, topology risks — or "None detected">',
        'Recommended Action: <workspace-wide next step — single most impactful command or investigation>',
        'Verification: <workspace-level check command, e.g. rapidkit doctor workspace>',
        'Affected Projects: <comma-separated project names needing attention, or "All healthy">',
        'Assumptions: <"none" or one short confidence-qualified assumption>',
        '',
        'Keep it concise, evidence-backed, and actionable at the workspace level.',
      ].join('\n');
    }

    // ── PROJECT-LEVEL ANALYSIS ────────────────────────────────────────────────
    // User has explicitly selected a project. Focus on that project's internals:
    // runtime state, module health, framework-specific blockers, execution readiness.
    const selectedProject = await this._resolveScopedProjectForWorkspace({
      workspacePath: resolvedWorkspacePath,
      projectPath: explicitProjectPath,
      projectName: options?.projectName,
      projectType: options?.projectType,
      doctorSnapshot,
    });
    const selectedProjectBelongsToWorkspace = Boolean(selectedProject);

    const projectCandidatesBlock = resolvedWorkspacePath
      ? await this._buildWorkspaceProjectCandidatesBlock(resolvedWorkspacePath, doctorSnapshot)
      : undefined;
    const workspaceArchitectureBlock = this._buildWorkspaceArchitectureBlock(
      doctorSnapshot,
      resolvedWorkspacePath
    );
    const projectExecutionBlock = await this._buildProjectExecutionBlock({
      workspacePath: resolvedWorkspacePath,
      projectPath: selectedProjectBelongsToWorkspace ? selectedProject?.path : undefined,
      projectName: selectedProjectBelongsToWorkspace ? selectedProject?.name : undefined,
      projectType: selectedProjectBelongsToWorkspace ? selectedProject?.type : undefined,
    });
    const responseRules = [
      'SCOPE: This is a project-level analysis. Focus on the selected project internals — runtime state, module health, framework-specific blockers, and execution readiness.',
      'EVIDENCE INTEGRITY: Use only facts present in WORKSPACE ARCHITECTURE and PROJECT EXECUTION STATE blocks. Do not invent missing modules, unknown kit, or missing projects.',
      'Domain feature modules (src/<feature>/) ≠ RapidKit catalog modules (npx rapidkit add module <slug>). Route questions accordingly.',
      'NestJS routes: mirror src/examples/ — no /api prefix unless setGlobalPrefix exists in main.ts.',
      'If doctor evidence shows healthy projects with zero issues, do not recommend setup/reset commands unless the user explicitly asks for reconfiguration.',
      'Never claim `kit unknown` or `no modules installed` unless those exact conditions are explicitly listed in the evidence block.',
      'CLARITY: Keep response short (6-10 lines), concrete, and execution-first. Avoid long narrative and avoid repeating the same risk in multiple sections.',
      'COMMANDS: Return exactly one Next command and one Verify command in plain text; do not wrap them in code fences unless user asks.',
      ...(selectedProjectBelongsToWorkspace
        ? [
            'Answer as a launch/readiness assistant for the selected project first.',
            'Explain the current delivery stage in plain language before listing commands.',
            'If Java build wrappers or system build tools are missing, name that blocker explicitly and do not recommend `rapidkit dev` as the next successful step.',
            'If `rapidkit init` may be quiet, explain what it prepares and how the user can verify readiness for `rapidkit dev`.',
          ]
        : [
            'If workspace project scope is ambiguous, do not produce definitive project-level root-cause claims. Ask for target project path first and provide a safe workspace-level next step.',
          ]),
      ...buildIncidentFirstResponseRules({
        projectScoped: selectedProjectBelongsToWorkspace,
        hasDoctorEvidence: Boolean(doctorSnapshot),
        framework: selectedProjectBelongsToWorkspace ? selectedProject?.type : undefined,
      }),
    ];

    return [
      message,
      '',
      ...(projectCandidatesBlock ? [projectCandidatesBlock, ''] : []),
      ...(projectExecutionBlock ? [projectExecutionBlock, ''] : []),
      workspaceArchitectureBlock,
      '',
      ...(liveCatalogBlock ? [liveCatalogBlock, ''] : []),
      architectureGrounding,
      '',
      ...responseRules,
      ...(responseRules.length ? [''] : []),
      'Respond using this exact structure and headings:',
      'What happened: <short diagnosis specific to this project>',
      'Why: <root cause in 1-3 bullets>',
      'Next command: <single best next command for this project>',
      'Verify command: <single command/check to confirm success>',
      '',
      'Keep it concise, specific to this project, and executable.',
    ].join('\n');
  }

  private _buildWorkspaceArchitectureBlock(
    snapshot: DoctorEvidenceSnapshot | undefined,
    workspacePath?: string
  ): string {
    const lines: string[] = ['WORKSPACE ARCHITECTURE (from doctor evidence):'];

    if (!snapshot) {
      lines.push(
        '- No doctor evidence available yet. Do not assume workspace doctor is the immediate next step unless the user asked for a workspace-wide audit.'
      );
      lines.push(`- Workspace path: ${workspacePath ?? 'unknown'}`);
      lines.push(
        '- Use the selected project path, framework files, dependency state, and launch blockers to guide the next action.'
      );
      lines.push(
        '- Doctor evidence, when present, is stored at .rapidkit/reports/doctor-last-run.json.'
      );
      return lines.join('\n');
    }

    const workspaceName =
      snapshot.workspaceName ?? (workspacePath ? path.basename(workspacePath) : 'unknown');
    lines.push(`- Workspace name: ${workspaceName}`);
    lines.push(`- Workspace path: ${workspacePath ?? 'unknown'}`);
    lines.push(
      `- Health: ${snapshot.health.percent}% (${snapshot.health.passed} passed, ${snapshot.health.warnings} warnings, ${snapshot.health.errors} errors)`
    );
    lines.push(`- Total projects: ${snapshot.projectCount}`);

    if (snapshot.projects.length === 0) {
      lines.push('- Projects: none found');
    } else {
      lines.push('- Projects in this workspace:');
      for (const project of snapshot.projects) {
        const issueText = project.issues > 0 ? ` [${project.issues} issue(s)]` : ' [healthy]';
        const depsText = project.depsInstalled === false ? ' [deps missing]' : '';
        const framework = project.framework ?? 'unknown framework';
        const kitText = project.kit ? ` | kit: ${project.kit}` : '';
        const modulesText =
          typeof project.modulesCount === 'number' && Number.isFinite(project.modulesCount)
            ? ` | modules: ${project.modulesCount}`
            : '';
        const moduleSlugSample = Array.isArray(project.installedModules)
          ? project.installedModules
              .map((mod) => mod.slug)
              .filter((slug) => typeof slug === 'string' && slug.trim().length > 0)
              .slice(0, 4)
          : [];
        const moduleSlugText =
          moduleSlugSample.length > 0 ? ` | moduleSlugs: ${moduleSlugSample.join(', ')}` : '';
        const modulesHealthText =
          typeof project.modulesHealthy === 'boolean'
            ? ` | modulesHealthy: ${project.modulesHealthy ? 'yes' : 'no'}`
            : '';
        const vulnText =
          typeof project.vulnerabilities === 'number' && project.vulnerabilities > 0
            ? ` | vulnerabilities: ${project.vulnerabilities}`
            : '';
        lines.push(
          `    • ${project.name} (${framework}) — path: ${project.path || `${workspacePath}/${project.name}`}${issueText}${depsText}${kitText}${modulesText}${moduleSlugText}${modulesHealthText}${vulnText}`
        );
      }
    }

    if (snapshot.fixCommands.length > 0) {
      lines.push(`- Suggested fix commands: ${snapshot.fixCommands.slice(0, 3).join(' | ')}`);
    }

    lines.push('');
    if (
      snapshot.health.errors === 0 &&
      snapshot.health.warnings === 0 &&
      snapshot.projects.length > 0 &&
      snapshot.projects.every((project) => project.issues === 0)
    ) {
      lines.push(
        'EVIDENCE NOTE: Workspace baseline is healthy. Prefer targeted verification commands over setup/reset flows.'
      );
    }
    if (
      snapshot.projects.length > 0 &&
      snapshot.projects.every((project) =>
        typeof project.modulesHealthy === 'boolean' ? project.modulesHealthy : true
      )
    ) {
      lines.push(
        'EVIDENCE NOTE: Doctor reports modulesHealthy=true for listed projects. Do NOT claim missing modules unless user provides contradictory evidence.'
      );
    }
    lines.push(
      'IMPORTANT: The workspace already has the projects listed above. Do NOT suggest creating a new project unless the user explicitly asks for one. Use the existing project paths for all commands.'
    );

    return lines.join('\n');
  }

  private async _readDoctorEvidenceSummary(workspacePath?: string): Promise<
    | {
        healthScoreText: string;
        generatedAt?: string;
        passed?: number;
        warnings?: number;
        errors?: number;
      }
    | undefined
  > {
    const snapshot = await this._readDoctorEvidenceSnapshot(workspacePath);
    if (!snapshot) {
      return undefined;
    }

    return {
      healthScoreText: `${snapshot.health.percent}% (${snapshot.health.passed} passed, ${snapshot.health.warnings} warnings, ${snapshot.health.errors} errors)`,
      generatedAt: snapshot.generatedAt,
      passed: snapshot.health.passed,
      warnings: snapshot.health.warnings,
      errors: snapshot.health.errors,
    };
  }

  private _resolveIncidentRollbackRuntimePolicy(input: {
    workspacePath?: string;
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    rollbackApprovalToken?: unknown;
  }): {
    approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
    requiresManualApproval: boolean;
    approvedByUser: boolean;
    protectedPathPrefixes: string[];
  } {
    const workspaceUri = input.workspacePath ? vscode.Uri.file(input.workspacePath) : undefined;
    const config = vscode.workspace.getConfiguration('workspai', workspaceUri);
    const uiPrefs = this._getUiPreferences();

    const approvalMode = normalizeIncidentRollbackApprovalMode(
      config.get('incidentStudio.rollbackApprovalMode') ?? uiPrefs.incidentRollbackApprovalMode
    );

    const configProtectedPaths = normalizeIncidentRollbackProtectedPaths(
      config.get('incidentStudio.rollbackProtectedPaths')
    );
    const protectedPathPrefixes =
      configProtectedPaths.length > 0
        ? configProtectedPaths
        : normalizeIncidentRollbackProtectedPaths(uiPrefs.incidentRollbackProtectedPaths);

    const requiresManualApproval =
      approvalMode === 'always' ||
      (approvalMode === 'high-risk-only' &&
        input.actionPolicy.riskClass === 'high-risk-mutating') ||
      (approvalMode === 'mutating-only' &&
        (input.actionPolicy.riskClass === 'guarded-mutating' ||
          input.actionPolicy.riskClass === 'high-risk-mutating'));

    const approvedByUser =
      input.rollbackApprovalToken === true ||
      (typeof input.rollbackApprovalToken === 'string' &&
        input.rollbackApprovalToken.trim().toLowerCase() === 'approved');

    return {
      approvalMode,
      requiresManualApproval,
      approvedByUser,
      protectedPathPrefixes,
    };
  }

  private _deriveIncidentVerifyCommandPack(input: {
    actionType: string;
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    workspacePath?: string;
    projectPath?: string;
    projectType?: string;
    impactAssessment: {
      verifyChecklist: string[];
      affectedTests: string[];
    };
    releaseGateEvidence: {
      scopeKnown: boolean;
      verifyPathPresent: boolean;
      rollbackPathPresent: boolean;
      blockedReasons: string[];
    };
    doctorEvidence?: {
      errors?: number;
      warnings?: number;
    };
  }): {
    qualityScore: number;
    readiness: 'ready' | 'needs-attention';
    rationale: string;
    commands: Array<{
      label: string;
      command: string;
      scope: 'workspace' | 'project';
      required: boolean;
    }>;
    blockedReasons: string[];
  } {
    return deriveIncidentVerifyCommandPack(input);
  }

  private _buildIncidentDiagnosisEvidence(input: {
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    verifyReady: boolean;
    verifySuccess: boolean;
    doctorEvidence?: {
      healthScoreText: string;
      generatedAt?: string;
      passed?: number;
      warnings?: number;
      errors?: number;
    };
    impactAssessment: {
      affectedFiles: string[];
      affectedModules: string[];
      likelyFailureMode?: string;
      verifyChecklist: string[];
    };
    predictiveWarning?: {
      warningId: string;
    };
    contractRuntimeEvidence?: WorkspaiContractRuntimeEvidence;
    verifyCommandPack?: {
      qualityScore: number;
      readiness: 'ready' | 'needs-attention';
    };
    graphSnapshot: {
      nodes: Array<{ filePath?: string }>;
    };
  }): {
    confidence: number;
    confidenceBand: 'low' | 'medium' | 'high';
    signalSources: string[];
    relatedFiles: string[];
    recommendedFocus?: string;
  } {
    const signalSources: string[] = [];
    let confidenceScore = 25;

    if (input.doctorEvidence) {
      signalSources.push('doctor-evidence');
      confidenceScore += 25;
    }

    if (input.graphSnapshot.nodes.length > 0) {
      signalSources.push('system-graph');
      confidenceScore += 20;
    }

    if (
      input.impactAssessment.affectedFiles.length > 0 ||
      input.impactAssessment.affectedModules.length > 0
    ) {
      signalSources.push('impact-analysis');
      confidenceScore += 15;
    }

    if (input.predictiveWarning) {
      signalSources.push('predictive-warning');
      confidenceScore += 10;
    }

    if (input.contractRuntimeEvidence?.evaluated) {
      signalSources.push('contract-validation');
      confidenceScore += input.contractRuntimeEvidence.errors.length > 0 ? -8 : 8;
    }

    if (input.verifyCommandPack) {
      signalSources.push('verify-command-pack');
      confidenceScore += input.verifyCommandPack.readiness === 'ready' ? 8 : -10;
      if (input.verifyCommandPack.qualityScore < 60) {
        confidenceScore -= 6;
      }
    }

    if (input.verifyReady) {
      signalSources.push('verify-evidence-ready');
      confidenceScore += 8;
    }

    if (!input.verifySuccess) {
      signalSources.push('verify-failed');
      confidenceScore -= 12;
    }

    if (input.actionPolicy.requiresImpactReview) {
      confidenceScore += 5;
    }

    const confidence = Math.max(0, Math.min(100, confidenceScore));
    const confidenceBand = derivePredictionConfidenceBand(confidence);
    const relatedFiles = Array.from(
      new Set([
        ...input.impactAssessment.affectedFiles,
        ...input.graphSnapshot.nodes
          .map((node) => node.filePath)
          .filter((filePath): filePath is string => Boolean(filePath)),
      ])
    ).slice(0, 8);

    const recommendedFocus =
      input.impactAssessment.likelyFailureMode || input.impactAssessment.verifyChecklist[0];

    return {
      confidence,
      confidenceBand,
      signalSources,
      relatedFiles,
      recommendedFocus,
    };
  }

  private _buildMemoryInfluenceAuditTimeline(input: {
    actionId: string;
    actionType: string;
    graphSnapshot: IncidentWorkspaceGraphSnapshot;
    decisionClarityMissingFields: string[];
    releaseGateBlockedReasons: string[];
    incidentReproPackId?: string;
    releaseReadinessArtifactId?: string;
  }): IncidentMemoryInfluenceAuditEntry[] {
    const now = new Date().toISOString();
    const memoryPolicy = input.graphSnapshot.memory;

    const decisionArtifacts = {
      actionId: input.actionId,
      reproPackId: input.incidentReproPackId,
      releaseReadinessArtifactId: input.releaseReadinessArtifactId,
    };

    const entries: IncidentMemoryInfluenceAuditEntry[] = [
      {
        memoryEventId: `memory-${input.actionId}-context`,
        timestamp: now,
        source: 'workspace-memory',
        influenceKind: 'context',
        summary: memoryPolicy.hasMemory
          ? `Workspace memory context was attached to ${input.actionType} decision flow.`
          : `No persisted workspace memory context was available for ${input.actionType}.`,
        policyProfile: memoryPolicy.policyProfile,
        sensitivity: memoryPolicy.sensitivity,
        localProcessingMode: memoryPolicy.localProcessingMode,
        decisionArtifacts,
      },
      {
        memoryEventId: `memory-${input.actionId}-policy`,
        timestamp: now,
        source: 'workspace-memory',
        influenceKind: 'policy',
        summary: `Memory policy profile ${memoryPolicy.policyProfile} (${memoryPolicy.sensitivity}) enforced localProcessingMode=${String(
          memoryPolicy.localProcessingMode
        )}.`,
        policyProfile: memoryPolicy.policyProfile,
        sensitivity: memoryPolicy.sensitivity,
        localProcessingMode: memoryPolicy.localProcessingMode,
        decisionArtifacts,
      },
      {
        memoryEventId: `memory-${input.actionId}-decision`,
        timestamp: now,
        source: 'workspace-memory',
        influenceKind: 'decision',
        summary:
          input.decisionClarityMissingFields.length > 0
            ? `Decision clarity remained gated by ${input.decisionClarityMissingFields.length} missing field(s).`
            : 'Decision clarity contract remained complete under current memory policy constraints.',
        policyProfile: memoryPolicy.policyProfile,
        sensitivity: memoryPolicy.sensitivity,
        localProcessingMode: memoryPolicy.localProcessingMode,
        decisionArtifacts,
      },
    ];

    if (input.incidentReproPackId || input.releaseReadinessArtifactId) {
      entries.push({
        memoryEventId: `memory-${input.actionId}-artifact-link`,
        timestamp: now,
        source: 'workspace-memory',
        influenceKind: 'artifact-link',
        summary:
          input.releaseGateBlockedReasons.length > 0
            ? `Audit linkage recorded with ${input.releaseGateBlockedReasons.length} release-gate blocked reason(s).`
            : 'Audit linkage recorded between memory influence and generated decision artifacts.',
        policyProfile: memoryPolicy.policyProfile,
        sensitivity: memoryPolicy.sensitivity,
        localProcessingMode: memoryPolicy.localProcessingMode,
        decisionArtifacts,
      });
    }

    return entries;
  }

  private _buildIncidentReproPackEvidence(input: {
    actionType: string;
    actionId: string;
    conversationId: string;
    workspacePath?: string;
    verifySuccess: boolean;
    conversationHistoryTurns: number;
    doctorEvidence?: {
      healthScoreText: string;
      generatedAt?: string;
      passed?: number;
      warnings?: number;
      errors?: number;
    };
    rollbackEvidence?: {
      attempted: boolean;
    };
    sandboxEvidence?: {
      status: 'passed' | 'failed' | 'skipped';
    };
    impactAssessment: {
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      likelyFailureMode?: string;
      verifyChecklist: string[];
      affectedFiles: string[];
    };
    releaseGateEvidence: {
      blockedReasons: string[];
    };
    diagnosisEvidence: {
      relatedFiles: string[];
    };
  }):
    | {
        packId: string;
        status: 'captured' | 'failed' | 'skipped';
        capturedAt: string;
        schemaVersion: 'v1';
        workspacePath: string;
        conversationId: string;
        actionId: string;
        redaction: {
          policy: string;
          applied: boolean;
          redactedFields: string[];
        };
        summary: {
          historyTurns: number;
          hasDoctorEvidence: boolean;
          hasRollbackEvidence: boolean;
          hasSandboxEvidence: boolean;
          hasPredictiveWarning: boolean;
          verifySuccess: boolean;
          affectedFilesCount: number;
          blockedReasonCount: number;
        };
        replayPayload: {
          workspacePath: string;
          conversationId: string;
          actionType: string;
          riskLevel: 'low' | 'medium' | 'high' | 'critical';
          likelyFailureMode?: string;
          verifyChecklist: string[];
          blockedReasons: string[];
          relatedFiles: string[];
        };
        exportHint?: string;
        sensitivityLabel?: 'internal' | 'restricted' | 'confidential';
        memoryInfluenceAuditTimeline?: IncidentMemoryInfluenceAuditEntry[];
      }
    | undefined {
    if (input.actionType !== 'incident-repro-pack' || !input.workspacePath) {
      return undefined;
    }

    const capturedAt = new Date().toISOString();
    const packId = `incident-repro-${input.actionId}-${Date.now().toString(36)}`;

    return {
      packId,
      status: 'captured',
      capturedAt,
      schemaVersion: 'v1',
      workspacePath: input.workspacePath,
      conversationId: input.conversationId,
      actionId: input.actionId,
      redaction: {
        policy: 'incident-studio-default',
        applied: true,
        redactedFields: ['authorization', 'token', 'password', 'secret', 'apiKey'],
      },
      summary: {
        historyTurns: input.conversationHistoryTurns,
        hasDoctorEvidence: Boolean(input.doctorEvidence),
        hasRollbackEvidence: Boolean(input.rollbackEvidence?.attempted),
        hasSandboxEvidence: Boolean(input.sandboxEvidence),
        hasPredictiveWarning: Boolean(input.impactAssessment.likelyFailureMode),
        verifySuccess: input.verifySuccess,
        affectedFilesCount: input.impactAssessment.affectedFiles.length,
        blockedReasonCount: input.releaseGateEvidence.blockedReasons.length,
      },
      replayPayload: {
        workspacePath: input.workspacePath,
        conversationId: input.conversationId,
        actionType: input.actionType,
        riskLevel: input.impactAssessment.riskLevel,
        likelyFailureMode: input.impactAssessment.likelyFailureMode,
        verifyChecklist: input.impactAssessment.verifyChecklist.slice(0, 8),
        blockedReasons: input.releaseGateEvidence.blockedReasons.slice(0, 8),
        relatedFiles: input.diagnosisEvidence.relatedFiles.slice(0, 10),
      },
      exportHint:
        'Use share/export flow for secure handoff: keep redaction enabled and include replay checklist + blocked reasons.',
      sensitivityLabel:
        input.impactAssessment.riskLevel === 'critical'
          ? 'confidential'
          : input.impactAssessment.riskLevel === 'high'
            ? 'restricted'
            : 'internal',
    };
  }

  private _buildReleaseReadinessCommanderArtifact(input: {
    actionType: string;
    actionId: string;
    workspacePath?: string;
    confidence: number;
    verifySuccess: boolean;
    releaseGateEvidence: {
      scopeKnown: boolean;
      verifyPathPresent: boolean;
      rollbackPathPresent: boolean;
      blockedReasons: string[];
    };
    sandboxEvidence?: {
      status: 'passed' | 'failed' | 'skipped';
    };
    doctorEvidence?: {
      errors?: number;
      warnings?: number;
    };
  }):
    | {
        artifactId: string;
        schemaVersion: 'v1';
        generatedAt: string;
        workspacePath: string;
        actionId: string;
        decision: 'go' | 'no-go';
        confidence: number;
        blockingReasons: string[];
        evidence: {
          verifyPackContractStatus: 'passed' | 'failed' | 'skipped' | 'unavailable';
          sandboxStatus: 'passed' | 'failed' | 'skipped' | 'unavailable';
          doctorErrors: number;
          doctorWarnings: number;
          scopeKnown: boolean;
          verifyPathPresent: boolean;
          rollbackPathPresent: boolean;
        };
        summary: {
          goNoGoRationale: string;
          recommendedNextStep: string;
        };
      }
    | undefined {
    if (input.actionType !== 'release-readiness-commander' || !input.workspacePath) {
      return undefined;
    }

    const verifyPackContractStatus =
      input.sandboxEvidence?.status === 'passed' ||
      input.sandboxEvidence?.status === 'failed' ||
      input.sandboxEvidence?.status === 'skipped'
        ? input.sandboxEvidence.status
        : 'unavailable';

    const evidence = {
      verifyPackContractStatus,
      sandboxStatus: verifyPackContractStatus,
      doctorErrors: Math.max(0, input.doctorEvidence?.errors ?? 0),
      doctorWarnings: Math.max(0, input.doctorEvidence?.warnings ?? 0),
      scopeKnown: input.releaseGateEvidence.scopeKnown,
      verifyPathPresent: input.releaseGateEvidence.verifyPathPresent,
      rollbackPathPresent: input.releaseGateEvidence.rollbackPathPresent,
    } as const;

    const blockingReasons = Array.from(
      new Set([
        ...input.releaseGateEvidence.blockedReasons,
        ...(evidence.doctorErrors > 0 ? [`Doctor reported ${evidence.doctorErrors} error(s)`] : []),
        ...(evidence.verifyPackContractStatus !== 'passed'
          ? [`Verify-pack contract status is ${evidence.verifyPackContractStatus}`]
          : []),
        ...(!evidence.scopeKnown ? ['Affected scope is unknown'] : []),
        ...(!evidence.verifyPathPresent ? ['Verify path is missing'] : []),
        ...(!evidence.rollbackPathPresent ? ['Rollback path is missing'] : []),
      ])
    ).slice(0, 12);

    const decision: 'go' | 'no-go' =
      input.verifySuccess &&
      blockingReasons.length === 0 &&
      evidence.verifyPackContractStatus === 'passed' &&
      evidence.rollbackPathPresent
        ? 'go'
        : 'no-go';

    const goNoGoRationale =
      decision === 'go'
        ? 'All release-readiness checks are green with no unresolved blockers.'
        : 'One or more release-readiness blockers are unresolved; ship should remain blocked.';

    const recommendedNextStep =
      decision === 'go'
        ? 'Proceed with release gate execution and keep rollback path documented in the release note.'
        : blockingReasons[0]
          ? `Resolve blocker: ${blockingReasons[0]}, then regenerate the commander artifact.`
          : 'Collect missing evidence and rerun release readiness commander.';

    return {
      artifactId: `release-readiness-${input.actionId}-${Date.now().toString(36)}`,
      schemaVersion: 'v1',
      generatedAt: new Date().toISOString(),
      workspacePath: input.workspacePath,
      actionId: input.actionId,
      decision,
      confidence: Math.max(0, Math.min(100, Math.round(input.confidence))),
      blockingReasons,
      evidence,
      summary: {
        goNoGoRationale,
        recommendedNextStep,
      },
    };
  }

  private async _resolveIncidentReplayWorkspacePath(
    preferredWorkspacePath?: string
  ): Promise<{ workspacePath: string; workspaceName: string } | null> {
    const candidatePaths: string[] = [];

    if (preferredWorkspacePath && preferredWorkspacePath.trim()) {
      candidatePaths.push(preferredWorkspacePath.trim());
    }

    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    if (selectedWorkspace?.path) {
      candidatePaths.push(selectedWorkspace.path);
    }

    if (vscode.workspace.workspaceFolders?.length) {
      candidatePaths.push(vscode.workspace.workspaceFolders[0].uri.fsPath);
    }

    for (const candidate of candidatePaths) {
      if (!candidate) {
        continue;
      }
      if (await fs.pathExists(candidate)) {
        return {
          workspacePath: candidate,
          workspaceName:
            selectedWorkspace?.path === candidate
              ? selectedWorkspace.name
              : path.basename(candidate),
        };
      }
    }

    return null;
  }

  private async _handleExportIncidentReproPack(
    data: MessagePayload,
    requestId?: string
  ): Promise<void> {
    const reproPack =
      data &&
      typeof data === 'object' &&
      data.incidentReproPack &&
      typeof data.incidentReproPack === 'object'
        ? (data.incidentReproPack as {
            packId?: string;
            status?: string;
            capturedAt?: string;
            schemaVersion?: string;
            workspacePath?: string;
            conversationId?: string;
            actionId?: string;
            redaction?: {
              policy?: string;
              applied?: boolean;
              redactedFields?: string[];
            };
            summary?: {
              historyTurns?: number;
              hasDoctorEvidence?: boolean;
              hasRollbackEvidence?: boolean;
              hasSandboxEvidence?: boolean;
              hasPredictiveWarning?: boolean;
              verifySuccess?: boolean;
              affectedFilesCount?: number;
              blockedReasonCount?: number;
            };
            replayPayload?: {
              workspacePath?: string;
              conversationId?: string;
              actionType?: string;
              riskLevel?: 'low' | 'medium' | 'high' | 'critical';
              likelyFailureMode?: string;
              verifyChecklist?: string[];
              blockedReasons?: string[];
              relatedFiles?: string[];
            };
            exportHint?: string;
            sensitivityLabel?: 'internal' | 'restricted' | 'confidential';
            memoryInfluenceAuditTimeline?: IncidentMemoryInfluenceAuditEntry[];
          })
        : undefined;

    const messageAuditTimeline = Array.isArray(data?.memoryInfluenceAuditTimeline)
      ? (data.memoryInfluenceAuditTimeline as IncidentMemoryInfluenceAuditEntry[])
      : [];

    if (!reproPack?.packId || !reproPack.replayPayload) {
      vscode.window.showWarningMessage('No incident repro pack is available to export.');
      return;
    }

    const workspacePathInput =
      typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : typeof reproPack.workspacePath === 'string' && reproPack.workspacePath.trim()
          ? reproPack.workspacePath.trim()
          : undefined;

    const exportProjectPath =
      typeof data?.projectPath === 'string' && data.projectPath.trim()
        ? data.projectPath.trim()
        : undefined;

    const workspaceResolution = await this._resolveIncidentReplayWorkspacePath(workspacePathInput);
    const defaultFileName = `${reproPack.packId}-redacted-bundle.json`;
    const defaultUri = workspaceResolution
      ? vscode.Uri.file(
          path.join(workspaceResolution.workspacePath, '.rapidkit', 'reports', defaultFileName)
        )
      : undefined;

    const outputUri = await vscode.window.showSaveDialog({
      title: 'Export Incident Repro Pack (Redacted)',
      saveLabel: 'Export Redacted Bundle',
      defaultUri,
      filters: {
        JSON: ['json'],
      },
    });

    if (!outputUri) {
      return;
    }

    const redactedBundle = buildLinkSafeExportBundle(
      {
        ...reproPack,
        packId: reproPack.packId,
        replayPayload: {
          ...reproPack.replayPayload,
          riskLevel:
            reproPack.replayPayload.riskLevel === 'low' ||
            reproPack.replayPayload.riskLevel === 'medium' ||
            reproPack.replayPayload.riskLevel === 'high' ||
            reproPack.replayPayload.riskLevel === 'critical'
              ? reproPack.replayPayload.riskLevel
              : 'high',
        },
        redaction: reproPack.redaction ?? {},
        summary: reproPack.summary ?? {},
        sensitivityLabel: reproPack.sensitivityLabel,
        memoryInfluenceAuditTimeline:
          reproPack.memoryInfluenceAuditTimeline &&
          reproPack.memoryInfluenceAuditTimeline.length > 0
            ? reproPack.memoryInfluenceAuditTimeline
            : messageAuditTimeline,
      },
      workspaceResolution?.workspaceName || path.basename(workspacePathInput || '') || 'workspace'
    );

    await vscode.workspace.fs.writeFile(
      outputUri,
      Buffer.from(JSON.stringify(redactedBundle, null, 2), 'utf8')
    );

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.studio.incident_repro_pack_exported',
      workspaceResolution?.workspacePath || workspacePathInput,
      {
        packId: redactedBundle.incident_repro_pack.packId,
        redactionApplied: true,
        verifyChecklistCount:
          redactedBundle.incident_repro_pack.replayPayload.verifyChecklist.length,
        blockedReasonCount: redactedBundle.incident_repro_pack.replayPayload.blockedReasons.length,
        ...(exportProjectPath ? { projectPath: exportProjectPath } : {}),
      }
    );

    vscode.window.showInformationMessage(`Incident repro bundle exported: ${outputUri.fsPath}`);

    this._postChatBrainWebviewMessage({
      command: 'aiChatActionProgress',
      data: {
        stage: 'repro-exported',
        progress: 100,
        note: `Redacted bundle exported: ${path.basename(outputUri.fsPath)}`,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  private async _handleImportIncidentReproPack(requestId?: string): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: {
        JSON: ['json'],
        'All Files': ['*'],
      },
      openLabel: 'Import Incident Repro Bundle',
      title: 'Select incident repro bundle (JSON)',
    });

    const fileUri = picked?.[0];
    if (!fileUri) {
      return;
    }

    try {
      const rawBuffer = await vscode.workspace.fs.readFile(fileUri);
      const rawText = Buffer.from(rawBuffer).toString('utf8');
      const parsed = JSON.parse(rawText) as Record<string, unknown>;

      const normalizedReproPack = parseImportedReproBundle(parsed);
      const rawReplayWorkspacePath =
        typeof normalizedReproPack.replayPayload.workspacePath === 'string'
          ? normalizedReproPack.replayPayload.workspacePath.trim()
          : '';
      const workspaceResolution =
        await this._resolveIncidentReplayWorkspacePath(rawReplayWorkspacePath);

      if (!workspaceResolution) {
        throw new Error(
          'No local workspace is available for replay. Select or open a workspace first.'
        );
      }

      const initialQuery = buildIncidentReplayQuery(normalizedReproPack);
      this._pendingImportedIncidentReplayByWorkspace.set(workspaceResolution.workspacePath, {
        packId: normalizedReproPack.packId,
        actionType: normalizedReproPack.replayPayload.actionType,
        riskLevel: normalizedReproPack.replayPayload.riskLevel,
        likelyFailureMode: normalizedReproPack.replayPayload.likelyFailureMode,
        verifyChecklist: normalizedReproPack.replayPayload.verifyChecklist,
        blockedReasons: normalizedReproPack.replayPayload.blockedReasons,
        relatedFiles: normalizedReproPack.replayPayload.relatedFiles,
        importedFrom: path.basename(fileUri.fsPath),
      });

      this._panel.webview.postMessage({
        command: 'openIncidentStudio',
        data: {
          workspacePath: workspaceResolution.workspacePath,
          workspaceName: workspaceResolution.workspaceName,
          initialQuery,
        },
        meta: { requestId, version: 'v1' },
      });

      await WorkspaceUsageTracker.getInstance().trackCommandEvent(
        'workspai.studio.incident_repro_pack_imported',
        workspaceResolution.workspacePath,
        {
          packId: normalizedReproPack.packId,
          sourceFile: path.basename(fileUri.fsPath),
          verifyChecklistCount: normalizedReproPack.replayPayload.verifyChecklist.length,
          blockedReasonCount: normalizedReproPack.replayPayload.blockedReasons.length,
        }
      );

      // Importing a repro pack from an external file is a team-expansion signal:
      // the bundle originated from a different session/user and is now being replayed here.
      this._trackStudioEvent(
        'workspai.studio.team_expansion_triggered',
        workspaceResolution.workspacePath,
        {
          packId: normalizedReproPack.packId,
          sourceFile: path.basename(fileUri.fsPath),
          actionType: normalizedReproPack.replayPayload.actionType ?? 'unknown',
          expansionType: 'repro_pack_import',
        }
      );

      this._trackStudioEvent(
        'workspai.studio.incident_replay_ready',
        workspaceResolution.workspacePath,
        {
          packId: normalizedReproPack.packId,
          actionType: normalizedReproPack.replayPayload.actionType,
          verifyChecklistCount: normalizedReproPack.replayPayload.verifyChecklist.length,
          blockedReasonCount: normalizedReproPack.replayPayload.blockedReasons.length,
        }
      );

      vscode.window.showInformationMessage(
        `Incident repro bundle imported and queued for replay: ${path.basename(fileUri.fsPath)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to import incident repro bundle: ${message}`);
    }
  }

  private async _buildIncidentWave2Contracts(input: {
    requestId?: string;
    conversationId?: string;
    actionId: string;
    actionType: string;
    actionQuery?: string;
    workspacePath?: string;
    actionPolicy: ReturnType<typeof classifyIncidentActionPolicy>;
    graphSnapshot: IncidentWorkspaceGraphSnapshot;
    doctorEvidence?: {
      healthScoreText: string;
      generatedAt?: string;
      passed?: number;
      warnings?: number;
      errors?: number;
    };
    verifyReady: boolean;
    verifySuccess: boolean;
    rollbackRuntimePolicy?: {
      approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
      requiresManualApproval: boolean;
      approvedByUser: boolean;
      protectedPathPrefixes: string[];
    };
  }): Promise<{
    systemGraphSnapshot: {
      requestId?: string;
      workspacePath: string;
      projectPath?: string;
      graphVersion: string;
      nodes: Array<{
        id: string;
        type:
          | 'route'
          | 'controller'
          | 'service'
          | 'model'
          | 'datastore'
          | 'test'
          | 'infra-service'
          | 'db-schema';
        label: string;
        filePath?: string;
        confidence: number;
      }>;
      edges: Array<{
        sourceId: string;
        targetId: string;
        relation: string;
      }>;
      summary: {
        nodeCount: number;
        edgeCount: number;
        supportedTopology: string;
      };
    };
    impactAssessment: {
      requestId?: string;
      source: string[];
      confidence: number;
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      affectedFiles: string[];
      affectedModules: string[];
      affectedTests: string[];
      impactScoreContract: ImpactScoreContractV1;
      likelyFailureMode?: string;
      rationale: string[];
      verifyChecklist: string[];
      blockMutationWhenScopeUnknown: boolean;
    };
    predictiveWarning?: {
      requestId?: string;
      warningId: string;
      confidenceBand: 'low' | 'medium' | 'high';
      predictedFailure?: string;
      affectedScopeSummary?: string;
      nextSafeAction?: string;
      verifyChecklist: string[];
      telemetrySeed: {
        predictionKey: string;
        evidenceSources: string[];
      };
    };
    releaseGateEvidence: {
      requestId?: string;
      scopeKnown: boolean;
      verifyPathPresent: boolean;
      rollbackPathPresent: boolean;
      confidenceSufficient: boolean;
      blockedReasons: string[];
    };
    architectureTelemetry: {
      warningCount: number;
      warnings: string[];
      unknownScopeBlocked: boolean;
    };
    contractRuntimeEvidence: WorkspaiContractRuntimeEvidence;
  }> {
    const workspacePath =
      input.workspacePath ||
      input.graphSnapshot.workspace.path ||
      this._resolveTelemetryWorkspacePath() ||
      '';
    const selectedProjectPath = input.graphSnapshot.project.selectedProject?.path;
    const indexedGraph = await indexProjectSystemGraph({
      workspacePath,
      projectPath: selectedProjectPath || undefined,
      framework: input.graphSnapshot.project.framework,
      kit: input.graphSnapshot.project.kit,
    });
    const predictionKpiStatus = workspacePath
      ? await WorkspaceUsageTracker.getInstance().getStudioPredictionKpiStatus(workspacePath)
      : null;

    const moduleSeeds =
      indexedGraph.topModules.length > 0
        ? indexedGraph.topModules.slice(0, 4)
        : input.graphSnapshot.topology.topModules.slice(0, 4);
    const actionSeedTokens = input.actionType
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 3)
      .slice(0, 3);
    const impactQuery = queryProjectSystemGraphImpact(indexedGraph, {
      seedFilePaths: selectedProjectPath ? [selectedProjectPath] : [],
      seedModules: Array.from(new Set([...moduleSeeds, ...actionSeedTokens])),
      maxDepth: 2,
      maxNodes: 36,
    });
    const deterministicScore = scoreSystemGraphImpactDeterministic({
      impactQuery,
      graphSnapshot: indexedGraph,
      doctorErrors: input.doctorEvidence?.errors ?? 0,
      doctorWarnings: input.doctorEvidence?.warnings ?? 0,
      requiresImpactReview: input.actionPolicy.requiresImpactReview,
      requiresVerifyPath: input.actionPolicy.requiresVerifyPath,
      riskClass: input.actionPolicy.riskClass,
    });
    const impactScoreContract = buildImpactScoreContractV1({
      impactQuery,
      scoring: deterministicScore,
      graphSnapshot: indexedGraph,
      generatedAt: new Date().toISOString(),
    });

    const nodes: Array<{
      id: string;
      type:
        | 'route'
        | 'controller'
        | 'service'
        | 'model'
        | 'datastore'
        | 'test'
        | 'infra-service'
        | 'db-schema';
      label: string;
      filePath?: string;
      confidence: number;
      symbolName?: string;
      startLine?: number;
    }> =
      indexedGraph.nodes.length > 0
        ? indexedGraph.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            label: node.label,
            filePath: node.filePath,
            confidence: node.confidence,
            symbolName: node.symbolName,
            startLine: node.startLine,
          }))
        : moduleSeeds.map((moduleName) => ({
            id: `service:${moduleName}`,
            type: 'service',
            label: `${moduleName} service`,
            filePath: `src/${moduleName}`,
            confidence: 70,
          }));

    const edges: Array<{
      sourceId: string;
      targetId: string;
      relation: string;
    }> =
      indexedGraph.edges.length > 0
        ? indexedGraph.edges.map((edge) => ({
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            relation: edge.relation,
          }))
        : [];

    if (
      selectedProjectPath &&
      nodes.length > 0 &&
      !nodes.some((node) => node.type === 'route' || node.type === 'controller')
    ) {
      nodes.unshift({
        id: 'route:entry',
        type: 'route',
        label: 'project entry route',
        filePath: selectedProjectPath,
        confidence: 65,
      });
      edges.push({
        sourceId: 'route:entry',
        targetId: nodes[1].id,
        relation: 'calls',
      });
    }

    if (edges.length === 0) {
      for (let index = 0; index < moduleSeeds.length - 1; index += 1) {
        edges.push({
          sourceId: `service:${moduleSeeds[index]}`,
          targetId: `service:${moduleSeeds[index + 1]}`,
          relation: 'depends-on',
        });
      }
    }

    const contractRuntimeEvidence = await evaluateWorkspaiContractRuntime({
      workspacePath,
      projectPath: selectedProjectPath,
    });

    const sources = ['graph'];
    if (input.graphSnapshot.evidence.hasDoctorEvidence) {
      sources.push('doctor');
    }
    if (input.graphSnapshot.evidence.hasGitDiff) {
      sources.push('runtime');
    }
    if (selectedProjectPath) {
      sources.push('selection');
    }
    if (contractRuntimeEvidence.evaluated) {
      sources.push('contracts');
    }

    const confidence = Math.max(0, Math.min(100, deterministicScore.confidence));

    const affectedModules =
      impactQuery.impactedModules.length > 0
        ? impactQuery.impactedModules.slice(0, 3)
        : moduleSeeds.slice(0, 3);
    const affectedFilesFromGraph =
      impactQuery.impactedNodes.length > 0
        ? impactQuery.impactedNodes
            .map((node) => node.filePath)
            .filter(
              (filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0
            )
            .slice(0, 8)
        : nodes
            .map((node) => node.filePath)
            .filter(
              (filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0
            )
            .slice(0, 8);
    const affectedFiles = Array.from(
      new Set([
        ...(selectedProjectPath ? [selectedProjectPath] : []),
        ...affectedFilesFromGraph,
        ...affectedModules.map((moduleName) => `src/${moduleName}`),
      ])
    );
    const affectedTests = Array.from(
      new Set([
        ...impactQuery.candidateTests.slice(0, 4),
        ...nodes
          .filter((node) => node.type === 'test' && typeof node.filePath === 'string')
          .map((node) => node.filePath as string)
          .slice(0, 4),
        ...affectedModules.map((moduleName) => `tests/${moduleName}.spec.ts`),
      ])
    );

    const likelyFailureMode =
      deterministicScore.likelyFailureMode ||
      ((input.doctorEvidence?.errors ?? 0) > 0
        ? `${input.doctorEvidence?.errors} doctor error(s) indicate unresolved runtime risk.`
        : input.actionPolicy.requiresImpactReview
          ? 'Mutation may break downstream modules if applied without impact review.'
          : undefined);

    const verifyChecklist: string[] = [];
    if (input.actionPolicy.requiresImpactReview) {
      verifyChecklist.push('Run change-impact-lite and review affected modules before apply.');
    }
    if (input.actionPolicy.requiresVerifyPath) {
      verifyChecklist.push('Run deterministic verify command and capture output evidence.');
    }
    if ((input.doctorEvidence?.errors ?? 0) > 0) {
      verifyChecklist.push(
        `Resolve ${input.doctorEvidence?.errors} doctor error(s) before completion claim.`
      );
    }
    if (verifyChecklist.length === 0) {
      verifyChecklist.push('No blocking verify checks detected for this action class.');
    }
    if (impactQuery.unknownScope && input.actionPolicy.requiresImpactReview) {
      verifyChecklist.push(
        'Scope is uncertain. Ask for clarification before mutation recommendation.'
      );
    }
    if (deterministicScore.architectureWarnings.length > 0) {
      verifyChecklist.push(
        `Architecture warning: ${deterministicScore.architectureWarnings[0]}. Run focused impact review before apply.`
      );
    }
    if (contractRuntimeEvidence.errors.length > 0) {
      verifyChecklist.push(
        `Fix Workspai contract errors before apply: ${contractRuntimeEvidence.errors[0]}`
      );
    }
    if (contractRuntimeEvidence.warnings.length > 0) {
      verifyChecklist.push(
        `Review Workspai contract warnings: ${contractRuntimeEvidence.warnings[0]}`
      );
    }
    if (!contractRuntimeEvidence.evaluated && input.actionPolicy.requiresImpactReview) {
      verifyChecklist.push(
        'No C06 Workspai contracts found. Add architecture.config, project.mapping, and execution.policy for stronger architecture control.'
      );
    }

    const c07GateEvaluation = await evaluateIncidentC07Gates({
      workspacePath,
      projectPath: selectedProjectPath,
      actionType: input.actionType,
      actionPolicy: {
        riskClass: input.actionPolicy.riskClass,
        riskLevel: input.actionPolicy.riskLevel,
        requiresImpactReview: input.actionPolicy.requiresImpactReview,
        requiresVerifyPath: input.actionPolicy.requiresVerifyPath,
      },
      verifyReady: input.verifyReady,
      verifySuccess: input.verifySuccess,
      verifyChecklist,
      doctorErrors: input.doctorEvidence?.errors ?? 0,
      rollbackApproved:
        !input.rollbackRuntimePolicy?.requiresManualApproval ||
        input.rollbackRuntimePolicy.approvedByUser,
    });

    if (c07GateEvaluation.scopeBlocked) {
      verifyChecklist.push('C07 gate blocked mutation: architecture scope is uncertain.');
    }

    const scopeKnown =
      deterministicScore.scopeKnown &&
      !c07GateEvaluation.scopeBlocked &&
      (affectedFiles.length > 0 || affectedModules.length > 0 || affectedTests.length > 0);
    const verifyCompletenessCheck = assessVerifyCompleteness(input.actionPolicy, verifyChecklist);
    const verifyPathPresent = verifyCompletenessCheck.adequate;
    const rollbackPathPresent =
      (input.actionPolicy.riskClass === 'informational' ||
        input.actionPolicy.riskClass === 'non-mutating-executable' ||
        input.verifyReady) &&
      (!input.rollbackRuntimePolicy?.requiresManualApproval ||
        input.rollbackRuntimePolicy.approvedByUser);
    const confidenceSufficient = confidence >= (input.actionPolicy.requiresImpactReview ? 60 : 50);

    const blockedReasons: string[] = [];
    if (input.actionPolicy.requiresImpactReview && !scopeKnown) {
      blockedReasons.push('Affected scope is unknown while impact review is required.');
    }
    if (input.actionPolicy.requiresVerifyPath && !input.verifyReady) {
      blockedReasons.push('Verification evidence is missing for a verify-first action.');
    }
    if (
      input.actionPolicy.requiresVerifyPath &&
      !verifyPathPresent &&
      verifyCompletenessCheck.reason
    ) {
      blockedReasons.push(verifyCompletenessCheck.reason);
    }
    if (!rollbackPathPresent) {
      if (
        input.rollbackRuntimePolicy?.requiresManualApproval &&
        !input.rollbackRuntimePolicy.approvedByUser
      ) {
        blockedReasons.push(
          `Rollback policy (${input.rollbackRuntimePolicy.approvalMode}) requires manual approval before auto-restore can run.`
        );
      } else {
        blockedReasons.push('Rollback path is unavailable for this risk class.');
      }
    }
    if (!confidenceSufficient) {
      blockedReasons.push('Impact confidence is below release-safe threshold.');
    }
    if (!input.verifySuccess && (input.doctorEvidence?.errors ?? 0) > 0) {
      blockedReasons.push(`${input.doctorEvidence?.errors} doctor error(s) remain unresolved.`);
    }
    blockedReasons.push(...contractRuntimeEvidence.errors);
    blockedReasons.push(...deterministicScore.blockedReasons);
    blockedReasons.push(...c07GateEvaluation.blockedReasons);

    const architectureWarnings = Array.from(
      new Set(
        [
          ...contractRuntimeEvidence.warnings,
          ...(contractRuntimeEvidence.evaluated ? [contractRuntimeEvidence.summary] : []),
          ...deterministicScore.architectureWarnings,
          ...(c07GateEvaluation.scopeBlocked
            ? ['C07 gate blocked mutation due to uncertain architecture scope.']
            : []),
        ]
          .filter((warning) => typeof warning === 'string' && warning.trim().length > 0)
          .map((warning) => warning.trim())
      )
    );
    const unknownScopeBlocked =
      c07GateEvaluation.scopeBlocked ||
      blockedReasons.some((reason) => /scope is unknown|scope is uncertain/i.test(reason));

    const predictiveWarningNeeded =
      input.actionPolicy.requiresImpactReview || (input.doctorEvidence?.errors ?? 0) > 0;
    const warningId = `${input.conversationId || 'conv'}:${input.actionId}:prediction`;
    const predictionKey = `${input.actionType}:${warningId}`;
    const predictiveWarning = predictiveWarningNeeded
      ? buildIncidentPredictiveWarning({
          impactAssessment: {
            confidence,
            riskLevel: deterministicScore.riskLevel,
            affectedFiles,
            affectedModules,
            affectedTests,
            likelyFailureMode,
            rationale: [
              'Impact is derived from workspace graph topology and doctor/runtime evidence.',
              input.actionPolicy.requiresImpactReview
                ? 'Action policy requires impact review before completion claim.'
                : 'Action policy allows lower-risk execution path.',
              ...(c07GateEvaluation.evaluated
                ? [
                    c07GateEvaluation.scopeBlocked
                      ? 'C07 architecture gates blocked mutation due to uncertain mapping scope.'
                      : 'C07 architecture gates passed for the current action path.',
                  ]
                : []),
              ...deterministicScore.architectureWarnings.slice(0, 2),
              ...deterministicScore.rationale.slice(0, 3),
            ],
            verifyChecklist,
          },
          actionPolicy: input.actionPolicy,
          doctorEvidence: input.doctorEvidence,
          graphSummary: {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            supportedTopology:
              indexedGraph.supportedTopology ||
              input.graphSnapshot.project.kit ||
              input.graphSnapshot.project.framework,
          },
          evidenceSources: sources,
          telemetryStatus: predictionKpiStatus,
          verifyReady: input.verifyReady,
          verifySuccess: input.verifySuccess,
          signalContext: {
            actionType: input.actionType,
            queryText: input.actionQuery,
          },
        })
      : null;

    return {
      systemGraphSnapshot: {
        requestId: input.requestId,
        workspacePath,
        projectPath: selectedProjectPath,
        graphVersion: input.graphSnapshot.snapshotVersion || 'v1',
        nodes,
        edges,
        summary: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          supportedTopology:
            indexedGraph.supportedTopology ||
            input.graphSnapshot.project.kit ||
            input.graphSnapshot.project.framework,
        },
      },
      impactAssessment: {
        requestId: input.requestId,
        source: sources,
        confidence,
        riskLevel: deterministicScore.riskLevel,
        affectedFiles,
        affectedModules,
        affectedTests,
        impactScoreContract,
        likelyFailureMode,
        rationale: [
          'Impact is derived from workspace graph topology and doctor/runtime evidence.',
          ...(contractRuntimeEvidence.evaluated ? [contractRuntimeEvidence.summary] : []),
          input.actionPolicy.requiresImpactReview
            ? 'Action policy requires impact review before completion claim.'
            : 'Action policy allows lower-risk execution path.',
          ...(c07GateEvaluation.evaluated
            ? [
                c07GateEvaluation.scopeBlocked
                  ? 'C07 architecture gates blocked mutation due to uncertain mapping scope.'
                  : 'C07 architecture gates passed for the current action path.',
              ]
            : []),
          ...deterministicScore.architectureWarnings.slice(0, 2),
          ...deterministicScore.rationale.slice(0, 3),
        ],
        verifyChecklist,
        blockMutationWhenScopeUnknown:
          input.actionPolicy.requiresImpactReview ||
          input.actionPolicy.requiresVerifyPath ||
          c07GateEvaluation.scopeBlocked,
      },
      predictiveWarning: predictiveWarning
        ? {
            requestId: input.requestId,
            warningId,
            confidenceBand: predictiveWarning.confidenceBand,
            predictedFailure: predictiveWarning.predictedFailure,
            affectedScopeSummary: predictiveWarning.affectedScopeSummary,
            nextSafeAction: predictiveWarning.nextSafeAction,
            verifyChecklist: predictiveWarning.verifyChecklist,
            telemetrySeed: {
              predictionKey,
              evidenceSources: predictiveWarning.evidenceSources,
            },
          }
        : undefined,
      releaseGateEvidence: {
        requestId: input.requestId,
        scopeKnown,
        verifyPathPresent,
        rollbackPathPresent,
        confidenceSufficient,
        blockedReasons: Array.from(new Set(blockedReasons)),
      },
      architectureTelemetry: {
        warningCount: architectureWarnings.length,
        warnings: architectureWarnings.slice(0, 4),
        unknownScopeBlocked,
      },
      contractRuntimeEvidence,
    };
  }

  private async _readDoctorEvidenceSnapshot(workspacePath?: string) {
    return readDoctorEvidenceSnapshot(workspacePath);
  }

  private async _buildIncidentMemoryReuseSnapshot(input: {
    workspacePath?: string;
    queryText?: string;
    actionType?: string;
  }) {
    const workspacePath = input.workspacePath;
    if (!workspacePath) {
      return null;
    }

    try {
      const memoryService = WorkspaceMemoryService.getInstance();
      const [memory, doctorSummary] = await Promise.all([
        memoryService.readNearest(workspacePath),
        this._readDoctorEvidenceSnapshot(workspacePath),
      ]);

      return buildIncidentMemoryReuseSnapshot({
        workspaceMemoryContext: memory.context,
        conventions: memory.conventions,
        decisions: memory.decisions,
        doctorFixCommands: doctorSummary?.fixCommands,
        queryText: input.queryText,
        actionType: input.actionType,
      });
    } catch {
      return null;
    }
  }

  private async _detectIncidentRepeatSignal(input: {
    workspacePath: string;
    queryText?: string;
    actionType?: string;
  }) {
    try {
      const memoryService = WorkspaceMemoryService.getInstance();
      const memory = await memoryService.readNearest(input.workspacePath);
      return detectRepeatedIncident({
        decisions: memory.decisions,
        queryText: input.queryText,
        actionType: input.actionType,
      });
    } catch {
      return null;
    }
  }

  private async _persistIncidentReplayLearning(input: {
    workspacePath: string;
    packId: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
  }): Promise<boolean> {
    try {
      const memoryService = WorkspaceMemoryService.getInstance();
      const currentMemory = await memoryService.read(input.workspacePath);
      const nextMemory = mergeIncidentReplayLearningIntoMemory(currentMemory, {
        packId: input.packId,
        actionType: input.actionType,
        riskLevel: input.riskLevel,
        likelyFailureMode: input.likelyFailureMode,
        verifyChecklist: input.verifyChecklist,
        blockedReasons: input.blockedReasons,
        relatedFiles: input.relatedFiles,
      });

      if (JSON.stringify(nextMemory) === JSON.stringify(currentMemory)) {
        return false;
      }

      await memoryService.write(input.workspacePath, nextMemory, {
        actor: 'incident-studio.replay-learning',
        operation: 'incident-replay-learning',
        mode: 'system-enrichment',
        reason: 'Persist replay learning from incident repro pack evidence.',
        approvedByUser: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async _handleAiChatQuery(data: MessagePayload, requestId?: string) {
    const conversationId =
      typeof data?.conversationId === 'string' ? data.conversationId : undefined;
    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    const normalizedRequestId =
      typeof requestId === 'string' && requestId.trim() ? requestId.trim() : undefined;
    const requestedModelId = normalizeRequestedModelId(data?.modelId);

    if (!conversationId || !message) {
      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId: conversationId ?? '',
          code: 'INVALID_INPUT',
          message: 'conversationId and message are required.',
          retryable: true,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    if (!trackChatBrainRequestStart(normalizedRequestId, this._chatBrainInFlightRequestIds)) {
      this._postChatBrainWebviewMessage({
        command: 'aiChatPartialFailure',
        data: {
          conversationId,
          code: 'DUPLICATE_REQUEST',
          message: 'Duplicate requestId detected. Ignoring replayed chat query.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });

      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'DUPLICATE_REQUEST',
          message: 'Duplicate requestId detected. Ignoring replayed chat query.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const existingConversation = this._chatBrainConversations.get(conversationId);
    const current = existingConversation || {
      workspacePath: typeof data?.workspacePath === 'string' ? data.workspacePath : undefined,
      projectPath:
        typeof data?.projectPath === 'string' && data.projectPath.trim()
          ? data.projectPath.trim()
          : undefined,
      projectName:
        typeof data?.projectName === 'string' && data.projectName.trim()
          ? data.projectName.trim()
          : undefined,
      projectType:
        typeof data?.projectType === 'string' && data.projectType.trim()
          ? data.projectType.trim()
          : undefined,
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      phase: 'detect' as const,
      history: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
      queryCount: 0,
      actionCount: 0,
      repeatedIncidentDetected: false,
      framework: undefined as string | undefined,
      scopeMode:
        data?.scopeMode === 'project' || data?.scopeMode === 'workspace'
          ? data.scopeMode
          : undefined,
    };

    current.workspacePath =
      (typeof data?.workspacePath === 'string' && data.workspacePath.trim()) ||
      current.workspacePath;
    current.projectPath =
      (typeof data?.projectPath === 'string' && data.projectPath.trim()) || current.projectPath;
    current.projectName =
      (typeof data?.projectName === 'string' && data.projectName.trim()) || current.projectName;
    current.projectType =
      (typeof data?.projectType === 'string' && data.projectType.trim()) || current.projectType;

    if (!current.framework) {
      current.framework = current.projectPath
        ? await this._inferFrameworkFromWorkspace(current.projectPath)
        : current.workspacePath
          ? await this._inferFrameworkFromWorkspace(current.workspacePath)
          : undefined;
    }

    current.lastActivityAt = Date.now();
    current.phase = 'diagnose';
    current.queryCount += 1;
    current.history = [...current.history, { role: 'user' as const, content: message }].slice(-12);
    this._chatBrainConversations.set(conversationId, current);

    const routingResult = this._routeActionTypeFromMessage(message);
    this._trackStudioEvent('workspai.studio.next_action_clicked', current.workspacePath, {
      framework: current.framework ?? 'unknown',
      conversationId,
      queryCount: current.queryCount,
      actionType: routingResult.actionType,
      fallbackReason: routingResult.fallbackReason,
      projectPath: current.projectPath,
      timeToFirstActionMs: Date.now() - current.startedAt,
    });

    this._chatBrainQueryTokenSource?.cancel();
    this._chatBrainQueryTokenSource?.dispose();
    const tokenSource = new vscode.CancellationTokenSource();
    this._chatBrainQueryTokenSource = tokenSource;
    this._activeChatBrainRequestId = requestId;
    this._activeChatBrainConversationId = conversationId;

    const messageId = `msg-${Date.now()}`;
    const actionType = routingResult.actionType;
    const actionPolicy = classifyIncidentActionPolicy(actionType);
    const isFirstQuery = current.queryCount === 1;
    const memoryReuseSnapshot = isFirstQuery
      ? await this._buildIncidentMemoryReuseSnapshot({
          workspacePath: current.workspacePath,
          queryText: message,
          actionType,
        })
      : null;
    const memoryPromptHint = buildIncidentMemoryPromptHint(memoryReuseSnapshot);
    const repeatSignal =
      isFirstQuery && current.workspacePath
        ? await this._detectIncidentRepeatSignal({
            workspacePath: current.workspacePath,
            queryText: message,
            actionType,
          })
        : null;
    if (repeatSignal?.isRepeated) {
      current.repeatedIncidentDetected = true;
      this._chatBrainConversations.set(conversationId, current);
      this._trackStudioEvent('workspai.studio.repeated_incident_detected', current.workspacePath, {
        conversationId,
        actionType,
        repeatScore: repeatSignal.repeatScore,
        framework: current.framework ?? 'unknown',
        projectPath: current.projectPath,
      });
    }
    const repeatedIncidentHint =
      repeatSignal?.isRepeated && repeatSignal.matchedDecision
        ? [
            'REPEATED_INCIDENT_SIGNAL:',
            `- A similar incident was previously resolved in this workspace (similarity score: ${repeatSignal.repeatScore}).`,
            `- Matched pattern: "${repeatSignal.matchedDecision.slice(0, 140)}"`,
            '- Do NOT re-diagnose from scratch. Reuse the matched verified fix pattern.',
            '- Confirm whether the current incident matches this pattern before suggesting new steps.',
          ].join('\n')
        : '';
    let assistantText = '';
    let responseModelId: string | undefined;
    const expectedWorkspacePath = current.workspacePath;

    try {
      const { prepareAIConversation, streamAIResponse } = await import('../../core/aiService.js');
      // Derive scope intent from explicit scopeMode, then projectPath.
      const requestedScopeMode =
        data?.scopeMode === 'project' || data?.scopeMode === 'workspace'
          ? data.scopeMode
          : current.scopeMode === 'project' || current.scopeMode === 'workspace'
            ? current.scopeMode
            : current.projectPath
              ? 'project'
              : 'workspace';
      const scopeIntent: 'workspace' | 'project' = requestedScopeMode;
      current.scopeMode = scopeIntent;
      const aiContext = await this._buildChatBrainAIContext({
        workspacePath: current.workspacePath,
        projectPath: current.projectPath,
        projectName: current.projectName,
        projectType: current.projectType,
        scopeIntent,
      });
      const history = current.history.slice(-8);
      const structuredPrompt = await this._buildStructuredIncidentPrompt(message, {
        workspacePath: current.workspacePath,
        projectPath: current.projectPath,
        projectName: current.projectName,
        projectType: current.projectType,
        scopeIntent,
      });

      // Doctor snapshot is already read inside _buildStructuredIncidentPrompt;
      // reuse it here for the contract rather than reading again.
      const chatDoctorSnapshot = await this._readDoctorEvidenceSnapshot(
        current.workspacePath
      ).catch(() => undefined);

      const prepared = await prepareAIConversation(
        'ask',
        [structuredPrompt, memoryPromptHint, repeatedIncidentHint].filter(Boolean).join('\n\n'),
        aiContext,
        history,
        chatDoctorSnapshot ?? undefined
      );

      if (prepared.validation.clarificationNeeded) {
        const clarificationText =
          prepared.validation.clarificationReason ??
          `Context evidence is missing. Select a workspace/project and run ${buildRapidkitDisplayCommand(['doctor', 'workspace'])}, then retry.`;

        const nextConversation = this._chatBrainConversations.get(conversationId);
        if (nextConversation) {
          nextConversation.history = [
            ...nextConversation.history,
            {
              role: 'assistant' as const,
              content: clarificationText,
            },
          ].slice(-12);
          nextConversation.lastActionResponseText = clarificationText;
          this._chatBrainConversations.set(conversationId, nextConversation);
        }

        this._postChatBrainWebviewMessage({
          command: 'aiChatDone',
          data: {
            conversationId,
            messageId,
            finalText: clarificationText,
            phase: 'detect',
            confidence: 100,
            nextActions: [
              'Select workspace/project',
              'Run doctor workspace',
              'Retry the same query',
            ],
          },
          meta: { requestId, version: 'v1' },
        });
        return;
      }

      const maxAttempts = 2;
      let streamSucceeded = false;
      let lastStreamError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (tokenSource.token.isCancellationRequested) {
          break;
        }

        let chunkBuffer = '';
        let attemptReceivedChunk = false;
        let flushTimer: ReturnType<typeof setInterval> | null = null;
        const attemptTokenSource = new vscode.CancellationTokenSource();
        const cancelSubscription = tokenSource.token.onCancellationRequested(() => {
          attemptTokenSource.cancel();
        });
        const firstChunkTimeout = setTimeout(() => {
          if (!attemptReceivedChunk && !attemptTokenSource.token.isCancellationRequested) {
            attemptTokenSource.cancel();
          }
        }, 45_000);

        try {
          flushTimer = setInterval(() => {
            const staleRequest =
              this._activeChatBrainRequestId !== requestId ||
              this._activeChatBrainConversationId !== conversationId ||
              (expectedWorkspacePath &&
                this._chatBrainConversations.get(conversationId)?.workspacePath !==
                  expectedWorkspacePath);

            if (staleRequest && !attemptTokenSource.token.isCancellationRequested) {
              attemptTokenSource.cancel();
              return;
            }

            if (!chunkBuffer || attemptTokenSource.token.isCancellationRequested) {
              return;
            }
            this._postChatBrainWebviewMessage({
              command: 'aiChatChunk',
              data: {
                conversationId,
                messageId,
                chunk: chunkBuffer,
              },
              meta: { requestId, version: 'v1' },
            });
            chunkBuffer = '';
          }, 50);

          const streamResult = await streamAIResponse(
            prepared.messages,
            (chunk) => {
              const staleRequest =
                this._activeChatBrainRequestId !== requestId ||
                this._activeChatBrainConversationId !== conversationId ||
                (expectedWorkspacePath &&
                  this._chatBrainConversations.get(conversationId)?.workspacePath !==
                    expectedWorkspacePath);

              if (staleRequest && !attemptTokenSource.token.isCancellationRequested) {
                attemptTokenSource.cancel();
                return;
              }

              if (chunk.text) {
                attemptReceivedChunk = true;
                assistantText += chunk.text;
                chunkBuffer += chunk.text;
              }
              if (!chunk.done) {
                return;
              }
              if (flushTimer) {
                clearInterval(flushTimer);
                flushTimer = null;
              }
              if (chunkBuffer && !attemptTokenSource.token.isCancellationRequested) {
                this._postChatBrainWebviewMessage({
                  command: 'aiChatChunk',
                  data: {
                    conversationId,
                    messageId,
                    chunk: chunkBuffer,
                  },
                  meta: { requestId, version: 'v1' },
                });
                chunkBuffer = '';
              }
            },
            attemptTokenSource.token,
            requestedModelId
          );

          if (
            attemptTokenSource.token.isCancellationRequested &&
            !tokenSource.token.isCancellationRequested &&
            !attemptReceivedChunk
          ) {
            throw new Error('First chunk timeout while streaming response.');
          }

          responseModelId = streamResult.modelId;
          streamSucceeded = true;
          break;
        } catch (streamErr) {
          lastStreamError = streamErr;
          const retryable = !attemptReceivedChunk && isRetryableChatBrainError(streamErr);
          const canRetry =
            attempt < maxAttempts && retryable && !tokenSource.token.isCancellationRequested;

          if (canRetry) {
            this._postChatBrainWebviewMessage({
              command: 'aiChatActionProgress',
              data: {
                conversationId,
                actionId: messageId,
                stage: 'retrying',
                progress: 45,
                note: `Transient stream interruption detected. Retrying (${attempt + 1}/${maxAttempts})...`,
              },
              meta: { requestId, version: 'v1' },
            });
            continue;
          }

          throw streamErr;
        } finally {
          if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
          }
          clearTimeout(firstChunkTimeout);
          cancelSubscription.dispose();
          attemptTokenSource.dispose();
        }
      }

      if (!streamSucceeded) {
        throw lastStreamError instanceof Error
          ? lastStreamError
          : new Error('Chat stream failed before completion.');
      }

      if (tokenSource.token.isCancellationRequested) {
        return;
      }

      const nextConversation = this._chatBrainConversations.get(conversationId);
      const baseAssistantText = assistantText.trim() || 'No response generated.';
      const finalAssistantText = shouldAttachIncidentMemoryReuse(
        current.queryCount,
        memoryReuseSnapshot
      )
        ? prependIncidentMemoryReuseBlock(baseAssistantText, memoryReuseSnapshot)
        : baseAssistantText;

      if (nextConversation) {
        nextConversation.history = [
          ...nextConversation.history,
          {
            role: 'assistant' as const,
            content: finalAssistantText,
          },
        ].slice(-12);
        nextConversation.lastActionResponseText = finalAssistantText;
        this._chatBrainConversations.set(conversationId, nextConversation);
      }

      if (current.workspacePath) {
        const persisted = await publishStudioAIActionContractFromText({
          workspacePath: current.workspacePath,
          text: finalAssistantText,
          provider: 'chat-brain',
          postMessage: (command, payload) => {
            this._postChatBrainWebviewMessage({ command, data: payload });
          },
        });
        this._latestDashboardAIActionContract = persisted.activeContract;
        this._latestDashboardAIActionId = persisted.activeActionId;
      }

      this._postChatBrainWebviewMessage({
        command: 'aiChatActionBoard',
        data: {
          conversationId,
          messageId,
          board: {
            id: `board-${Date.now()}`,
            type: actionType === 'terminal-bridge' ? 'error' : 'solution',
            title: 'Next Safe Action',
            summary: current.projectName
              ? `Selected project: ${current.projectName} | ${this._getChatBrainPrimaryActionLabel(actionType, current.projectName)}`
              : this._getChatBrainPrimaryActionLabel(actionType),
            data: {
              route: actionType,
              confidence: 80,
              actionPolicy,
            },
            actions: [
              {
                id: `action-${Date.now()}`,
                label: this._getChatBrainPrimaryActionLabel(actionType, current.projectName),
                actionType: actionType === 'orchestrate' ? 'terminal-bridge' : actionType,
                riskLevel: actionPolicy.riskLevel,
                riskClass: actionPolicy.riskClass,
                requiresImpactReview: actionPolicy.requiresImpactReview,
                requiresVerifyPath: actionPolicy.requiresVerifyPath,
              },
              ...(actionType !== 'release-readiness-commander'
                ? [
                    {
                      id: `action-release-readiness-${Date.now()}`,
                      label: 'Generate release readiness Go/No-Go',
                      actionType: 'release-readiness-commander',
                      riskLevel: 'medium',
                    },
                  ]
                : []),
              ...(actionType !== 'verify-pack-autopilot'
                ? [
                    {
                      id: `action-verify-pack-${Date.now()}`,
                      label: 'Generate deterministic verify command pack',
                      actionType: 'verify-pack-autopilot',
                      riskLevel: 'medium',
                    },
                  ]
                : []),
              ...(actionType === 'terminal-bridge'
                ? [
                    {
                      id: `action-followup-${Date.now()}`,
                      label: 'Preview safe patch from this error',
                      actionType: 'apply-debug-patch',
                      riskLevel: 'medium',
                    },
                  ]
                : []),
            ],
          },
        },
        meta: { requestId, version: 'v1' },
      });

      this._postChatBrainWebviewMessage({
        command: 'aiChatSuggestedQuestions',
        data: {
          conversationId,
          messageId,
          questions: this._buildSuggestedQuestions(actionType, message, scopeIntent),
        },
        meta: { requestId, version: 'v1' },
      });

      this._postChatBrainWebviewMessage({
        command: 'aiChatDone',
        data: {
          conversationId,
          messageId,
          modelId: responseModelId,
          finalText: finalAssistantText,
          phase: 'diagnose',
          confidence: 80,
          nextActions: [
            'Run the next safe action',
            'Generate verification evidence',
            'Ask a scoped follow-up',
          ],
        },
        meta: { requestId, version: 'v1' },
      });
    } catch (err) {
      if (!tokenSource.token.isCancellationRequested) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const failureCode = deriveChatBrainFailureCode(err);
        const retryable = isRetryableChatBrainError(err);
        this._postChatBrainWebviewMessage({
          command: 'aiChatPartialFailure',
          data: {
            conversationId,
            code: failureCode,
            message: errMsg,
            retryable,
            board: buildChatBrainFallbackBoard(actionType, current.projectName),
          },
          meta: { requestId, version: 'v1' },
        });

        this._postChatBrainWebviewMessage({
          command: 'aiChatError',
          data: {
            conversationId,
            code: failureCode,
            message: errMsg,
            retryable,
          },
          meta: { requestId, version: 'v1' },
        });
      }
    } finally {
      if (this._chatBrainQueryTokenSource === tokenSource) {
        this._chatBrainQueryTokenSource = undefined;
      }
      if (this._activeChatBrainRequestId === requestId) {
        this._activeChatBrainRequestId = undefined;
      }
      if (this._activeChatBrainConversationId === conversationId) {
        this._activeChatBrainConversationId = undefined;
      }
      trackChatBrainRequestComplete(
        normalizedRequestId,
        this._chatBrainInFlightRequestIds,
        this._chatBrainCompletedRequestIds
      );
      tokenSource.dispose();
    }
  }

  /**
   * Build a natural-language query from an action type + optional payload.
   * Lets every action stream its answer INTO the Studio thread instead of
   * opening a separate modal.
   *
   * scopeIntent drives fundamentally different query content:
   * - 'workspace': reason across all projects, topology, shared health
   * - 'project': focus on the selected project's internals and runtime state
   */
  private async _buildInlineQueryFromAction(
    actionType: string,
    payload?: Record<string, unknown>,
    scopeIntent: 'workspace' | 'project' = 'workspace'
  ): Promise<string> {
    const isWorkspaceScope = scopeIntent === 'workspace';

    // ── terminal-bridge ──────────────────────────────────────────────────────
    if (actionType === 'terminal-bridge') {
      let terminalOutput = '';
      try {
        const clip = (await vscode.env.clipboard.readText()).trim();
        if (clip && /\n|Error:|error:|Traceback|FAILED|npm ERR|❌/.test(clip)) {
          terminalOutput = clip.slice(0, 5000);
        }
      } catch {
        // clipboard unavailable — fall through to selection
      }
      if (!terminalOutput) {
        const editor = vscode.window.activeTextEditor;
        terminalOutput = editor?.document.getText(editor.selection).trim() ?? '';
      }
      if (terminalOutput) {
        const scopeLabel = isWorkspaceScope
          ? 'Identify which workspace projects are affected and provide workspace-wide remediation steps.'
          : 'Guide me to the fastest, safest fix for this project.';
        return [
          isWorkspaceScope
            ? 'Analyze this terminal output across the workspace context and identify affected services.'
            : 'Analyze this terminal output and guide me to the fastest, safest fix.',
          '```\n' + terminalOutput + '\n```',
          `Respond with: root cause, immediate fix steps, any code-level follow-up, a prevention tip. ${scopeLabel}`,
        ].join('\n\n');
      }
      return isWorkspaceScope
        ? 'Analyze all workspace projects for runtime errors, check logs and recent terminal output across services, then surface the highest-priority cross-workspace fix.'
        : 'Analyze my project for runtime errors, check logs and recent terminal output, then suggest the highest-priority fix.';
    }

    // ── fix-preview-lite ─────────────────────────────────────────────────────
    if (actionType === 'fix-preview-lite') {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection).trim();
      const fileName = editor?.document.fileName
        ? path.basename(editor.document.fileName)
        : 'current file';
      if (selection) {
        return [
          `Preview a fix for this code in \`${fileName}\`:`,
          '```\n' + selection.slice(0, 3000) + '\n```',
          'Provide: what is wrong, the corrected code, and a one-sentence explanation of the change.',
        ].join('\n\n');
      }
      const issueSummary = typeof payload?.issueSummary === 'string' ? payload.issueSummary : '';
      if (issueSummary) {
        return `Preview the safest fix for this issue: ${issueSummary}\n\nShow the corrected code and explain why the change is safe.`;
      }
      return isWorkspaceScope
        ? 'Scan all workspace projects for the most impactful bugs or code smells. For each project with issues, show a concrete fix preview with before/after code and note any cross-project propagation risk.'
        : 'Scan my project for the most impactful bug or code smell and show a concrete fix preview with before/after code.';
    }

    // ── change-impact-lite ───────────────────────────────────────────────────
    if (actionType === 'change-impact-lite') {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection).trim();
      const fileName = editor?.document.fileName
        ? path.basename(editor.document.fileName)
        : 'current file';
      if (selection) {
        const impactLens = isWorkspaceScope
          ? 'List: affected modules/files across ALL workspace projects, cross-service propagation risk, overall risk level (low/medium/high/critical), required test updates per service, and a safe workspace-wide rollout checklist.'
          : 'List: affected modules/files, risk level (low/medium/high/critical), required test updates, and a safe rollout checklist.';
        return [
          isWorkspaceScope
            ? `Analyze the workspace-wide blast radius of changing this code in \`${fileName}\`:`
            : `Analyze the blast radius of changing this code in \`${fileName}\`:`,
          '```\n' + selection.slice(0, 3000) + '\n```',
          impactLens,
        ].join('\n\n');
      }
      return isWorkspaceScope
        ? 'Analyze the entire workspace for the highest-risk pending changes or tech debt. Identify cross-project impact: which projects are coupled, what shared dependencies could cascade, and what the safest multi-project rollout sequence is.'
        : 'Analyze the current project for the highest-risk pending change or tech debt and estimate its impact on the rest of the project.';
    }

    // ── doctor-fix ───────────────────────────────────────────────────────────
    if (actionType === 'doctor-fix') {
      const issueSummary = typeof payload?.issueSummary === 'string' ? payload.issueSummary : '';
      const projectName = typeof payload?.projectName === 'string' ? payload.projectName : '';
      const issueType = typeof payload?.issueType === 'string' ? payload.issueType : '';
      if (issueSummary) {
        return [
          `Doctor detected an issue in project "${projectName || 'unknown'}":`,
          `Type: ${issueType || 'unknown'}`,
          `Detail: ${issueSummary}`,
          '',
          'Give me the exact fix commands or code changes to resolve this. Be direct and specific.',
          ...(isWorkspaceScope
            ? [
                'Also check whether this issue pattern affects other projects in the workspace and surface any shared root cause.',
              ]
            : []),
        ].join('\n');
      }
      return isWorkspaceScope
        ? 'Run a full workspace doctor check across ALL projects and summarize the top issues per project. Group issues by root cause where possible and provide workspace-wide fix steps.'
        : 'Run a full project doctor check and explain the top issues with their exact fix steps.';
    }

    // ── workspace-memory-wizard ───────────────────────────────────────────────
    if (actionType === 'workspace-memory-wizard') {
      return isWorkspaceScope
        ? [
            'Help me capture workspace-wide architecture decisions, conventions, and cross-project patterns into memory.',
            'Cover all projects in the workspace: shared patterns, deployment topology, cross-service contracts, and team conventions.',
            'Ask the most important questions to build a comprehensive workspace-level memory profile that benefits all projects.',
            'After my answers, generate a structured workspace memory summary that spans all projects.',
          ].join('\n')
        : [
            'Help me capture the key architecture decisions and conventions from this project into memory.',
            'Ask me the most important questions to build a complete project memory profile.',
            'After my answers, generate a structured memory summary I can save.',
          ].join('\n');
    }

    // ── recipe-pack ───────────────────────────────────────────────────────────
    if (actionType === 'recipe-pack') {
      const recipeId = typeof payload?.recipeId === 'string' ? payload.recipeId : '';
      if (recipeId) {
        return `Run the AI recipe "${recipeId}" for this ${isWorkspaceScope ? 'workspace (apply across all relevant projects)' : 'project'}. Provide a step-by-step analysis and actionable output.`;
      }
      return isWorkspaceScope
        ? 'List the 5 most relevant AI recipe workflows for this workspace topology and project mix, then run the highest-impact one across all applicable projects.'
        : 'List the 5 most relevant AI recipe workflows for my current project type, then run the top one.';
    }

    // ── incident-repro-pack (KF5) ─────────────────────────────────────────────
    if (actionType === 'incident-repro-pack') {
      const incidentScope =
        typeof payload?.incidentScope === 'string' ? payload.incidentScope.trim() : '';
      const incidentSummary =
        typeof payload?.incidentSummary === 'string' ? payload.incidentSummary.trim() : '';
      return [
        'Prepare a reproducible incident pack and replay brief from the current Incident Studio context.',
        incidentScope ? `Scope: ${incidentScope}` : '',
        incidentSummary ? `Incident summary: ${incidentSummary}` : '',
        '',
        'Return exactly these sections:',
        '1) Incident reproduction checklist (deterministic, step-by-step)',
        '2) Minimal evidence bundle (logs, diff, commands, environment)',
        '3) Sanitized share payload (what is safe to share and what must be redacted)',
        '4) Replay procedure for another developer and expected pass/fail signals',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // ── apply-module-gen (A02) ────────────────────────────────────────────────
    if (actionType === 'apply-module-gen') {
      const featureIntent =
        typeof payload?.featureIntent === 'string' ? payload.featureIntent.trim() : '';
      const moduleName = typeof payload?.moduleName === 'string' ? payload.moduleName.trim() : '';
      const targetPath = typeof payload?.targetPath === 'string' ? payload.targetPath.trim() : '';
      return [
        featureIntent
          ? `Generate a complete, production-ready module for this feature: ${featureIntent}`
          : `Generate a complete module${moduleName ? ` named "${moduleName}"` : ''} for this workspace.`,
        targetPath ? `Target directory: ${targetPath}` : '',
        '',
        'IMPORTANT: For every file you create or modify, output it as a fenced code block with this format:',
        '```<language> path: <relative/path/to/file>',
        '// file content here',
        '```',
        '',
        'Decision Clarity Contract (required):',
        '1) Situation',
        '2) Why',
        '3) Impact scope (exact files/modules)',
        '4) Risk (confidence + mutating/non-mutating)',
        '5) Next safe step',
        '6) Verify plan (required commands)',
        '7) Rollback plan',
        '',
        'Include: all required source files, tests, and any configuration changes needed.',
        'After the code blocks, provide a brief summary of what was generated and verification steps.',
      ]
        .filter(Boolean)
        .join('\n');
    }

    // ── apply-debug-patch (A03) ───────────────────────────────────────────────
    if (actionType === 'apply-debug-patch') {
      const traceText = typeof payload?.traceText === 'string' ? payload.traceText.trim() : '';
      const logContext = typeof payload?.logContext === 'string' ? payload.logContext.trim() : '';
      const issueSummary =
        typeof payload?.issueSummary === 'string' ? payload.issueSummary.trim() : '';
      const parts: string[] = [];
      if (traceText) {
        parts.push(`Stack trace / error:\n\`\`\`\n${traceText.slice(0, 4000)}\n\`\`\``);
      }
      if (logContext) {
        parts.push(`Relevant log context:\n\`\`\`\n${logContext.slice(0, 2000)}\n\`\`\``);
      }
      if (issueSummary) {
        parts.push(`Issue description: ${issueSummary}`);
      }
      parts.push(
        '',
        'Provide a concrete patch to fix this issue.',
        'IMPORTANT: For every file you create or modify, output it as a fenced code block with this format:',
        '```<language> path: <relative/path/to/file>',
        '// patched content here',
        '```',
        '',
        'Decision Clarity Contract (required):',
        '1) Situation',
        '2) Why',
        '3) Impact scope (exact files/modules)',
        '4) Risk (confidence + mutating/non-mutating)',
        '5) Next safe step',
        '6) Verify plan (required commands)',
        '7) Rollback plan',
        '',
        'After the code blocks: explain the root cause, why this patch fixes it, and any required verification commands.'
      );
      if (!traceText && !issueSummary) {
        return 'Scan my workspace for the most likely active bug or error, then generate a targeted patch with before/after code blocks per file.';
      }
      return parts.filter(Boolean).join('\n');
    }

    // ── inline-command (A01) ─────────────────────────────────────────────────
    if (actionType === 'inline-command') {
      const command =
        typeof payload?.command === 'string' && payload.command.trim()
          ? payload.command.trim()
          : '';
      return [
        command
          ? `Analyze and safely execute this inline command intent: ${command}`
          : 'Analyze and safely execute an inline command for this incident context.',
        'Use fail-closed behavior for mutating steps and never claim completion without deterministic verify evidence.',
        '',
        'Return exactly these sections:',
        '1) Situation',
        '2) Why',
        '3) Impact scope (exact files/modules)',
        '4) Risk (confidence + mutating/non-mutating)',
        '5) Next safe step',
        '6) Verify plan (required commands)',
        '7) Rollback plan',
      ].join('\n');
    }

    // ── release-readiness-commander (KF9) ───────────────────────────────────
    if (actionType === 'release-readiness-commander') {
      return isWorkspaceScope
        ? [
            'Build a release readiness decision for ALL projects in this workspace.',
            'Evaluate cross-project health, dependency state, and go/no-go criteria for each service.',
            'Use strict verify-first and evidence-first policy.',
            '',
            'Return exactly these sections:',
            '1) Workspace Decision: GO or NO-GO',
            '2) Per-project status: list each project with its individual GO / NO-GO and top blocking reason',
            '3) Cross-project blockers: shared risks that affect multiple services',
            '4) Evidence summary (verify/sandbox/doctor/scope per workspace)',
            '5) Recommended next safe step (workspace-wide)',
          ].join('\n')
        : [
            'Build a release readiness decision for this project.',
            'Use strict verify-first and evidence-first policy.',
            '',
            'Return exactly these sections:',
            '1) Decision: GO or NO-GO',
            '2) Blocking reasons',
            '3) Evidence summary (verify/sandbox/doctor/scope)',
            '4) Recommended next safe step',
          ].join('\n');
    }

    // ── browser-smoke-test (VSC-1119 browser agent tools) ───────────────────
    if (actionType === 'browser-smoke-test') {
      const targetPath = typeof payload?.projectPath === 'string' ? payload.projectPath.trim() : '';
      let devUrl = 'http://localhost:8000';

      // Detect running dev server port from the runningServers registry
      if (targetPath) {
        const runningTerminal = runningServers.get(targetPath);
        if (runningTerminal) {
          const portMatch = runningTerminal.name.match(/:([0-9]+)/);
          if (portMatch) {
            devUrl = `http://localhost:${portMatch[1]}`;
          }
        }
      }

      // Open VS Code simple browser to the dev URL (best-effort)
      try {
        await vscode.commands.executeCommand('simpleBrowser.show', devUrl);
      } catch {
        // simpleBrowser unavailable — browser tools will handle navigation
      }

      return [
        `Run a browser smoke test against the project at: ${devUrl}`,
        '',
        'Using VS Code browser agent tools (VS Code 1.119+), verify the following:',
        '1) The root URL loads without errors and returns HTTP 2xx',
        '2) Key UI surfaces render: main page, API docs (/docs or /swagger), and health endpoint (/health or /actuator/health)',
        '3) No JavaScript console errors on initial load',
        '4) Critical interactive elements are visible and not broken',
        '',
        'Return exactly these sections:',
        '1) Smoke result: PASS or FAIL',
        '2) Verified endpoints (URL → status code → pass/fail)',
        '3) Detected issues (if any)',
        '4) Recommended next step',
      ].join('\n');
    }

    // ── verify-pack-autopilot ───────────────────────────────────────────────
    if (actionType === 'verify-pack-autopilot') {
      return isWorkspaceScope
        ? [
            'Generate a deterministic verify command pack for ALL projects in this workspace.',
            'Start with workspace-wide health checks, then per-project verify commands.',
            'Prioritize by cross-project risk and confidence.',
            'Flag blockers that prevent workspace-level completion claim.',
            'Return exactly these sections:',
            '1) Workspace verify pack quality score (0-100)',
            '2) Workspace-wide required checks (max 3)',
            '3) Per-project required commands (max 2 per project)',
            '4) Blocking reasons (workspace-level and per-project)',
          ].join('\n')
        : [
            'Generate a deterministic verify command pack for this incident context.',
            'Prioritize commands by confidence and execution scope (workspace vs project).',
            'Flag blockers that still prevent completion claim.',
            'Return exactly these sections:',
            '1) Verify pack quality score (0-100)',
            '2) Required commands (max 3)',
            '3) Optional commands (max 2)',
            '4) Blocking reasons (if any)',
          ].join('\n');
    }

    // ── generic/orchestrate fallback ──────────────────────────────────────────
    const label = typeof payload?.label === 'string' ? payload.label : actionType;
    const scopeLabel = isWorkspaceScope ? 'workspace (across all projects)' : 'project';
    return `Perform the following action for my ${scopeLabel}: ${label}. Analyze the current state and provide specific, actionable guidance.`;
  }

  private async _handleAiChatExecuteAction(data: MessagePayload, requestId?: string) {
    const conversationId =
      typeof data?.conversationId === 'string' ? data.conversationId : undefined;
    const actionId = typeof data?.actionId === 'string' ? data.actionId : `action-${Date.now()}`;
    const actionType = typeof data?.actionType === 'string' ? data.actionType : '';
    const conv = conversationId ? this._chatBrainConversations.get(conversationId) : undefined;

    if (!actionType) {
      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'INVALID_INPUT',
          message: 'Action type is required.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    if (!conversationId) {
      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId: '',
          code: 'INVALID_INPUT',
          message: 'conversationId is required.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const actionProjectPath =
      typeof data?.projectPath === 'string' && data.projectPath.trim()
        ? data.projectPath.trim()
        : undefined;
    const actionProjectType =
      typeof data?.projectType === 'string' && data.projectType.trim()
        ? data.projectType.trim()
        : undefined;

    if (!isIncidentActionAllowlisted(actionType)) {
      if (conv) {
        this._trackStudioEvent('workspai.studio.abandoned', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          reason: 'action_not_allowlisted',
          framework: conv.framework ?? 'unknown',
          projectPath: conv.projectPath,
        });
      }

      this._postChatBrainWebviewMessage({
        command: 'aiChatActionResult',
        data: {
          conversationId,
          actionId,
          success: false,
          outputSummary: `${actionType} blocked by action allowlist policy`,
          verificationRequired: false,
          verifyPolicy: {
            requiresVerifyPath: true,
            requiresImpactReview: true,
            allowCompletionClaimWithoutVerify: false,
          },
        },
        meta: { requestId, version: 'v1' },
      });

      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'ACTION_NOT_ALLOWED',
          message: `Action type "${actionType}" is not in the approved allowlist.`,
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const explicitWorkspacePath =
      typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : undefined;

    if (conv?.workspacePath && explicitWorkspacePath) {
      const sameWorkspace = conv.workspacePath === explicitWorkspacePath;
      const sameHierarchy =
        isWorkspacePathAncestor(conv.workspacePath, explicitWorkspacePath) ||
        isWorkspacePathAncestor(explicitWorkspacePath, conv.workspacePath);

      if (!sameWorkspace && !sameHierarchy) {
        this._postChatBrainWebviewMessage({
          command: 'aiChatError',
          data: {
            conversationId,
            code: 'WORKSPACE_SCOPE_VIOLATION',
            message: 'Action payload workspace does not match the active conversation workspace.',
            retryable: false,
          },
          meta: { requestId, version: 'v1' },
        });
        return;
      }
    }

    const projectPathInPayload = actionProjectPath;

    if (conv?.workspacePath && projectPathInPayload) {
      if (!isWorkspacePathAncestor(conv.workspacePath, projectPathInPayload)) {
        this._postChatBrainWebviewMessage({
          command: 'aiChatError',
          data: {
            conversationId,
            code: 'WORKSPACE_SCOPE_VIOLATION',
            message: 'Action project path is outside the active workspace scope.',
            retryable: false,
          },
          meta: { requestId, version: 'v1' },
        });
        return;
      }
    }

    const actionPolicy = classifyIncidentActionPolicy(actionType);
    const workspacePath = explicitWorkspacePath || conv?.workspacePath;
    const telemetryProjectPath = projectPathInPayload || conv?.projectPath;
    const telemetryScopeProps = telemetryProjectPath ? { projectPath: telemetryProjectPath } : {};
    const shouldAttemptAutoRollback =
      actionPolicy.riskClass === 'guarded-mutating' ||
      actionPolicy.riskClass === 'high-risk-mutating';
    const rollbackBaselineEntries =
      shouldAttemptAutoRollback && workspacePath
        ? await this._readGitDirtyEntries(workspacePath)
        : null;

    if (conv) {
      conv.actionCount += 1;
      conv.phase = 'verify';
      conv.lastActivityAt = Date.now();
      this._chatBrainConversations.set(conversationId, conv);

      this._trackStudioEvent('workspai.studio.action_executed', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        actionRiskClass: actionPolicy.riskClass,
        actionRiskLevel: actionPolicy.riskLevel,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
        actionCount: conv.actionCount,
        timeToFirstActionMs: Date.now() - conv.startedAt,
      });
    }

    // Tell the Studio the action is starting
    this._postChatBrainWebviewMessage({
      command: 'aiChatActionProgress',
      data: {
        conversationId,
        actionId,
        stage: 'gathering context',
        progress: 20,
        note: `Preparing ${actionType} analysis\u2026`,
      },
      meta: { requestId, version: 'v1' },
    });

    // Build the inline query — no modal opened
    // Derive scope intent: explicit projectPath in action payload or conversation = project scope.
    const actionScopeIntent: 'workspace' | 'project' =
      projectPathInPayload || conv?.projectPath ? 'project' : 'workspace';
    const inlineQuery = await this._buildInlineQueryFromAction(
      actionType,
      data?.payload as Record<string, unknown> | undefined,
      actionScopeIntent
    );

    this._postChatBrainWebviewMessage({
      command: 'aiChatActionProgress',
      data: {
        conversationId,
        actionId,
        stage: 'streaming',
        progress: 40,
        note: 'Sending to AI\u2026',
      },
      meta: { requestId, version: 'v1' },
    });

    // Route through Chat Brain — answer streams into the Studio thread
    await this._handleAiChatQuery(
      {
        conversationId: conversationId ?? '',
        message: inlineQuery,
        workspacePath,
        projectPath: actionProjectPath,
        projectName: data?.projectName,
        projectType: actionProjectType,
        modelId: data?.modelId,
      },
      requestId
    );

    const activeWorkspacePath =
      workspacePath || this._chatBrainConversations.get(conversationId)?.workspacePath;
    const graphSnapshot = await this._getWorkspaceGraphSnapshot({
      workspacePath: activeWorkspacePath,
      projectPath: projectPathInPayload || conv?.projectPath,
      projectName:
        typeof data?.projectName === 'string' && data.projectName.trim()
          ? data.projectName.trim()
          : conv?.projectName,
      projectType:
        typeof data?.projectType === 'string' && data.projectType.trim()
          ? data.projectType.trim()
          : conv?.projectType,
      scopeIntent: actionScopeIntent,
    });
    const doctorEvidence = await this._readDoctorEvidenceSummary(activeWorkspacePath);
    const verifyEvidenceAvailable = Boolean(doctorEvidence);
    const verifyReady = !actionPolicy.requiresVerifyPath || verifyEvidenceAvailable;
    const verifySuccess = verifyReady && (doctorEvidence?.errors ?? 0) === 0;
    const rollbackRuntimePolicy = this._resolveIncidentRollbackRuntimePolicy({
      workspacePath: activeWorkspacePath,
      actionPolicy,
      rollbackApprovalToken: data?.rollbackApproval,
    });
    const rollbackEvidence =
      !verifySuccess && shouldAttemptAutoRollback && activeWorkspacePath
        ? await this._attemptIncidentAutoRollback(
            activeWorkspacePath,
            rollbackBaselineEntries,
            rollbackRuntimePolicy
          )
        : undefined;
    const wave2Contracts = await this._buildIncidentWave2Contracts({
      requestId,
      conversationId,
      actionId,
      actionType,
      actionQuery: inlineQuery,
      workspacePath: activeWorkspacePath,
      actionPolicy,
      graphSnapshot,
      doctorEvidence,
      verifyReady,
      verifySuccess,
      rollbackRuntimePolicy,
    });
    const releaseGateBlockedReasons = wave2Contracts.releaseGateEvidence.blockedReasons;
    const isMutatingAction =
      actionPolicy.riskClass === 'guarded-mutating' ||
      actionPolicy.riskClass === 'high-risk-mutating';
    const releaseGateCompletionBlocked =
      (isMutatingAction || actionPolicy.requiresImpactReview || actionPolicy.requiresVerifyPath) &&
      releaseGateBlockedReasons.length > 0;
    const unknownScopeMutationBlocked =
      (isMutatingAction || actionPolicy.requiresImpactReview) &&
      wave2Contracts.impactAssessment.blockMutationWhenScopeUnknown &&
      (!wave2Contracts.releaseGateEvidence.scopeKnown ||
        wave2Contracts.impactAssessment.impactScoreContract?.scopeKnown === false);
    const effectiveVerifySuccess = verifySuccess && !releaseGateCompletionBlocked;
    const sandboxEvidence =
      activeWorkspacePath &&
      (actionPolicy.riskClass === 'guarded-mutating' ||
        actionPolicy.riskClass === 'high-risk-mutating')
        ? await runSandboxSimulation({
            workspacePath: activeWorkspacePath,
            actionId,
            riskClass: actionPolicy.riskClass,
            verifyCommands: this._buildSandboxVerifyCommands({
              actionType,
              inlineQuery,
              impactVerifyChecklist: wave2Contracts.impactAssessment.verifyChecklist,
              conversationId,
              projectType: actionProjectType,
              projectPath: actionProjectPath,
            }),
            rollbackHint:
              rollbackEvidence?.suggestedNextStep ||
              'Keep apply blocked until simulation evidence and deterministic verification both pass.',
            defaultTimeoutMs: 20000,
          })
        : undefined;
    const verifyCommandPack = this._deriveIncidentVerifyCommandPack({
      actionType,
      actionPolicy,
      workspacePath: activeWorkspacePath,
      projectPath: actionProjectPath,
      projectType: actionProjectType,
      impactAssessment: wave2Contracts.impactAssessment,
      releaseGateEvidence: wave2Contracts.releaseGateEvidence,
      doctorEvidence,
    });
    const decisionClarityMissingFields: Array<
      'situation' | 'nextStep' | 'verifyPlan' | 'impactScope' | 'rollbackPlan'
    > = [];
    const decisionClaritySituation =
      wave2Contracts.impactAssessment.likelyFailureMode || inlineQuery.trim();
    const primaryVerifyCommand =
      verifyCommandPack.commands.find((entry) => entry.required)?.command ||
      verifyCommandPack.commands[0]?.command;
    const decisionClarityNextStep =
      wave2Contracts.predictiveWarning?.nextSafeAction ||
      (verifyCommandPack.blockedReasons[0]
        ? `Resolve verify blocker: ${verifyCommandPack.blockedReasons[0]}.`
        : undefined) ||
      (primaryVerifyCommand
        ? 'Run the primary verify step and inspect the result before claiming completion.'
        : undefined);
    const hasNextStep = Boolean(decisionClarityNextStep);
    const requiredVerifyCommandCount = verifyCommandPack.commands.filter(
      (entry) => entry.required
    ).length;
    const hasImpactScope = wave2Contracts.impactAssessment.affectedFiles.length > 0;
    // Derive rollback plan: prefer explicit post-execution evidence (rollback step or
    // sandbox simulation), but fall back to a git-revert suggestion from the impact
    // assessment so mutating actions are not blocked on the very first run when no
    // rollback or sandbox has been executed yet.
    const rollbackAffectedFiles = wave2Contracts.impactAssessment.affectedFiles;
    const derivedRollbackPlan =
      rollbackEvidence?.suggestedNextStep ||
      sandboxEvidence?.recommendedRollbackPath ||
      (rollbackAffectedFiles.length > 0
        ? rollbackAffectedFiles.length <= 12
          ? `git checkout -- ${rollbackAffectedFiles
              .map((filePath) => `"${filePath.replace(/"/g, '\\"')}"`)
              .join(' ')}`
          : 'git checkout -- .'
        : undefined);
    const hasRollbackPlan = Boolean(derivedRollbackPlan);
    if (!decisionClaritySituation) {
      decisionClarityMissingFields.push('situation');
    }
    if ((isMutatingAction || actionPolicy.requiresImpactReview) && !hasImpactScope) {
      decisionClarityMissingFields.push('impactScope');
    }
    if ((isMutatingAction || actionPolicy.requiresVerifyPath) && !hasNextStep) {
      decisionClarityMissingFields.push('nextStep');
    }
    if ((isMutatingAction || actionPolicy.requiresVerifyPath) && requiredVerifyCommandCount === 0) {
      decisionClarityMissingFields.push('verifyPlan');
    }
    if ((isMutatingAction || actionPolicy.requiresImpactReview) && !hasRollbackPlan) {
      decisionClarityMissingFields.push('rollbackPlan');
    }
    const decisionClarityCompletionBlocked = decisionClarityMissingFields.length > 0;
    const completionSuccess = effectiveVerifySuccess && !decisionClarityCompletionBlocked;
    const decisionClarityVerifyPlan =
      verifyCommandPack.commands
        .filter((entry) => entry.required)
        .map((entry) => entry.command)
        .filter((command) => typeof command === 'string' && command.trim().length > 0) || [];

    if (conv && actionType === 'verify-pack-autopilot') {
      this._trackStudioEvent(
        'workspai.studio.verify_pack_autopilot_generated',
        conv.workspacePath,
        {
          conversationId,
          actionId,
          actionType,
          qualityScore: verifyCommandPack.qualityScore,
          readiness: verifyCommandPack.readiness,
          requiredCommandCount: verifyCommandPack.commands.filter((entry) => entry.required).length,
          blockedReasonCount: verifyCommandPack.blockedReasons.length,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        }
      );

      if (verifyCommandPack.readiness === 'ready') {
        this._trackStudioEvent('workspai.studio.verify_pack_autopilot_ready', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          qualityScore: verifyCommandPack.qualityScore,
          requiredCommandCount: verifyCommandPack.commands.filter((entry) => entry.required).length,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        });
      }
    }
    const diagnosisEvidence = this._buildIncidentDiagnosisEvidence({
      actionPolicy,
      verifyReady,
      verifySuccess: effectiveVerifySuccess,
      doctorEvidence,
      impactAssessment: wave2Contracts.impactAssessment,
      predictiveWarning: wave2Contracts.predictiveWarning,
      contractRuntimeEvidence: wave2Contracts.contractRuntimeEvidence,
      verifyCommandPack,
      graphSnapshot: wave2Contracts.systemGraphSnapshot,
    });
    const decisionClarityImpactScope = Array.from(
      new Set([
        ...wave2Contracts.impactAssessment.affectedFiles,
        ...wave2Contracts.impactAssessment.affectedModules.map(
          (moduleName) => `module:${moduleName}`
        ),
        ...wave2Contracts.impactAssessment.affectedTests.map((testName) => `test:${testName}`),
      ])
    ).slice(0, 8);
    const decisionClarityEvidenceLinks = Array.from(
      new Set([
        ...diagnosisEvidence.signalSources,
        ...(wave2Contracts.predictiveWarning?.telemetrySeed.evidenceSources || []),
      ])
    ).slice(0, 8);
    const decisionClarityContract = {
      situation: decisionClaritySituation || diagnosisEvidence.recommendedFocus || undefined,
      reason:
        wave2Contracts.impactAssessment.rationale[0] ||
        diagnosisEvidence.recommendedFocus ||
        undefined,
      impactScope: decisionClarityImpactScope,
      risk: {
        confidenceBand: diagnosisEvidence.confidenceBand,
        confidence: diagnosisEvidence.confidence,
        mutating: isMutatingAction || actionPolicy.requiresImpactReview,
      },
      nextStep: decisionClarityNextStep,
      verifyPlan:
        decisionClarityVerifyPlan.length > 0
          ? decisionClarityVerifyPlan
          : wave2Contracts.impactAssessment.verifyChecklist,
      rollbackPlan: derivedRollbackPlan,
      evidenceLinks: decisionClarityEvidenceLinks,
      requiredMissingFields: decisionClarityMissingFields,
      mutationReady:
        !decisionClarityCompletionBlocked &&
        !releaseGateCompletionBlocked &&
        !unknownScopeMutationBlocked &&
        effectiveVerifySuccess,
    };
    const incidentReproPackEvidence = this._buildIncidentReproPackEvidence({
      actionType,
      actionId,
      conversationId,
      workspacePath: activeWorkspacePath,
      verifySuccess: effectiveVerifySuccess,
      conversationHistoryTurns: conv?.history.length ?? 0,
      doctorEvidence,
      rollbackEvidence,
      sandboxEvidence,
      impactAssessment: wave2Contracts.impactAssessment,
      releaseGateEvidence: wave2Contracts.releaseGateEvidence,
      diagnosisEvidence,
    });
    const releaseReadinessCommanderArtifact = this._buildReleaseReadinessCommanderArtifact({
      actionType,
      actionId,
      workspacePath: activeWorkspacePath,
      confidence: diagnosisEvidence.confidence,
      verifySuccess: effectiveVerifySuccess,
      releaseGateEvidence: wave2Contracts.releaseGateEvidence,
      sandboxEvidence,
      doctorEvidence,
    });
    const memoryInfluenceAuditTimeline = this._buildMemoryInfluenceAuditTimeline({
      actionId,
      actionType,
      graphSnapshot,
      decisionClarityMissingFields,
      releaseGateBlockedReasons,
      incidentReproPackId: incidentReproPackEvidence?.packId,
      releaseReadinessArtifactId: releaseReadinessCommanderArtifact?.artifactId,
    });

    if (incidentReproPackEvidence) {
      incidentReproPackEvidence.memoryInfluenceAuditTimeline = memoryInfluenceAuditTimeline;
    }

    if (conv && wave2Contracts.predictiveWarning) {
      this._trackStudioEvent('workspai.studio.prediction_shown', conv.workspacePath, {
        conversationId,
        actionId,
        actionType,
        predictionKey: wave2Contracts.predictiveWarning.telemetrySeed.predictionKey,
        confidenceBand: wave2Contracts.predictiveWarning.confidenceBand,
        riskLevel: wave2Contracts.impactAssessment.riskLevel,
        framework: conv.framework ?? 'unknown',
        ...telemetryScopeProps,
      });
    }

    if (conv) {
      if (completionSuccess) {
        conv.verifyPassedAt = Date.now();
        conv.phase = 'learn';
      } else {
        conv.phase = 'verify';
      }
      conv.lastScopeKnown = wave2Contracts.releaseGateEvidence.scopeKnown;
      conv.lastUnknownScopeMutationBlocked = unknownScopeMutationBlocked;
      conv.lastActivityAt = Date.now();
      this._chatBrainConversations.set(conversationId, conv);

      const verifyCompletenessCheck = assessVerifyCompleteness(
        actionPolicy,
        wave2Contracts.impactAssessment.verifyChecklist
      );
      const verifyRequired = actionPolicy.requiresVerifyPath || actionPolicy.requiresImpactReview;
      const verifyPathPresent = verifyCompletenessCheck.adequate;
      const repeatedIncident = conv.repeatedIncidentDetected === true;
      const uiPrefs = this._getUiPreferences();
      const memorySuggestion =
        completionSuccess && uiPrefs.incidentAutoLearningPrompt
          ? buildIncidentMemoryEnrichmentSuggestion({
              verifySuccess: completionSuccess,
              actionType,
              likelyFailureMode: wave2Contracts.impactAssessment.likelyFailureMode,
              verifyChecklist: wave2Contracts.impactAssessment.verifyChecklist,
            })
          : null;
      if (!verifyCompletenessCheck.adequate) {
        this._trackStudioEvent('workspai.studio.verify_incomplete_warning', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          reason: verifyCompletenessCheck.reason,
          verifyRequired,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        });
      }

      const diagnosisConfidenceLabel = labelDiagnosisConfidence(
        wave2Contracts.releaseGateEvidence.scopeKnown ? 'known' : 'partial',
        wave2Contracts.impactAssessment.confidence / 100
      );

      this._trackStudioEvent(
        completionSuccess ? 'workspai.studio.verify_passed' : 'workspai.studio.verify_failed',
        conv.workspacePath,
        {
          conversationId,
          actionId,
          actionType,
          verifyReady,
          verifyRequired,
          verifyPathPresent,
          verifyPathReason: verifyCompletenessCheck.reason ?? 'ok',
          repeatedIncident,
          diagnosisConfidenceLabel,
          verifyCompletenessAdequate: verifyCompletenessCheck.adequate,
          decisionClarityCompletionBlocked,
          decisionClarityMissingFieldCount: decisionClarityMissingFields.length,
          unknownScopeMutationBlocked,
          releaseGateCompletionBlocked,
          releaseGateBlockedReasonCount: releaseGateBlockedReasons.length,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
          errors: doctorEvidence?.errors ?? 0,
          warnings: doctorEvidence?.warnings ?? 0,
          passed: doctorEvidence?.passed ?? 0,
        }
      );

      if (completionSuccess) {
        this._trackStudioEvent(
          'workspai.studio.verified_outcome_ready_for_artifact',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            framework: conv.framework ?? 'unknown',
            outcomeContractVersion: 'v2',
            verifyRequired,
            verifyPathPresent,
            repeatedIncident,
            verifyChecklistCount: wave2Contracts.impactAssessment.verifyChecklist.length,
            blockedReasonCount: wave2Contracts.releaseGateEvidence.blockedReasons.length,
            affectedFilesCount: wave2Contracts.impactAssessment.affectedFiles.length,
            releaseGateBlocked: releaseGateCompletionBlocked,
            memorySuggestionReady: Boolean(memorySuggestion),
            replayReady: Boolean(incidentReproPackEvidence),
            ...telemetryScopeProps,
          }
        );
      }

      if (wave2Contracts.predictiveWarning) {
        this._trackStudioEvent(
          completionSuccess
            ? 'workspai.studio.prediction_falsified'
            : 'workspai.studio.prediction_verified',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            predictionKey: wave2Contracts.predictiveWarning.telemetrySeed.predictionKey,
            warningId: wave2Contracts.predictiveWarning.warningId,
            verifySuccess: completionSuccess,
            framework: conv.framework ?? 'unknown',
            ...telemetryScopeProps,
          }
        );
      }

      this._emitArchitectureReasoningRuntimeEvents({
        conversationId,
        actionId,
        actionType,
        workspacePath: conv.workspacePath ?? activeWorkspacePath ?? '',
        framework: conv.framework,
        wave2Contracts,
        verifySuccess: completionSuccess,
      });

      if (incidentReproPackEvidence) {
        this._trackStudioEvent('workspai.studio.incident_repro_pack_captured', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          packId: incidentReproPackEvidence.packId,
          redactionApplied: incidentReproPackEvidence.redaction.applied,
          verifySuccess,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        });

        this._trackStudioEvent('workspai.studio.incident_replay_ready', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          packId: incidentReproPackEvidence.packId,
          blockedReasonCount: incidentReproPackEvidence.summary.blockedReasonCount,
          verifyChecklistCount: incidentReproPackEvidence.replayPayload.verifyChecklist.length,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        });
      }

      if (completionSuccess && conv.importedIncidentReplay && conv.workspacePath) {
        const replayMemorySaved = await this._persistIncidentReplayLearning({
          workspacePath: conv.workspacePath,
          packId: conv.importedIncidentReplay.packId,
          actionType: conv.importedIncidentReplay.actionType,
          riskLevel: conv.importedIncidentReplay.riskLevel,
          likelyFailureMode:
            wave2Contracts.impactAssessment.likelyFailureMode ||
            conv.importedIncidentReplay.likelyFailureMode,
          verifyChecklist:
            wave2Contracts.impactAssessment.verifyChecklist.length > 0
              ? wave2Contracts.impactAssessment.verifyChecklist
              : conv.importedIncidentReplay.verifyChecklist,
          blockedReasons:
            wave2Contracts.releaseGateEvidence.blockedReasons.length > 0
              ? wave2Contracts.releaseGateEvidence.blockedReasons
              : conv.importedIncidentReplay.blockedReasons,
          relatedFiles:
            wave2Contracts.impactAssessment.affectedFiles.length > 0
              ? wave2Contracts.impactAssessment.affectedFiles
              : conv.importedIncidentReplay.relatedFiles,
        });

        if (replayMemorySaved) {
          this._trackStudioEvent(
            'workspai.studio.incident_replay_memory_enriched',
            conv.workspacePath,
            {
              conversationId,
              actionId,
              actionType,
              packId: conv.importedIncidentReplay.packId,
              framework: conv.framework ?? 'unknown',
              ...telemetryScopeProps,
            }
          );
        }

        delete conv.importedIncidentReplay;
        this._chatBrainConversations.set(conversationId, conv);
      } else if (completionSuccess && conv.workspacePath) {
        // Non-imported verified outcomes should also enrich team-reuse memory.
        // Without this, reuse enrichment is biased toward imported replay flows only.
        const replayMemorySaved = await this._persistIncidentReplayLearning({
          workspacePath: conv.workspacePath,
          packId: incidentReproPackEvidence?.packId || `verified-outcome-${actionId}`,
          actionType,
          riskLevel: wave2Contracts.impactAssessment.riskLevel,
          likelyFailureMode: wave2Contracts.impactAssessment.likelyFailureMode,
          verifyChecklist: wave2Contracts.impactAssessment.verifyChecklist,
          blockedReasons: wave2Contracts.releaseGateEvidence.blockedReasons,
          relatedFiles: wave2Contracts.impactAssessment.affectedFiles,
        });

        if (replayMemorySaved) {
          this._trackStudioEvent(
            'workspai.studio.incident_replay_memory_enriched',
            conv.workspacePath,
            {
              conversationId,
              actionId,
              actionType,
              packId: incidentReproPackEvidence?.packId || `verified-outcome-${actionId}`,
              framework: conv.framework ?? 'unknown',
              source: 'verified_outcome',
              ...telemetryScopeProps,
            }
          );
        }
      }

      if (rollbackEvidence?.attempted) {
        const rollbackRecoveryClass =
          rollbackEvidence.status === 'succeeded'
            ? 'full'
            : rollbackEvidence.restoredFiles.length > 0
              ? 'partial'
              : 'none';
        this._trackStudioEvent('workspai.studio.rollback_attempted', conv.workspacePath, {
          conversationId,
          actionId,
          actionType,
          rollbackStatus: rollbackEvidence.status,
          recoveryClass: rollbackRecoveryClass,
          verifyFailureRecovered: !completionSuccess && rollbackEvidence.status === 'succeeded',
          restoredCount: rollbackEvidence.restoredFiles.length,
          failedCount: rollbackEvidence.failedFiles.length,
          framework: conv.framework ?? 'unknown',
          ...telemetryScopeProps,
        });

        this._trackStudioEvent(
          rollbackEvidence.status === 'succeeded'
            ? 'workspai.studio.rollback_succeeded'
            : 'workspai.studio.rollback_failed',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            rollbackStatus: rollbackEvidence.status,
            recoveryClass: rollbackRecoveryClass,
            verifyFailureRecovered: !completionSuccess && rollbackEvidence.status === 'succeeded',
            restoredCount: rollbackEvidence.restoredFiles.length,
            failedCount: rollbackEvidence.failedFiles.length,
            framework: conv.framework ?? 'unknown',
            ...telemetryScopeProps,
          }
        );
      }

      if (completionSuccess && uiPrefs.incidentAutoLearningPrompt) {
        if (!memorySuggestion) {
          return;
        }

        this._trackStudioEvent(
          'workspai.studio.outcome_memory_suggestion_ready',
          conv.workspacePath,
          {
            conversationId,
            actionId,
            actionType,
            verifyChecklistCount: wave2Contracts.impactAssessment.verifyChecklist.length,
            framework: conv.framework ?? 'unknown',
            ...telemetryScopeProps,
          }
        );

        this._postChatBrainWebviewMessage({
          command: 'aiChatSuggestedQuestions',
          data: {
            conversationId,
            messageId: `learn-${Date.now()}`,
            questions: memorySuggestion.questions,
          },
          meta: { requestId, version: 'v1' },
        });

        this._postChatBrainWebviewMessage({
          command: 'aiChatActionBoard',
          data: {
            conversationId,
            messageId: `learn-board-${Date.now()}`,
            board: {
              id: `learn-board-${Date.now()}`,
              type: 'learning',
              title: memorySuggestion.title,
              summary: memorySuggestion.summary,
              data: {
                route: 'workspace-memory-wizard',
                confidence: 90,
              },
              actions: [
                {
                  id: `learn-action-${Date.now()}`,
                  label: memorySuggestion.primaryActionLabel,
                  actionType: 'workspace-memory-wizard',
                  riskLevel: 'low',
                },
              ],
            },
          },
          meta: { requestId, version: 'v1' },
        });
      }
    }

    // ── Multi-file patch extraction (A02 / A03) ────────────────────────────────
    let multiFilePatchResult: MultiFilePatchResult | undefined;
    const isPatchAction = actionType === 'apply-module-gen' || actionType === 'apply-debug-patch';
    if (isPatchAction && activeWorkspacePath) {
      const convAfterQuery = this._chatBrainConversations.get(conversationId);
      const lastResponseText = convAfterQuery?.lastActionResponseText ?? '';

      if (lastResponseText) {
        const rawPatches = extractPatchesFromAiResponse(lastResponseText, {
          actionId,
          workspacePath: activeWorkspacePath,
        });

        if (rawPatches.length > 0) {
          // For A03 (apply-debug-patch), only auto-apply when sandboxEvidence says safeToApply.
          // For A02 (apply-module-gen), send patches as 'pending' for user to review.
          const shouldAutoApply =
            actionType === 'apply-debug-patch' &&
            !unknownScopeMutationBlocked &&
            !releaseGateCompletionBlocked &&
            !decisionClarityCompletionBlocked &&
            sandboxEvidence?.safeToApply === true &&
            actionPolicy.riskClass !== 'high-risk-mutating';

          if (shouldAutoApply) {
            multiFilePatchResult = await applyPatches({
              actionId,
              workspacePath: activeWorkspacePath,
              patches: rawPatches,
              branchSafeApply: true,
              verificationPassed: sandboxEvidence?.status === 'passed',
              verificationNote: sandboxEvidence?.reason,
            });
          } else {
            // Return patches as 'pending' — user applies/rejects via UI
            multiFilePatchResult = {
              patchId: `patch-${actionId}-${Date.now().toString(36)}`,
              generatedAt: new Date().toISOString(),
              actionId,
              patches: rawPatches.map((p) => ({ ...p, status: 'pending' as const })),
              appliedCount: 0,
              rejectedCount: 0,
              failedCount: 0,
            };
          }

          await WorkspaceUsageTracker.getInstance().trackCommandEvent(
            'workspai.patch.extracted',
            activeWorkspacePath,
            {
              actionId,
              actionType,
              patchCount: rawPatches.length,
              autoApplied: shouldAutoApply,
            }
          );
        }
      }
    }

    // Mark action resolved (stream already showed the result)
    this._postChatBrainWebviewMessage({
      command: 'aiChatActionResult',
      data: {
        conversationId,
        actionId,
        success: completionSuccess,
        outputSummary: releaseGateCompletionBlocked
          ? `${actionType} - blocked by release gate: ${
              releaseGateBlockedReasons[0] ||
              'verify, scope, and rollback requirements are not satisfied'
            }`
          : decisionClarityCompletionBlocked
            ? `${actionType} - blocked by decision clarity contract: ${decisionClarityMissingFields[0] || 'required fields are missing'}`
            : completionSuccess
              ? `${actionType} \u2014 result shown in conversation above`
              : rollbackEvidence
                ? `${actionType} \u2014 verification failed; rollback status: ${rollbackEvidence.status}`
                : verifyReady
                  ? `${actionType} \u2014 verification failed; review output and retry safely`
                  : `${actionType} \u2014 verification required before completion claim`,
        verificationRequired: !verifyReady || decisionClarityCompletionBlocked,
        verifyPolicy: {
          requiresVerifyPath: actionPolicy.requiresVerifyPath,
          requiresImpactReview: actionPolicy.requiresImpactReview,
          allowCompletionClaimWithoutVerify: actionPolicy.allowCompletionClaimWithoutVerify,
        },
        evidence: doctorEvidence
          ? {
              source: 'doctor-last-run',
              ...doctorEvidence,
            }
          : undefined,
        diagnosis: diagnosisEvidence,
        rollback: rollbackEvidence,
        sandboxSimulation: sandboxEvidence,
        incidentReproPack: incidentReproPackEvidence,
        releaseReadinessCommander: releaseReadinessCommanderArtifact,
        memoryInfluenceAuditTimeline,
        multiFilePatch: multiFilePatchResult,
        systemGraphSnapshot: wave2Contracts.systemGraphSnapshot,
        impactAssessment: wave2Contracts.impactAssessment,
        predictiveWarning: wave2Contracts.predictiveWarning,
        releaseGateEvidence: wave2Contracts.releaseGateEvidence,
        contractRuntimeEvidence: wave2Contracts.contractRuntimeEvidence,
        verifyCommandPack,
        decisionClarity: decisionClarityContract,
      },
      meta: { requestId, version: 'v1' },
    });
  }

  /**
   * Handle the user applying or rejecting individual file patches from the
   * multi-file patch review card (A02 / A03 apply/reject workflow).
   *
   * Expected payload:
   *   { conversationId, patchId, acceptedPaths: string[], workspacePath, branchSafeApply?: boolean }
   */
  private async _handleApplyPatch(data: MessagePayload, requestId?: string) {
    const conversationId =
      typeof data?.conversationId === 'string' ? data.conversationId : undefined;
    const patchId = typeof data?.patchId === 'string' ? data.patchId : `patch-${Date.now()}`;
    const acceptedPaths: string[] = Array.isArray(data?.acceptedPaths)
      ? data.acceptedPaths.filter((p: unknown) => typeof p === 'string')
      : [];
    const branchSafeApply = data?.branchSafeApply === true;

    const conv = conversationId ? this._chatBrainConversations.get(conversationId) : undefined;
    const workspacePath =
      (typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : undefined) ?? conv?.workspacePath;

    if (!workspacePath) {
      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'INVALID_INPUT',
          message: 'workspacePath is required to apply patches.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    if (conv?.lastUnknownScopeMutationBlocked || conv?.lastScopeKnown === false) {
      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'SCOPE_UNKNOWN_MUTATION_BLOCKED',
          message:
            'Patch apply blocked: impacted scope is unknown. Run change-impact-lite and verify before mutation.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const lastResponse = conv?.lastActionResponseText ?? '';
    const rawPatches = lastResponse
      ? extractPatchesFromAiResponse(lastResponse, { actionId: patchId, workspacePath })
      : [];

    if (rawPatches.length === 0) {
      this._postChatBrainWebviewMessage({
        command: 'aiChatError',
        data: {
          conversationId,
          code: 'NO_PATCHES',
          message: 'No patches found to apply.',
          retryable: false,
        },
        meta: { requestId, version: 'v1' },
      });
      return;
    }

    const result = await applyPatches({
      actionId: patchId,
      workspacePath,
      patches: rawPatches,
      branchSafeApply,
      acceptedPaths: acceptedPaths.length > 0 ? acceptedPaths : undefined,
    });

    this._postChatBrainWebviewMessage({
      command: 'aiChatPatchApplied',
      data: { conversationId, patchId, result },
      meta: { requestId, version: 'v1' },
    });

    const workspaceName =
      conv?.projectName ||
      conv?.workspacePath?.split(/[\\/]/).filter(Boolean).pop() ||
      path.basename(workspacePath);
    await runPostPatchShipLoopRefresh({
      webview: this._chatBrainReplyWebview ?? this._panel.webview,
      context: this._context,
      workspace: { workspacePath, workspaceName },
      projectPath: conv?.projectPath,
      patchSucceeded: result.appliedCount > 0 && result.failedCount === 0,
      requestId,
    });
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
    await postIncidentStudioTelemetry(this._panel.webview, {
      context: this._context,
      workspacePath: explicitWorkspacePath || this._resolveTelemetryWorkspacePath(),
      projectPath: explicitProjectPath,
      forceRefresh,
    });
  }

  private _getUiPreferences(workspacePath?: string) {
    return readIncidentStudioUiPreferences(this._context, {
      workspacePath,
      telemetryWorkspacePath: this._resolveTelemetryWorkspacePath() || 'global',
    });
  }

  private _sendUiPreferences(workspacePath?: string) {
    postIncidentStudioUiPreferences(this._panel.webview, this._context, workspacePath);
  }

  private async _sendWorkspaiSettings(preferredModelOverride?: string) {
    const settings = readWorkspaiSettings();
    let models: Array<{ id: string; name: string; vendor: string }> = [];
    const aiProviderStatus = await getAIProviderStatus(this._context);

    try {
      const { listAvailableModels } = await import('../../core/aiService.js');
      models = await listAvailableModels();
    } catch {
      models = [];
    }

    this._panel.webview.postMessage({
      command: 'workspaiSettings',
      data: {
        preferredModel: preferredModelOverride ?? settings.preferredModel,
        aiStreamTimeoutMs: settings.aiStreamTimeoutMs,
        aiProvider: settings.aiProvider,
        customAIBaseUrl: settings.customAIBaseUrl,
        customAIModel: settings.customAIModel,
        themeMode: settings.themeMode,
        aiProviderStatus,
        models,
      },
    });
  }

  private _sendVersion() {
    const version = this._context.extension.packageJSON.version || '0.0.0';
    this._panel.webview.postMessage({
      command: 'updateVersion',
      data: version,
    });
  }

  private async _sendRecentWorkspaces() {
    const workspaces = await this._getRecentWorkspaces();
    this._panel.webview.postMessage({
      command: 'updateRecentWorkspaces',
      data: workspaces,
    });
    void this._sendDashboardEvidence();
  }

  private async _sendExampleWorkspaces() {
    try {
      const examplesService = ExamplesService.getInstance();
      const examples = await examplesService.getExamples();

      // Enrich each example with clone status
      const enrichedExamples = await Promise.all(
        examples.map(async (example) => {
          const isCloned = await examplesService.isExampleCloned(example.id);
          let cloneStatus: 'not-cloned' | 'cloned' | 'update-available' = 'not-cloned';

          if (isCloned) {
            cloneStatus = 'cloned';

            // Check for updates
            const updateInfo = await examplesService.checkForUpdates(example.id);
            if (updateInfo.hasUpdate) {
              cloneStatus = 'update-available';
            }
          }

          // repoUrl: URL used by the UI "Open on GitHub" button (workspace subfolder when available).
          // cloneUrl: URL used by `git clone` and must always be repository root.
          const repoUrl = example.path
            ? `https://github.com/rapidkitlabs/rapidkit-examples/tree/main/${example.path}`
            : 'https://github.com/rapidkitlabs/rapidkit-examples';
          const cloneUrl = 'https://github.com/rapidkitlabs/rapidkit-examples';

          return {
            ...example,
            repoUrl,
            cloneUrl,
            cloneStatus,
          };
        })
      );

      this._panel.webview.postMessage({
        command: 'updateExampleWorkspaces',
        data: enrichedExamples,
      });
    } catch (error) {
      console.error('[WelcomePanel] Failed to send example workspaces:', error);
    }
  }

  private async _sendAvailableKits() {
    try {
      const kitsService = KitsService.getInstance();
      const kits = await kitsService.getKits();

      this._panel.webview.postMessage({
        command: 'updateAvailableKits',
        data: kits,
      });

      console.log('[WelcomePanel] ✅ Available kits sent to webview:', kits.length);
    } catch (error) {
      console.error('[WelcomePanel] Failed to send available kits:', error);
      // Send empty array on error
      this._panel.webview.postMessage({
        command: 'updateAvailableKits',
        data: [],
      });
    }
  }
  private async _cloneExample(example: ExampleWorkspaceDescriptor) {
    try {
      // Notify webview we're cloning
      this._panel.webview.postMessage({
        command: 'setCloning',
        data: { exampleName: example.name },
      });

      // Ask user where to clone
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select Clone Location',
        title: `Clone ${example.title}`,
      });

      if (!result || result.length === 0) {
        // User cancelled
        this._panel.webview.postMessage({
          command: 'setCloning',
          data: { exampleName: null },
        });
        return;
      }

      const parentFolder = result[0].fsPath;
      const targetPath = path.join(parentFolder, example.name);

      // Check if already exists
      if (await fs.pathExists(targetPath)) {
        const overwrite = await vscode.window.showWarningMessage(
          `Folder "${example.name}" already exists at this location.`,
          'Cancel',
          'Open Existing'
        );

        if (overwrite === 'Open Existing') {
          // Import existing workspace
          const workspaceManager = WorkspaceManager.getInstance();
          await workspaceManager.addWorkspace(targetPath);
          await this._sendRecentWorkspaces();
          vscode.window.showInformationMessage(`✅ Imported existing workspace: ${example.name}`);
        }

        this._panel.webview.postMessage({
          command: 'setCloning',
          data: { exampleName: null },
        });
        return;
      }

      // Clone the repository
      vscode.window.showInformationMessage(`🔄 Cloning ${example.title}...`);
      const cloneSource = example.cloneUrl || 'https://github.com/rapidkitlabs/rapidkit-examples';

      const terminal = runShellCommandInTerminal({
        name: `Clone ${example.name}`,
        cwd: parentFolder,
        command: 'git',
        args: ['clone', cloneSource, 'rapidkit-examples-temp'],
      });

      // Wait for clone to complete
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Move the specific workspace out
      const tempRepoPath = path.join(parentFolder, 'rapidkit-examples-temp');
      const sourceWorkspacePath = path.join(tempRepoPath, example.name);

      // Check if workspace exists in cloned repo
      if (await fs.pathExists(sourceWorkspacePath)) {
        // Move workspace to target location
        await fs.move(sourceWorkspacePath, targetPath);

        // Clean up temp repo
        await fs.remove(tempRepoPath);

        // Get commit hash for tracking
        const examplesService = ExamplesService.getInstance();
        const commitHash = await examplesService.getRepoCommitHash(targetPath);

        // Track the cloned example
        await examplesService.trackClonedExample(
          example.id || example.name,
          example.name,
          targetPath,
          commitHash || undefined
        );

        // Import to workspace list
        const workspaceManager = WorkspaceManager.getInstance();
        await workspaceManager.addWorkspace(targetPath);
        await this._sendRecentWorkspaces();
        void this._beginGovernanceChainForWorkspace(targetPath, example.name, 'clone');

        // Refresh examples list to show new clone status
        await this._sendExampleWorkspaces();

        vscode.window
          .showInformationMessage(
            `✅ Successfully cloned and imported: ${example.name}`,
            'Open Workspace'
          )
          .then((selection) => {
            if (selection === 'Open Workspace') {
              const uri = vscode.Uri.file(targetPath);
              vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
            }
          });

        terminal.dispose();
      } else {
        // Cleanup on failure
        if (await fs.pathExists(tempRepoPath)) {
          await fs.remove(tempRepoPath);
        }
        vscode.window.showWarningMessage(
          `Clone completed but workspace "${example.name}" not found in repository. Check the terminal for details.`,
          'OK'
        );
      }
    } catch (error: unknown) {
      console.error('[WelcomePanel] Error cloning example:', error);
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to clone example: ${message}`);
    } finally {
      // Reset cloning state
      this._panel.webview.postMessage({
        command: 'setCloning',
        data: { exampleName: null },
      });
    }
  }

  private async _updateExample(example: ExampleWorkspaceDescriptor) {
    try {
      const examplesService = ExamplesService.getInstance();
      const info = await examplesService.getClonedExampleInfo(example.id || example.name);

      if (!info || !info.clonedPath) {
        vscode.window.showWarningMessage('Example is not cloned yet.');
        return;
      }

      // Check if path exists
      if (!(await fs.pathExists(info.clonedPath))) {
        vscode.window
          .showWarningMessage(`Cloned example not found at: ${info.clonedPath}`, 'Untrack')
          .then(async (action) => {
            if (action === 'Untrack') {
              await examplesService.untrackExample(example.id || example.name);
              await this._sendExampleWorkspaces();
            }
          });
        return;
      }

      // Notify user
      this._panel.webview.postMessage({
        command: 'setUpdating',
        data: { exampleName: example.name },
      });

      // Check if workspace has uncommitted changes
      const hasChanges = await this._checkGitStatus(info.clonedPath);

      if (hasChanges) {
        const action = await vscode.window.showWarningMessage(
          `The workspace "${example.name}" has uncommitted changes. Updating may cause conflicts.`,
          'Continue Anyway',
          'Cancel'
        );

        if (action !== 'Continue Anyway') {
          this._panel.webview.postMessage({
            command: 'setUpdating',
            data: { exampleName: null },
          });
          return;
        }
      }

      // Create terminal and run git pull
      runCommandsInTerminal({
        name: `Update ${example.name}`,
        cwd: info.clonedPath,
        commands: ['git fetch origin main', 'git pull origin main'],
      });

      vscode.window.showInformationMessage(
        `🔄 Updating ${example.name}... Check terminal for details.`,
        'OK'
      );

      // Wait for update to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Update tracking with new commit hash
      const newCommitHash = await examplesService.getRepoCommitHash(info.clonedPath);
      if (newCommitHash) {
        await examplesService.trackClonedExample(
          example.id || example.name,
          example.name,
          info.clonedPath,
          newCommitHash
        );
      }

      // Refresh examples list
      await this._sendExampleWorkspaces();

      vscode.window.showInformationMessage(`✅ ${example.name} updated successfully!`);
    } catch (error: unknown) {
      console.error('[WelcomePanel] Error updating example:', error);
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to update example: ${message}`);
    } finally {
      this._panel.webview.postMessage({
        command: 'setUpdating',
        data: { exampleName: null },
      });
    }
  }

  private async _checkGitStatus(repoPath: string): Promise<boolean> {
    try {
      const result = await run('git', ['status', '--porcelain'], { cwd: repoPath });
      if (result.exitCode !== 0) {
        return false;
      }
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async _readGitDirtyEntries(
    workspacePath: string
  ): Promise<Array<{ path: string; untracked: boolean }> | null> {
    try {
      const result = await run('git', ['status', '--porcelain'], {
        cwd: workspacePath,
        timeout: 3000,
      });

      if (result.exitCode !== 0) {
        return null;
      }

      if (!result.stdout.trim()) {
        return [];
      }

      const entries: Array<{ path: string; untracked: boolean }> = [];
      for (const rawLine of result.stdout.split('\n')) {
        const line = rawLine.trimEnd();
        if (!line || line.length < 4) {
          continue;
        }

        const statusCode = line.slice(0, 2);
        const pathChunk = line.slice(3).trim();
        if (!pathChunk) {
          continue;
        }

        const normalizedPath = pathChunk.includes('->')
          ? pathChunk.split('->').pop()?.trim() || pathChunk
          : pathChunk;

        if (!normalizedPath) {
          continue;
        }

        entries.push({
          path: normalizedPath,
          untracked: statusCode === '??',
        });
      }

      return entries;
    } catch {
      return null;
    }
  }

  private async _attemptIncidentAutoRollback(
    workspacePath: string,
    baselineEntries: Array<{ path: string; untracked: boolean }> | null,
    runtimePolicy?: {
      approvalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
      requiresManualApproval: boolean;
      approvedByUser: boolean;
      protectedPathPrefixes: string[];
    }
  ): Promise<{
    attempted: boolean;
    status: 'succeeded' | 'failed' | 'partial' | 'skipped' | 'unavailable';
    reason?: string;
    attemptedAt: string;
    candidateFiles: string[];
    restoredFiles: string[];
    failedFiles: string[];
    suggestedNextStep?: string;
  }> {
    const attemptedAt = new Date().toISOString();
    const unavailableResult = {
      attempted: false,
      status: 'unavailable' as const,
      reason: 'Git rollback is unavailable for this workspace.',
      attemptedAt,
      candidateFiles: [] as string[],
      restoredFiles: [] as string[],
      failedFiles: [] as string[],
      suggestedNextStep: 'Run the verify path manually and inspect workspace state before retry.',
    };

    const afterEntries = await this._readGitDirtyEntries(workspacePath);
    if (!baselineEntries || !afterEntries) {
      return unavailableResult;
    }

    const baselineSet = new Set(baselineEntries.map((entry) => entry.path));
    const deltaEntries = afterEntries.filter((entry) => !baselineSet.has(entry.path));
    if (deltaEntries.length === 0) {
      return {
        attempted: false,
        status: 'skipped',
        reason: 'No new file mutations were detected for rollback.',
        attemptedAt,
        candidateFiles: [],
        restoredFiles: [],
        failedFiles: [],
      };
    }

    const allCandidateFiles = deltaEntries.map((entry) => entry.path);
    if (runtimePolicy?.requiresManualApproval && !runtimePolicy.approvedByUser) {
      return {
        attempted: false,
        status: 'skipped',
        reason: `Rollback policy (${runtimePolicy.approvalMode}) requires manual approval before auto-restore.`,
        attemptedAt,
        candidateFiles: allCandidateFiles,
        restoredFiles: [],
        failedFiles: allCandidateFiles,
        suggestedNextStep:
          'Approve rollback for this action in the UI or run manual `git restore` for affected files.',
      };
    }

    const trackedCandidates = deltaEntries
      .filter((entry) => !entry.untracked)
      .map((entry) => entry.path);
    const untrackedCandidates = deltaEntries
      .filter((entry) => entry.untracked)
      .map((entry) => entry.path);
    const protectedCandidates = trackedCandidates.filter((candidatePath) =>
      isIncidentRollbackProtectedPath(candidatePath, runtimePolicy?.protectedPathPrefixes ?? [])
    );
    const eligibleTrackedCandidates = trackedCandidates.filter(
      (candidatePath) => !protectedCandidates.includes(candidatePath)
    );

    if (eligibleTrackedCandidates.length === 0 && protectedCandidates.length > 0) {
      return {
        attempted: false,
        status: 'skipped',
        reason:
          'All tracked rollback candidates are protected by policy and require manual restore.',
        attemptedAt,
        candidateFiles: allCandidateFiles,
        restoredFiles: [],
        failedFiles: [...protectedCandidates, ...untrackedCandidates],
        suggestedNextStep:
          'Review protected files and run a manual rollback after explicit approval.',
      };
    }

    if (trackedCandidates.length === 0) {
      return {
        attempted: false,
        status: 'skipped',
        reason: 'Only untracked files changed; auto-rollback skipped for safety.',
        attemptedAt,
        candidateFiles: untrackedCandidates,
        restoredFiles: [],
        failedFiles: untrackedCandidates,
        suggestedNextStep:
          'Inspect untracked files and remove manually if safe, then rerun verification.',
      };
    }

    let restoreResult = await run(
      'git',
      ['restore', '--staged', '--worktree', '--', ...eligibleTrackedCandidates],
      {
        cwd: workspacePath,
        timeout: 6000,
      }
    );

    if (restoreResult.exitCode !== 0) {
      restoreResult = await run(
        'git',
        ['restore', '--worktree', '--', ...eligibleTrackedCandidates],
        {
          cwd: workspacePath,
          timeout: 6000,
        }
      );
    }

    const afterRestoreEntries = await this._readGitDirtyEntries(workspacePath);
    const afterRestoreSet = new Set((afterRestoreEntries || []).map((entry) => entry.path));
    const restoredFiles = eligibleTrackedCandidates.filter(
      (filePath) => !afterRestoreSet.has(filePath)
    );
    const failedTrackedFiles = eligibleTrackedCandidates.filter((filePath) =>
      afterRestoreSet.has(filePath)
    );
    const failedFiles = [...failedTrackedFiles, ...protectedCandidates, ...untrackedCandidates];

    const status: 'succeeded' | 'failed' | 'partial' =
      failedFiles.length === 0 ? 'succeeded' : restoredFiles.length > 0 ? 'partial' : 'failed';

    const reason =
      restoreResult.exitCode !== 0
        ? 'Auto-rollback command exited with errors; some files may need manual restore.'
        : protectedCandidates.length > 0
          ? 'Protected rollback files were skipped and need manual restore approval.'
          : undefined;

    return {
      attempted: true,
      status,
      reason,
      attemptedAt,
      candidateFiles: [
        ...eligibleTrackedCandidates,
        ...protectedCandidates,
        ...untrackedCandidates,
      ],
      restoredFiles,
      failedFiles,
      suggestedNextStep:
        failedFiles.length > 0
          ? 'Run `git status` and restore remaining files manually before retrying.'
          : undefined,
    };
  }

  private _buildSandboxVerifyCommands(input: {
    actionType: string;
    inlineQuery: string;
    impactVerifyChecklist: string[];
    conversationId?: string;
    projectType?: string;
    projectPath?: string;
  }): SandboxVerifyCommand[] {
    const candidates: string[] = [];

    for (const checklistItem of input.impactVerifyChecklist) {
      const trimmed = checklistItem.trim();
      if (!trimmed) {
        continue;
      }

      const checklistCommandRegex = /`([^`]+)`/g;
      let match: RegExpExecArray | null = checklistCommandRegex.exec(trimmed);
      while (match) {
        const commandText = (match[1] || '').trim();
        if (commandText) {
          candidates.push(commandText);
        }
        match = checklistCommandRegex.exec(trimmed);
      }
    }

    const conversation =
      input.conversationId && this._chatBrainConversations.has(input.conversationId)
        ? this._chatBrainConversations.get(input.conversationId)
        : undefined;
    const assistantHistory = (conversation?.history || [])
      .filter((entry) => entry.role === 'assistant')
      .slice(-3);
    for (const entry of assistantHistory) {
      candidates.push(...extractVerifyCommandCandidatesFromText(entry.content));
    }

    candidates.push(...extractVerifyCommandCandidatesFromText(input.inlineQuery));

    // Add deterministic verify-pack profile commands as stable fallback candidates.
    const verifyPackPlan = buildVerifyPackPlan({
      projectType: input.projectType || WelcomePanel._selectedProject?.type,
      projectPath: input.projectPath || WelcomePanel._selectedProject?.path,
    });
    candidates.push(...toVerifyPackCommandStrings(verifyPackPlan));

    const fallbackByActionType: Record<string, string> = {
      'doctor-fix': 'rapidkit doctor --fix',
      'change-impact-lite': 'rapidkit change-impact-lite',
      'fix-preview-lite': 'rapidkit fix-preview-lite',
    };
    if (fallbackByActionType[input.actionType]) {
      candidates.push(fallbackByActionType[input.actionType]);
    }

    return toSandboxVerifyCommands(candidates);
  }

  private async _sendModulesCatalog() {
    await this._refreshModulesCatalog();
  }

  private _resolveModuleDetailsInput(input: unknown): ModuleData | null {
    if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
      const record = input as Partial<ModuleData> & { display_name?: unknown };
      const slug = typeof record.slug === 'string' && record.slug.trim() ? record.slug : undefined;
      const id =
        typeof record.id === 'string' && record.id.trim()
          ? record.id
          : slug?.split('/').filter(Boolean).pop();
      const displayName =
        typeof record.display_name === 'string' && record.display_name.trim()
          ? record.display_name
          : undefined;
      const name =
        typeof record.name === 'string' && record.name.trim()
          ? record.name
          : displayName || id || slug;

      if (!id && !slug && !name) {
        return null;
      }

      return {
        ...record,
        id: id || name || slug || 'unknown',
        name: name || id || slug || 'Unknown module',
        display_name: displayName || name || id || slug || 'Unknown module',
        version:
          typeof record.version === 'string' && record.version.trim() ? record.version : '0.0.0',
        category:
          typeof record.category === 'string' && record.category.trim()
            ? record.category
            : slug?.split('/').filter(Boolean)[1] || 'unknown',
        icon: typeof record.icon === 'string' && record.icon.trim() ? record.icon : '📦',
        description: typeof record.description === 'string' ? record.description : '',
        status:
          record.status === 'beta' || record.status === 'experimental' || record.status === 'stable'
            ? record.status
            : 'stable',
        dependencies: Array.isArray(record.dependencies)
          ? record.dependencies.filter((value): value is string => typeof value === 'string')
          : undefined,
        tags: Array.isArray(record.tags)
          ? record.tags.filter((value): value is string => typeof value === 'string')
          : undefined,
        slug: slug || id || name || 'unknown',
      } as ModuleData;
    }

    if (typeof input !== 'string' || !input.trim()) {
      return null;
    }

    const moduleId = input.trim();
    const moduleData =
      this._modulesCatalog.find((m) => m.id === moduleId || m.slug === moduleId) ||
      MODULES.find((m) => m.id === moduleId || m.slug === moduleId);

    if (moduleData) {
      return moduleData;
    }

    const parts = moduleId.split('/').filter(Boolean);
    return {
      id: parts[parts.length - 1] || moduleId,
      name: parts[parts.length - 1] || moduleId,
      version: '0.0.0',
      category: parts.length >= 3 ? parts[1] : 'unknown',
      icon: '📦',
      description: '',
      status: 'stable',
      tags: [],
      slug: moduleId,
    };
  }

  private async _refreshModulesCatalog(options?: { forceRefresh?: boolean }): Promise<void> {
    const postCatalog = (modules: typeof this._modulesCatalog, meta: Record<string, unknown>) => {
      this._panel.webview.postMessage({
        command: 'updateModulesCatalog',
        data: { modules, meta },
      });
    };

    try {
      const service = ModulesCatalogService.getInstance();
      const rawWorkspacePath = this._resolveModulesCatalogWorkspacePath();
      const workspacePath =
        (await resolveCatalogWorkspaceRoot(rawWorkspacePath)) || rawWorkspacePath;

      if (options?.forceRefresh && workspacePath) {
        CoreVersionService.getInstance().clearCache(workspacePath);
      }

      const result = await service.getModulesCatalog(workspacePath, {
        forceRefresh: options?.forceRefresh === true,
      });

      this._modulesCatalog = result.modules;
      postCatalog(this._modulesCatalog, result.meta);
    } catch (error) {
      console.error('[WelcomePanel] Failed to load modules catalog:', error);
      this._modulesCatalog = MODULES;
      postCatalog(this._modulesCatalog, {
        source: 'fallback',
        loadError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private _resolveModulesCatalogWorkspacePath(): string | undefined {
    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    if (selectedWorkspace?.path) {
      return selectedWorkspace.path;
    }

    if (WelcomePanel._selectedProject?.path) {
      return (
        WelcomePanel._selectedProject.workspacePath ||
        path.dirname(WelcomePanel._selectedProject.path)
      );
    }

    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    return undefined;
  }

  private async _sendWorkspaceStatus() {
    const selectedWorkspace = this._getSelectedWorkspaceInfo();
    const selectedProject = WelcomePanel._selectedProject;
    const fallbackWorkspacePath = selectedProject?.workspacePath;
    const fallbackWorkspaceName =
      selectedProject?.workspaceName ||
      (fallbackWorkspacePath ? path.basename(fallbackWorkspacePath) : undefined);
    const effectiveWorkspace = selectedWorkspace
      ? selectedWorkspace
      : fallbackWorkspacePath
        ? {
            path: fallbackWorkspacePath,
            name: fallbackWorkspaceName || path.basename(fallbackWorkspacePath),
          }
        : null;
    const hasWorkspace = effectiveWorkspace !== null;
    let hasProjectSelected = false;
    let installedModules: { slug: string; version: string; display_name: string }[] = [];
    let projectType: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet' | undefined;

    if (!selectedWorkspace && !fallbackWorkspacePath) {
      WelcomePanel._selectedProject = null;
    }

    // Keep project-scoped details only when selected project belongs to selected workspace.
    if (
      WelcomePanel._selectedProject &&
      effectiveWorkspace &&
      isWorkspacePathAncestor(effectiveWorkspace.path, WelcomePanel._selectedProject.path)
    ) {
      hasProjectSelected = true;
      installedModules = await WelcomePanel._readInstalledModules(
        WelcomePanel._selectedProject.path
      );
      projectType =
        (await WelcomePanel._detectProjectTypeStatic(WelcomePanel._selectedProject.path)) ??
        undefined;
    }

    // If project selection is stale (from another workspace), clear project-scoped state.
    if (
      WelcomePanel._selectedProject &&
      selectedWorkspace &&
      !isWorkspacePathAncestor(selectedWorkspace.path, WelcomePanel._selectedProject.path)
    ) {
      WelcomePanel._selectedProject = null;
    }

    this._panel.webview.postMessage({
      command: 'updateWorkspaceStatus',
      data: {
        hasWorkspace,
        hasProjectSelected,
        workspaceName: effectiveWorkspace?.name,
        workspacePath: effectiveWorkspace?.path,
        projectName: hasProjectSelected ? WelcomePanel._selectedProject?.name : undefined,
        projectPath: hasProjectSelected ? WelcomePanel._selectedProject?.path : undefined,
        projectType,
        installedModules,
      },
    });
    void this._sendDashboardEvidence();
  }

  private _getRecentWorkspaces(): Promise<
    Array<{
      name: string;
      path: string;
      lastAccessed?: number;
      coreVersion?: string;
      coreStatus?:
        | 'ok'
        | 'outdated'
        | 'not-installed'
        | 'update-available'
        | 'up-to-date'
        | 'error'
        | 'deprecated';
      coreLocation?: 'workspace' | 'global' | 'pipx';
      lastModified?: number;
      projectCount?: number;
      projectStats?: {
        fastapi?: number;
        nestjs?: number;
        springboot?: number;
        go?: number;
        dotnet?: number;
      };
      bootstrapProfile?:
        | 'minimal'
        | 'python-only'
        | 'node-only'
        | 'go-only'
        | 'java-only'
        | 'dotnet-only'
        | 'polyglot'
        | 'enterprise';
      dependencySharingMode?: 'isolated' | 'shared-runtime-caches' | 'shared-node-deps';
      policyMode?: 'warn' | 'strict';
      complianceStatus?: 'passing' | 'failing' | 'unknown';
      mirrorStatus?: 'synced' | 'stale' | 'not-configured';
    }>
  > {
    try {
      const workspaceManager = WorkspaceManager.getInstance();
      const versionService = CoreVersionService.getInstance();
      const workspaces = workspaceManager.getWorkspaces();

      // Enrich workspaces with version info, last modified, and project info
      const enrichedWorkspaces = Promise.all(
        workspaces.map(async (ws) => {
          try {
            const versionInfo = await versionService.getVersionInfo(ws.path);

            // Get last modified time and project info
            let lastModified: number | undefined;
            let projectCount: number | undefined;
            let projectStats:
              | {
                  fastapi?: number;
                  nestjs?: number;
                  springboot?: number;
                  go?: number;
                  dotnet?: number;
                }
              | undefined;
            try {
              const stats = await fs.stat(ws.path);
              lastModified = stats.mtimeMs;

              // Detect projects in workspace root (not projects/ subfolder!)
              const entries = await fs.readdir(ws.path, { withFileTypes: true });
              const stats_counter = { fastapi: 0, nestjs: 0, springboot: 0, go: 0, dotnet: 0 };
              let count = 0;

              for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                  const projectPath = path.join(ws.path, entry.name);

                  // Check for RapidKit project markers
                  const hasRapidKitMarker =
                    (await fs.pathExists(path.join(projectPath, '.rapidkit', 'project.json'))) ||
                    (await fs.pathExists(path.join(projectPath, '.rapidkit', 'context.json')));

                  if (hasRapidKitMarker) {
                    count++;
                    // Detect project type
                    const type = await this._detectProjectType(projectPath);
                    if (type === 'fastapi') {
                      stats_counter.fastapi++;
                    } else if (type === 'nestjs') {
                      stats_counter.nestjs++;
                    } else if (type === 'springboot') {
                      stats_counter.springboot++;
                    } else if (type === 'go') {
                      stats_counter.go++;
                    } else if (type === 'dotnet') {
                      stats_counter.dotnet++;
                    }
                  }
                  // Fallback: Check for FastAPI project
                  else if (await fs.pathExists(path.join(projectPath, 'pyproject.toml'))) {
                    count++;
                    stats_counter.fastapi++;
                  }
                  // Fallback: Check for Spring Boot project
                  else if (
                    (await fs.pathExists(path.join(projectPath, 'pom.xml'))) ||
                    (await fs.pathExists(path.join(projectPath, 'build.gradle'))) ||
                    (await fs.pathExists(path.join(projectPath, 'build.gradle.kts')))
                  ) {
                    count++;
                    stats_counter.springboot++;
                  }
                  // Fallback: Check for Go project
                  else if (await fs.pathExists(path.join(projectPath, 'go.mod'))) {
                    count++;
                    stats_counter.go++;
                  }
                  // Fallback: Check for .NET project
                  else if (
                    (await WelcomePanel._detectProjectTypeStatic(projectPath)) === 'dotnet'
                  ) {
                    count++;
                    stats_counter.dotnet++;
                  }
                  // Fallback: Check for NestJS project
                  else if (await fs.pathExists(path.join(projectPath, 'package.json'))) {
                    try {
                      const pkg = await fs.readJSON(path.join(projectPath, 'package.json'));
                      if (pkg.dependencies?.['@nestjs/core']) {
                        count++;
                        stats_counter.nestjs++;
                      }
                    } catch {
                      // Ignore invalid package.json
                    }
                  }
                }
              }

              projectCount = count;
              projectStats =
                count > 0
                  ? {
                      fastapi: stats_counter.fastapi > 0 ? stats_counter.fastapi : undefined,
                      nestjs: stats_counter.nestjs > 0 ? stats_counter.nestjs : undefined,
                      springboot:
                        stats_counter.springboot > 0 ? stats_counter.springboot : undefined,
                      go: stats_counter.go > 0 ? stats_counter.go : undefined,
                      dotnet: stats_counter.dotnet > 0 ? stats_counter.dotnet : undefined,
                    }
                  : undefined;
            } catch (err) {
              console.error(`Failed to get stats for ${ws.path}:`, err);
            }

            // --- Phase 4 enrichment ---
            let bootstrapProfile:
              | 'minimal'
              | 'python-only'
              | 'node-only'
              | 'go-only'
              | 'java-only'
              | 'dotnet-only'
              | 'polyglot'
              | 'enterprise'
              | undefined;
            let dependencySharingMode:
              | 'isolated'
              | 'shared-runtime-caches'
              | 'shared-node-deps'
              | undefined;
            let policyMode: 'warn' | 'strict' | undefined;
            let complianceStatus: 'passing' | 'failing' | 'unknown' | undefined;
            let mirrorStatus: 'synced' | 'stale' | 'not-configured' | undefined;
            try {
              const manifestPath = path.join(ws.path, '.rapidkit', 'workspace.json');
              if (await fs.pathExists(manifestPath)) {
                const manifest = await fs.readJSON(manifestPath).catch(() => null);
                if (manifest) {
                  bootstrapProfile = manifest.profile;
                }
              }

              const policiesPath = path.join(ws.path, '.rapidkit', 'policies.yml');
              if (await fs.pathExists(policiesPath)) {
                const policyContent = await fs.readFile(policiesPath, 'utf-8');

                const modeMatch = policyContent.match(/^\s*mode:\s*(warn|strict)\s*$/m);
                if (modeMatch && (modeMatch[1] === 'warn' || modeMatch[1] === 'strict')) {
                  policyMode = modeMatch[1];
                }

                const depModeMatch = policyContent.match(
                  /^\s*dependency_sharing_mode:\s*(isolated|shared-runtime-caches|shared-node-deps)\s*$/m
                );
                if (
                  depModeMatch &&
                  (depModeMatch[1] === 'isolated' ||
                    depModeMatch[1] === 'shared-runtime-caches' ||
                    depModeMatch[1] === 'shared-node-deps')
                ) {
                  dependencySharingMode = depModeMatch[1];
                }
              }

              const reportsDir = path.join(ws.path, '.rapidkit', 'reports');
              if (await fs.pathExists(reportsDir)) {
                const reportFiles = await fs.readdir(reportsDir);
                const latestCompliance = reportFiles
                  .filter((f) => f.startsWith('bootstrap-compliance'))
                  .sort()
                  .reverse()[0];
                if (latestCompliance) {
                  const report = await fs
                    .readJSON(path.join(reportsDir, latestCompliance))
                    .catch(() => null);
                  // result field: 'ok' | 'ok_with_warnings' | 'failed'
                  const rawResult = report?.result || report?.status;
                  complianceStatus =
                    rawResult === 'ok' || rawResult === 'ok_with_warnings'
                      ? 'passing'
                      : rawResult === 'failed'
                        ? 'failing'
                        : 'unknown';
                }
                const latestMirror = reportFiles
                  .filter((f) => f.startsWith('mirror-ops'))
                  .sort()
                  .reverse()[0];
                mirrorStatus = latestMirror
                  ? ((await fs.readJSON(path.join(reportsDir, latestMirror)).catch(() => null))
                      ?.status ?? 'not-configured')
                  : 'not-configured';
              }
            } catch {
              // Phase 4 data unavailable — leave as undefined
            }
            // --- End Phase 4 enrichment ---

            return {
              ...ws,
              coreVersion: versionInfo.installed,
              coreLatestVersion: versionInfo.latest,
              coreStatus: versionInfo.status,
              coreLocation: versionInfo.location as 'workspace' | 'global' | 'pipx' | undefined,
              lastModified,
              projectCount,
              projectStats,
              bootstrapProfile,
              dependencySharingMode,
              policyMode,
              complianceStatus,
              mirrorStatus,
            };
          } catch (error) {
            console.error(`Failed to get version info for ${ws.path}:`, error);
            return {
              ...ws,
              coreVersion: undefined,
              coreStatus: 'error' as const,
              coreLocation: undefined,
              bootstrapProfile: undefined,
              dependencySharingMode: undefined,
              policyMode: undefined,
              complianceStatus: undefined,
              mirrorStatus: undefined,
            };
          }
        })
      );

      return enrichedWorkspaces;
    } catch (error) {
      console.error('Failed to get recent workspaces:', error);
      return Promise.resolve([]);
    }
  }

  private async _detectProjectType(
    projectPath: string
  ): Promise<'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet' | null> {
    return WelcomePanel._detectProjectTypeStatic(projectPath);
  }

  static async _detectProjectTypeStatic(
    projectPath: string
  ): Promise<'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet' | null> {
    try {
      // Check for Go indicators
      const goModPath = path.join(projectPath, 'go.mod');
      if (await fs.pathExists(goModPath)) {
        return 'go';
      }

      // Check for Spring Boot / Java indicators
      const pomXmlPath = path.join(projectPath, 'pom.xml');
      const gradlePath = path.join(projectPath, 'build.gradle');
      const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
      if (
        (await fs.pathExists(pomXmlPath)) ||
        (await fs.pathExists(gradlePath)) ||
        (await fs.pathExists(gradleKtsPath))
      ) {
        return 'springboot';
      }

      const entries = await fs.readdir(projectPath, { withFileTypes: true }).catch(() => []);
      if (
        entries.some(
          (entry) =>
            entry.isFile() && (entry.name.endsWith('.csproj') || entry.name.endsWith('.sln'))
        )
      ) {
        return 'dotnet';
      }

      // Check for FastAPI indicators
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      if (await fs.pathExists(pyprojectPath)) {
        const content = await fs.readFile(pyprojectPath, 'utf8');
        if (content.includes('fastapi') || content.includes('uvicorn')) {
          return 'fastapi';
        }
      }

      // Check for NestJS indicators
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const content = await fs.readFile(packageJsonPath, 'utf8');
        if (content.includes('@nestjs/core') || content.includes('@nestjs/common')) {
          return 'nestjs';
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private _getHtmlContent(context: vscode.ExtensionContext): string {
    // Get URIs for webview resources
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js')
    );
    const cssUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.css')
    );
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'workspai.svg')
    );
    const fontUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'fonts', 'MuseoModerno-Bold.ttf')
    );
    const fastapiIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'fastapi.svg')
    );
    const nestjsIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'nestjs.svg')
    );
    const goIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'go.svg')
    );
    const springbootIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'springboot.svg')
    );
    const dotnetIconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'media', 'icons', 'dotnet.svg')
    );

    // Generate nonce for CSP
    let nonce = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; font-src ${this._panel.webview.cspSource}; img-src ${this._panel.webview.cspSource} https:; script-src 'nonce-${nonce}';">
    <title>Welcome to Workspai</title>
    <link rel="stylesheet" type="text/css" href="${cssUri}">
    <style>
        @font-face {
            font-family: 'MuseoModerno';
            src: url('${fontUri}') format('truetype');
            font-weight: bold;
            font-style: normal;
        }
        
        /* Inject icon URIs as CSS variables */
        :root {
            --icon-uri: url('${iconUri}');
            --fastapi-icon-uri: url('${fastapiIconUri}');
            --nestjs-icon-uri: url('${nestjsIconUri}');
            --go-icon-uri: url('${goIconUri}');
          --springboot-icon-uri: url('${springbootIconUri}');
          --dotnet-icon-uri: url('${dotnetIconUri}');
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        // Inject URIs for React components to use
        window.ICON_URI = '${iconUri}';
        window.FASTAPI_ICON_URI = '${fastapiIconUri}';
        window.NESTJS_ICON_URI = '${nestjsIconUri}';
        window.GO_ICON_URI = '${goIconUri}';
        window.SPRINGBOOT_ICON_URI = '${springbootIconUri}';
        window.DOTNET_ICON_URI = '${dotnetIconUri}';
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async _showModuleDetails(moduleData: ModuleData): Promise<void> {
    try {
      let workspacePath: string | undefined;
      if (WelcomePanel._selectedProject) {
        workspacePath =
          WelcomePanel._selectedProject.workspacePath ||
          path.dirname(WelcomePanel._selectedProject.path);
      } else if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
      ) {
        workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      }

      const { run } = await import('../../utils/exec.js');

      let command = 'rapidkit';
      if (workspacePath) {
        const candidates = getWorkspaceVenvRapidkitCandidates(workspacePath);
        for (const candidate of candidates) {
          if (await fs.pathExists(candidate)) {
            command = candidate;
            break;
          }
        }
      }

      const candidates = [
        moduleData.slug,
        moduleData.id,
        moduleData.slug?.split('/').filter(Boolean).pop(),
      ].filter((value, index, self) => value && self.indexOf(value) === index) as string[];

      console.log('[WelcomePanel] Fetching module info for:', candidates);

      let moduleInfo: ModuleInfoPayload | null = null;
      let foundMatch = false;

      for (const candidate of candidates) {
        try {
          // Try to get JSON output first
          const jsonResult = await run(command, ['modules', 'info', candidate, '--json'], {
            cwd: workspacePath,
            shell: false,
            timeout: 5000,
          });
          if (jsonResult.exitCode === 0 && jsonResult.stdout) {
            try {
              const parsed = JSON.parse(jsonResult.stdout) as Record<string, unknown>;
              // Merge with moduleData but prefer fresh CLI data
              moduleInfo = { ...moduleData, ...parsed };
              foundMatch = true;
              console.log(
                '[WelcomePanel] Found module info (JSON) for:',
                candidate,
                'version:',
                parsed.version
              );
              console.log('[WelcomePanel] moduleInfo after merge:', {
                name: moduleInfo.display_name,
                version: moduleInfo.version,
                slug: moduleInfo.slug,
              });
              break;
            } catch {
              console.log('[WelcomePanel] Failed to parse JSON for:', candidate);
            }
          }
        } catch {
          console.log('[WelcomePanel] Failed to fetch JSON info for:', candidate);
        }
      }

      if (!foundMatch || !moduleInfo) {
        console.log('[WelcomePanel] Could not fetch module info from CLI, using card data');
        moduleInfo = { ...moduleData };
      }

      // Send module details to React webview for modal display
      console.log('[WelcomePanel] Sending showModuleDetailsModal message:', moduleInfo);
      WelcomePanel.currentPanel?._panel.webview.postMessage({
        command: 'showModuleDetailsModal',
        data: moduleInfo,
      });
    } catch (error) {
      console.error('[WelcomePanel] Error showing module details:', error);
      vscode.window.showErrorMessage('Failed to load module details');
    }
  }

  public dispose() {
    if (WelcomePanel.currentPanel === this) {
      if (this._panelRole === 'incident' && WelcomePanel._dashboardPanel) {
        WelcomePanel.currentPanel = WelcomePanel._dashboardPanel;
      } else if (this._panelRole === 'dashboard' && WelcomePanel._incidentPanel) {
        WelcomePanel.currentPanel = WelcomePanel._incidentPanel;
      } else {
        WelcomePanel.currentPanel = undefined;
      }
    }
    if (this._panelRole === 'dashboard' && WelcomePanel._dashboardPanel === this) {
      WelcomePanel._dashboardPanel = undefined;
    }
    if (this._panelRole === 'incident' && WelcomePanel._incidentPanel === this) {
      WelcomePanel._incidentPanel = undefined;
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
