import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Wrench, Sparkles } from 'lucide-react';
import { vscode } from '@/vscode';
import type {
    ModuleData,
    CategoryInfo,
    Workspace,
    WorkspaceStatus,
    InstallStatus,
    ExampleWorkspace,
    Kit,
    WorkspaceToolStatus,
} from '@/types';
import { Header } from '@/components/Header';
import { RecentWorkspaces } from '@/components/RecentWorkspaces';
import { ExampleWorkspaces } from '@/components/ExampleWorkspaces';
import { ModuleBrowser } from '@/components/ModuleBrowser';
import { Footer } from '@/components/Footer';
import { EnterpriseDashboardFlow } from '@/components/EnterpriseDashboardFlow';
import { WorkspaceOverview } from '@/components/WorkspaceOverview';
import { AIIncidentStudio } from '@/components/AIIncidentStudio';
import {
    DEFAULT_INCIDENT_STUDIO_DISPLAY_MODE,
    DEFAULT_INCIDENT_USER_MODE,
    normalizeIncidentStudioDisplayMode,
    normalizeIncidentPrimaryCtaExperimentVariant,
    normalizeIncidentUserMode,
    resolveIncidentPrimaryCtaMode,
    type IncidentStudioDisplayMode,
    type IncidentPrimaryCtaExperimentVariant,
    type IncidentUserMode,
} from '@/lib/incidentStudioPreferences';
import {
    getConversationIdToCloseOnBootstrap,
    getConversationIdToCloseOnViewExit,
    reconcileIncidentStudioSyncSelection,
} from '@/lib/incidentStudioLifecycle';
import {
    buildIncidentChatExecuteActionPayload,
    buildIncidentChatQueryPayload,
    buildIncidentChatSyncWorkspacePayload,
    buildIncidentChatStartPayload,
    isIncidentDuplicateRequest,
    normalizeIncidentPartialFailurePayload,
    normalizeIncidentActionProgressPayload,
    normalizeIncidentActionResultPayload,
    normalizeIncidentDonePayload,
    normalizeIncidentImpactAssessmentPayload,
    normalizeIncomingIncidentStudioOpen,
    normalizeIncidentPredictiveWarningPayload,
    normalizeIncidentProtocolMeta,
    normalizeIncidentReleaseGateEvidencePayload,
    normalizeIncidentSystemGraphSnapshotPayload,
    normalizeIncidentWorkspaceGraphSnapshot,
    type NormalizedIncidentActionResultPayload,
    type NormalizedIncidentImpactAssessmentPayload,
    type NormalizedIncidentPredictiveWarningPayload,
    type NormalizedIncidentReleaseGateEvidencePayload,
    type NormalizedIncidentSystemGraphSnapshotPayload,
    type IncidentProjectSelection,
} from '@/lib/incidentStudioPayload';
import { AIModal, AIModalContext, AIContextContractSummary } from '@/components/AIModal';
import { AICreateModal, AICreationPlan, AICreateFramework } from '@/components/AICreateModal';
import { CreateWorkspaceModal, WorkspaceCreationConfig } from '@/components/CreateWorkspaceModal';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { InstallModuleModal } from '@/components/InstallModuleModal';
import { ModuleDetailsModal } from '@/components/ModuleDetailsModal';

function normalizeSelectedModelId(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }

    return trimmed;
}

