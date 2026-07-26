import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Wrench, Settings2 } from 'lucide-react';
import { vscode } from '@/vscode';
import { normalizeExtensionWebviewMessage } from '@workspai-contracts/webviewProtocol';
import type {
  ModuleData,
  CategoryInfo,
  Workspace,
  WorkspaceStatus,
  InstallStatus,
  ExampleWorkspace,
  Kit,
  WorkspaceToolStatus,
  ModulesCatalogMeta,
  ModulesCatalogUpdate,
  ScaffoldFramework,
} from '@/types';
import { Header } from '@/components/Header';
import { RecentWorkspaces } from '@/components/RecentWorkspaces';
import { ExampleWorkspaces } from '@/components/ExampleWorkspaces';
import {
  DashboardCatalogLoadingShell,
  DashboardModuleCatalogSurface,
} from '@/components/DashboardModuleCatalogSurface';
import { DashboardSubNav } from '@/components/DashboardSubNav';
import { DashboardContextBar } from '@/components/DashboardContextBar';
import { HomeCreateHandoff } from '@/components/HomeCreateHandoff';
import { HomeImportAdoptHandoff } from '@/components/HomeImportAdoptHandoff';
import { DashboardEvidenceArtifactsSection } from '@/components/DashboardEvidenceArtifactsSection';
import { DashboardRepairPanel } from '@/components/DashboardRepairPanel';
import { WorkspaceGraphExplorer } from '@/components/WorkspaceGraphExplorer';
import type { WorkspaceGraphProjection } from '@workspai-contracts/workspaceGraphProjection';
import type {
  WorkspaceGraphRecordingFrameInput,
  WorkspaceGraphRecordingState,
} from '@workspai-contracts/workspaceGraphRecording';
import { DashboardOperatePanel } from '@/components/DashboardOperatePanel';
import {
  DashboardOverviewSection,
  type ImportedWorkspaceShareSummary,
} from '@/components/DashboardOverviewSection';
import { OpsChainBanner } from '@/components/OpsChainBanner';
import { ProjectActions } from '@/components/ProjectActions';
import { WorkspaiEmptyState } from '@/components/WorkspaiEmptyState';
import { Footer } from '@/components/Footer';
import { SetupExperience } from '@/components/SetupExperience';
import { type IncidentProjectSelection } from '@/lib/incidentStudioPayload';
import { AICreateModal, AICreationPlan, AICreateFramework } from '@/components/AICreateModal';
import { CreateWorkspaceModal, WorkspaceCreationConfig } from '@/components/CreateWorkspaceModal';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { InstallModuleModal } from '@/components/InstallModuleModal';
import { ModuleDetailsModal } from '@/components/ModuleDetailsModal';
import {
  WorkspaiSettingsPanel,
  type WorkspaiAIProviderDefinition,
} from '@/components/WorkspaiSettingsPanel';
import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';
import { normalizeThemeMode, type ThemeMode } from '@/components/StudioRedesign/styles/themeSystem';
import { WorkspaiBanner } from '@/components/WorkspaiBanner';
import { resolveSidebarProjectSelection } from '@/lib/incidentStudioAnalysisScope';
import {
  dashboardSectionForOpsChainStep,
  dashboardSectionNeedsCatalog,
  dashboardSectionShowsScopePaths,
  normalizeDashboardSection,
  type DashboardSection,
} from '@/lib/dashboardSections';
import {
  dashboardOperateZoneForOpsChainStep,
  scrollToDashboardOperateZoneWithRetry,
  type DashboardOperateZone,
} from '@/lib/dashboardOperateZones';
import {
  resolveCatalogModulesReady,
  resolveCatalogTemplatesReady,
  shouldRequestCatalogRefresh,
} from '@/lib/dashboardCatalogLoad';
import { buildDashboardEvidenceActionContract } from '@/lib/dashboardActionContract';
import {
  trackDashboardNavigation,
  type DashboardNavigationSource,
} from '@/lib/dashboardNavigationTelemetry';
import {
  getDashboardCommandAffectedEvidenceCards,
  getDashboardCommandPendingEvidenceCards,
  shouldRefreshDashboardEvidenceAfterCommand,
} from '@/lib/dashboardCommandRegistry';
import {
  clearPendingEvidenceForCommand,
  mergePendingEvidenceCardIds,
  reconcilePendingEvidenceCardIds,
} from '@/lib/dashboardEvidencePending';
import { createDashboardEvidenceRefreshScheduler } from '@/lib/dashboardEvidenceRefreshSchedule';
import {
  applyDashboardEvidenceMessage,
  emptyEvidencePayloadForWorkspace,
  nextEvidenceRequestId,
} from '@/lib/dashboardEvidenceSession';
import { isUnsupportedModuleProjectType } from '@/lib/moduleSupport';
import {
  getDashboardLifecycleDisableReason,
  isDashboardLifecycleCommandSupported,
} from '@/lib/projectCapabilities';
import type {
  DashboardOpsChainStep,
  DashboardEvidenceCard,
  DashboardEvidenceCardId,
  DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import {
  countOperateAttention,
  filterOpsChainForActiveWorkspace,
} from '@/lib/dashboardEvidence';
import { countEvidenceAttentionBuckets } from '@/lib/evidenceAgentContext';
import {
  applyDashboardCommandFailures,
  successfulEvidenceCardIds,
  type DashboardCommandFailure,
  type DashboardCommandFailureMap,
} from '@/lib/dashboardCommandFailure';
import { normalizeEvidenceViewMode, type EvidenceViewMode } from '@/lib/dashboardEvidenceViewMode';
import { buildDashboardScopeDescriptor } from '@/lib/dashboardScope';
import {
  buildDashboardCommandPayload,
  buildDashboardDispatchMessages,
} from '@/lib/dashboardDispatch';
import { dashboardWorkspaceScope } from '@/lib/dashboardScopePolicy';

function normalizeAvailableModels(
  raw: unknown
): Array<{ id: string; name: string; vendor: string }> {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seenIds = new Set<string>();

  return raw
    .filter(
      (model: unknown): model is { id: string; name: string; vendor: string } =>
        Boolean(model) &&
        typeof (model as { id?: unknown }).id === 'string' &&
        (model as { id: string }).id.trim().length > 0
    )
    .map((model) => ({
      id: model.id.trim(),
      name: typeof model.name === 'string' && model.name.trim().length > 0 ? model.name : model.id,
      vendor: typeof model.vendor === 'string' ? model.vendor : '',
    }))
    .filter((model) => {
      if (seenIds.has(model.id)) {
        return false;
      }
      seenIds.add(model.id);
      return true;
    });
}

declare global {
  interface Window {
    /** @deprecated Legacy standalone setup webview; App resolves setup tab when present. */
    WORKSPAI_VIEW?: 'welcome' | 'setup';
  }
}

type WorkspaiActiveView = 'dashboard' | 'settings' | 'setup';

function resolveInitialActiveView(): WorkspaiActiveView {
  if (typeof window !== 'undefined' && window.WORKSPAI_VIEW === 'setup') {
    return 'setup';
  }
  return 'dashboard';
}

export function App() {
  const [version, setVersion] = useState('0.0.0');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showModuleDetailsModal, setShowModuleDetailsModal] = useState(false);
  const [aiAvailableModels, setAIAvailableModels] = useState<
    { id: string; name: string; vendor: string }[]
  >([]);
  const [preferredModelId, setPreferredModelId] = useState<string>('auto');
  const [aiProvider, setAIProvider] = useState<string>('vscode-lm');
  const [aiProviderCatalog, setAIProviderCatalog] = useState<WorkspaiAIProviderDefinition[]>([]);
  const [customAIBaseUrl, setCustomAIBaseUrl] = useState('');
  const [customAIModel, setCustomAIModel] = useState('');
  const [aiProviderStatus, setAIProviderStatus] = useState<{
    provider: string;
    ready: boolean;
    label: string;
    reason?: string;
    hasApiKey?: boolean;
  } | null>(null);
  const [aiProviderHealthCheck, setAIProviderHealthCheck] = useState<{
    ok: boolean;
    label: string;
    latencyMs?: number;
    model?: string;
    reason?: string;
  } | null>(null);
  const [providerHealthChecking, setProviderHealthChecking] = useState(false);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  // AI Create state
  const [showAICreateModal, setShowAICreateModal] = useState(false);
  const [aiCreateMode, setAICreateMode] = useState<'workspace' | 'project'>('workspace');
  const [aiCreateFramework, setAICreateFramework] = useState<AICreateFramework | undefined>(
    undefined
  );
  const [aiCreateTargetWorkspaceName, setAICreateTargetWorkspaceName] = useState<
    string | undefined
  >(undefined);
  const [aiCreateTargetWorkspacePath, setAICreateTargetWorkspacePath] = useState<
    string | undefined
  >(undefined);
  const [aiCreationPlan, setAICreationPlan] = useState<AICreationPlan | null>(null);
  const [aiCreationThinking, setAICreationThinking] = useState(false);
  const [aiCreationCreating, setAICreationCreating] = useState(false);
  const [aiCreationStage, setAICreationStage] = useState<
    'workspace_done' | 'first_project_done' | null
  >(null);
  const [aiCreationError, setAICreationError] = useState<string | null>(null);
  const [aiCreateModelId, setAICreateModelId] = useState<string | null>(null);
  const [aiCreationPlanSource, setAICreationPlanSource] = useState<'llm' | 'heuristic' | null>(
    null
  );
  const [selectedFramework, setSelectedFramework] = useState<ScaffoldFramework>('fastapi');
  const [selectedModule, setSelectedModule] = useState<ModuleData | null>(null);
  const [moduleDetails, setModuleDetails] = useState<ModuleData | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<Workspace[]>([]);
  const [exampleWorkspaces, setExampleWorkspaces] = useState<ExampleWorkspace[]>([]);
  const [availableKits, setAvailableKits] = useState<Kit[]>([]);
  const [cloningExample, setCloningExample] = useState<string | null>(null);
  const [updatingExample, setUpdatingExample] = useState<string | null>(null);
  const [modulesCatalog, setModulesCatalog] = useState<ModuleData[]>([]);
  const [modulesCatalogMeta, setModulesCatalogMeta] = useState<ModulesCatalogMeta | null>(null);
  const [categoryInfo] = useState<CategoryInfo>({});
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({ hasWorkspace: false });
  const [installStatus, setInstallStatus] = useState<InstallStatus>({
    npmInstalled: false,
    coreInstalled: false,
  });
  const [workspaceToolStatus, setWorkspaceToolStatus] = useState<WorkspaceToolStatus | null>(null);
  /** true once extension has sent at least one installStatusUpdate — before that, initial false values must not be trusted */
  const [installStatusChecked, setInstallStatusChecked] = useState(false);
  const [isRefreshingWorkspaces, setIsRefreshingWorkspaces] = useState(false);
  const [activeView, setActiveView] = useState<WorkspaiActiveView>(resolveInitialActiveView);
  const [dashboardTemplatesReady, setDashboardTemplatesReady] = useState(false);
  const [dashboardModulesReady, setDashboardModulesReady] = useState(false);
  const [dashboardCatalogTimedOut, setDashboardCatalogTimedOut] = useState(false);
  const catalogTemplatesAckRef = useRef(false);
  const catalogModulesAckRef = useRef(false);
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('overview');
  const [evidenceViewMode, setEvidenceViewMode] = useState<EvidenceViewMode>('guided');
  const [pendingEvidenceCardIds, setPendingEvidenceCardIds] = useState<DashboardEvidenceCardId[]>(
    []
  );
  const [pendingEvidenceRefreshCardIds, setPendingEvidenceRefreshCardIds] = useState<
    DashboardEvidenceCardId[]
  >([]);
  const [isEvidenceFullRefreshPending, setIsEvidenceFullRefreshPending] = useState(false);
  const dashboardEvidenceRefreshSchedulerRef = useRef(createDashboardEvidenceRefreshScheduler());
  const dashboardEvidenceRequestIdRef = useRef(0);
  const lastAppliedEvidenceRequestIdRef = useRef(0);
  const [requestedOperateZone, setRequestedOperateZone] = useState<DashboardOperateZone | null>(
    null
  );
  const [dashboardCommandNotice, setDashboardCommandNotice] = useState<{
    title: string;
    body: string;
    stderrTail?: string;
    exitCode?: number;
  } | null>(null);
  const [dashboardCommandFailures, setDashboardCommandFailures] =
    useState<DashboardCommandFailureMap>({});
  const lastDashboardNavigationRef = useRef<{
    section: DashboardSection;
    operateZone?: DashboardOperateZone;
  } | null>(null);
  const lastDashboardSectionChangeAtRef = useRef(0);
  const pendingDashboardSectionPreferenceRef = useRef<DashboardSection | null>(null);
  const hasAppliedInitialDashboardSectionPreferenceRef = useRef(false);
  const dashboardSectionRef = useRef<DashboardSection>(dashboardSection);
  dashboardSectionRef.current = dashboardSection;
  const requestedOperateZoneRef = useRef<DashboardOperateZone | null>(requestedOperateZone);
  requestedOperateZoneRef.current = requestedOperateZone;
  const [dashboardEvidence, setDashboardEvidence] = useState<DashboardEvidencePayload | null>(null);
  const [liveWorkspaceGraph, setLiveWorkspaceGraph] = useState<WorkspaceGraphProjection | null>(
    null
  );
  const [workspaceGraphStreamStatus, setWorkspaceGraphStreamStatus] = useState('stopped');
  const [workspaceGraphStreamStats, setWorkspaceGraphStreamStats] = useState<{
    received: number;
    emitted: number;
    coalesced: number;
  } | null>(null);
  const [workspaceGraphMemorySample, setWorkspaceGraphMemorySample] = useState<{
    estimatedBytes: number;
    budgetBytes: number;
    utilizationRatio: number;
    exceeded: boolean;
  } | null>(null);
  const [workspaceGraphRecordingState, setWorkspaceGraphRecordingState] =
    useState<WorkspaceGraphRecordingState | null>(null);
  const dashboardEvidenceRef = useRef<DashboardEvidencePayload | null>(dashboardEvidence);
  const effectiveDashboardEvidence = useMemo(
    () => applyDashboardCommandFailures(dashboardEvidence, dashboardCommandFailures),
    [dashboardEvidence, dashboardCommandFailures]
  );
  const [importedWorkspaceShare, setImportedWorkspaceShare] =
    useState<ImportedWorkspaceShareSummary | null>(null);
  const [selectedWorkspaceForAnalysis, setSelectedWorkspaceForAnalysis] = useState<string | null>(
    null
  );
  const [selectedProjectForAnalysis, setSelectedProjectForAnalysis] =
    useState<IncidentProjectSelection | null>(null);
  const workspaceStatusRef = useRef(workspaceStatus);
  const selectedWorkspaceForAnalysisRef = useRef<string | null>(selectedWorkspaceForAnalysis);
  const selectedProjectForAnalysisRef = useRef<IncidentProjectSelection | null>(
    selectedProjectForAnalysis
  );
  const dashboardMountedAtRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  );

  useEffect(() => {
    workspaceStatusRef.current = workspaceStatus;
  }, [workspaceStatus]);

  useEffect(() => {
    selectedWorkspaceForAnalysisRef.current = selectedWorkspaceForAnalysis;
  }, [selectedWorkspaceForAnalysis]);

  useEffect(() => {
    selectedProjectForAnalysisRef.current = selectedProjectForAnalysis;
  }, [selectedProjectForAnalysis]);

  useEffect(() => {
    dashboardEvidenceRef.current = dashboardEvidence;
  }, [dashboardEvidence]);

  const mergedPendingEvidenceCardIds = useMemo(
    () => mergePendingEvidenceCardIds(pendingEvidenceCardIds, pendingEvidenceRefreshCardIds),
    [pendingEvidenceCardIds, pendingEvidenceRefreshCardIds]
  );

  const refreshWorkspaiSettings = () => {
    setAiModelsLoading(true);
    vscode.postMessage('requestWorkspaiSettings');
  };

  const handlePreferredModelChange = (modelId: string) => {
    const normalized = modelId.trim() || 'auto';
    setPreferredModelId(normalized);
    vscode.postMessage('setPreferredModel', { modelId: normalized });
  };

  const handleThemeModeChange = (mode: ThemeMode) => {
    const normalized = normalizeThemeMode(mode);
    setThemeMode(normalized);
    vscode.postMessage('setThemeMode', { mode: normalized });
  };

  const handleAICreateStartOver = () => {
    setAICreationPlan(null);
    setAICreationPlanSource(null);
    setAICreationError(null);
    setAICreationThinking(false);
    setAICreationStage(null);
  };

  const openStudioInSidebar = (
    initialQuery?: string,
    options?: {
      studioMode?: 'investigate' | 'verify' | 'prepare';
      composerHandoff?: 'prefill' | 'submit';
      shipLoopIntent?: 'release';
    }
  ) => {
    const workspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath;
    if (!workspacePath) {
      vscode.postMessage('quickSwitchWorkspace');
      return;
    }

    const workspaceName =
      selectedWorkspaceForAnalysisObj?.name ||
      workspaceStatus.workspaceName ||
      activeWorkspaceName ||
      workspacePath;

    setSelectedWorkspaceForAnalysis(workspacePath);
    vscode.postMessage('openStudioSidebarTab', {
      workspacePath,
      workspaceName,
      initialQuery,
      initialTask: initialQuery,
      studioMode: options?.studioMode ?? 'investigate',
      composerHandoff: options?.composerHandoff,
      shipLoopIntent: options?.shipLoopIntent,
      source: 'dashboard',
      trigger: 'dashboard-studio-handoff',
    });
  };

  const openStudioForEvidence = (card: DashboardEvidenceCard) => {
    if (!workspaceStatus.workspacePath) {
      vscode.postMessage('quickSwitchWorkspace');
      return;
    }

    const actionContract = buildDashboardEvidenceActionContract(card, {
      workspace: {
        path: workspaceStatus.workspacePath,
        name: activeWorkspaceName,
      },
      project: {
        path: selectedProjectForAnalysis?.path,
        name: selectedProjectForAnalysis?.name,
      },
      evidence: effectiveDashboardEvidence,
    });
    vscode.postMessage('askStudioAboutEvidence', {
      ...actionContract.studioPayload,
      source:
        dashboardSection === 'repair'
          ? 'repair'
          : dashboardSection === 'evidence'
            ? 'artifacts'
            : 'dashboard',
      handoffSource:
        dashboardSection === 'repair'
          ? 'repair'
          : dashboardSection === 'evidence'
            ? 'artifacts'
            : 'dashboard',
      trigger:
        dashboardSection === 'repair'
          ? 'repair-flow-studio-handoff'
          : dashboardSection === 'evidence'
            ? 'artifacts-inbox-studio-handoff'
            : 'dashboard-evidence-studio-handoff',
    });
  };

  const openStudioTarget = (
    target: NonNullable<DashboardEvidenceCard['incidentStudioTarget']>,
    options?: { studioMode?: 'investigate' | 'verify' | 'prepare'; shipLoopIntent?: 'release' }
  ) => {
    if (options?.shipLoopIntent === 'release') {
      openStudioInSidebar(undefined, {
        studioMode: options.studioMode ?? 'verify',
        shipLoopIntent: 'release',
      });
      return;
    }

    const card =
      effectiveDashboardEvidence?.cards.find((entry) => entry.incidentStudioTarget === target) ??
      effectiveDashboardEvidence?.cards.find((entry) => entry.id === target);
    if (card) {
      openStudioForEvidence(card);
      return;
    }
    openStudioInSidebar(undefined, {
      studioMode: options?.studioMode ?? 'investigate',
      shipLoopIntent: target === 'release' ? 'release' : undefined,
    });
  };

  const activeWorkspace =
    recentWorkspaces.find((workspace) => workspace.path === workspaceStatus.workspacePath) || null;
  const selectedWorkspaceForAnalysisObj = selectedWorkspaceForAnalysis
    ? recentWorkspaces.find((w) => w.path === selectedWorkspaceForAnalysis)
    : null;
  const hasActiveWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
  const activeWorkspaceProfile = activeWorkspace?.bootstrapProfile;
  const activeWorkspaceName =
    selectedWorkspaceForAnalysisObj?.name || workspaceStatus.workspaceName || activeWorkspace?.name;
  const activeDashboardWorkspacePath =
    workspaceStatus.workspacePath || selectedWorkspaceForAnalysis || null;
  const visibleOpsChain = useMemo(
    () =>
      filterOpsChainForActiveWorkspace(
        effectiveDashboardEvidence?.opsChain,
        activeDashboardWorkspacePath
      ),
    [effectiveDashboardEvidence?.opsChain, activeDashboardWorkspacePath]
  );
  const opsChainBlockedCardIdByStep: Record<DashboardOpsChainStep, DashboardEvidenceCardId> = {
    bootstrap: 'bootstrap',
    doctor: 'doctor',
    analyze: 'analyze',
    readiness: 'readiness',
  };
  const opsChainBlockedByRepairCard = useMemo(() => {
    if (!visibleOpsChain || visibleOpsChain.status !== 'blocked') {
      return false;
    }
    const cardId = opsChainBlockedCardIdByStep[visibleOpsChain.currentStep];
    return Boolean(
      effectiveDashboardEvidence?.cards.some(
        (card) => card.id === cardId && (card.status === 'fail' || card.status === 'warn')
      )
    );
  }, [effectiveDashboardEvidence?.cards, visibleOpsChain]);
  const workspaceCommandPayload = () => ({
    path: workspaceStatus.workspacePath,
    workspacePath: workspaceStatus.workspacePath,
    name: activeWorkspaceName,
    workspaceName: activeWorkspaceName,
  });
  const projectCommandPayload = () => ({
    workspacePath: workspaceStatus.workspacePath || selectedWorkspaceForAnalysis || undefined,
    workspaceName: activeWorkspaceName,
    projectPath: selectedProjectForAnalysis?.path || workspaceStatus.projectPath || undefined,
    projectName: selectedProjectForAnalysis?.name || workspaceStatus.projectName || undefined,
    projectType: selectedProjectForAnalysis?.type || workspaceStatus.projectType || undefined,
  });
  const buildEvidenceRequestContext = useCallback((context?: Record<string, unknown>) => {
    const currentWorkspaceStatus = workspaceStatusRef.current;
    const currentWorkspacePath = selectedWorkspaceForAnalysisRef.current;
    const contextWorkspacePath =
      typeof context?.workspacePath === 'string'
        ? context.workspacePath
        : typeof context?.path === 'string'
          ? context.path
          : undefined;
    const contextProjectPath =
      typeof context?.projectPath === 'string' ? context.projectPath : undefined;
    const contextProjectName =
      typeof context?.projectName === 'string' ? context.projectName : undefined;

    return {
      workspacePath:
        currentWorkspaceStatus.workspacePath ||
        contextWorkspacePath ||
        currentWorkspacePath ||
        undefined,
      projectPath:
        contextProjectPath ||
        selectedProjectForAnalysisRef.current?.path ||
        currentWorkspaceStatus.projectPath ||
        undefined,
      projectName:
        contextProjectName ||
        selectedProjectForAnalysisRef.current?.name ||
        currentWorkspaceStatus.projectName ||
        undefined,
    };
  }, []);
  const requestDashboardEvidenceFull = useCallback(
    (context?: Record<string, unknown>) => {
      const nextRequestId = nextEvidenceRequestId(dashboardEvidenceRequestIdRef.current);
      dashboardEvidenceRequestIdRef.current = nextRequestId;
      vscode.postMessage('requestDashboardEvidence', {
        ...buildEvidenceRequestContext(context),
        refreshMode: 'full',
        requestId: nextRequestId,
      });
    },
    [buildEvidenceRequestContext]
  );
  const requestDashboardEvidenceCardRefresh = useCallback(
    (cardIds: DashboardEvidenceCardId[], context?: Record<string, unknown>) => {
      if (cardIds.length === 0) {
        return;
      }
      const nextRequestId = nextEvidenceRequestId(dashboardEvidenceRequestIdRef.current);
      dashboardEvidenceRequestIdRef.current = nextRequestId;
      vscode.postMessage('refreshDashboardEvidenceCard', {
        ...buildEvidenceRequestContext(context),
        cardIds,
        requestId: nextRequestId,
      });
    },
    [buildEvidenceRequestContext]
  );
  const markEvidenceCardsRefreshing = useCallback((cardIds: DashboardEvidenceCardId[]) => {
    if (cardIds.length === 0) {
      return;
    }
    setPendingEvidenceRefreshCardIds((current) => [...new Set([...current, ...cardIds])]);
  }, []);
  const refreshDashboardEvidenceFull = useCallback(
    (context?: Record<string, unknown>) => {
      const cardIds = dashboardEvidenceRef.current?.cards.map((card) => card.id) ?? [];
      if (cardIds.length > 0) {
        markEvidenceCardsRefreshing(cardIds);
      } else {
        setIsEvidenceFullRefreshPending(true);
      }
      requestDashboardEvidenceFull(context);
    },
    [markEvidenceCardsRefreshing, requestDashboardEvidenceFull]
  );
  const refreshDashboardEvidenceCard = useCallback(
    (cardIds: DashboardEvidenceCardId[], context?: Record<string, unknown>) => {
      markEvidenceCardsRefreshing(cardIds);
      requestDashboardEvidenceCardRefresh(cardIds, context);
    },
    [markEvidenceCardsRefreshing, requestDashboardEvidenceCardRefresh]
  );
  const clearDashboardEvidenceRefreshTimers = useCallback(() => {
    dashboardEvidenceRefreshSchedulerRef.current.cancel();
  }, []);
  const resetDashboardEvidenceSession = useCallback(
    (workspacePath?: string) => {
      clearDashboardEvidenceRefreshTimers();
      setPendingEvidenceCardIds([]);
      setPendingEvidenceRefreshCardIds([]);
      setIsEvidenceFullRefreshPending(false);
      setDashboardCommandFailures({});
      const nextRequestId = nextEvidenceRequestId(dashboardEvidenceRequestIdRef.current);
      dashboardEvidenceRequestIdRef.current = nextRequestId;
      lastAppliedEvidenceRequestIdRef.current = 0;
      setDashboardEvidence(emptyEvidencePayloadForWorkspace(workspacePath, nextRequestId));
    },
    [clearDashboardEvidenceRefreshTimers]
  );
  const resetDashboardSectionForWorkspaceSwitch = useCallback(() => {
    const resetSection: DashboardSection = 'overview';
    lastDashboardSectionChangeAtRef.current = Date.now();
    pendingDashboardSectionPreferenceRef.current = resetSection;
    lastDashboardNavigationRef.current = null;
    setRequestedOperateZone(null);
    setDashboardSection(resetSection);
    vscode.postMessage('setUiPreference', {
      key: 'dashboardSection',
      value: resetSection,
    });
  }, []);
  const clearDashboardCommandFailuresForCards = useCallback(
    (cardIds: DashboardEvidenceCardId[]) => {
      if (cardIds.length === 0) {
        return;
      }
      const cardIdSet = new Set(cardIds);
      setDashboardCommandFailures((current) => {
        let changed = false;
        const next: DashboardCommandFailureMap = {};
        for (const [cardId, failure] of Object.entries(current) as Array<
          [DashboardEvidenceCardId, DashboardCommandFailure]
        >) {
          if (cardIdSet.has(cardId)) {
            changed = true;
            continue;
          }
          next[cardId] = failure;
        }
        return changed ? next : current;
      });
    },
    []
  );
  const reconcilePendingEvidenceCards = useCallback(
    (payload?: DashboardEvidencePayload | null) => {
      setPendingEvidenceCardIds((current) => reconcilePendingEvidenceCardIds(current, payload));
      setPendingEvidenceRefreshCardIds((current) =>
        reconcilePendingEvidenceCardIds(current, payload)
      );
      clearDashboardCommandFailuresForCards(successfulEvidenceCardIds(payload));
      if (payload?.refreshMode === 'full') {
        setIsEvidenceFullRefreshPending(false);
      }
    },
    [clearDashboardCommandFailuresForCards]
  );
  const scheduleDashboardEvidenceFullRefresh = useCallback(
    (context?: Record<string, unknown>) => {
      dashboardEvidenceRefreshSchedulerRef.current.scheduleFull(() =>
        requestDashboardEvidenceFull(context)
      );
    },
    [requestDashboardEvidenceFull]
  );
  const scheduleDashboardEvidenceCardRefresh = useCallback(
    (cardIds: DashboardEvidenceCardId[], context?: Record<string, unknown>) => {
      dashboardEvidenceRefreshSchedulerRef.current.scheduleCards(() =>
        refreshDashboardEvidenceCard(cardIds, context)
      );
    },
    [refreshDashboardEvidenceCard]
  );
  const buildEvidenceActionContract = (card: DashboardEvidenceCard) =>
    buildDashboardEvidenceActionContract(card, {
      workspace: {
        path: workspaceStatus.workspacePath,
        name: activeWorkspaceName,
      },
      project: {
        path: selectedProjectForAnalysis?.path,
        name: selectedProjectForAnalysis?.name,
      },
      evidence: effectiveDashboardEvidence,
    });

  const askStudioAboutEvidenceCard = useCallback(
    (card: DashboardEvidenceCard) => {
      if (!workspaceStatus.workspacePath) {
        vscode.postMessage('quickSwitchWorkspace');
        return;
      }
      const actionContract = buildEvidenceActionContract(card);
      const handoffSource =
        dashboardSection === 'repair'
          ? 'repair'
          : dashboardSection === 'evidence'
            ? 'artifacts'
            : 'dashboard';
      vscode.postMessage('askStudioAboutEvidence', {
        ...actionContract.studioPayload,
        source: handoffSource,
        handoffSource,
        trigger:
          handoffSource === 'repair'
            ? 'repair-flow-studio-handoff'
            : handoffSource === 'artifacts'
              ? 'artifacts-inbox-studio-handoff'
              : 'dashboard-evidence-studio-handoff',
      });
    },
    [
      activeWorkspaceName,
      effectiveDashboardEvidence?.projectName,
      effectiveDashboardEvidence?.projectPath,
      dashboardSection,
      selectedProjectForAnalysis?.name,
      selectedProjectForAnalysis?.path,
      workspaceStatus.workspacePath,
    ]
  );

  const sendEvidenceCardToCopilot = useCallback(
    (card: DashboardEvidenceCard) => {
      if (!workspaceStatus.workspacePath) {
        vscode.postMessage('quickSwitchWorkspace');
        return;
      }
      vscode.postMessage('sendToCopilot', buildEvidenceActionContract(card).copilotPayload);
    },
    [
      activeWorkspaceName,
      effectiveDashboardEvidence?.projectName,
      effectiveDashboardEvidence?.projectPath,
      selectedProjectForAnalysis?.name,
      selectedProjectForAnalysis?.path,
      workspaceStatus.workspacePath,
    ]
  );

  const copyEvidenceCardAgentHandoff = useCallback(
    (card: DashboardEvidenceCard) => {
      if (!workspaceStatus.workspacePath) {
        vscode.postMessage('quickSwitchWorkspace');
        return;
      }
      vscode.postMessage(
        'copyEvidenceAgentHandoff',
        buildEvidenceActionContract(card).copilotPayload
      );
    },
    [
      activeWorkspaceName,
      effectiveDashboardEvidence?.projectName,
      effectiveDashboardEvidence?.projectPath,
      selectedProjectForAnalysis?.name,
      selectedProjectForAnalysis?.path,
      workspaceStatus.workspacePath,
    ]
  );

  const showWorkspaiEvidenceOutput = useCallback(() => {
    vscode.postMessage('showWorkspaiEvidenceOutput');
  }, []);

  useEffect(() => () => dashboardEvidenceRefreshSchedulerRef.current.cancel(), []);
  const openSetupInDashboard = () => {
    setActiveView('setup');
  };
  const dispatchDashboardCommand = (command: string, data?: Record<string, unknown>) => {
    if (command === 'openSetup') {
      openSetupInDashboard();
      return;
    }
    if (command === 'openCreateWorkspace') {
      setShowCreateModal(true);
      return;
    }
    if (
      !isDashboardLifecycleCommandSupported(workspaceStatus.projectCapabilities, command) &&
      workspaceStatus.projectCapabilities?.available
    ) {
      const reason =
        getDashboardLifecycleDisableReason(workspaceStatus.projectCapabilities, command) ||
        'This project action is not supported by RapidKit for the selected runtime.';
      setDashboardCommandNotice({
        title: 'Project command blocked',
        body: reason,
      });
      return;
    }
    setDashboardCommandNotice(null);
    const scopePayload = command.startsWith('project')
      ? projectCommandPayload()
      : command.startsWith('module')
        ? undefined
        : workspaceCommandPayload();
    const payload = buildDashboardCommandPayload(
      command,
      data,
      scopePayload,
      workspaceStatus.workspacePath
    );
    const affectedCards = getDashboardCommandAffectedEvidenceCards(command);
    const pendingCards = getDashboardCommandPendingEvidenceCards(
      command,
      dashboardEvidence?.cards.map((card) => card.id) ?? []
    );
    const shouldRefreshEvidence = shouldRefreshDashboardEvidenceAfterCommand(command);
    clearDashboardCommandFailuresForCards(affectedCards);
    if (pendingCards.length > 0) {
      setPendingEvidenceCardIds((current) => [...new Set([...current, ...pendingCards])]);
    }
    for (const message of buildDashboardDispatchMessages(command, payload)) {
      vscode.postMessage(message.command, message.data);
    }
    if (shouldRefreshEvidence) {
      if (affectedCards.length > 0) {
        scheduleDashboardEvidenceCardRefresh(affectedCards, payload);
      } else {
        scheduleDashboardEvidenceFullRefresh(payload);
      }
    }
  };
  const handleDashboardCommand = dispatchDashboardCommand;
  const isEmptyWorkspaceHome = dashboardSection === 'overview' && !hasActiveWorkspace;
  const showDashboardContextBar = dashboardSection !== 'catalog' && hasActiveWorkspace;
  const showOverviewDiagnostics = dashboardSection === 'overview' && hasActiveWorkspace;
  const evidenceAttentionCount = useMemo(
    () => {
      const buckets = countEvidenceAttentionBuckets(effectiveDashboardEvidence);
      return buckets.blocked + buckets.attention;
    },
    [effectiveDashboardEvidence]
  );
  const operateAttentionCount = useMemo(
    () =>
      countOperateAttention({
        evidence: effectiveDashboardEvidence,
        complianceStatus: activeWorkspace?.complianceStatus,
        mirrorStatus: activeWorkspace?.mirrorStatus,
      }),
    [effectiveDashboardEvidence, activeWorkspace?.complianceStatus, activeWorkspace?.mirrorStatus]
  );
  const dashboardScope = useMemo(
    () =>
      buildDashboardScopeDescriptor({
        workspaceStatus,
        activeWorkspaceName,
        activeWorkspaceProfile,
        selectedProjectForAnalysis,
      }),
    [activeWorkspaceName, activeWorkspaceProfile, selectedProjectForAnalysis, workspaceStatus]
  );
  const dashboardWorkspaceOnlyScope = useMemo(
    () => dashboardWorkspaceScope(dashboardScope),
    [dashboardScope]
  );
  const dashboardProjectPath = dashboardScope.project.path;
  const dashboardProjectName = dashboardScope.project.name;
  const dashboardProjectType = dashboardScope.project.type;
  const hasDashboardProject = dashboardScope.project.active;

  const updateEvidenceViewMode = (mode: EvidenceViewMode) => {
    const normalized = normalizeEvidenceViewMode(mode);
    setEvidenceViewMode(normalized);
    vscode.postMessage('setUiPreference', {
      key: 'dashboardEvidenceViewMode',
      value: normalized,
    });
  };

  const updateDashboardSection = (
    section: DashboardSection,
    options?: {
      operateZone?: DashboardOperateZone;
      navigationSource?: DashboardNavigationSource;
      skipNavigationTelemetry?: boolean;
    }
  ) => {
    const normalizedSection = normalizeDashboardSection(section);
    const isDuplicateNavigation =
      lastDashboardNavigationRef.current?.section === normalizedSection &&
      (lastDashboardNavigationRef.current?.operateZone ?? '') === (options?.operateZone ?? '');
    const skipTelemetry =
      options?.skipNavigationTelemetry ||
      (normalizedSection === dashboardSection && !options?.operateZone) ||
      isDuplicateNavigation;
    lastDashboardSectionChangeAtRef.current = Date.now();
    pendingDashboardSectionPreferenceRef.current = normalizedSection;
    setDashboardSection(normalizedSection);
    vscode.postMessage('setUiPreference', {
      key: 'dashboardSection',
      value: normalizedSection,
    });
    if (!skipTelemetry) {
      lastDashboardNavigationRef.current = {
        section: normalizedSection,
        operateZone: options?.operateZone,
      };
      trackDashboardNavigation(vscode.postMessage.bind(vscode), normalizedSection, {
        operateZone: options?.operateZone,
        source: options?.navigationSource ?? 'tab',
      });
    }
    if (normalizedSection === 'operate' && options?.operateZone) {
      setRequestedOperateZone(options.operateZone);
      if (dashboardSection === 'operate') {
        scrollToDashboardOperateZoneWithRetry(options.operateZone);
      }
    } else if (normalizedSection !== 'operate') {
      setRequestedOperateZone(null);
    }
  };

  const openRunZone = (
    zone: DashboardOperateZone,
    navigationSource: DashboardNavigationSource = 'evidence'
  ) => {
    updateDashboardSection('operate', { operateZone: zone, navigationSource });
  };

  const modulesDisabledForProject =
    Boolean(workspaceStatus.hasProjectSelected) &&
    isUnsupportedModuleProjectType(
      workspaceStatus.projectType,
      workspaceStatus.projectCapabilities
    );

  const dashboardModuleCatalogSurfaceProps = {
    modules: modulesCatalog,
    catalogMeta: modulesCatalogMeta,
    workspaceStatus,
    scope: dashboardScope,
    categoryInfo,
    modulesDisabled: modulesDisabledForProject,
    onCopyText: (text: string) => vscode.postMessage('copyText', { text }),
    onRefresh: () => dispatchDashboardCommand('refreshModules'),
    onInstall: (module: ModuleData) => handleOpenInstallModal(module),
    onShowDetails: (module: ModuleData) => vscode.postMessage('showModuleDetails', module),
    onAI: (module: ModuleData) =>
      vscode.postMessage('aiForModule', {
        moduleId: module.id,
        moduleName: module.display_name || module.name,
        moduleSlug: module.slug,
      }),
    onProjectTerminal: () => dispatchDashboardCommand('projectTerminal'),
    onProjectInit: () => dispatchDashboardCommand('projectInit'),
    onProjectDev: () => dispatchDashboardCommand('projectDev'),
    onProjectStop: () => dispatchDashboardCommand('projectStop'),
    onProjectTest: () => dispatchDashboardCommand('projectTest'),
    onProjectDoctor: () => dispatchDashboardCommand('projectDoctor'),
    onProjectArchitecture: () => dispatchDashboardCommand('projectArchitecture'),
    onProjectIncident: () => dispatchDashboardCommand('projectIncident'),
    onProjectAI: () => dispatchDashboardCommand('projectAI'),
    onProjectRelease: () => dispatchDashboardCommand('projectRelease'),
    onProjectImpact: () => dispatchDashboardCommand('projectImpact'),
    onProjectBrowser: () => dispatchDashboardCommand('projectBrowser'),
    onProjectBuild: () => dispatchDashboardCommand('projectBuild'),
  };

  // Listen for messages from extension
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = normalizeExtensionWebviewMessage(event.data);
      if (!message) {
        console.warn('[React Webview] Ignoring malformed host message:', event.data);
        return;
      }
      console.log('[React Webview] Received message:', message.command, message.data);

      switch (message.command) {
        case 'updateVersion':
          console.log('[React Webview] Updating version:', message.data);
          setVersion(message.data);
          break;
        case 'updateWorkspaceStatus':
          console.log('[React Webview] Updating workspace status:', message.data);
          {
            const previousWorkspacePath = workspaceStatusRef.current.workspacePath;
            setWorkspaceStatus(message.data);

            if (
              typeof message.data?.workspacePath === 'string' &&
              message.data.workspacePath.trim().length > 0
            ) {
              setSelectedWorkspaceForAnalysis(message.data.workspacePath.trim());
            }

            const workspaceChanged =
              typeof message.data?.workspacePath === 'string' &&
              message.data.workspacePath !== previousWorkspacePath;

            if (workspaceChanged) {
              resetDashboardSectionForWorkspaceSwitch();
              resetDashboardEvidenceSession(message.data.workspacePath);
            }

            if (
              message.data?.hasProjectSelected === true &&
              typeof message.data?.projectPath === 'string' &&
              message.data.projectPath.trim().length > 0
            ) {
              const inboundProject = resolveSidebarProjectSelection(message.data);
              if (inboundProject) {
                setSelectedProjectForAnalysis((current) =>
                  current?.path === inboundProject.path ? current : inboundProject
                );
              }
            } else if (message.data?.hasProjectSelected === false && workspaceChanged) {
              setSelectedProjectForAnalysis(null);
            }
          }
          break;
        case 'updateRecentWorkspaces':
          console.log('[React Webview] Updating workspaces:', message.data);
          setRecentWorkspaces(Array.isArray(message.data) ? message.data : []);
          setIsRefreshingWorkspaces(false);
          break;
        case 'dashboardEvidence': {
          const incoming = (message.data ?? null) as DashboardEvidencePayload | null;
          const activeWorkspacePath = workspaceStatusRef.current.workspacePath;
          const activeProjectPath =
            typeof workspaceStatusRef.current.projectPath === 'string' &&
            workspaceStatusRef.current.projectPath.trim().length > 0
              ? workspaceStatusRef.current.projectPath.trim()
              : workspaceStatusRef.current.hasProjectSelected !== false
                ? selectedProjectForAnalysisRef.current?.path
                : undefined;

          if (
            incoming?.workspacePath &&
            activeWorkspacePath &&
            incoming.workspacePath !== activeWorkspacePath
          ) {
            break;
          }

          if (incoming?.refreshMode === 'patch') {
            setDashboardEvidence((current) => {
              const merged = current
                ? applyDashboardEvidenceMessage(current, incoming, {
                    activeWorkspacePath,
                    activeProjectPath,
                    allowMissingRequestId: true,
                  })
                : incoming;
              reconcilePendingEvidenceCards(merged);
              return merged;
            });
            break;
          }

          if (
            incoming?.requestId !== null &&
            incoming?.requestId !== undefined &&
            incoming.requestId < lastAppliedEvidenceRequestIdRef.current
          ) {
            break;
          }

          if (
            incoming?.requestId !== null &&
            incoming?.requestId !== undefined &&
            incoming.requestId > dashboardEvidenceRequestIdRef.current
          ) {
            break;
          }

          setDashboardEvidence((current) => {
            const next =
              applyDashboardEvidenceMessage(current, incoming, {
                expectedRequestId: incoming?.requestId,
                activeWorkspacePath,
                activeProjectPath,
                allowMissingRequestId: true,
              }) ?? incoming;
            if (incoming?.requestId !== null && incoming?.requestId !== undefined) {
              lastAppliedEvidenceRequestIdRef.current = incoming.requestId;
            }
            reconcilePendingEvidenceCards(next);
            return next;
          });
          break;
        }
        case 'workspaceGraphProjectionLive': {
          const projection = message.data?.projection as WorkspaceGraphProjection | undefined;
          if (projection?.schemaVersion === 'workspace-graph-projection.v1') {
            setLiveWorkspaceGraph(projection);
          }
          const streamStats = message.data?.streamStats;
          if (
            typeof streamStats?.received === 'number' &&
            typeof streamStats?.emitted === 'number' &&
            typeof streamStats?.coalesced === 'number'
          ) {
            setWorkspaceGraphStreamStats(streamStats);
          }
          break;
        }
        case 'workspaceGraphStreamStatus':
          setWorkspaceGraphStreamStatus(
            typeof message.data?.status === 'string' ? message.data.status : 'error'
          );
          break;
        case 'workspaceGraphMemorySample': {
          const sample = message.data;
          if (
            typeof sample?.estimatedBytes === 'number' &&
            typeof sample?.budgetBytes === 'number' &&
            typeof sample?.utilizationRatio === 'number' &&
            typeof sample?.exceeded === 'boolean'
          ) {
            setWorkspaceGraphMemorySample(sample);
          }
          break;
        }
        case 'workspaceGraphRecordingState': {
          const state = message.data as WorkspaceGraphRecordingState | undefined;
          if (state?.schemaVersion === 'workspace-graph-recording.v1') {
            setWorkspaceGraphRecordingState(state);
          }
          break;
        }
        case 'dashboardCommandFailed': {
          const failedCommand =
            typeof message.data?.command === 'string' ? message.data.command : undefined;
          const failureReason =
            typeof message.data?.reason === 'string' ? message.data.reason.trim() : '';
          const failedCardIds = Array.isArray(message.data?.cardIds)
            ? message.data.cardIds.filter(
                (cardId: unknown): cardId is DashboardEvidenceCardId => typeof cardId === 'string'
              )
            : failedCommand
              ? getDashboardCommandAffectedEvidenceCards(failedCommand)
              : [];
          const exitCode =
            typeof message.data?.exitCode === 'number' ? message.data.exitCode : undefined;
          const stderrTail =
            typeof message.data?.stderrTail === 'string' && message.data.stderrTail.trim()
              ? message.data.stderrTail.trim()
              : undefined;
          const suggestedNextAction =
            typeof message.data?.suggestedNextAction === 'string' &&
            message.data.suggestedNextAction.trim()
              ? message.data.suggestedNextAction.trim()
              : undefined;
          if (failureReason.length > 0 && failedCardIds.length === 0) {
            setDashboardCommandNotice({
              title:
                exitCode === undefined ? 'Dashboard command blocked' : 'Dashboard command failed',
              body: failureReason,
              exitCode,
              stderrTail,
            });
          }
          if (failedCommand && failedCardIds.length > 0) {
            const failure: DashboardCommandFailure = {
              command: failedCommand,
              reason: failureReason || `${failedCommand} failed.`,
              cardIds: failedCardIds,
              ...(exitCode !== undefined ? { exitCode } : {}),
              ...(stderrTail ? { stderrTail } : {}),
              ...(suggestedNextAction ? { suggestedNextAction } : {}),
              timestamp:
                typeof message.data?.timestamp === 'number' ? message.data.timestamp : Date.now(),
            };
            setDashboardCommandFailures((current) => {
              const next: DashboardCommandFailureMap = { ...current };
              for (const cardId of failedCardIds) {
                next[cardId] = failure;
              }
              return next;
            });
            setPendingEvidenceCardIds((current) =>
              clearPendingEvidenceForCommand(current, failedCommand)
            );
            if (failedCardIds.length > 0) {
              const failedCardSet = new Set(failedCardIds);
              setPendingEvidenceRefreshCardIds((current) =>
                current.filter((cardId) => !failedCardSet.has(cardId))
              );
            }
          }
          break;
        }
        case 'updateExampleWorkspaces':
          console.log('[React Webview] Updating examples:', message.data);
          setExampleWorkspaces(Array.isArray(message.data) ? message.data : []);
          catalogTemplatesAckRef.current = true;
          setDashboardCatalogTimedOut(false);
          setDashboardTemplatesReady(true);
          break;
        case 'updateAvailableKits':
          console.log('[React Webview] Updating available kits:', message.data);
          setAvailableKits(Array.isArray(message.data) ? message.data : []);
          break;
        case 'setCloning':
          console.log('[React Webview] Setting cloning state:', message.data);
          setCloningExample(
            typeof message.data?.exampleName === 'string' ? message.data.exampleName : null
          );
          break;
        case 'setUpdating':
          console.log('[React Webview] Setting updating state:', message.data);
          setUpdatingExample(
            typeof message.data?.exampleName === 'string' ? message.data.exampleName : null
          );
          break;
        case 'updateModulesCatalog': {
          const payload = message.data as ModulesCatalogUpdate | ModuleData[] | undefined;
          const modules = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.modules)
              ? payload.modules
              : [];
          const meta = Array.isArray(payload) ? null : (payload?.meta ?? null);
          console.log(
            '[React Webview] Updating modules catalog:',
            modules.length,
            'modules',
            meta?.rapidkitCoreVersion ? `(core ${meta.rapidkitCoreVersion})` : ''
          );
          setModulesCatalog(modules);
          setModulesCatalogMeta(meta);
          catalogModulesAckRef.current = true;
          setDashboardCatalogTimedOut(false);
          setDashboardModulesReady(true);
          break;
        }
        case 'installStatusUpdate':
          setInstallStatus(
            message.data && typeof message.data === 'object' && !Array.isArray(message.data)
              ? message.data
              : { npmInstalled: false, coreInstalled: false }
          );
          setInstallStatusChecked(true);
          break;
        case 'installProgressUpdate':
          // Handle progress updates
          console.log('Install progress:', message.data);
          break;
        case 'setCreatingWorkspace':
          console.log('[React Webview] Setting creating workspace state:', message.data.isLoading);
          setIsCreatingWorkspace(message.data.isLoading);
          if (!message.data.isLoading) {
            // Reset modal when workspace creation completes
            setShowCreateModal(false);
          }
          break;
        case 'showModuleDetailsModal':
          console.log('[React Webview] Showing module details modal:', message.data);
          setModuleDetails(message.data);
          setShowModuleDetailsModal(true);
          break;
        case 'openModuleInstallModal':
          // Triggered from sidebar AVAILABLE MODULES click
          console.log('[React Webview] openModuleInstallModal:', message.data);
          if (message.data) {
            setSelectedModule(message.data);
            setShowInstallModal(true);
          }
          break;
        case 'openProjectModal':
          // Triggered from sidebar or external command
          console.log('[React Webview] openProjectModal:', message.data?.framework);
          if (message.data?.framework) {
            setSelectedFramework(message.data.framework);
            setShowProjectModal(true);
          }
          break;
        case 'closeProjectModal':
          setShowProjectModal(false);
          break;
        case 'openWorkspaceModal':
          // Triggered from sidebar Workspace button
          console.log('[React Webview] openWorkspaceModal');
          setShowCreateModal(true);
          break;
        case 'openAICreateModal':
          vscode.postMessage('openCreateWithAITab', {
            mode: message.data?.mode ?? 'workspace',
            targetWorkspaceName: message.data?.targetWorkspaceName,
            targetWorkspacePath: message.data?.targetWorkspacePath,
            useDefaultWorkspace:
              message.data?.mode === 'project' && !message.data?.targetWorkspacePath,
          });
          break;
        case 'openAIModal':
          vscode.postMessage('openWorkspaceAdvisorTab', {
            workspacePath: message.data?.workspacePath,
            workspaceName: message.data?.workspaceName,
            projectPath: message.data?.projectPath,
            projectName: message.data?.projectName,
            projectType: message.data?.projectType,
            scopeMode: message.data?.scopeMode,
            source: 'dashboard',
            trigger: 'legacy-context-assist-handoff',
            initialQuestion: message.data?.prefillQuestion,
          });
          break;
        case 'aiModelsList':
          if (Array.isArray(message.data?.models)) {
            const normalizedModels = normalizeAvailableModels(message.data.models);
            setAIAvailableModels(normalizedModels);
            setAiModelsLoading(false);
          }
          break;
        case 'workspaiSettings': {
          const preferredModel =
            typeof message.data?.preferredModel === 'string' &&
            message.data.preferredModel.trim().length > 0
              ? message.data.preferredModel.trim()
              : 'auto';
          const normalizedModels = normalizeAvailableModels(message.data?.models);
          setPreferredModelId(preferredModel);
          setAIProvider(
            typeof message.data?.aiProvider === 'string' ? message.data.aiProvider : 'vscode-lm'
          );
          setAIProviderCatalog(
            Array.isArray(message.data?.aiProviderCatalog)
              ? (message.data.aiProviderCatalog as WorkspaiAIProviderDefinition[])
              : []
          );
          setCustomAIBaseUrl(
            typeof message.data?.customAIBaseUrl === 'string' ? message.data.customAIBaseUrl : ''
          );
          setCustomAIModel(
            typeof message.data?.customAIModel === 'string' ? message.data.customAIModel : ''
          );
          setAIProviderStatus(
            message.data?.aiProviderStatus && typeof message.data.aiProviderStatus === 'object'
              ? message.data.aiProviderStatus
              : null
          );
          setAIAvailableModels(normalizedModels);
          setAiModelsLoading(false);
          setThemeMode(normalizeThemeMode(message.data?.themeMode));
          break;
        }
        case 'aiProviderHealthCheck': {
          setProviderHealthChecking(false);
          setAIProviderHealthCheck(
            message.data && typeof message.data === 'object' ? message.data : null
          );
          break;
        }
        // ── AI Create events ────────────────────────────────────────
        case 'aiCreationThinking':
          setAICreationThinking(message.data?.thinking ?? false);
          if (message.data?.thinking) {
            setAICreationError(null);
          }
          break;
        case 'aiCreationPlan':
          setAICreationPlan(message.data?.plan ?? null);
          setAICreationPlanSource(message.data?.planSource === 'heuristic' ? 'heuristic' : 'llm');
          if (message.data?.modelId) {
            setAICreateModelId(message.data.modelId);
          }
          break;
        case 'aiCreationError':
          setAICreationError(message.data?.error ?? 'Unknown error');
          setAICreationCreating(false);
          break;
        case 'aiCreationReset':
          setAICreationPlan(null);
          setAICreationPlanSource(null);
          setAICreationError(null);
          setAICreationStage(null);
          break;
        case 'aiCreationStarted':
          setAICreationCreating(true);
          setAICreationStage(null);
          break;
        case 'aiCreationProgress':
          setAICreationStage(message.data?.stage ?? null);
          break;
        case 'aiCreationDone':
          setAICreationCreating(false);
          setAICreationStage(null);
          if (message.data?.projectError && message.data?.workspaceCreated) {
            const workspacePath =
              typeof message.data?.workspacePath === 'string'
                ? message.data.workspacePath
                : 'the selected location';
            setAICreationError(
              `Workspace created successfully at ${workspacePath}, but project creation failed: ${message.data.projectError}`
            );
            if (message.data?.plan) {
              setAICreationPlan(message.data.plan);
            }
          } else {
            setShowAICreateModal(false);
            setAICreationPlan(null);
            setAICreationError(null);
            setAICreateTargetWorkspaceName(undefined);
            setAICreateTargetWorkspacePath(undefined);
          }
          break;
        case 'workspaceToolStatus':
          setWorkspaceToolStatus(message.data);
          break;
        case 'setActiveView':
          if (
            message.data?.view === 'dashboard' ||
            message.data?.view === 'settings' ||
            message.data?.view === 'setup'
          ) {
            setActiveView(message.data.view);
            if (message.data.view === 'dashboard' && message.data.dashboardSection) {
              updateDashboardSection(normalizeDashboardSection(message.data.dashboardSection), {
                navigationSource: 'host_message',
                skipNavigationTelemetry: true,
              });
            }
          } else if (message.data?.view === 'incident-studio') {
            openStudioInSidebar();
          }
          break;
        case 'openWorkspaceShareDashboard':
          if (message.data?.summary) {
            setImportedWorkspaceShare(message.data.summary as ImportedWorkspaceShareSummary);
            setActiveView('dashboard');
          }
          break;
        case 'uiPreferences':
          {
            const incomingDashboardSection = normalizeDashboardSection(
              message.data?.dashboardSection
            );
            const pendingDashboardSection = pendingDashboardSectionPreferenceRef.current;
            const recentlyChangedDashboardSection =
              Date.now() - lastDashboardSectionChangeAtRef.current < 10000;

            if (pendingDashboardSection) {
              if (incomingDashboardSection === pendingDashboardSection) {
                pendingDashboardSectionPreferenceRef.current = null;
                hasAppliedInitialDashboardSectionPreferenceRef.current = true;
                setDashboardSection(incomingDashboardSection);
              }
            } else if (!hasAppliedInitialDashboardSectionPreferenceRef.current) {
              hasAppliedInitialDashboardSectionPreferenceRef.current = true;
              setDashboardSection(incomingDashboardSection);
            } else if (
              recentlyChangedDashboardSection &&
              incomingDashboardSection !== dashboardSectionRef.current
            ) {
              // Keep the user's most recent tab selection instead of accepting stale host prefs.
            } else {
              setDashboardSection(incomingDashboardSection);
            }
          }
          setEvidenceViewMode(normalizeEvidenceViewMode(message.data?.dashboardEvidenceViewMode));
          break;
      }
    };

    window.addEventListener('message', messageHandler);

    // Request initial data
    vscode.postMessage('ready');
    vscode.postMessage('getUiPreferences');

    return () => window.removeEventListener('message', messageHandler);
  }, []);

  useEffect(() => {
    if (showCreateModal) {
      vscode.postMessage('requestWorkspaceToolStatus');
    }
  }, [showCreateModal]);

  useEffect(() => {
    const workspacePath = workspaceStatus.workspacePath;
    if (dashboardSection !== 'graph' || !workspacePath) {
      setLiveWorkspaceGraph(null);
      vscode.postMessage('stopWorkspaceGraphStream');
      return;
    }
    vscode.postMessage('startWorkspaceGraphStream', { workspacePath });
    return () => vscode.postMessage('stopWorkspaceGraphStream');
  }, [dashboardSection, workspaceStatus.workspacePath]);

  useEffect(() => {
    if (showProjectModal) {
      vscode.postMessage('requestWorkspaceToolStatus');
      // On-demand refresh: prevents first-open race where project modal appears
      // before initial kits payload has arrived.
      vscode.postMessage('requestAvailableKits');
    }
  }, [showProjectModal]);

  const handleCreateWorkspace = (config: WorkspaceCreationConfig) => {
    console.log('[React Webview] Creating workspace:', config.name);
    vscode.postMessage('createWorkspace', config);
  };

  const handleOpenProjectModal = (framework: ScaffoldFramework, _kitName?: string) => {
    if (installStatusChecked && !installStatus.coreInstalled) {
      openSetupInDashboard();
      return;
    }
    setAICreateMode('project');
    setAICreateFramework(framework);
    setAICreationPlan(null);
    setAICreationError(null);
    setAICreationThinking(false);
    setAICreationCreating(false);
    setAICreationStage(null);
    setAICreateModelId(null);
    setAICreateTargetWorkspaceName(activeWorkspaceName ?? undefined);
    setAICreateTargetWorkspacePath(workspaceStatus.workspacePath ?? undefined);
    setShowAICreateModal(true);
  };

  const handleOpenManualProjectModal = (framework: ScaffoldFramework) => {
    if (installStatusChecked && !installStatus.coreInstalled) {
      openSetupInDashboard();
      return;
    }
    setSelectedFramework(framework);
    setShowProjectModal(true);
  };

  const handleOpenAICreateWorkspace = () => {
    vscode.postMessage('openCreateWithAITab', {
      mode: 'workspace',
      source: 'dashboard',
      trigger: 'dashboard-ai-create-handoff',
    });
  };

  const handleOpenAICreateProject = () => {
    const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
    vscode.postMessage('openCreateWithAITab', {
      mode: 'project',
      source: 'dashboard',
      trigger: 'dashboard-ai-create-project-handoff',
      targetWorkspaceName: activeWorkspaceName ?? undefined,
      targetWorkspacePath: workspaceStatus.workspacePath ?? undefined,
      useDefaultWorkspace: !hasWorkspace,
    });
  };

  const handleAICreatePromptSubmit = (
    prompt: string,
    mode: 'workspace' | 'project',
    framework?: string,
    stackIntent?: 'balanced' | 'frontend' | 'backend' | 'polyglot' | 'enterprise'
  ) => {
    vscode.postMessage('aiParseCreation', { prompt, mode, framework, stackIntent });
  };

  const handleAICreateConfirm = (plan: AICreationPlan) => {
    vscode.postMessage('aiCreateConfirm', {
      ...plan,
      // Pass the workspace path captured at modal-open time so the backend
      // uses the workspace the user saw in the modal (not the current selection).
      targetWorkspacePath: aiCreateMode === 'project' ? aiCreateTargetWorkspacePath : undefined,
    });
  };

  const handleCreateProject = (
    projectName: string,
    framework: ScaffoldFramework,
    kitName: string
  ) => {
    console.log('[React Webview] Creating project:', projectName, framework, kitName);
    vscode.postMessage('createProjectWithKit', { name: projectName, framework, kit: kitName });
  };

  const handleOpenInstallModal = (module: ModuleData) => {
    setSelectedModule(module);
    setShowInstallModal(true);
  };

  const handleConfirmInstall = () => {
    if (selectedModule) {
      console.log('[React Webview] Installing module:', selectedModule);
      vscode.postMessage('installModule', selectedModule);
      setShowInstallModal(false);
      setSelectedModule(null);
    }
  };

  const handleAnalyzeWorkspace = (workspace: Workspace) => {
    vscode.postMessage('openStudioSidebarTab', {
      workspacePath: workspace.path,
      workspaceName: workspace.name,
      studioMode: 'investigate',
      source: 'dashboard',
      trigger: 'recent-workspace-analyze',
    });
  };

  useEffect(() => {
    if (!shouldRequestCatalogRefresh(dashboardSectionNeedsCatalog(dashboardSection), activeView)) {
      return;
    }

    dashboardMountedAtRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    setDashboardCatalogTimedOut(false);

    setDashboardTemplatesReady(
      resolveCatalogTemplatesReady(
        catalogTemplatesAckRef.current,
        exampleWorkspaces.length,
        dashboardCatalogTimedOut
      )
    );
    setDashboardModulesReady(
      resolveCatalogModulesReady(
        catalogModulesAckRef.current,
        modulesCatalogMeta !== null && modulesCatalogMeta !== undefined,
        dashboardCatalogTimedOut
      )
    );

    vscode.postMessage('requestCatalogRefresh');

    const timeoutHandle = window.setTimeout(() => {
      setDashboardCatalogTimedOut(true);
      setDashboardTemplatesReady(true);
      setDashboardModulesReady(true);
    }, 12000);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [activeView, dashboardSection]);

  useEffect(() => {
    if (activeView !== 'dashboard') {
      return;
    }
    if (!workspaceStatus.workspacePath) {
      return;
    }
    requestDashboardEvidenceFull({
      workspacePath: workspaceStatus.workspacePath,
      projectPath: selectedProjectForAnalysis?.path,
      projectName: selectedProjectForAnalysis?.name,
    });
  }, [
    activeView,
    requestDashboardEvidenceFull,
    selectedProjectForAnalysis?.name,
    selectedProjectForAnalysis?.path,
    workspaceStatus.workspacePath,
  ]);

  useEffect(() => {
    if (activeView !== 'dashboard') {
      return;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    vscode.postMessage('dashboardPerf', {
      stage: dashboardModulesReady
        ? 'modules-ready'
        : dashboardTemplatesReady
          ? 'templates-ready'
          : 'shell-ready',
      elapsedMs: Math.max(0, Math.round(now - dashboardMountedAtRef.current)),
      recentWorkspaceCount: recentWorkspaces.length,
      templateCount: exampleWorkspaces.length,
      moduleCount: modulesCatalog.length,
      hasWorkspace: hasActiveWorkspace,
      hasProject: Boolean(workspaceStatus.hasProjectSelected),
    });
  }, [
    activeView,
    dashboardModulesReady,
    dashboardTemplatesReady,
    exampleWorkspaces.length,
    hasActiveWorkspace,
    modulesCatalog.length,
    recentWorkspaces.length,
    workspaceStatus.hasProjectSelected,
  ]);

  const workspaiViewTabs = (
    <div className="workspai-view-tabs" role="tablist" aria-label="Workspai views">
      <Header version={version} variant="inline" />
      <div className="workspai-view-tabs__group workspai-view-tabs__group--primary">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'dashboard'}
          className={`workspai-view-tab ${activeView === 'dashboard' ? 'is-active' : ''}`}
          title="Command Center — Home, Run, Repair, Artifacts, Project, Library"
          onClick={() => {
            setActiveView('dashboard');
          }}
        >
          <span className="workspai-view-tab-content">
            <LayoutDashboard size={13} aria-hidden="true" />
            <span className="workspai-view-tab-label">Dashboard</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'settings'}
          className={`workspai-view-tab ${activeView === 'settings' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveView('settings');
            refreshWorkspaiSettings();
          }}
        >
          <span className="workspai-view-tab-content">
            <Settings2 size={13} aria-hidden="true" />
            <span className="workspai-view-tab-label">Settings</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === 'setup'}
          className={`workspai-view-tab ${activeView === 'setup' ? 'is-active' : ''}`}
          onClick={openSetupInDashboard}
        >
          <span className="workspai-view-tab-content">
            <Wrench size={13} aria-hidden="true" />
            <span className="workspai-view-tab-label workspai-view-tab-label--setup">Setup</span>
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <WorkspaiThemeProvider themeMode={themeMode}>
      <div
        className={[
          'container',
          activeView === 'dashboard'
            ? 'container--dashboard'
            : activeView === 'settings' || activeView === 'setup'
              ? 'container--embedded-scroll'
              : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-active-view={activeView}
      >
        {activeView === 'dashboard' ? (
          <div className="ws-dashboard-shell">
            <div className="ws-dashboard-shell__main">
              <div className="ws-dashboard-sticky-chrome">
                {workspaiViewTabs}
                <DashboardSubNav
                  activeSection={dashboardSection}
                  onSectionChange={(section) =>
                    updateDashboardSection(section, { navigationSource: 'tab' })
                  }
                  hasProjectSelected={Boolean(workspaceStatus.hasProjectSelected)}
                  recentWorkspaceCount={recentWorkspaces.length}
                  evidenceAttentionCount={evidenceAttentionCount}
                  operateAttentionCount={operateAttentionCount}
                />

                {dashboardCommandNotice ? (
                  <WorkspaiBanner
                    title={dashboardCommandNotice.title}
                    onDismiss={() => setDashboardCommandNotice(null)}
                  >
                    <p className="workspai-banner__body">{dashboardCommandNotice.body}</p>
                    {dashboardCommandNotice.exitCode !== undefined ? (
                      <p className="workspai-banner__meta">
                        Exit code: {dashboardCommandNotice.exitCode}
                      </p>
                    ) : null}
                    {dashboardCommandNotice.stderrTail ? (
                      <pre className="workspai-banner__log">
                        {dashboardCommandNotice.stderrTail}
                      </pre>
                    ) : null}
                  </WorkspaiBanner>
                ) : null}

                {showDashboardContextBar ? (
                  <DashboardContextBar
                    scope={dashboardScope}
                    showProjectScope={dashboardSection === 'console'}
                    showScopePaths={dashboardSectionShowsScopePaths(dashboardSection)}
                    onSwitchWorkspace={() => handleDashboardCommand('quickSwitchWorkspace')}
                    onOpenWorkspaceInNewWindow={() =>
                      vscode.postMessage('openWorkspaceInNewWindow', {
                        path: workspaceStatus.workspacePath,
                      })
                    }
                    onRevealWorkspaceFolder={() =>
                      vscode.postMessage('revealWorkspaceFolder', {
                        path: workspaceStatus.workspacePath,
                      })
                    }
                    onOpenWorkspaces={() =>
                      updateDashboardSection('catalog', { navigationSource: 'context_bar' })
                    }
                    onOpenProject={() =>
                      updateDashboardSection('console', { navigationSource: 'context_bar' })
                    }
                    onFocusProjectExplorer={() => vscode.postMessage('focusProjectExplorer')}
                  />
                ) : null}
              </div>

              {dashboardSection === 'overview' ? (
                <div className="home-onboarding-handoffs">
                  <HomeCreateHandoff
                    workspaceStatus={workspaceStatus}
                    isCreatingWorkspace={isCreatingWorkspace}
                    onCreateAIWorkspace={handleOpenAICreateWorkspace}
                    onCreateAIProject={handleOpenAICreateProject}
                  />
                  <HomeImportAdoptHandoff
                    workspaceStatus={workspaceStatus}
                    onRunCommand={handleDashboardCommand}
                  />
                </div>
              ) : null}

              {dashboardSection === 'operate' &&
              visibleOpsChain &&
              !opsChainBlockedByRepairCard &&
              (visibleOpsChain.status === 'running' || visibleOpsChain.status === 'blocked') ? (
                <OpsChainBanner
                  chain={visibleOpsChain}
                  onDismiss={() => vscode.postMessage('dismissDashboardOpsChain')}
                  continueLabel={
                    visibleOpsChain.status === 'blocked'
                      ? dashboardOperateZoneForOpsChainStep(visibleOpsChain.currentStep)
                        ? `Open Run — ${visibleOpsChain.currentStep}`
                        : 'Open Repair flow'
                      : undefined
                  }
                  onViewEvidence={() => {
                    if (visibleOpsChain.status === 'blocked') {
                      const zone = dashboardOperateZoneForOpsChainStep(visibleOpsChain.currentStep);
                      if (zone) {
                        openRunZone(zone, 'ops_chain');
                        return;
                      }
                      updateDashboardSection(
                        dashboardSectionForOpsChainStep(visibleOpsChain.currentStep),
                        { navigationSource: 'ops_chain' }
                      );
                      return;
                    }
                    updateDashboardSection('repair', { navigationSource: 'ops_chain' });
                  }}
                />
              ) : null}

              {showOverviewDiagnostics ? (
                <DashboardOverviewSection
                  workspaceStatus={workspaceStatus}
                  evidence={effectiveDashboardEvidence}
                  importedWorkspaceShare={importedWorkspaceShare}
                  evidenceAttentionCount={evidenceAttentionCount}
                  operateAttentionCount={operateAttentionCount}
                  onDismissImportedWorkspaceShare={() => setImportedWorkspaceShare(null)}
                  onOpenEvidence={() =>
                    updateDashboardSection('repair', { navigationSource: 'home_metric' })
                  }
                  onOpenRunGovernance={() => openRunZone('governance', 'home_metric')}
                  onNavigate={(section) => {
                    if (section === 'operate') {
                      openRunZone('quick', 'home_quick_nav');
                      return;
                    }
                    updateDashboardSection(section, { navigationSource: 'home_quick_nav' });
                  }}
                />
              ) : null}

              {dashboardSection === 'repair' ? (
                <DashboardRepairPanel
                  evidence={effectiveDashboardEvidence}
                  hasWorkspace={hasActiveWorkspace}
                  hasProject={workspaceStatus.hasProjectSelected === true}
                  scope={dashboardWorkspaceOnlyScope}
                  workspace={{
                    path: workspaceStatus.workspacePath || undefined,
                    name: activeWorkspaceName,
                  }}
                  pendingCardIds={mergedPendingEvidenceCardIds}
                  pendingRunCardIds={pendingEvidenceCardIds}
                  pendingRefreshCardIds={pendingEvidenceRefreshCardIds}
                  isEvidenceFullRefreshPending={isEvidenceFullRefreshPending}
                  onRunCommand={handleDashboardCommand}
                  onRefreshEvidence={refreshDashboardEvidenceFull}
                  onRefreshEvidenceCard={(cardId) => refreshDashboardEvidenceCard([cardId])}
                  onAskStudioAboutCard={askStudioAboutEvidenceCard}
                  onSendEvidenceToCopilot={sendEvidenceCardToCopilot}
                  onCopyEvidenceAgentHandoff={copyEvidenceCardAgentHandoff}
                  onShowEvidenceOutput={showWorkspaiEvidenceOutput}
                  onRevealArtifact={(artifactPath) =>
                    vscode.postMessage('revealEvidence', {
                      path: artifactPath,
                      workspacePath: workspaceStatus.workspacePath,
                      projectPath: dashboardProjectPath,
                    })
                  }
                  onOpenRunZone={openRunZone}
                  onOpenProjectLifecycle={() =>
                    updateDashboardSection('console', { navigationSource: 'repair' })
                  }
                />
              ) : null}

              {dashboardSection === 'evidence' ? (
                <DashboardEvidenceArtifactsSection
                  evidence={effectiveDashboardEvidence}
                  hasWorkspace={hasActiveWorkspace}
                  hasProject={workspaceStatus.hasProjectSelected === true}
                  scope={dashboardWorkspaceOnlyScope}
                  workspace={{
                    path: workspaceStatus.workspacePath || undefined,
                    name: activeWorkspaceName,
                  }}
                  evidenceViewMode={evidenceViewMode}
                  onEvidenceViewModeChange={updateEvidenceViewMode}
                  pendingCardIds={mergedPendingEvidenceCardIds}
                  pendingRunCardIds={pendingEvidenceCardIds}
                  pendingRefreshCardIds={pendingEvidenceRefreshCardIds}
                  isEvidenceFullRefreshPending={isEvidenceFullRefreshPending}
                  onRunCommand={handleDashboardCommand}
                  onRefreshEvidence={refreshDashboardEvidenceFull}
                  onRefreshEvidenceCard={(cardId) => refreshDashboardEvidenceCard([cardId])}
                  onAskStudioAboutCard={askStudioAboutEvidenceCard}
                  onSendEvidenceToCopilot={sendEvidenceCardToCopilot}
                  onCopyEvidenceAgentHandoff={copyEvidenceCardAgentHandoff}
                  onShowEvidenceOutput={showWorkspaiEvidenceOutput}
                  onClearActivity={() => vscode.postMessage('clearDashboardActivity')}
                  onRevealArtifact={(artifactPath) =>
                    vscode.postMessage('revealEvidence', {
                      path: artifactPath,
                      workspacePath: workspaceStatus.workspacePath,
                      projectPath: dashboardProjectPath,
                    })
                  }
                  onOpenIncidentStudio={openStudioForEvidence}
                  onPipeline={() => handleDashboardCommand('workspacePipeline')}
                  onReadiness={() => handleDashboardCommand('workspaceReadiness')}
                  onAnalyze={() => handleDashboardCommand('workspaceAnalyze')}
                  onAutopilotRelease={() => handleDashboardCommand('workspaceAutopilotRelease')}
                  onWorkspaceVerify={() => handleDashboardCommand('workspaceVerify')}
                  onOpenStudioVerify={() =>
                    openStudioTarget('release', { studioMode: 'verify', shipLoopIntent: 'release' })
                  }
                  onNavigateSection={(section) => {
                    if (section === 'operate') {
                      openRunZone('quick', 'evidence');
                      return;
                    }
                    updateDashboardSection(section, { navigationSource: 'evidence' });
                  }}
                  onOpenRunZone={openRunZone}
                />
              ) : null}

              {dashboardSection === 'graph' ? (
                <WorkspaceGraphExplorer
                  evidence={effectiveDashboardEvidence}
                  liveGraph={liveWorkspaceGraph}
                  streamStatus={workspaceGraphStreamStatus}
                  streamStats={workspaceGraphStreamStats}
                  memorySample={workspaceGraphMemorySample}
                  recordingState={workspaceGraphRecordingState}
                  workspacePath={workspaceStatus.workspacePath}
                  hasWorkspace={hasActiveWorkspace}
                  onRefresh={() => handleDashboardCommand('workspaceModel')}
                  onSearchCanonical={() => handleDashboardCommand('workspaceGraphSearch')}
                  onExport={(format) =>
                    handleDashboardCommand(
                      format === 'jsonld'
                        ? 'workspaceGraphExportJsonLd'
                        : format === 'graphml'
                          ? 'workspaceGraphExportGraphMl'
                          : 'workspaceGraphExportGexf'
                    )
                  }
                  onRevealArtifact={(artifactPath) =>
                    vscode.postMessage('revealEvidence', {
                      path: artifactPath,
                      workspacePath: workspaceStatus.workspacePath,
                      projectPath: dashboardProjectPath,
                    })
                  }
                  onStartRecording={(input) =>
                    vscode.postMessage('startWorkspaceGraphRecording', input)
                  }
                  onAppendRecordingFrame={(input: WorkspaceGraphRecordingFrameInput) =>
                    vscode.postMessage('appendWorkspaceGraphRecordingFrame', input)
                  }
                  onStopRecording={(input) =>
                    vscode.postMessage('stopWorkspaceGraphRecording', input)
                  }
                  onOpenRecording={() => vscode.postMessage('openWorkspaceGraphRecording')}
                />
              ) : null}

              {dashboardSection === 'operate' ? (
                <DashboardOperatePanel
                  hasWorkspace={hasActiveWorkspace}
                  scope={dashboardWorkspaceOnlyScope}
                  workspaceStatus={workspaceStatus}
                  evidence={effectiveDashboardEvidence}
                  pendingCardIds={pendingEvidenceCardIds}
                  selectedFramework={selectedFramework}
                  onSelectFramework={setSelectedFramework}
                  onOpenProjectBuilder={handleOpenProjectModal}
                  onOpenManualProject={handleOpenManualProjectModal}
                  onRunWorkspaceCommand={dispatchDashboardCommand}
                  onRunFixPreview={() =>
                    openStudioInSidebar(
                      'Prepare a safe fix preview for the current workspace evidence.',
                      { studioMode: 'prepare' }
                    )
                  }
                  onRunChangeImpact={() =>
                    openStudioInSidebar(
                      'Assess the change impact for the current workspace evidence.',
                      { studioMode: 'investigate' }
                    )
                  }
                  onRunTerminalBridge={() =>
                    openStudioInSidebar(
                      'Prepare a terminal-safe action plan for the current workspace evidence.',
                      { studioMode: 'prepare' }
                    )
                  }
                  onOpenIncidentStudio={() => openStudioInSidebar()}
                  onNavigateSection={(section) =>
                    updateDashboardSection(section, { navigationSource: 'tab' })
                  }
                  onOperateZoneSelect={(zone) => {
                    lastDashboardNavigationRef.current = {
                      section: 'operate',
                      operateZone: zone,
                    };
                    trackDashboardNavigation(vscode.postMessage.bind(vscode), 'operate', {
                      operateZone: zone,
                      source: 'operate_sub_nav',
                    });
                  }}
                  onCreateWorkspace={handleOpenAICreateWorkspace}
                  onBootstrap={() => handleDashboardCommand('workspaceBootstrap')}
                  onSetup={() => handleDashboardCommand('workspaceSetup')}
                  onWorkspaceSync={() => handleDashboardCommand('workspaceSync')}
                  onFoundationEnsure={() => handleDashboardCommand('workspaceFoundationEnsure')}
                  onContractInspect={() => handleDashboardCommand('workspaceContractInspect')}
                  onContractVerify={() => handleDashboardCommand('workspaceContractVerify')}
                  onReadiness={() => handleDashboardCommand('workspaceReadiness')}
                  onAutopilotRelease={() => handleDashboardCommand('workspaceAutopilotRelease')}
                  onMirrorOps={() => handleDashboardCommand('mirrorOps')}
                  onCacheStatus={() => handleDashboardCommand('cacheStatus')}
                  onPolicy={() => handleDashboardCommand('workspacePolicyShow')}
                  onInfra={() => handleDashboardCommand('workspaceInfra')}
                  onWorkspaceModel={() => handleDashboardCommand('workspaceModel')}
                  onIntelligenceSnapshot={() =>
                    handleDashboardCommand('workspaceIntelligenceSnapshot')
                  }
                  onWorkspaceDiff={() => handleDashboardCommand('workspaceDiff')}
                  onWorkspaceImpact={() => handleDashboardCommand('workspaceImpact')}
                  onWorkspaceContextAgent={() => handleDashboardCommand('workspaceContextAgent')}
                  onWorkspaceAgentSync={() => handleDashboardCommand('workspaceAgentSync')}
                  onWorkspaceVerify={() => handleDashboardCommand('workspaceVerify')}
                  onWorkspaceExplain={() => handleDashboardCommand('workspaceExplain')}
                  onWorkspaceWhy={() => handleDashboardCommand('workspaceWhy')}
                  onWorkspaceTrace={() => handleDashboardCommand('workspaceTrace')}
                  onWorkspaceWatch={() => handleDashboardCommand('workspaceWatch')}
                  onWorkspaceMcp={() => handleDashboardCommand('workspaceMcp')}
                  onWorkspaceImpactLens={() => handleDashboardCommand('workspaceImpactLens')}
                  onRunImpactLensCli={() => handleDashboardCommand('workspaceImpactLensCli')}
                  onIntelligenceChain={() => handleDashboardCommand('workspaceIntelligenceChain')}
                  onSendWorkspaceToCopilot={() =>
                    vscode.postMessage('sendWorkspaceToCopilot', {
                      workspacePath: workspaceStatus.workspacePath,
                      workspaceName:
                        selectedWorkspaceForAnalysisObj?.name ||
                        workspaceStatus.workspaceName ||
                        activeWorkspaceName,
                    })
                  }
                  onCopyText={(text) => vscode.postMessage('copyText', { text })}
                  requestedOperateZone={requestedOperateZone}
                  onRequestedOperateZoneConsumed={() => setRequestedOperateZone(null)}
                />
              ) : null}

              {dashboardSection === 'console' ? (
                <div
                  id="dashboard-panel-console"
                  role="tabpanel"
                  aria-labelledby="dashboard-tab-console"
                  className="ws-dashboard-panel ws-dashboard-panel--console"
                >
                  {!hasDashboardProject ? (
                    <WorkspaiEmptyState
                      icon={<LayoutDashboard size={18} />}
                      title="No project selected"
                      description={
                        <>
                          Select a project from the <strong>PROJECTS</strong> panel in the sidebar,
                          or scaffold one from the <strong>Run</strong> tab (Build section).
                        </>
                      }
                      actions={
                        <>
                          <button
                            type="button"
                            className="ws-btn ws-btn--primary"
                            onClick={() => openRunZone('build', 'tab')}
                          >
                            Open Run — Build
                          </button>
                          <button
                            type="button"
                            className="ws-btn"
                            onClick={() =>
                              updateDashboardSection('catalog', { navigationSource: 'tab' })
                            }
                          >
                            Open Library
                          </button>
                        </>
                      }
                    />
                  ) : (
                    <>
                      <p className="dashboard-section-hint">
                        Installed modules for the active project appear here. Browse the full
                        catalog in <strong>Library</strong> and install into your selected project.
                      </p>
                      <ProjectActions
                        workspaceStatus={workspaceStatus}
                        scope={dashboardScope}
                        evidence={effectiveDashboardEvidence}
                        pendingCardIds={pendingEvidenceCardIds}
                        onTerminal={() => dispatchDashboardCommand('projectTerminal')}
                        onInit={() => dispatchDashboardCommand('projectInit')}
                        onDev={() => dispatchDashboardCommand('projectDev')}
                        onStop={() => dispatchDashboardCommand('projectStop')}
                        onTest={() => dispatchDashboardCommand('projectTest')}
                        onDoctor={() => dispatchDashboardCommand('projectDoctor')}
                        onDoctorFix={() =>
                          dispatchDashboardCommand('projectDoctor', { preferredAction: 'fix' })
                        }
                        onArchitecture={() => dispatchDashboardCommand('projectArchitecture')}
                        onIncident={() => dispatchDashboardCommand('projectIncident')}
                        onAI={() => dispatchDashboardCommand('projectAI')}
                        onRelease={() => dispatchDashboardCommand('projectRelease')}
                        onImpact={() => dispatchDashboardCommand('projectImpact')}
                        onBrowser={() => dispatchDashboardCommand('projectBrowser')}
                        onBuild={() => dispatchDashboardCommand('projectBuild')}
                        onLint={() => dispatchDashboardCommand('projectLint')}
                        onFormat={() => dispatchDashboardCommand('projectFormat')}
                        onRevealArtifact={(artifactPath) =>
                          vscode.postMessage('revealEvidence', {
                            path: artifactPath,
                            workspacePath: workspaceStatus.workspacePath,
                            projectPath: dashboardProjectPath,
                          })
                        }
                      />
                      {dashboardModulesReady ? (
                        <DashboardModuleCatalogSurface
                          {...dashboardModuleCatalogSurfaceProps}
                          surface="console"
                          onModuleDiff={(module) =>
                            dispatchDashboardCommand('moduleDiff', {
                              moduleSlug: module.slug,
                              preferNonInteractive: true,
                              ...workspaceCommandPayload(),
                            })
                          }
                          onModuleRollback={(module) =>
                            dispatchDashboardCommand('moduleRollback', {
                              moduleSlug: module.slug,
                              preferNonInteractive: true,
                              ...workspaceCommandPayload(),
                            })
                          }
                          onModuleUninstall={(module) =>
                            dispatchDashboardCommand('moduleUninstall', {
                              moduleSlug: module.slug,
                              preferNonInteractive: true,
                              ...workspaceCommandPayload(),
                            })
                          }
                        />
                      ) : (
                        <DashboardCatalogLoadingShell variant="modules" />
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {dashboardSection === 'catalog' ? (
                <div
                  id="dashboard-panel-catalog"
                  role="tabpanel"
                  aria-labelledby="dashboard-tab-catalog"
                  className="ws-dashboard-panel ws-dashboard-panel--catalog"
                >
                  <p className="dashboard-section-hint">
                    Your workspaces, starter templates, and the module catalog. Installed modules
                    for the active project are managed from the <strong>Project</strong> tab.
                  </p>
                  <RecentWorkspaces
                    workspaces={recentWorkspaces}
                    isRefreshing={isRefreshingWorkspaces}
                    onRefresh={() => {
                      setIsRefreshingWorkspaces(true);
                      vscode.postMessage('refreshWorkspaces');
                    }}
                    onSelect={(workspace) =>
                      vscode.postMessage('openWorkspaceFolder', { path: workspace.path })
                    }
                    onRemove={(workspace) =>
                      vscode.postMessage('removeWorkspace', { path: workspace.path })
                    }
                    onUpgrade={(workspace) =>
                      vscode.postMessage('upgradeCore', {
                        path: workspace.path,
                        version: workspace.coreLatestVersion,
                      })
                    }
                    onCheckHealth={(workspace) =>
                      dispatchDashboardCommand('checkWorkspaceHealth', {
                        path: workspace.path,
                        name: workspace.name,
                      })
                    }
                    onExport={(workspace) =>
                      dispatchDashboardCommand('exportWorkspace', { path: workspace.path })
                    }
                    onAI={(workspace) =>
                      vscode.postMessage('openWorkspaceAdvisorTab', {
                        workspacePath: workspace.path,
                        workspaceName: workspace.name,
                        source: 'dashboard',
                        trigger: 'recent-workspace-ai',
                      })
                    }
                    onAnalyze={handleAnalyzeWorkspace}
                    onBootstrap={(workspace) =>
                      dispatchDashboardCommand('workspaceBootstrap', {
                        path: workspace.path,
                        name: workspace.name,
                      })
                    }
                    onMirrorSync={(workspace) =>
                      dispatchDashboardCommand('mirrorSync', {
                        path: workspace.path,
                        name: workspace.name,
                      })
                    }
                  />
                  {dashboardCatalogTimedOut ? (
                    <WorkspaiBanner title="Library load delayed">
                      <p className="workspai-banner__body">
                        Module catalog did not confirm within 12 seconds. Showing last known data —
                        use Refresh on the module catalog if entries look stale.
                      </p>
                    </WorkspaiBanner>
                  ) : null}
                  <p className="dashboard-section-hint dashboard-section-hint--secondary">
                    Starter templates and module catalog browse.
                  </p>
                  {dashboardTemplatesReady ? (
                    <>
                      <ExampleWorkspaces
                        examples={exampleWorkspaces}
                        onClone={(example) => vscode.postMessage('cloneExample', example)}
                        onUpdate={(example) => vscode.postMessage('updateExample', example)}
                        cloningExample={cloningExample}
                        updatingExample={updatingExample}
                      />

                      {dashboardModulesReady ? (
                        <DashboardModuleCatalogSurface
                          {...dashboardModuleCatalogSurfaceProps}
                          surface="catalog"
                        />
                      ) : (
                        <DashboardCatalogLoadingShell variant="modules" />
                      )}
                    </>
                  ) : (
                    <DashboardCatalogLoadingShell variant="templates" />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : activeView === 'settings' ? (
          <div className="ws-embedded-host ws-embedded-host--full">
            <div className="workspai-view-tabs-sticky">{workspaiViewTabs}</div>
            <WorkspaiSettingsPanel
              availableModels={aiAvailableModels}
              preferredModelId={preferredModelId}
              aiProvider={aiProvider}
              aiProviderCatalog={aiProviderCatalog}
              customAIBaseUrl={customAIBaseUrl}
              customAIModel={customAIModel}
              aiProviderStatus={aiProviderStatus}
              aiProviderHealthCheck={aiProviderHealthCheck}
              providerHealthChecking={providerHealthChecking}
              modelsLoading={aiModelsLoading}
              onPreferredModelChange={handlePreferredModelChange}
              onProviderChange={(provider) => {
                setAIProviderHealthCheck(null);
                vscode.postMessage('setAIProvider', { provider });
              }}
              onCustomAIConfigSave={(input) => vscode.postMessage('setCustomAIConfig', input)}
              onCustomAIAPIKeySave={(apiKey) => vscode.postMessage('setCustomAIAPIKey', { apiKey })}
              onCustomAIAPIKeyClear={() => vscode.postMessage('clearCustomAIAPIKey')}
              onTestAIProvider={() => {
                setProviderHealthChecking(true);
                setAIProviderHealthCheck(null);
                vscode.postMessage('testAIProvider');
              }}
              onRefreshModels={refreshWorkspaiSettings}
              themeMode={themeMode}
              onThemeModeChange={handleThemeModeChange}
            />
          </div>
        ) : activeView === 'setup' ? (
          <div className="ws-embedded-host ws-embedded-host--full">
            <div className="workspai-view-tabs-sticky">{workspaiViewTabs}</div>
            <SetupExperience embedded />
          </div>
        ) : null}

        <CreateWorkspaceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateWorkspace}
          toolStatus={workspaceToolStatus}
          onSwitchToAI={() => {
            setShowCreateModal(false);
            handleOpenAICreateWorkspace();
          }}
        />
        <CreateProjectModal
          isOpen={showProjectModal}
          framework={selectedFramework}
          availableKits={availableKits}
          onClose={() => setShowProjectModal(false)}
          onCreate={handleCreateProject}
          onSwitchToAI={() => {
            setShowProjectModal(false);
            setAICreateMode('project');
            setAICreateFramework(selectedFramework);
            setAICreationPlan(null);
            setAICreationError(null);
            setAICreationThinking(false);
            setAICreationCreating(false);
            setAICreationStage(null);
            setAICreateModelId(null);
            setAICreateTargetWorkspaceName(activeWorkspaceName ?? undefined);
            setAICreateTargetWorkspacePath(workspaceStatus.workspacePath ?? undefined);
            setShowAICreateModal(true);
          }}
          toolStatus={workspaceToolStatus}
        />
        <AICreateModal
          isOpen={showAICreateModal}
          mode={aiCreateMode}
          framework={aiCreateFramework}
          targetWorkspaceName={aiCreateMode === 'project' ? aiCreateTargetWorkspaceName : undefined}
          plan={aiCreationPlan}
          isThinking={aiCreationThinking}
          isCreating={aiCreationCreating}
          creationStage={aiCreationStage}
          planError={aiCreationError}
          planSource={aiCreationPlanSource}
          modelId={aiCreateModelId}
          onClose={() => {
            if (!aiCreationThinking && !aiCreationCreating) {
              setShowAICreateModal(false);
              setAICreationPlan(null);
              setAICreationError(null);
              setAICreateTargetWorkspaceName(undefined);
              setAICreateTargetWorkspacePath(undefined);
            }
          }}
          onPromptSubmit={handleAICreatePromptSubmit}
          onConfirm={handleAICreateConfirm}
          onStartOver={handleAICreateStartOver}
          onManualFallback={() => {
            setShowAICreateModal(false);
            if (aiCreateMode === 'workspace') {
              setShowCreateModal(true);
            } else {
              setSelectedFramework(aiCreateFramework ?? 'fastapi');
              setShowProjectModal(true);
            }
          }}
        />
        <InstallModuleModal
          isOpen={showInstallModal}
          module={selectedModule}
          workspaceStatus={workspaceStatus}
          onClose={() => {
            setShowInstallModal(false);
            setSelectedModule(null);
          }}
          onConfirm={handleConfirmInstall}
        />
        {showModuleDetailsModal && (
          <ModuleDetailsModal
            module={moduleDetails}
            onClose={() => {
              setShowModuleDetailsModal(false);
              setModuleDetails(null);
            }}
          />
        )}
        <Footer />
      </div>
    </WorkspaiThemeProvider>
  );
}