export function App() {
    type ChatBrainBoardAction = {
        id: string;
        label: string;
        actionType: string;
        riskLevel?: string;
    };

    type ChatBrainBoard = {
        id: string;
        type: string;
        title: string;
        summary?: string;
        data?: Record<string, unknown>;
        actions?: ChatBrainBoardAction[];
    };

    type ChatBrainHistoryItem = {
        id: string;
        role: 'user' | 'assistant';
        text: string;
        timestamp: number;
    };

    type IncidentTelemetrySnapshot = {
        commandSummary: {
            totalEvents: number;
            lastCommand: string | null;
            lastCommandAt: string | null;
            commandUsage: Array<{ command: string; count: number }>;
            surfaceBreakdown: {
                actionEvents: number;
                askEvents: number;
                actionVsAskShare: number | null;
            };
        } | null;
        onboardingSummary: {
            followupShown: number;
            followupClicked: number;
            overallFollowupClickThroughRate: number;
        } | null;
        studioHardGateStatus?: {
            workspacePath: string;
            timeWindow: 'all' | 'last24h' | 'last7d';
            windowStartAt: string | null;
            windowEndAt: string;
            thresholds: {
                verifyPhaseReachMin: number;
                bridgeRouteCompletionMin: number;
            };
            metrics: {
                loopStarted: number;
                nextActionClicked: number;
                actionExecuted: number;
                verifyOutcomes: number;
                verifyPhaseReach: number | null;
                bridgeRouteCompletionRate: number | null;
            };
            gates: {
                verifyPhaseReachPass: boolean;
                bridgeRouteCompletionPass: boolean;
                telemetryEvidencePass: boolean;
                overallPass: boolean;
            };
        } | null;
        studioRollbackKpiStatus?: {
            workspacePath: string;
            timeWindow: 'all' | 'last24h' | 'last7d';
            windowStartAt: string | null;
            windowEndAt: string;
            thresholds: {
                verifyAutoRollbackSuccessRateMin: number;
                falseConfidenceRateMax: number;
            };
            metrics: {
                verifyFailed: number;
                rollbackAttempted: number;
                rollbackSucceeded: number;
                verifyAutoRollbackSuccessRate: number | null;
                falseConfidenceRate: number | null;
            };
            gates: {
                telemetryEvidencePass: boolean;
                verifyAutoRollbackSuccessRatePass: boolean;
                falseConfidenceRatePass: boolean;
                overallPass: boolean;
            };
        } | null;
        studioReproPackKpiStatus?: {
            workspacePath: string;
            timeWindow: 'all' | 'last24h' | 'last7d';
            windowStartAt: string | null;
            windowEndAt: string;
            thresholds: {
                reproPackShareRateMin: number;
                replayToResolutionRateMin: number;
            };
            metrics: {
                reproPackCaptured: number;
                reproPackExported: number;
                reproPackImported: number;
                incidentReplayReady: number;
                incidentReplayMemoryEnriched: number;
                reproPackShareRate: number | null;
                replayToResolutionRate: number | null;
            };
            gates: {
                telemetryEvidencePass: boolean;
                reproPackShareRatePass: boolean;
                replayToResolutionRatePass: boolean;
                overallPass: boolean;
            };
        } | null;
        releaseReadinessValidationKpiStatus?: {
            workspacePath: string;
            timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d';
            windowStartAt: string | null;
            windowEndAt: string;
            metrics: {
                releaseReadinessArtifactsExported: number;
                goDecisionsExported: number;
                noGoDecisionsExported: number;
                decisionsValidated: number;
                decisionsCorrect: number;
                noGoDecisionsValidated: number;
                noGoPreventedIncident: number;
                releaseReadinessDecisionAccuracy: number | null;
                noGoPreventedIncidentRate: number | null;
            };
            gates: {
                telemetryEvidencePass: boolean;
                releaseReadinessDecisionAccuracyAvailable: boolean;
                noGoPreventedIncidentRateAvailable: boolean;
                overallPass: boolean;
            };
        } | null;
        verifiedOutcomeLoopStatus?: {
            workspacePath: string | null;
            timeWindow: 'all' | 'last24h' | 'last7d' | 'last30d' | null;
            verifiedOutcomes: number;
            reusableArtifacts: {
                reproPacksExported: number;
                replayReady: number;
                memoryEnriched: number;
                releaseArtifactsExported: number;
            };
            conversionRates: {
                replayToResolutionRate: number | null;
                releaseDecisionAccuracy: number | null;
                noGoPreventedIncidentRate: number | null;
            };
            gates: {
                reproEvidencePass: boolean;
                releaseEvidencePass: boolean;
                overallPass: boolean;
            };
        } | null;
        doctorSummary?: {
            workspaceName?: string;
            generatedAt?: string;
            health: {
                total: number;
                passed: number;
                warnings: number;
                errors: number;
                percent: number;
            };
            projectCount: number;
            projectsWithIssues: number;
            issueCount: number;
            frameworks: Array<{ name: string; count: number }>;
            projects: Array<{
                name: string;
                framework?: string;
                issues: number;
                depsInstalled?: boolean;
            }>;
            fixCommands: string[];
        } | null;
    };

    type IncidentResumeSnapshot = {
        workspacePath: string;
        phase: 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';
        turnCount: number;
        queryCount: number;
        actionCount: number;
        lastActivityAt: number;
        resolved: boolean;
        recap: string;
        nextActionLabel: string;
        nextActionQuery: string;
    };

    type ImportedWorkspaceShareSummary = {
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

    const [version, setVersion] = useState('0.0.0');
    const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [showModuleDetailsModal, setShowModuleDetailsModal] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [aiModalContext, setAIModalContext] = useState<AIModalContext | null>(null);
    const [aiStreamContent, setAIStreamContent] = useState('');
    const [aiIsStreaming, setAIIsStreaming] = useState(false);
    const [aiStreamError, setAIStreamError] = useState<string | null>(null);
    const [aiModelId, setAIModelId] = useState<string | null>(null);
    const [aiAvailableModels, setAIAvailableModels] = useState<{ id: string; name: string; vendor: string }[]>([]);
    const [aiSelectedModelId, setAISelectedModelId] = useState<string | null>(null);
    const [aiContextContract, setAIContextContract] = useState<AIContextContractSummary | null>(null);
    const [incidentSelectedModelId, setIncidentSelectedModelId] = useState<string | null>(null);
    const [incidentModelId, setIncidentModelId] = useState<string | null>(null);
    const [aiConversationHistory, setAIConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
    // AI Create state
    const [showAICreateModal, setShowAICreateModal] = useState(false);
    const [aiCreateMode, setAICreateMode] = useState<'workspace' | 'project'>('workspace');
    const [aiCreateFramework, setAICreateFramework] = useState<AICreateFramework | undefined>(undefined);
    const [aiCreateTargetWorkspaceName, setAICreateTargetWorkspaceName] = useState<string | undefined>(undefined);
    const [aiCreateTargetWorkspacePath, setAICreateTargetWorkspacePath] = useState<string | undefined>(undefined);
    const [aiCreationPlan, setAICreationPlan] = useState<AICreationPlan | null>(null);
    const [aiCreationThinking, setAICreationThinking] = useState(false);
    const [aiCreationCreating, setAICreationCreating] = useState(false);
    const [aiCreationStage, setAICreationStage] = useState<'workspace_done' | null>(null);
    const [aiCreationError, setAICreationError] = useState<string | null>(null);
    const [aiCreateModelId, setAICreateModelId] = useState<string | null>(null);
    const [selectedFramework, setSelectedFramework] = useState<AICreateFramework>('fastapi');
    const [selectedModule, setSelectedModule] = useState<ModuleData | null>(null);
    const [moduleDetails, setModuleDetails] = useState<ModuleData | null>(null);
    const [recentWorkspaces, setRecentWorkspaces] = useState<Workspace[]>([]);
    const [exampleWorkspaces, setExampleWorkspaces] = useState<ExampleWorkspace[]>([]);
    const [availableKits, setAvailableKits] = useState<Kit[]>([]);
    const [cloningExample, setCloningExample] = useState<string | null>(null);
    const [updatingExample, setUpdatingExample] = useState<string | null>(null);
    const [modulesCatalog, setModulesCatalog] = useState<ModuleData[]>([]);
    const [categoryInfo] = useState<CategoryInfo>({});
    const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>({ hasWorkspace: false });
    const [installStatus, setInstallStatus] = useState<InstallStatus>({
        npmInstalled: false,
        coreInstalled: false
    });
    const [workspaceToolStatus, setWorkspaceToolStatus] = useState<WorkspaceToolStatus | null>(null);
    const [incidentTelemetry, setIncidentTelemetry] = useState<IncidentTelemetrySnapshot | null>(null);
    const [incidentResume, setIncidentResume] = useState<IncidentResumeSnapshot | null>(null);
    const [chatBrainConversationId, setChatBrainConversationId] = useState<string | null>(null);
    const [chatBrainStreamText, setChatBrainStreamText] = useState('');
    const [chatBrainHistory, setChatBrainHistory] = useState<ChatBrainHistoryItem[]>([]);
    const [chatBrainSuggestedQuestions, setChatBrainSuggestedQuestions] = useState<string[]>([]);
    const [chatBrainBoard, setChatBrainBoard] = useState<ChatBrainBoard | null>(null);
    const [chatBrainActionProgress, setChatBrainActionProgress] = useState<{
        stage: string;
        progress: number;
        note?: string;
    } | null>(null);
    const [chatBrainActionResult, setChatBrainActionResult] =
        useState<NormalizedIncidentActionResultPayload | null>(null);
    const [chatBrainSystemGraphSnapshot, setChatBrainSystemGraphSnapshot] =
        useState<NormalizedIncidentSystemGraphSnapshotPayload | null>(null);
    const [chatBrainImpactAssessment, setChatBrainImpactAssessment] =
        useState<NormalizedIncidentImpactAssessmentPayload | null>(null);
    const [chatBrainPredictiveWarning, setChatBrainPredictiveWarning] =
        useState<NormalizedIncidentPredictiveWarningPayload | null>(null);
    const [chatBrainReleaseGateEvidence, setChatBrainReleaseGateEvidence] =
        useState<NormalizedIncidentReleaseGateEvidencePayload | null>(null);
    const [chatBrainError, setChatBrainError] = useState<string | null>(null);
    const [chatBrainErrorRetryable, setChatBrainErrorRetryable] = useState<boolean>(true);
    const [chatBrainIsStreaming, setChatBrainIsStreaming] = useState(false);
    const [chatBrainExecutingCommand, setChatBrainExecutingCommand] = useState<string | null>(null);
    /** true once extension has sent at least one installStatusUpdate — before that, initial false values must not be trusted */
    const [installStatusChecked, setInstallStatusChecked] = useState(false);
    const [isRefreshingWorkspaces, setIsRefreshingWorkspaces] = useState(false);
    const [activeView, setActiveView] = useState<'dashboard' | 'incident-studio'>('dashboard');
    const [dashboardTemplatesReady, setDashboardTemplatesReady] = useState(false);
    const [dashboardModulesReady, setDashboardModulesReady] = useState(false);
    const [importedWorkspaceShare, setImportedWorkspaceShare] =
        useState<ImportedWorkspaceShareSummary | null>(null);
    const [incidentUserMode, setIncidentUserMode] = useState<IncidentUserMode>(DEFAULT_INCIDENT_USER_MODE);
    const [incidentStudioDisplayMode, setIncidentStudioDisplayMode] =
        useState<IncidentStudioDisplayMode>(DEFAULT_INCIDENT_STUDIO_DISPLAY_MODE);
    const [incidentArchitectureLensViewOverride, setIncidentArchitectureLensViewOverride] =
        useState<'tree' | 'dependency' | 'runtime' | null>(null);
    const [incidentPrimaryCtaExperimentVariant, setIncidentPrimaryCtaExperimentVariant] =
        useState<IncidentPrimaryCtaExperimentVariant | null>(null);
    const [incidentAutoLearningPrompt, setIncidentAutoLearningPrompt] = useState(true);
    const [isIncidentRefreshing, setIsIncidentRefreshing] = useState(false);
    const [lastIncidentRefreshedAt, setLastIncidentRefreshedAt] = useState<number | null>(null);
    const [selectedWorkspaceForAnalysis, setSelectedWorkspaceForAnalysis] = useState<string | null>(null);
    const [selectedProjectForAnalysis, setSelectedProjectForAnalysis] = useState<IncidentProjectSelection | null>(null);
    const [analyzeReport, setAnalyzeReport] = useState<any | null>(null);
    const [analyzeReportError, setAnalyzeReportError] = useState<string | null>(null);
    const [analyzeReportExists, setAnalyzeReportExists] = useState<boolean | null>(null);
    const [isAnalyzeLoading, setIsAnalyzeLoading] = useState(false);
    const aiRequestIdRef = useRef(0);
    const chatBrainMessageIdRef = useRef<string | null>(null);
    const chatBrainStreamTextRef = useRef('');
    const chatBrainLastDoneRequestIdRef = useRef<string | null>(null);
    const chatBrainLastActionResultRequestIdRef = useRef<string | null>(null);
    const chatBrainLastPartialFailureRequestIdRef = useRef<string | null>(null);
    const chatBrainLastErrorRequestIdRef = useRef<string | null>(null);
    const lastIncidentBootstrapWorkspaceRef = useRef<string | null>(null);
    const incidentStudioDisplayModeOverrideRef = useRef<IncidentStudioDisplayMode | null>(null);
    const dashboardMountedAtRef = useRef<number>(
        typeof performance !== 'undefined' ? performance.now() : Date.now()
    );

    const activeWorkspace =
        recentWorkspaces.find((workspace) => workspace.path === workspaceStatus.workspacePath) || null;
    const selectedWorkspaceForAnalysisObj =
        selectedWorkspaceForAnalysis ? recentWorkspaces.find((w) => w.path === selectedWorkspaceForAnalysis) : null;
    const hasActiveWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);
    const activeWorkspaceProfile = activeWorkspace?.bootstrapProfile;
    const activeWorkspaceName = selectedWorkspaceForAnalysisObj?.name || workspaceStatus.workspaceName || activeWorkspace?.name;
    const analysisScopeType: 'workspace' | 'project' = selectedProjectForAnalysis?.path
        ? 'project'
        : 'workspace';
    const analysisScopeLabel =
        (analysisScopeType === 'project'
            ? [selectedProjectForAnalysis?.name, activeWorkspaceName]
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                .join(' @ ')
            : activeWorkspaceName) ||
        (analysisScopeType === 'project'
            ? selectedProjectForAnalysis?.path
            : selectedWorkspaceForAnalysis || workspaceStatus.workspacePath) ||
        'No active scope';
    const analysisScopePath =
        (analysisScopeType === 'project'
            ? selectedProjectForAnalysis?.path
            : selectedWorkspaceForAnalysis || workspaceStatus.workspacePath) || null;
    const analysisWorkspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath || null;
    const analysisProjectPath = selectedProjectForAnalysis?.path || null;
    const incidentPrimaryCtaMode = resolveIncidentPrimaryCtaMode(
        incidentUserMode,
        incidentPrimaryCtaExperimentVariant
    );
    const incidentRefreshLabel = lastIncidentRefreshedAt
        ? new Date(lastIncidentRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;

    const updateIncidentUserMode = (mode: IncidentUserMode) => {
        const normalizedMode = normalizeIncidentUserMode(mode);
        setIncidentUserMode(normalizedMode);
        vscode.postMessage('setUiPreference', {
            key: 'incidentUserMode',
            value: normalizedMode,
        });
    };

    const resolveIncidentPreferenceWorkspacePath = () =>
        selectedWorkspaceForAnalysis || workspaceStatus.workspacePath || undefined;

    const updateIncidentStudioDisplayMode = (mode: IncidentStudioDisplayMode) => {
        const normalizedMode = normalizeIncidentStudioDisplayMode(mode);
        incidentStudioDisplayModeOverrideRef.current = null;
        setIncidentStudioDisplayMode(normalizedMode);
        vscode.postMessage('setUiPreference', {
            key: 'incidentStudioDisplayMode',
            value: normalizedMode,
            workspacePath: resolveIncidentPreferenceWorkspacePath(),
        });
    };

    const updateIncidentAutoLearningPrompt = (enabled: boolean) => {
        setIncidentAutoLearningPrompt(enabled);
        vscode.postMessage('setUiPreference', {
            key: 'incidentAutoLearningPrompt',
            value: enabled,
        });
    };

    // Listen for messages from extension
    useEffect(() => {
        const messageHandler = (event: MessageEvent) => {
            const message = event.data;
            const messageRequestId =
                typeof message?.data?.requestId === 'number' ? message.data.requestId : undefined;

            console.log('[React Webview] Received message:', message.command, message.data);

            switch (message.command) {
                case 'updateVersion':
                    console.log('[React Webview] Updating version:', message.data);
                    setVersion(message.data);
                    break;
                case 'updateWorkspaceStatus':
                    console.log('[React Webview] Updating workspace status:', message.data);
                    setWorkspaceStatus(message.data);

                    if (typeof message.data?.workspacePath === 'string' && message.data.workspacePath.trim().length > 0) {
                        setSelectedWorkspaceForAnalysis(message.data.workspacePath.trim());
                    }

                    if (
                        message.data?.hasProjectSelected === true &&
                        typeof message.data?.projectPath === 'string' &&
                        message.data.projectPath.trim().length > 0
                    ) {
                        const rawProjectType =
                            typeof message.data?.projectType === 'string'
                                ? message.data.projectType
                                : undefined;
                        const normalizedProjectType =
                            rawProjectType === 'fastapi' ||
                                rawProjectType === 'nestjs' ||
                                rawProjectType === 'go' ||
                                rawProjectType === 'springboot' ||
                                rawProjectType === 'dotnet'
                                ? rawProjectType
                                : undefined;

                        setSelectedProjectForAnalysis({
                            path: message.data.projectPath.trim(),
                            name:
                                typeof message.data?.projectName === 'string' &&
                                    message.data.projectName.trim().length > 0
                                    ? message.data.projectName.trim()
                                    : undefined,
                            type: normalizedProjectType,
                        });
                    } else if (message.data?.hasProjectSelected === false) {
                        setSelectedProjectForAnalysis(null);
                    }
                    break;
                case 'reportExistsResult':
                    setAnalyzeReportExists(Boolean(message.data?.exists));
                    break;
                case 'reportLoaded':
                    setIsAnalyzeLoading(false);
                    setAnalyzeReport(message.data?.data ?? null);
                    setAnalyzeReportError(typeof message.data?.error === 'string' ? message.data.error : null);
                    break;
                case 'updateRecentWorkspaces':
                    console.log('[React Webview] Updating workspaces:', message.data);
                    setRecentWorkspaces(message.data);
                    setIsRefreshingWorkspaces(false);
                    break;
                case 'updateExampleWorkspaces':
                    console.log('[React Webview] Updating examples:', message.data);
                    setExampleWorkspaces(message.data);
                    break;
                case 'updateAvailableKits':
                    console.log('[React Webview] Updating available kits:', message.data);
                    setAvailableKits(message.data);
                    break;
                case 'setCloning':
                    console.log('[React Webview] Setting cloning state:', message.data);
                    setCloningExample(message.data.exampleName);
                    break;
                case 'setUpdating':
                    console.log('[React Webview] Setting updating state:', message.data);
                    setUpdatingExample(message.data.exampleName);
                    break;
                case 'updateModulesCatalog':
                    console.log('[React Webview] Updating modules catalog:', message.data?.length || 0, 'modules');
                    setModulesCatalog(message.data);
                    break;
                case 'installStatusUpdate':
                    setInstallStatus(message.data);
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
                    // Triggered from sidebar — mode can be 'workspace' or 'project'
                    setAICreateMode(message.data?.mode ?? 'workspace');
                    setAICreateFramework(undefined);
                    setAICreationPlan(null);
                    setAICreationError(null);
                    setAICreationThinking(false);
                    setAICreationCreating(false);
                    setAICreationStage(null);
                    setAICreateModelId(null);
                    setAICreateTargetWorkspaceName(message.data?.targetWorkspaceName ?? undefined);
                    setAICreateTargetWorkspacePath(message.data?.targetWorkspacePath ?? undefined);
                    setShowAICreateModal(true);
                    break;
                case 'openAIModal':
                    // Triggered from tree view AI inline button
                    console.log('[React Webview] openAIModal:', message.data);
                    aiRequestIdRef.current = 0;
                    setAIModalContext(message.data);
                    setAIStreamContent('');
                    setAIStreamError(null);
                    setAIIsStreaming(false);
                    setAIModelId(null);
                    setAIContextContract(null);
                    setAIConversationHistory([]);
                    setShowAIModal(true);
                    // Fetch available models for the selector
                    vscode.postMessage('aiGetModels');
                    break;
                case 'aiChunkUpdate':
                    if (
                        typeof messageRequestId === 'number' &&
                        messageRequestId !== aiRequestIdRef.current
                    ) {
                        break;
                    }
                    setAIStreamContent((prev) => prev + (message.data?.text || ''));
                    break;
                case 'aiContextContract':
                    if (
                        typeof messageRequestId === 'number' &&
                        messageRequestId !== aiRequestIdRef.current
                    ) {
                        break;
                    }
                    setAIContextContract({
                        persona_level:
                            typeof message.data?.persona_level === 'string'
                                ? message.data.persona_level
                                : undefined,
                        evidence_confidence:
                            typeof message.data?.evidence_confidence === 'string'
                                ? message.data.evidence_confidence
                                : undefined,
                        commandScope:
                            typeof message.data?.commandScope === 'string'
                                ? message.data.commandScope
                                : undefined,
                        missingFields: Array.isArray(message.data?.missingFields)
                            ? message.data.missingFields.filter((item: unknown): item is string => typeof item === 'string')
                            : undefined,
                        safetyFlags:
                            message.data?.safetyFlags && typeof message.data.safetyFlags === 'object'
                                ? (message.data.safetyFlags as Record<string, boolean>)
                                : undefined,
                    });
                    break;
                case 'aiStreamDone':
                    if (
                        typeof messageRequestId === 'number' &&
                        messageRequestId !== aiRequestIdRef.current
                    ) {
                        break;
                    }
                    setAIIsStreaming(false);
                    if (message.data?.error) {
                        setAIStreamError(message.data.error);
                    }
                    vscode.postMessage('requestIncidentStudioTelemetry', {
                        workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                        projectPath: selectedProjectForAnalysis?.path,
                    });
                    break;
                case 'aiModelUsed':
                    if (
                        typeof messageRequestId === 'number' &&
                        messageRequestId !== aiRequestIdRef.current
                    ) {
                        break;
                    }
                    if (message.data?.modelId) {
                        setAIModelId(message.data.modelId);
                    }
                    break;
                case 'aiModelsList':
                    if (Array.isArray(message.data?.models)) {
                        const incomingModels = message.data.models as Array<unknown>;
                        const normalizedModels = incomingModels
                            .filter(
                                (model: unknown): model is { id: string; name: string; vendor: string } =>
                                    Boolean(model) &&
                                    typeof (model as { id?: unknown }).id === 'string' &&
                                    ((model as { id: string }).id).trim().length > 0
                            )
                            .map((model: { id: string; name: string; vendor: string }) => ({
                                id: model.id,
                                name:
                                    typeof model.name === 'string' && model.name.trim().length > 0
                                        ? model.name
                                        : model.id,
                                vendor: typeof model.vendor === 'string' ? model.vendor : '',
                            }));

                        setAIAvailableModels(normalizedModels);
                        setAISelectedModelId((current) => {
                            const normalizedCurrent = normalizeSelectedModelId(current);
                            if (!normalizedCurrent) {
                                return null;
                            }
                            return normalizedModels.some((model) => model.id === normalizedCurrent)
                                ? normalizedCurrent
                                : null;
                        });
                        setIncidentSelectedModelId((current) => {
                            const normalizedCurrent = normalizeSelectedModelId(current);
                            if (!normalizedCurrent) {
                                return null;
                            }
                            return normalizedModels.some((model) => model.id === normalizedCurrent)
                                ? normalizedCurrent
                                : null;
                        });
                    }
                    break;
                // ── AI Create events ────────────────────────────────────────
                case 'aiCreationThinking':
                    setAICreationThinking(message.data?.thinking ?? false);
                    if (message.data?.thinking) {
                        setAICreationError(null);
                    }
                    break;
                case 'aiCreationPlan':
                    setAICreationPlan(message.data?.plan ?? null);
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
                    if (message.data?.view === 'dashboard' || message.data?.view === 'incident-studio') {
                        setActiveView(message.data.view);
                    }
                    break;
                case 'openIncidentStudio': {
                    const normalizedOpen = normalizeIncomingIncidentStudioOpen(message.data);
                    if (!normalizedOpen) {
                        break;
                    }

                    const displayModeOverride = normalizedOpen.preferredDisplayMode
                        ? normalizeIncidentStudioDisplayMode(normalizedOpen.preferredDisplayMode)
                        : null;

                    incidentStudioDisplayModeOverrideRef.current = displayModeOverride;
                    setIncidentArchitectureLensViewOverride(
                        normalizedOpen.preferredArchitectureLensView || null
                    );
                    if (displayModeOverride) {
                        setIncidentStudioDisplayMode(displayModeOverride);
                    }

                    setActiveView('incident-studio');
                    bootstrapIncidentStudioForWorkspace(
                        normalizedOpen.workspacePath,
                        normalizedOpen.workspaceName,
                        true,
                        normalizedOpen.initialQuery,
                        normalizedOpen.projectSelection
                    );
                    break;
                }
                case 'openWorkspaceShareDashboard':
                    if (message.data?.summary) {
                        setImportedWorkspaceShare(message.data.summary as ImportedWorkspaceShareSummary);
                        setActiveView('dashboard');
                    }
                    break;
                case 'incidentStudioTelemetry':
                    setIncidentTelemetry(message.data ?? null);
                    setIsIncidentRefreshing(false);
                    setLastIncidentRefreshedAt(Date.now());
                    break;
                case 'aiChatStarted':
                    setChatBrainConversationId(message.data?.conversationId ?? null);
                    setIncidentModelId(null);
                    setIncidentResume(
                        message.data?.resumeSnapshot && typeof message.data.resumeSnapshot === 'object'
                            ? (message.data.resumeSnapshot as IncidentResumeSnapshot)
                            : null
                    );
                    chatBrainMessageIdRef.current = null;
                    chatBrainStreamTextRef.current = '';
                    chatBrainLastDoneRequestIdRef.current = null;
                    chatBrainLastActionResultRequestIdRef.current = null;
                    chatBrainLastPartialFailureRequestIdRef.current = null;
                    chatBrainLastErrorRequestIdRef.current = null;
                    setChatBrainStreamText('');
                    setChatBrainHistory([]);
                    setChatBrainSuggestedQuestions([]);
                    setChatBrainBoard(null);
                    setChatBrainActionProgress(null);
                    setChatBrainActionResult(null);
                    setChatBrainSystemGraphSnapshot(null);
                    setChatBrainImpactAssessment(null);
                    setChatBrainPredictiveWarning(null);
                    setChatBrainReleaseGateEvidence(null);
                    setChatBrainError(null);
                    setChatBrainErrorRetryable(true);
                    setChatBrainIsStreaming(false);
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'aiChatWorkspaceSynced':
                    {
                        const normalizedGraph = normalizeIncidentWorkspaceGraphSnapshot(message.data?.graph);
                        const syncState = reconcileIncidentStudioSyncSelection(
                            selectedWorkspaceForAnalysis,
                            selectedProjectForAnalysis?.path ?? null,
                            {
                                workspacePath:
                                    typeof message.data?.workspacePath === 'string'
                                        ? message.data.workspacePath
                                        : null,
                                selectedProjectPath:
                                    typeof message.data?.selectedProjectPath === 'string'
                                        ? message.data.selectedProjectPath
                                        : null,
                                graph: normalizedGraph,
                            }
                        );

                        if (!syncState.shouldApply) {
                            console.log('[ChatBrain] ignored stale workspace sync', message.data);
                            break;
                        }

                        if (syncState.selectionChanged) {
                            setChatBrainHistory([]);
                            setChatBrainStreamText('');
                            chatBrainStreamTextRef.current = '';
                            chatBrainMessageIdRef.current = null;
                            chatBrainLastDoneRequestIdRef.current = null;
                            chatBrainLastActionResultRequestIdRef.current = null;
                            chatBrainLastPartialFailureRequestIdRef.current = null;
                            chatBrainLastErrorRequestIdRef.current = null;
                            setChatBrainBoard(null);
                            setChatBrainActionProgress(null);
                            setChatBrainActionResult(null);
                            setChatBrainSystemGraphSnapshot(null);
                            setChatBrainImpactAssessment(null);
                            setChatBrainPredictiveWarning(null);
                            setChatBrainReleaseGateEvidence(null);
                            setChatBrainSuggestedQuestions([]);
                            setChatBrainError(null);
                            setChatBrainErrorRetryable(true);
                            setIncidentResume(null);
                        }

                        setSelectedProjectForAnalysis(syncState.projectSelection);
                    }
                    setIsIncidentRefreshing(false);
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'aiChatChunk':
                    if (typeof message.data?.messageId === 'string' && message.data.messageId !== chatBrainMessageIdRef.current) {
                        // New message stream starting — clear stale progress indicator
                        chatBrainMessageIdRef.current = message.data.messageId;
                        const nextChunk = message.data?.chunk || '';
                        chatBrainStreamTextRef.current = nextChunk;
                        setChatBrainStreamText(nextChunk);
                        setChatBrainActionProgress(null);
                    } else {
                        const nextChunk = chatBrainStreamTextRef.current + (message.data?.chunk || '');
                        chatBrainStreamTextRef.current = nextChunk;
                        setChatBrainStreamText(nextChunk);
                    }
                    setChatBrainIsStreaming(true);
                    setChatBrainError(null);
                    setChatBrainErrorRetryable(true);
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'aiChatActionBoard':
                    if (message.data?.board) {
                        setChatBrainBoard(message.data.board as ChatBrainBoard);
                    }
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'aiChatSuggestedQuestions':
                    if (Array.isArray(message.data?.questions)) {
                        setChatBrainSuggestedQuestions(message.data.questions);
                    }
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'aiChatActionProgress':
                    setChatBrainActionProgress(normalizeIncidentActionProgressPayload(message.data));
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'aiChatActionResult': {
                    {
                        const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
                        if (
                            isIncidentDuplicateRequest(
                                chatBrainLastActionResultRequestIdRef.current,
                                protocolMeta.requestId
                            )
                        ) {
                            break;
                        }
                        chatBrainLastActionResultRequestIdRef.current = protocolMeta.requestId;
                    }
                    const actionResultPayload = normalizeIncidentActionResultPayload(message.data);
                    const graphPayload = normalizeIncidentSystemGraphSnapshotPayload(
                        message.data?.systemGraphSnapshot
                    );
                    const impactPayload = normalizeIncidentImpactAssessmentPayload(
                        message.data?.impactAssessment
                    );
                    const predictivePayload = normalizeIncidentPredictiveWarningPayload(
                        message.data?.predictiveWarning
                    );
                    const gateEvidencePayload = normalizeIncidentReleaseGateEvidencePayload(
                        message.data?.releaseGateEvidence
                    );

                    setChatBrainActionResult(actionResultPayload);
                    setChatBrainSystemGraphSnapshot(graphPayload);

                    const hasImpactAssessment =
                        impactPayload.affectedFiles.length > 0 ||
                        impactPayload.affectedModules.length > 0 ||
                        impactPayload.affectedTests.length > 0 ||
                        impactPayload.verifyChecklist.length > 0 ||
                        Boolean(impactPayload.likelyFailureMode);
                    setChatBrainImpactAssessment(
                        message.data?.impactAssessment && hasImpactAssessment ? impactPayload : null
                    );

                    const hasPredictiveSignal =
                        predictivePayload.verifyChecklist.length > 0 ||
                        Boolean(predictivePayload.predictedFailure) ||
                        Boolean(predictivePayload.nextSafeAction);
                    setChatBrainPredictiveWarning(
                        message.data?.predictiveWarning && hasPredictiveSignal
                            ? predictivePayload
                            : null
                    );

                    const hasGateEvidence =
                        gateEvidencePayload.scopeKnown ||
                        gateEvidencePayload.verifyPathPresent ||
                        gateEvidencePayload.rollbackPathPresent ||
                        gateEvidencePayload.confidenceSufficient ||
                        gateEvidencePayload.blockedReasons.length > 0;
                    setChatBrainReleaseGateEvidence(
                        message.data?.releaseGateEvidence && hasGateEvidence
                            ? gateEvidencePayload
                            : null
                    );

                    if (message.data?.board) {
                        setChatBrainBoard(message.data.board as ChatBrainBoard);
                    }
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                }
                case 'aiChatDone':
                    {
                        const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
                        if (
                            isIncidentDuplicateRequest(
                                chatBrainLastDoneRequestIdRef.current,
                                protocolMeta.requestId
                            )
                        ) {
                            break;
                        }
                        chatBrainLastDoneRequestIdRef.current = protocolMeta.requestId;
                    }
                    setChatBrainIsStreaming(false);
                    {
                        const donePayload = normalizeIncidentDonePayload(message.data);
                        if (donePayload.modelId) {
                            setIncidentModelId(donePayload.modelId);
                        }

                        const finalText =
                            typeof donePayload.finalText === 'string' && donePayload.finalText.trim()
                                ? donePayload.finalText
                                : chatBrainStreamTextRef.current;
                        if (finalText.trim()) {
                            setChatBrainHistory((prev) => [
                                ...prev,
                                {
                                    id: chatBrainMessageIdRef.current || `assistant-${Date.now()}`,
                                    role: 'assistant' as const,
                                    text: finalText,
                                    timestamp: Date.now(),
                                },
                            ].slice(-24));
                        }
                    }
                    chatBrainStreamTextRef.current = '';
                    setChatBrainStreamText('');
                    setChatBrainErrorRetryable(true);
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'aiChatPartialFailure': {
                    {
                        const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
                        if (
                            isIncidentDuplicateRequest(
                                chatBrainLastPartialFailureRequestIdRef.current,
                                protocolMeta.requestId
                            )
                        ) {
                            break;
                        }
                        chatBrainLastPartialFailureRequestIdRef.current = protocolMeta.requestId;
                    }

                    const partialFailure = normalizeIncidentPartialFailurePayload(message.data);
                    setChatBrainIsStreaming(false);
                    if (chatBrainStreamTextRef.current.trim()) {
                        setChatBrainHistory((prev) => [
                            ...prev,
                            {
                                id: chatBrainMessageIdRef.current || `assistant-partial-${Date.now()}`,
                                role: 'assistant' as const,
                                text: `${chatBrainStreamTextRef.current}\n\nResponse interrupted before completion.`,
                                timestamp: Date.now(),
                            },
                        ].slice(-24));
                    }
                    chatBrainStreamTextRef.current = '';
                    setChatBrainStreamText('');
                    setChatBrainActionProgress(null);
                    if (message.data?.board) {
                        setChatBrainBoard(message.data.board as ChatBrainBoard);
                    }
                    setChatBrainError(partialFailure.message);
                    setChatBrainErrorRetryable(partialFailure.retryable !== false);
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                }
                case 'aiChatError':
                    {
                        const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
                        if (
                            isIncidentDuplicateRequest(
                                chatBrainLastErrorRequestIdRef.current,
                                protocolMeta.requestId
                            )
                        ) {
                            break;
                        }
                        chatBrainLastErrorRequestIdRef.current = protocolMeta.requestId;
                    }
                    setChatBrainIsStreaming(false);
                    if (chatBrainStreamTextRef.current.trim()) {
                        setChatBrainHistory((prev) => [
                            ...prev,
                            {
                                id: chatBrainMessageIdRef.current || `assistant-partial-${Date.now()}`,
                                role: 'assistant' as const,
                                text: `${chatBrainStreamTextRef.current}\n\nResponse interrupted before completion.`,
                                timestamp: Date.now(),
                            },
                        ].slice(-24));
                    }
                    chatBrainStreamTextRef.current = '';
                    setChatBrainStreamText('');
                    setChatBrainError(
                        typeof message.data?.message === 'string'
                            ? message.data.message
                            : 'Chat Brain request failed.'
                    );
                    setChatBrainErrorRetryable(message.data?.retryable !== false);
                    console.log('[ChatBrain]', message.command, message.data);
                    break;
                case 'runIncidentInlineCommandDone':
                    setChatBrainExecutingCommand(null);
                    if (message.data?.success && message.data?.output) {
                        const outputMessage = `✓ Command completed:\n\`\`\`\n${message.data.output}\n\`\`\``;
                        setChatBrainHistory((prev) => [
                            ...prev,
                            {
                                id: `command-result-${Date.now()}`,
                                role: 'assistant' as const,
                                text: outputMessage,
                                timestamp: Date.now(),
                            },
                        ].slice(-24));
                    } else if (!message.data?.success && message.data?.error) {
                        const errorMessage = `✗ Command failed: ${message.data.error}`;
                        setChatBrainHistory((prev) => [
                            ...prev,
                            {
                                id: `command-error-${Date.now()}`,
                                role: 'assistant' as const,
                                text: errorMessage,
                                timestamp: Date.now(),
                            },
                        ].slice(-24));
                    }
                    console.log('[InlineCommand] Completed:', message.data);
                    break;
                case 'uiPreferences':
                    setIncidentUserMode(normalizeIncidentUserMode(message.data?.incidentUserMode));
                    if (!incidentStudioDisplayModeOverrideRef.current) {
                        setIncidentStudioDisplayMode(
                            normalizeIncidentStudioDisplayMode(message.data?.incidentStudioDisplayMode)
                        );
                    }
                    setIncidentPrimaryCtaExperimentVariant(
                        normalizeIncidentPrimaryCtaExperimentVariant(
                            message.data?.incidentPrimaryCtaExperimentVariant
                        )
                    );
                    setIncidentAutoLearningPrompt(message.data?.incidentAutoLearningPrompt !== false);
                    break;
            }
        };

        window.addEventListener('message', messageHandler);

        // Request initial data
        vscode.postMessage('ready');
        vscode.postMessage('getUiPreferences');
        vscode.postMessage('requestIncidentStudioTelemetry', {
            workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
            projectPath: selectedProjectForAnalysis?.path,
        });

        return () => window.removeEventListener('message', messageHandler);
    }, []);

    useEffect(() => {
        if (showCreateModal) {
            vscode.postMessage('requestWorkspaceToolStatus');
        }
    }, [showCreateModal]);

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

    const handleOpenProjectModal = (framework: AICreateFramework, _kitName?: string) => {
        if (installStatusChecked && !installStatus.coreInstalled) {
            vscode.postMessage('openSetup');
            return;
        }
        // Open AI create modal in project mode with pre-selected framework
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

    const handleOpenManualProjectModal = (framework: AICreateFramework) => {
        if (installStatusChecked && !installStatus.coreInstalled) {
            vscode.postMessage('openSetup');
            return;
        }
        setSelectedFramework(framework);
        setShowProjectModal(true);
    };

    const handleOpenAICreateWorkspace = () => {
        setAICreateMode('workspace');
        setAICreateFramework(undefined);
        setAICreationPlan(null);
        setAICreationError(null);
        setAICreationThinking(false);
        setAICreationCreating(false);
        setAICreationStage(null);
        setAICreateModelId(null);
        setAICreateTargetWorkspaceName(undefined);
        setAICreateTargetWorkspacePath(undefined);
        setShowAICreateModal(true);
    };

    const handleAICreatePromptSubmit = (prompt: string, mode: 'workspace' | 'project', framework?: string) => {
        vscode.postMessage('aiParseCreation', { prompt, mode, framework });
    };

    const handleAICreateConfirm = (plan: AICreationPlan) => {
        vscode.postMessage('aiCreateConfirm', {
            ...plan,
            // Pass the workspace path captured at modal-open time so the backend
            // uses the workspace the user saw in the modal (not the current selection).
            targetWorkspacePath: aiCreateMode === 'project' ? aiCreateTargetWorkspacePath : undefined,
        });
    };

    const handleCreateProject = (projectName: string, framework: AICreateFramework, kitName: string) => {
        console.log('[React Webview] Creating project:', projectName, framework, kitName);
        vscode.postMessage('createProjectWithKit', { name: projectName, framework, kit: kitName });
    };

    const handleOpenInstallModal = (module: ModuleData) => {
        setSelectedModule(module);
        setShowInstallModal(true);
    };

    const handleAIQuery = (mode: 'debug' | 'ask', question: string, ctx: AIModalContext) => {
        const requestId = aiRequestIdRef.current + 1;
        aiRequestIdRef.current = requestId;
        const historyForRequest = [
            ...aiConversationHistory,
            ...(aiStreamContent.trim()
                ? [{ role: 'assistant' as const, content: aiStreamContent }]
                : []),
        ].slice(-8);
        const nextHistory = [...historyForRequest, { role: 'user' as const, content: question }].slice(-8);
        setAIConversationHistory(nextHistory);
        setAIStreamContent('');
        setAIStreamError(null);
        setAIIsStreaming(true);
        setAIModelId(null);
        setAIContextContract(null);
        vscode.postMessage('aiQuery', {
            mode,
            question,
            context: ctx,
            requestId,
            history: historyForRequest,
            modelId: normalizeSelectedModelId(aiSelectedModelId) ?? undefined,
        });
    };

    const handleAICancelQuery = () => {
        vscode.postMessage('aiCancelQuery', { requestId: aiRequestIdRef.current });
    };

    const handleConfirmInstall = () => {
        if (selectedModule) {
            console.log('[React Webview] Installing module:', selectedModule);
            vscode.postMessage('installModule', selectedModule);
            setShowInstallModal(false);
            setSelectedModule(null);
        }
    };

    const runIncidentAction = (command: string, data?: any) => {
        vscode.postMessage(command, data);
        window.setTimeout(() => {
            vscode.postMessage('requestIncidentStudioTelemetry', {
                workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                projectPath: selectedProjectForAnalysis?.path,
            });
        }, 450);
    };

    const refreshIncidentStudio = () => {
        const workspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath;
        if (!workspacePath) {
            return;
        }

        setIsIncidentRefreshing(true);

        const workspaceName =
            selectedWorkspaceForAnalysisObj?.name ||
            workspaceStatus.workspaceName ||
            workspacePath;

        // Refresh model selector from Copilot LM API on each studio refresh.
        vscode.postMessage('aiGetModels');

        // Refresh = restart analysis loop from the current scope (workspace/project)
        bootstrapIncidentStudioForWorkspace(
            workspacePath,
            workspaceName,
            true,
            undefined,
            selectedProjectForAnalysis
        );
    };

    const runIncidentInlineCommand = (command: string) => {
        const workspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath;
        if (!command.trim() || !workspacePath) {
            return;
        }
        setChatBrainExecutingCommand(command);
        vscode.postMessage('runIncidentInlineCommand', {
            command,
            workspacePath,
            workspaceName: activeWorkspaceName,
        });
    };

    const revealArchitectureTarget = (target: {
        path: string;
        label: string;
        kind: 'file' | 'test' | 'node';
        symbolName?: string;
        startLine?: number;
    }) => {
        const workspacePath =
            selectedWorkspaceForAnalysis ||
            workspaceStatus.workspacePath ||
            chatBrainSystemGraphSnapshot?.workspacePath;

        vscode.postMessage('openIncidentNavigatorTarget', {
            ...target,
            workspacePath,
            workspaceName: activeWorkspaceName,
            projectPath: chatBrainSystemGraphSnapshot?.projectPath,
        });
    };

    const bootstrapIncidentStudioForWorkspace = (
        workspacePath: string,
        workspaceName?: string,
        runInitialQuery: boolean = true,
        initialQuery?: string,
        projectSelection?: IncidentProjectSelection | null
    ) => {
        const requestId = `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const conversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const conversationIdToClose = getConversationIdToCloseOnBootstrap(
            chatBrainConversationId,
            conversationId
        );

        if (conversationIdToClose) {
            vscode.postMessage('aiChatClose', { conversationId: conversationIdToClose });
        }

        lastIncidentBootstrapWorkspaceRef.current = workspacePath;
        setSelectedWorkspaceForAnalysis(workspacePath);
        setSelectedProjectForAnalysis(projectSelection || null);
        setChatBrainConversationId(conversationId);
        setChatBrainHistory([]);
        setChatBrainStreamText('');
        chatBrainStreamTextRef.current = '';
        chatBrainMessageIdRef.current = null;
        chatBrainLastDoneRequestIdRef.current = null;
        chatBrainLastActionResultRequestIdRef.current = null;
        chatBrainLastPartialFailureRequestIdRef.current = null;
        chatBrainLastErrorRequestIdRef.current = null;
        setChatBrainSuggestedQuestions([]);
        setChatBrainBoard(null);
        setChatBrainActionProgress(null);
        setChatBrainActionResult(null);
        setChatBrainSystemGraphSnapshot(null);
        setChatBrainImpactAssessment(null);
        setChatBrainPredictiveWarning(null);
        setChatBrainReleaseGateEvidence(null);
        setChatBrainError(null);
        setChatBrainErrorRetryable(true);
        setChatBrainIsStreaming(false);
        setIncidentModelId(null);
        setIncidentResume(null);

        window.setTimeout(() => {
            vscode.postMessage('getUiPreferences', { workspacePath });
            vscode.postMessage('requestIncidentStudioTelemetry', {
                workspacePath,
                projectPath: projectSelection?.path,
            });
            vscode.postMessage(
                'aiChatStart',
                buildIncidentChatStartPayload({
                    workspacePath,
                    requestId,
                    resumeConversationId: conversationId,
                    projectSelection,
                })
            );
            vscode.postMessage(
                'aiChatSyncWorkspace',
                buildIncidentChatSyncWorkspacePayload({ workspacePath, requestId })
            );

            if (runInitialQuery) {
                vscode.postMessage(
                    'aiChatQuery',
                    buildIncidentChatQueryPayload({
                        conversationId,
                        workspacePath,
                        requestId,
                        modelId: normalizeSelectedModelId(incidentSelectedModelId) ?? undefined,
                        projectSelection,
                        message:
                            initialQuery ||
                            `Analyze workspace ${workspaceName || workspacePath} and surface top incident risks with one recommended next action.`,
                    })
                );
            }
        }, 100);
    };

    const handleAnalyzeWorkspace = (workspace: Workspace) => {
        // Switch to incident studio tab and bootstrap full workspace-aware session
        setActiveView('incident-studio');
        bootstrapIncidentStudioForWorkspace(workspace.path, workspace.name, true, undefined, null);
    };

    const handleRunAnalyze = () => {
        const workspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath;
        const workspaceName = activeWorkspaceName || undefined;

        if (!workspacePath) {
            console.warn('Select or open a workspace before running analyze.');
            return;
        }

        setIsAnalyzeLoading(true);
        setAnalyzeReportError(null);
        vscode.postMessage('runAnalyze', { workspacePath, workspaceName });
    };

    useEffect(() => {
        if (activeView !== 'incident-studio') {
            return;
        }

        vscode.postMessage('aiGetModels');

        const workspacePath = workspaceStatus.workspacePath;
        if (!workspacePath) {
            return;
        }

        if (lastIncidentBootstrapWorkspaceRef.current === workspacePath) {
            return;
        }

        const workspaceName =
            recentWorkspaces.find((workspace) => workspace.path === workspacePath)?.name ||
            workspaceStatus.workspaceName ||
            workspacePath;

        lastIncidentBootstrapWorkspaceRef.current = workspacePath;
        bootstrapIncidentStudioForWorkspace(workspacePath, workspaceName, true);
    }, [activeView, recentWorkspaces, workspaceStatus.workspaceName, workspaceStatus.workspacePath]);

    useEffect(() => {
        const workspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath;
        if (activeView !== 'incident-studio' || !workspacePath) {
            return;
        }

        setIsAnalyzeLoading(true);
        vscode.postMessage('checkReportExists', { workspacePath });
        vscode.postMessage('loadReport', { workspacePath, workspaceName: activeWorkspaceName });
    }, [activeView, selectedWorkspaceForAnalysis, workspaceStatus.workspacePath, activeWorkspaceName]);

    const handleChatBrainQuery = (query: string) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return;
        }

        const workspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath;
        if (!workspacePath) {
            setChatBrainError('Select or open a workspace before sending an Incident Studio query.');
            setChatBrainErrorRetryable(false);
            return;
        }

        if (!selectedWorkspaceForAnalysis) {
            setSelectedWorkspaceForAnalysis(workspacePath);
        }

        const conversationId = chatBrainConversationId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        if (!chatBrainConversationId) {
            setChatBrainConversationId(conversationId);
            vscode.postMessage(
                'aiChatStart',
                buildIncidentChatStartPayload({
                    workspacePath,
                    projectSelection: selectedProjectForAnalysis,
                    resumeConversationId: conversationId,
                    requestId: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                })
            );
        }
        setChatBrainIsStreaming(true);
        setChatBrainError(null);
        setChatBrainErrorRetryable(true);
        setChatBrainActionProgress(null);
        setChatBrainActionResult(null);
        setChatBrainSystemGraphSnapshot(null);
        setChatBrainImpactAssessment(null);
        setChatBrainPredictiveWarning(null);
        setChatBrainReleaseGateEvidence(null);
        setChatBrainBoard(null);
        setChatBrainSuggestedQuestions([]);
        setChatBrainHistory((prev) => [
            ...prev,
            {
                id: `user-${Date.now()}`,
                role: 'user' as const,
                text: trimmedQuery,
                timestamp: Date.now(),
            },
        ].slice(-24));
        vscode.postMessage(
            'aiChatQuery',
            buildIncidentChatQueryPayload({
                conversationId,
                workspacePath,
                projectSelection: selectedProjectForAnalysis,
                requestId: `cbq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                modelId: normalizeSelectedModelId(incidentSelectedModelId) ?? undefined,
                message: trimmedQuery,
            })
        );
    };

    const handleChatBrainExecuteAction = (actionType: string, actionId?: string) => {
        if (!chatBrainConversationId || !actionType) {
            return;
        }
        setChatBrainActionProgress({ stage: 'running', progress: 10, note: `Executing ${actionType}` });
        setChatBrainActionResult(null);
        setChatBrainSystemGraphSnapshot(null);
        setChatBrainImpactAssessment(null);
        setChatBrainPredictiveWarning(null);
        setChatBrainReleaseGateEvidence(null);
        setChatBrainError(null);
        setChatBrainErrorRetryable(true);
        vscode.postMessage(
            'aiChatExecuteAction',
            buildIncidentChatExecuteActionPayload({
                conversationId: chatBrainConversationId,
                actionId: actionId || `action-${Date.now()}`,
                actionType,
                workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                projectSelection: selectedProjectForAnalysis,
                modelId: normalizeSelectedModelId(incidentSelectedModelId) ?? undefined,
                requestId: `cba-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            })
        );
    };

    const handlePredictiveWarningAccepted = (warningId: string, predictionKey: string) => {
        const workspacePath = selectedWorkspaceForAnalysis || workspaceStatus.workspacePath;
        if (!workspacePath || !chatBrainConversationId) {
            return;
        }

        vscode.postMessage('incidentPredictionAccepted', {
            conversationId: chatBrainConversationId,
            workspacePath,
            projectPath: selectedProjectForAnalysis?.path,
            warningId,
            predictionKey,
        });
    };

    const handleExportIncidentReproPack = (
        reproPack: NonNullable<NormalizedIncidentActionResultPayload['incidentReproPack']>
    ) => {
        const workspacePath =
            selectedWorkspaceForAnalysis || workspaceStatus.workspacePath || reproPack.workspacePath;
        vscode.postMessage('exportIncidentReproPack', {
            incidentReproPack: reproPack,
            memoryInfluenceAuditTimeline: chatBrainActionResult?.memoryInfluenceAuditTimeline,
            workspacePath,
            projectPath: selectedProjectForAnalysis?.path,
        });
    };

    const handleImportIncidentReproPack = () => {
        vscode.postMessage('importIncidentReproPack');
    };

    const handleExportSandboxSimulationEvidence = (
        sandboxSimulation: NonNullable<NormalizedIncidentActionResultPayload['sandboxSimulation']>
    ) => {
        const workspacePath =
            selectedWorkspaceForAnalysis || workspaceStatus.workspacePath || sandboxSimulation.workspacePath;
        vscode.postMessage('exportSandboxSimulationEvidence', {
            sandboxSimulation,
            workspacePath,
        });
    };

    const handleExportReleaseReadinessCommander = (
        releaseReadinessCommander: NonNullable<
            NormalizedIncidentActionResultPayload['releaseReadinessCommander']
        >
    ) => {
        const workspacePath =
            selectedWorkspaceForAnalysis ||
            workspaceStatus.workspacePath ||
            releaseReadinessCommander.workspacePath;
        vscode.postMessage('exportReleaseReadinessCommander', {
            releaseReadinessCommander,
            workspacePath,
        });
    };

    useEffect(() => {
        return () => {
            if (chatBrainConversationId) {
                vscode.postMessage('aiChatClose', { conversationId: chatBrainConversationId });
            }
        };
    }, [chatBrainConversationId]);

    useEffect(() => {
        const conversationIdToClose = getConversationIdToCloseOnViewExit(
            activeView,
            chatBrainConversationId
        );

        if (!conversationIdToClose) {
            return;
        }

        vscode.postMessage('aiChatClose', { conversationId: conversationIdToClose });
        setChatBrainConversationId(null);
    }, [activeView, chatBrainConversationId]);

    useEffect(() => {
        if (activeView !== 'dashboard') {
            setDashboardTemplatesReady(false);
            setDashboardModulesReady(false);
            return;
        }

        dashboardMountedAtRef.current =
            typeof performance !== 'undefined' ? performance.now() : Date.now();
        setDashboardTemplatesReady(false);
        setDashboardModulesReady(false);
        const scheduleIdle = window.requestIdleCallback ?? ((callback) => window.setTimeout(callback, 80));
        const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
        const templatesHandle = scheduleIdle(() => setDashboardTemplatesReady(true));
        const modulesHandle = window.setTimeout(() => {
            scheduleIdle(() => setDashboardModulesReady(true));
        }, 140);

        return () => {
            cancelIdle(templatesHandle);
            window.clearTimeout(modulesHandle);
        };
    }, [activeView]);

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

    return (
        <div className={`container`}>
            <Header version={version} />

            <div className="workspai-view-tabs" role="tablist" aria-label="Workspai views">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'dashboard'}
                    className={`workspai-view-tab ${activeView === 'dashboard' ? 'is-active' : ''}`}
                    onClick={() => {
                        if (activeView === 'incident-studio') {
                            vscode.postMessage('openDashboardTab');
                            return;
                        }
                        setActiveView('dashboard');
                    }}
                >
                    <span className="workspai-view-tab-content">
                        <LayoutDashboard size={13} aria-hidden="true" />
                        <span>Dashboard</span>
                    </span>
                </button>
                <button
                    type="button"
                    className="workspai-view-tab"
                    onClick={() => vscode.postMessage('openSetup')}
                >
                    <span className="workspai-view-tab-content">
                        <Wrench size={13} aria-hidden="true" />
                        <span>Setup & Installation</span>
                    </span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'incident-studio'}
                    className={`workspai-view-tab ${activeView === 'incident-studio' ? 'is-active' : ''}`}
                    onClick={() => {
                        if (activeView === 'dashboard') {
                            vscode.postMessage('openIncidentStudioTab', {
                                workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                                workspaceName: activeWorkspaceName,
                                projectPath: selectedProjectForAnalysis?.path,
                                projectName: selectedProjectForAnalysis?.name,
                                projectType: selectedProjectForAnalysis?.type,
                                preferredDisplayMode: incidentStudioDisplayMode,
                                preferredArchitectureLensView: incidentArchitectureLensViewOverride || undefined,
                            });
                            return;
                        }
                        setActiveView('incident-studio');
                    }}
                >
                    <span className="workspai-view-tab-content">
                        <Sparkles size={13} aria-hidden="true" />
                        <span>WorkspAi Incident Studio</span>
                    </span>
                </button>
            </div>

            {activeView === 'dashboard' ? (
                <>
                    {importedWorkspaceShare ? (
                        <section
                            style={{
                                border: '1px solid var(--vscode-panel-border)',
                                borderRadius: '10px',
                                padding: '12px',
                                marginBottom: '12px',
                                background: 'var(--vscode-editor-inactiveSelectionBackground)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '13px' }}>Imported Share Bundle</h3>
                                <button
                                    type="button"
                                    onClick={() => setImportedWorkspaceShare(null)}
                                    style={{
                                        border: '1px solid var(--vscode-panel-border)',
                                        background: 'var(--vscode-editor-background)',
                                        color: 'var(--vscode-foreground)',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                    }}
                                >
                                    Dismiss
                                </button>
                            </div>
                            <p style={{ margin: '8px 0 4px 0', fontSize: '12px' }}>
                                <strong>{importedWorkspaceShare.workspaceName}</strong>
                                {importedWorkspaceShare.workspaceProfile ? ` (${importedWorkspaceShare.workspaceProfile})` : ''}
                                {' · '}
                                {importedWorkspaceShare.projectCount} projects
                                {' · schema '}
                                {importedWorkspaceShare.schemaVersion}
                            </p>
                            <p style={{ margin: '0 0 4px 0', fontSize: '12px' }}>
                                Runtimes: {importedWorkspaceShare.runtimes.length > 0 ? importedWorkspaceShare.runtimes.join(', ') : 'unknown'}
                            </p>
                            <p style={{ margin: 0, fontSize: '12px' }}>
                                Health totals: {importedWorkspaceShare.healthTotals.passed} passed, {importedWorkspaceShare.healthTotals.warnings} warnings, {importedWorkspaceShare.healthTotals.errors} errors
                            </p>
                        </section>
                    ) : null}

                    <WorkspaceOverview
                        workspaceName={activeWorkspaceName}
                        workspaceProfile={activeWorkspaceProfile}
                        workspaceStatus={workspaceStatus}
                        moduleCount={modulesCatalog.length}
                        templateCount={exampleWorkspaces.length}
                        recentWorkspaceCount={recentWorkspaces.length}
                        modules={modulesCatalog}
                        isCreatingWorkspace={isCreatingWorkspace}
                        onCreateWorkspace={handleOpenAICreateWorkspace}
                        onImportWorkspace={() => vscode.postMessage('importWorkspace')}
                    />

                    <EnterpriseDashboardFlow
                        workspaceName={activeWorkspaceName}
                        workspaceProfile={activeWorkspaceProfile}
                        workspaceStatus={workspaceStatus}
                        selectedFramework={selectedFramework}
                        onSelectFramework={setSelectedFramework}
                        onOpenProjectBuilder={handleOpenProjectModal}
                        onOpenManualProject={handleOpenManualProjectModal}
                        onRunFixPreview={() => runIncidentAction('aiFixPreviewLite')}
                        onRunChangeImpact={() => runIncidentAction('aiChangeImpactLite')}
                        onRunTerminalBridge={() => runIncidentAction('aiTerminalBridge')}
                        onOpenIncidentStudio={() => {
                            vscode.postMessage('openIncidentStudioTab', {
                                workspacePath: workspaceStatus.workspacePath,
                                workspaceName: activeWorkspaceName,
                                projectPath: selectedProjectForAnalysis?.path,
                                projectName: selectedProjectForAnalysis?.name,
                                projectType: selectedProjectForAnalysis?.type,
                            });
                        }}
                    />

                    <RecentWorkspaces
                        workspaces={recentWorkspaces}
                        isRefreshing={isRefreshingWorkspaces}
                        onRefresh={() => { setIsRefreshingWorkspaces(true); vscode.postMessage('refreshWorkspaces'); }}
                        onSelect={(workspace) => vscode.postMessage('openWorkspaceFolder', { path: workspace.path })}
                        onRemove={(workspace) => vscode.postMessage('removeWorkspace', { path: workspace.path })}
                        onUpgrade={(workspace) => vscode.postMessage('upgradeCore', { path: workspace.path, version: workspace.coreLatestVersion })}
                        onCheckHealth={(workspace) => vscode.postMessage('checkWorkspaceHealth', { path: workspace.path })}
                        onExport={(workspace) => vscode.postMessage('exportWorkspace', { path: workspace.path })}
                        onAI={(workspace) => vscode.postMessage('aiForWorkspace', { workspacePath: workspace.path, workspaceName: workspace.name })}
                        onAnalyze={handleAnalyzeWorkspace}
                    />

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
                                <ModuleBrowser
                                    modules={modulesCatalog}
                                    workspaceStatus={workspaceStatus}
                                    categoryInfo={categoryInfo}
                                    onRefresh={() => vscode.postMessage('refreshModules')}
                                    onInstall={handleOpenInstallModal}
                                    onShowDetails={(module) => vscode.postMessage('showModuleDetails', module)}
                                    onAI={(module) => vscode.postMessage('aiForModule', { moduleId: module.id, moduleName: module.display_name || module.name, moduleSlug: module.slug })}
                                    onProjectTerminal={() => vscode.postMessage('projectTerminal')}
                                    onProjectInit={() => vscode.postMessage('projectInit')}
                                    onProjectDev={() => vscode.postMessage('projectDev')}
                                    onProjectStop={() => vscode.postMessage('projectStop')}
                                    onProjectTest={() => vscode.postMessage('projectTest')}
                                    onProjectDoctor={() => vscode.postMessage('projectDoctor')}
                                    onProjectArchitecture={() => vscode.postMessage('projectArchitecture')}
                                    onProjectIncident={() => vscode.postMessage('projectIncident')}
                                    onProjectAI={() => vscode.postMessage('projectAI')}
                                    onProjectRelease={() => vscode.postMessage('projectRelease')}
                                    onProjectImpact={() => vscode.postMessage('projectImpact')}
                                    onProjectBrowser={() => vscode.postMessage('projectBrowser')}
                                    onProjectBuild={() => vscode.postMessage('projectBuild')}
                                    modulesDisabled={
                                        workspaceStatus.projectType === 'go' || workspaceStatus.projectType === 'springboot' || workspaceStatus.projectType === 'dotnet'
                                    }
                                />
                            ) : (
                                <section
                                    className="catalog-loading-shell catalog-loading-shell--modules"
                                    aria-live="polite"
                                    aria-label="Preparing module catalog"
                                >
                                    <div className="catalog-loading-header">
                                        <span>Preparing module catalog</span>
                                        <small>Package manager surface</small>
                                    </div>
                                    <div className="catalog-skeleton-grid">
                                        {Array.from({ length: 4 }).map((_, index) => (
                                            <span key={index} className="catalog-skeleton-card" />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </>
                    ) : (
                        <section
                            className="catalog-loading-shell catalog-loading-shell--templates"
                            aria-live="polite"
                            aria-label="Loading workspace catalogs"
                        >
                            <div className="catalog-loading-header">
                                <span>Loading workspace catalogs</span>
                                <small>Templates, examples, and module inventory</small>
                            </div>
                            <div className="catalog-skeleton-grid catalog-skeleton-grid--templates">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <span key={index} className="catalog-skeleton-card" />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            ) : (
                <>
                    <AIIncidentStudio
                        workspaceName={activeWorkspaceName}
                        analysisScopeType={analysisScopeType}
                        analysisScopeLabel={analysisScopeLabel}
                        analysisScopePath={analysisScopePath}
                        analysisWorkspacePath={analysisWorkspacePath}
                        analysisProjectPath={analysisProjectPath}
                        modelId={incidentModelId || incidentSelectedModelId}
                        availableModels={aiAvailableModels}
                        selectedModelId={incidentSelectedModelId}
                        onModelChange={(modelId) =>
                            setIncidentSelectedModelId(normalizeSelectedModelId(modelId))
                        }
                        autoLearningEnabled={incidentAutoLearningPrompt}
                        onToggleAutoLearning={updateIncidentAutoLearningPrompt}
                        isRefreshing={isIncidentRefreshing}
                        onRefreshData={refreshIncidentStudio}
                        refreshLabel={incidentRefreshLabel}
                        isAnalyzing={aiIsStreaming || chatBrainIsStreaming}
                        lastError={chatBrainError || aiStreamError}
                        conversationTurns={chatBrainHistory.length}
                        telemetry={incidentTelemetry}
                        chatBrainStreamText={chatBrainStreamText}
                        chatBrainHistory={chatBrainHistory}
                        chatBrainSuggestedQuestions={chatBrainSuggestedQuestions}
                        chatBrainBoard={chatBrainBoard}
                        chatBrainActionProgress={chatBrainActionProgress}
                        chatBrainActionResult={chatBrainActionResult}
                        chatBrainSystemGraphSnapshot={chatBrainSystemGraphSnapshot}
                        chatBrainImpactAssessment={chatBrainImpactAssessment}
                        chatBrainPredictiveWarning={chatBrainPredictiveWarning}
                        chatBrainReleaseGateEvidence={chatBrainReleaseGateEvidence}
                        chatBrainError={chatBrainError}
                        chatBrainErrorRetryable={chatBrainErrorRetryable}
                        incidentResume={incidentResume}
                        onChatBrainQuery={handleChatBrainQuery}
                        onChatBrainExecuteAction={handleChatBrainExecuteAction}
                        onRunTerminalBridge={() => runIncidentAction('aiTerminalBridge')}
                        onRunFixPreview={() => runIncidentAction('aiFixPreviewLite')}
                        onRunChangeImpact={() => runIncidentAction('aiChangeImpactLite')}
                        onRunMemoryWizard={() => runIncidentAction('aiWorkspaceMemoryWizard')}
                        onRunDoctorChecks={() => runIncidentAction('runDoctorChecks', {
                            workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                            workspaceName: activeWorkspaceName,
                            projectPath: selectedProjectForAnalysis?.path,
                            projectName: selectedProjectForAnalysis?.name,
                        })}
                        onRunDoctorFix={() => runIncidentAction('runDoctorFix', {
                            workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                            workspaceName: activeWorkspaceName,
                            projectPath: selectedProjectForAnalysis?.path,
                            projectName: selectedProjectForAnalysis?.name,
                        })}
                        onViewComplianceReport={() => runIncidentAction('viewComplianceReport', {
                            workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                            workspaceName: activeWorkspaceName,
                        })}
                        onViewProjectDoctorReport={() => runIncidentAction('viewProjectDoctorReport', {
                            workspacePath: selectedWorkspaceForAnalysis || workspaceStatus.workspacePath,
                            workspaceName: activeWorkspaceName,
                            projectPath: selectedProjectForAnalysis?.path,
                            projectName: selectedProjectForAnalysis?.name,
                        })}
                        onRunAnalyze={handleRunAnalyze}
                        analyzeReport={analyzeReport}
                        analyzeReportError={analyzeReportError}
                        analyzeReportExists={analyzeReportExists}
                        isAnalyzeLoading={isAnalyzeLoading}
                        onRunInlineCommand={runIncidentInlineCommand}
                        onRevealArchitectureTarget={revealArchitectureTarget}
                        onPredictiveWarningAccepted={handlePredictiveWarningAccepted}
                        onExportIncidentReproPack={handleExportIncidentReproPack}
                        onExportSandboxSimulationEvidence={handleExportSandboxSimulationEvidence}
                        onExportReleaseReadinessCommander={handleExportReleaseReadinessCommander}
                        onImportIncidentReproPack={handleImportIncidentReproPack}
                        executingCommand={chatBrainExecutingCommand}
                        primaryCtaMode={incidentPrimaryCtaMode}
                        studioDisplayMode={incidentStudioDisplayMode}
                        preferredArchitectureLensView={incidentArchitectureLensViewOverride}
                        userMode={incidentUserMode}
                        onUserModeChange={updateIncidentUserMode}
                        onStudioDisplayModeChange={updateIncidentStudioDisplayMode}
                        hasProjectSelected={Boolean(
                            selectedProjectForAnalysis?.path || workspaceStatus.hasProjectSelected
                        )}
                    />
                </>
            )}

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
            <AIModal
                isOpen={showAIModal}
                context={aiModalContext}
                isStreaming={aiIsStreaming}
                streamContent={aiStreamContent}
                streamError={aiStreamError}
                modelId={aiModelId}
                availableModels={aiAvailableModels}
                selectedModelId={aiSelectedModelId}
                contextContract={aiContextContract}
                onModelChange={(modelId) =>
                    setAISelectedModelId(normalizeSelectedModelId(modelId))
                }
                onClose={() => {
                    if (!aiIsStreaming) {
                        aiRequestIdRef.current = 0;
                        setShowAIModal(false);
                        setAIStreamContent('');
                        setAIStreamError(null);
                        setAIModelId(null);
                        setAIContextContract(null);
                        setAIConversationHistory([]);
                    }
                }}
                onCancel={handleAICancelQuery}
                onQuery={handleAIQuery}
            />
            <Footer />
        </div>
    );
}
