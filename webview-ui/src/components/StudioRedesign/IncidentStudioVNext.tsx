/**
 * IncidentStudioVNext: Main wrapper component
 * 3-column fullscreen layout: TopBar | PhaseStepper | ActivityBar + Sidebar + ContextPanel + ChatSurface (flex)
 * Input is fixed at bottom of chat, messages scroll independently.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef, type MutableRefObject } from 'react';
import {
    createInitialState,
    IncidentStudioState,
    IncidentPhase,
    UserMode,
    ChatMessage,
    ActionItem,
    AIActionContractView,
    AIActionRegistryView,
    StudioActionStatus,
    canTransitionToPhase,
    StudioExecutionTranscript,
    StudioProofEvent,
} from './state/studioState';
import { studioClass } from './styles/studioUi';
import { useWorkspaiThemeKind } from '@/components/WorkspaiThemeProvider';
import { ErrorBoundary } from './ErrorBoundary';
import { MissionControlHeader } from './regions/MissionControlHeader';
import { PhaseStepper } from './regions/PhaseStepper';
import { ActivityBar } from './regions/ActivityBar';
import { WorkspaceSidebar } from './regions/WorkspaceSidebar';
import { ContextPanel } from './regions/ContextPanel';
import { ChatSurface } from './regions/ChatSurface';
import { STUDIO_ACTION_COMMANDS } from './state/studioActions';
import type {
    IncidentReproPackEvidence,
    IncidentStudioStabilizationKpiStatus,
    NormalizedIncidentActionResultPayload,
} from '../../lib/incidentStudioPayload';
import type { IncidentStudioDisplayMode } from '../../lib/incidentStudioPreferences';
import { resolveLiteReleaseStateFromStudioContext } from '../../lib/incidentStudioLiteMode';
import { StudioApprovalAuditEvent } from './state/studioActionAudit';
import {
  mergePolicyGatesFromTelemetry,
  type IncidentStudioTelemetryGateSlice,
} from '../../lib/incidentStudioPolicyGateMapper';
import { deriveEnterpriseStabilizationLoopView } from '../../lib/incidentStudioStabilizationLoop';
import {
  deriveEnterpriseShipLoopView,
  type ShipLoopEvidenceCard,
  type ShipLoopStepId,
} from '../../lib/incidentStudioShipLoop';
import { resolvePhaseShipGuidance } from '../../lib/incidentStudioPhaseShipGuidance';
import { deriveEnterpriseObservabilityView } from '../../lib/incidentStudioObservabilityView';
import {
  buildReportBackedStateRevision,
  mergeReportBackedStudioState,
} from '../../lib/incidentStudioReportStateSync';
import { resolveStudioMutationBlockReason } from '../../lib/incidentStudioMutationGate';
import {
  useIncidentStudioSessionPersistence,
} from '../../lib/incidentStudioSessionPersistence';
import type { IncidentReleaseReadinessCommanderArtifact } from '../../lib/incidentStudioPayload';
import type { IncidentStudioChatBrainBoard } from '../../lib/incidentStudioChatBrainSession';
import type { StudioCodeChangeActionPayload } from '../../lib/incidentStudioCodeChangeActions';

interface IncidentStudioVNextProps {
    onSendMessage?: (message: string) => string | void | Promise<string | void>;
    initialState?: Partial<IncidentStudioState>;
    incomingMessage?: ChatMessage | null;
    incomingActionContract?: AIActionContractView | null;
    incomingActionRegistry?: AIActionRegistryView | null;
    incomingActionStatus?: StudioActionStatus | null;
    onAIActionCommand?: (operation: 'apply' | 'verify' | 'rollback') => void;
    onRevealEvidence?: (path: string) => void;
    onCopyText?: (text: string) => void;
    showDemoScenario?: boolean;
    incomingActionResult?: NormalizedIncidentActionResultPayload | null;
    verifyGateBlockedReasons?: string[];
    stabilizationKpiStatus?: IncidentStudioStabilizationKpiStatus | null;
    onExportIncidentReproPack?: (reproPack: IncidentReproPackEvidence) => void;
    onExportReleaseReadiness?: (releaseReadiness: IncidentReleaseReadinessCommanderArtifact) => void;
    onImportIncidentReproPack?: () => void;
    onReplayIncidentQuery?: (query: string) => void;
    onApplyMultiFilePatch?: (
        patchId: string,
        acceptedPaths: string[],
        branchSafeApply: boolean,
    ) => void;
    guidedPrimaryBoardAction?: {
        label: string;
        command?: string;
        actionType?: string;
        actionId?: string;
    } | null;
    chatBrainBoard?: IncidentStudioChatBrainBoard | null;
    onExecuteChatBrainAction?: (
        actionType: string,
        actionId?: string,
        payload?: StudioCodeChangeActionPayload,
        userMessage?: string,
    ) => void;
    onRunGuidedCommand?: (command: string) => void;
    onRunCliSurfaceAction?: (entry: { command: string; cliActionId: string }) => void;
    executingCliCommand?: string | null;
    hasProjectSelected?: boolean;
    preferredUserMode?: UserMode;
    onUserModeChange?: (mode: UserMode) => void;
    studioDisplayMode?: IncidentStudioDisplayMode;
    onStudioDisplayModeChange?: (mode: IncidentStudioDisplayMode) => void;
    telemetryRefreshLabel?: string | null;
    isTelemetryRefreshing?: boolean;
    onTelemetryRefresh?: () => void;
    /** When rendered inside Dashboard tab — fills host, hides duplicate chrome */
    embedded?: boolean;
    incomingTelemetry?: IncidentStudioTelemetryGateSlice | null;
    /** Unified chat brain streaming — partial assistant text while host streams */
    streamAssistantText?: string;
    /** Host-managed streaming flag for chat brain parity */
    externalIsStreaming?: boolean;
    /** When true, AI chat uses fire-and-forget chat brain instead of blocking studioMessage */
    chatBrainStreamingEnabled?: boolean;
    shipEvidence?: { cards?: ShipLoopEvidenceCard[] } | null;
    executingShipLoopStepId?: ShipLoopStepId | null;
    onRunShipLoopStep?: (stepId: ShipLoopStepId) => void;
    canRunShipLoopStep?: (stepId: ShipLoopStepId) => boolean;
    workspacePath?: string;
    sessionPostMessage?: (command: string, data?: unknown) => void;
    sessionHostMessageHandlerRef?: MutableRefObject<
        ((command: string, data?: unknown) => boolean) | null
    >;
    onScopeChange?: (scope: 'workspace' | 'project') => void;
    analysisScopeNotice?: import('@/lib/incidentStudioAnalysisScope').AnalysisScopeNotice | null;
    selectedProjectPath?: string | null;
    selectedProjectName?: string;
    availableProjects?: import('@/lib/incidentStudioAnalysisScope').WorkspaceProjectOption[];
    onSelectAnalysisProject?: (
        project: import('@/lib/incidentStudioAnalysisScope').WorkspaceProjectOption
    ) => void;
    onDismissScopeNotice?: () => void;
    chatBrainError?: string | null;
    chatBrainErrorRetryable?: boolean;
    onDismissChatBrainError?: () => void;
    availableModels?: Array<{ id: string; name: string; vendor: string }>;
    selectedModelId?: string | null;
    preferredModelId?: string;
    modelsLoading?: boolean;
    onModelChange?: (modelId: string | null) => void;
}

export const IncidentStudioVNext: React.FC<IncidentStudioVNextProps> = ({
    onSendMessage,
    initialState,
    incomingMessage,
    incomingActionContract,
    incomingActionRegistry,
    incomingActionStatus,
    onAIActionCommand,
    onRevealEvidence,
    onCopyText,
    showDemoScenario = false,
    incomingActionResult = null,
    verifyGateBlockedReasons = [],
    stabilizationKpiStatus = null,
    onExportIncidentReproPack,
    onExportReleaseReadiness,
    onImportIncidentReproPack,
    onReplayIncidentQuery,
    onApplyMultiFilePatch,
    guidedPrimaryBoardAction = null,
    chatBrainBoard = null,
    onExecuteChatBrainAction,
    onRunGuidedCommand,
    onRunCliSurfaceAction,
    executingCliCommand = null,
    hasProjectSelected = false,
    analysisScopeNotice = null,
    selectedProjectPath = null,
    selectedProjectName,
    availableProjects = [],
    onSelectAnalysisProject,
    onDismissScopeNotice,
    preferredUserMode,
    onUserModeChange,
    studioDisplayMode = 'full',
    onStudioDisplayModeChange,
    telemetryRefreshLabel = null,
    isTelemetryRefreshing = false,
    onTelemetryRefresh,
    embedded = false,
    incomingTelemetry = null,
    streamAssistantText = '',
    externalIsStreaming = false,
    chatBrainStreamingEnabled = false,
    shipEvidence = null,
    executingShipLoopStepId = null,
    onRunShipLoopStep,
    canRunShipLoopStep,
    workspacePath = '',
    sessionPostMessage,
    sessionHostMessageHandlerRef,
    onScopeChange,
    chatBrainError = null,
    chatBrainErrorRetryable = true,
    onDismissChatBrainError,
    availableModels = [],
    selectedModelId = null,
    preferredModelId = 'auto',
    modelsLoading = false,
    onModelChange,
}) => {
    const actionOutcomeCallbacks = useMemo(
        () =>
            onExportIncidentReproPack ||
            onImportIncidentReproPack ||
            onReplayIncidentQuery ||
            onApplyMultiFilePatch
                ? {
                      onExportReproPack: onExportIncidentReproPack,
                      onImportReproPack: onImportIncidentReproPack,
                      onReplayReproPack: onReplayIncidentQuery,
                      onApplyPatch: onApplyMultiFilePatch,
                  }
                : undefined,
        [
            onApplyMultiFilePatch,
            onExportIncidentReproPack,
            onImportIncidentReproPack,
            onReplayIncidentQuery,
        ],
    );

    const learnExportArchive = useMemo(
        () =>
            onExportIncidentReproPack || onExportReleaseReadiness
                ? {
                      onExportReproPack: onExportIncidentReproPack,
                      onExportReleaseReadiness: onExportReleaseReadiness,
                  }
                : undefined,
        [onExportIncidentReproPack, onExportReleaseReadiness],
    );

    const [state, setState] = useState<IncidentStudioState>(
        createInitialState(initialState),
    );
    const reportBackedRevisionRef = useRef('');
    const [approvalAuditEvents, setApprovalAuditEvents] = useState<StudioApprovalAuditEvent[]>([]);
    const [proofEvents, setProofEvents] = useState<StudioProofEvent[]>([]);
    const [executionTranscripts, setExecutionTranscripts] = useState<StudioExecutionTranscript[]>([]);
    const sessionLoadedRef = useRef(false);
    const sessionPersistence = useIncidentStudioSessionPersistence({
        workspacePath,
        postMessage: sessionPostMessage ?? (() => undefined),
        messages: state.messages,
        approvalAuditEvents,
        proofEvents,
        executionTranscripts,
    });

    useEffect(() => {
        if (!sessionPersistence.loadedSession || sessionLoadedRef.current) {
            return;
        }
        sessionLoadedRef.current = true;
        setState((prev) => ({
            ...prev,
            messages:
                sessionPersistence.loadedSession!.messages.length > 0
                    ? sessionPersistence.loadedSession!.messages
                    : prev.messages,
        }));
        if (sessionPersistence.loadedSession.approvalAuditEvents.length > 0) {
            setApprovalAuditEvents(sessionPersistence.loadedSession.approvalAuditEvents);
        }
        if (sessionPersistence.loadedSession.proofEvents.length > 0) {
            setProofEvents(sessionPersistence.loadedSession.proofEvents);
        }
        if (sessionPersistence.loadedSession.executionTranscripts.length > 0) {
            setExecutionTranscripts(sessionPersistence.loadedSession.executionTranscripts);
        }
    }, [sessionPersistence.loadedSession]);

    useEffect(() => {
        if (!initialState) {
            return;
        }
        const revision = buildReportBackedStateRevision(initialState);
        if (!revision || revision === reportBackedRevisionRef.current) {
            return;
        }
        reportBackedRevisionRef.current = revision;
        setState((prev) =>
            mergeReportBackedStudioState(prev, initialState, {
                preserveConversation: sessionLoadedRef.current || prev.messages.length > 0,
            })
        );
    }, [initialState]);

    useEffect(() => {
        if (!initialState?.scopeType || initialState.scopeType === state.scopeType) {
            return;
        }
        setState((prev) => ({ ...prev, scopeType: initialState.scopeType! }));
    }, [initialState?.scopeType, state.scopeType]);

    if (sessionHostMessageHandlerRef) {
        sessionHostMessageHandlerRef.current = sessionPersistence.handleHostMessage;
    }

    useEffect(() => {
        if (!sessionHostMessageHandlerRef) {
            return;
        }
        return () => {
            sessionHostMessageHandlerRef.current = null;
        };
    }, [sessionHostMessageHandlerRef, sessionPersistence.handleHostMessage]);

    const [viewportWidth, setViewportWidth] = useState<number>(
        typeof window !== 'undefined' ? window.innerWidth : 1366,
    );
    const studioThemeKind = useWorkspaiThemeKind();
    const phaseTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const incomingMessageIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);

        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        return () => {
            if (phaseTransitionTimeoutRef.current) {
                clearTimeout(phaseTransitionTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!incomingMessage || incomingMessageIdsRef.current.has(incomingMessage.id)) {
            return;
        }
        incomingMessageIdsRef.current.add(incomingMessage.id);
        setState((prev) => ({
            ...prev,
            messages: [...prev.messages, incomingMessage],
            isStreaming: false,
        }));
    }, [incomingMessage]);

    useEffect(() => {
        if (!incomingActionContract) {
            return;
        }
        setState((prev) => ({
            ...prev,
            aiActionContract: incomingActionContract,
            currentPhase: incomingActionContract.validation.canVerify ? 'verify' : 'plan',
            releasePosture:
                incomingActionContract.validation.status === 'valid'
                    ? prev.releasePosture
                    : 'pending',
        }));
    }, [incomingActionContract]);

    useEffect(() => {
        if (!incomingActionRegistry) {
            return;
        }
        setState((prev) => ({
            ...prev,
            aiActionRegistry: incomingActionRegistry,
        }));
    }, [incomingActionRegistry]);

    useEffect(() => {
        if (!incomingTelemetry) {
            return;
        }
        setState((prev) => {
            const nextPolicyGates = mergePolicyGatesFromTelemetry(
                prev.policyGates,
                incomingTelemetry,
                prev.studioEvidence?.verdict,
            );
            const nextReleasePosture =
                nextPolicyGates.releasePosture === 'pending'
                    ? prev.releasePosture
                    : nextPolicyGates.releasePosture;
            if (
                nextPolicyGates.flowState === prev.policyGates.flowState &&
                nextPolicyGates.telemetryState === prev.policyGates.telemetryState &&
                nextPolicyGates.releasePosture === prev.policyGates.releasePosture &&
                nextReleasePosture === prev.releasePosture
            ) {
                return prev;
            }
            return {
                ...prev,
                policyGates: nextPolicyGates,
                releasePosture: nextReleasePosture,
            };
        });
    }, [incomingTelemetry]);

    useEffect(() => {
        if (!incomingActionStatus) {
            return;
        }
        setState((prev) => ({
            ...prev,
            studioActionStatus: incomingActionStatus,
            isStreaming:
                chatBrainStreamingEnabled && externalIsStreaming
                    ? externalIsStreaming
                    : incomingActionStatus.status === 'started',
        }));
        const proofEvent = incomingActionStatus.result?.proofEvent;
        if (proofEvent) {
            setProofEvents((prev) => {
                const duplicate = prev.some(
                    (event) =>
                        event.actionId === proofEvent.actionId &&
                        event.generatedAt === proofEvent.generatedAt,
                );
                if (duplicate) {
                    return prev;
                }
                return [proofEvent, ...prev].slice(0, 50);
            });
        }
        const executionTranscript = incomingActionStatus.result?.executionTranscript;
        if (executionTranscript) {
            setExecutionTranscripts((prev) => {
                if (prev.some((transcript) => transcript.id === executionTranscript.id)) {
                    return prev;
                }
                return [executionTranscript, ...prev].slice(0, 50);
            });
        }
    }, [chatBrainStreamingEnabled, externalIsStreaming, incomingActionStatus]);

    useEffect(() => {
        if (!chatBrainStreamingEnabled) {
            return;
        }
        setState((prev) => ({
            ...prev,
            isStreaming: externalIsStreaming,
        }));
    }, [chatBrainStreamingEnabled, externalIsStreaming]);

    const chatMessages = useMemo(() => {
        if (!chatBrainStreamingEnabled || !streamAssistantText.trim()) {
            return state.messages;
        }

        return [
            ...state.messages,
            {
                id: 'chat-brain-streaming-assistant',
                role: 'assistant' as const,
                content: streamAssistantText,
                timestamp: new Date().toISOString(),
                phase: state.currentPhase,
                sources: [{ type: 'system' as const, label: 'chat-brain' }],
            },
        ];
    }, [chatBrainStreamingEnabled, state.currentPhase, state.messages, streamAssistantText]);

    const sidebarItems = useMemo(
        () => [
            {
                id: 'decision-layer',
                name: 'Decision Layer',
                type: 'workspace' as const,
                command: STUDIO_ACTION_COMMANDS.runAnalyze,
                description: 'Refresh the decision layer with current workspace evidence.',
            },
            {
                id: 'action-matrix',
                name: 'Action Matrix',
                type: 'workspace' as const,
                command: STUDIO_ACTION_COMMANDS.impactLens,
                description: 'Map the safest next action and blast radius.',
            },
            {
                id: 'doctor-evidence',
                name: 'Doctor Evidence',
                type: 'module' as const,
                command: STUDIO_ACTION_COMMANDS.runAnalyze,
                description: 'Hydrate health and doctor evidence.',
            },
            {
                id: 'module-graph',
                name: 'Module Graph',
                type: 'module' as const,
                command: STUDIO_ACTION_COMMANDS.impactLens,
                description: 'Inspect module-level impact signals.',
            },
            {
                id: 'release-gates',
                name: 'Release Gates',
                type: 'module' as const,
                command: STUDIO_ACTION_COMMANDS.verifyGates,
                description: 'Run deterministic gate verification.',
            },
            {
                id: 'evidence-proof',
                name: 'Evidence Proof',
                type: 'project' as const,
                command: STUDIO_ACTION_COMMANDS.verifyGates,
                description: 'Generate or refresh proof-backed verification evidence.',
            },
        ],
        [],
    );
    const [selectedSidebarItem, setSelectedSidebarItem] = useState<string>('decision-layer');
    const [activeTool, setActiveTool] = useState<string | undefined>(undefined);

    // Responsive rails: full split at wide widths; one actionable rail mid-narrow; chat owns narrow viewports.
    const showFullLayout = viewportWidth >= 1180;
    const showSidebar = viewportWidth >= 880;
    const showContextPanel = showFullLayout;
    const showActivityBar = viewportWidth >= 760;
    const studioLayout =
        showFullLayout && showSidebar && showContextPanel
            ? 'full'
            : showSidebar && !showContextPanel
              ? 'sidebar-chat'
              : !showSidebar && showContextPanel
                ? 'context-chat'
                : showActivityBar
                  ? 'chat-focus'
                  : 'chat-full';
    const compactTopBar = viewportWidth < 1380;
    const compactStudio = viewportWidth < 1320;
    const isGuided = state.userMode === 'guided';
    const studioDensity = isGuided ? 'guided' : compactStudio ? 'compact' : 'comfortable';
    const viewportTier = viewportWidth >= 1540 ? 'wide' : viewportWidth >= 1260 ? 'normal' : 'compact';
    const liteReleaseState = useMemo(
        () =>
            resolveLiteReleaseStateFromStudioContext({
                releaseDecision: incomingActionResult?.releaseReadinessCommander?.decision,
                stabilizationKpiStatus,
                verifyGateBlockedReasons,
                policyReleasePosture: state.policyGates.releasePosture,
            }),
        [
            incomingActionResult?.releaseReadinessCommander?.decision,
            stabilizationKpiStatus,
            state.policyGates.releasePosture,
            verifyGateBlockedReasons,
        ],
    );
    const enterpriseStabilizationLoop = useMemo(
        () => deriveEnterpriseStabilizationLoopView(incomingTelemetry),
        [incomingTelemetry],
    );
    const policyMutationBlockReason = useMemo(
        () => resolveStudioMutationBlockReason(incomingTelemetry),
        [incomingTelemetry]
    );
    const enterpriseShipLoop = useMemo(
        () =>
            deriveEnterpriseShipLoopView({
                shipEvidence,
                studioEvidence: state.studioEvidence,
                telemetry: incomingTelemetry,
                policyGates: state.policyGates,
                releasePosture: state.releasePosture,
                verifyGateBlockedReasons,
            }),
        [
            incomingTelemetry,
            shipEvidence,
            state.policyGates,
            state.releasePosture,
            state.studioEvidence,
            verifyGateBlockedReasons,
        ],
    );
    const phaseShipGuidance = useMemo(
        () => resolvePhaseShipGuidance(state.currentPhase, enterpriseShipLoop),
        [enterpriseShipLoop, state.currentPhase],
    );
    const observabilityView = useMemo(
        () => deriveEnterpriseObservabilityView(incomingTelemetry),
        [incomingTelemetry],
    );

    useEffect(() => {
        if (!preferredUserMode) {
            return;
        }
        setState((prev) =>
            prev.userMode === preferredUserMode ? prev : { ...prev, userMode: preferredUserMode },
        );
    }, [preferredUserMode]);

    const handlePhaseSelect = useCallback((phase: IncidentPhase) => {
        setState((prev) => {
            // Check if transition is valid
            if (!canTransitionToPhase(prev.currentPhase, phase, prev.policyGates)) {
                console.warn(
                    `Cannot transition from ${prev.currentPhase} to ${phase}`,
                );
                return prev;
            }

            return {
                ...prev,
                currentPhase: phase,
                isPhaseTransitioning: true,
            };
        });

        // Clear transitioning flag after animation
        if (phaseTransitionTimeoutRef.current) {
            clearTimeout(phaseTransitionTimeoutRef.current);
        }

        phaseTransitionTimeoutRef.current = setTimeout(() => {
            setState((prev) => ({
                ...prev,
                isPhaseTransitioning: false,
            }));
            phaseTransitionTimeoutRef.current = null;
        }, 300);
    }, []);

    // User mode changes
    const handleUserModeChange = useCallback(
        (mode: UserMode) => {
            setState((prev) => ({
                ...prev,
                userMode: mode,
            }));
            onUserModeChange?.(mode);
        },
        [onUserModeChange],
    );

    // Action items — cross-session retention hook
    const handleAddActionItem = useCallback((text: string) => {
        const item: ActionItem = {
            id: `action-${Date.now()}`,
            text,
            done: false,
            createdAt: new Date().toISOString(),
        };
        setState((prev) => ({
            ...prev,
            actionItems: [...prev.actionItems, item],
        }));
    }, []);

    const handleToggleActionItem = useCallback((id: string) => {
        setState((prev) => ({
            ...prev,
            actionItems: prev.actionItems.map((a) =>
                a.id === id ? { ...a, done: !a.done } : a,
            ),
        }));
    }, []);

    const handleCopyText = useCallback((text: string) => {
        if (onCopyText) {
            onCopyText(text);
            return;
        }
        void navigator.clipboard?.writeText(text);
    }, [onCopyText]);

    // Scope changes
    const handleScopeChange = useCallback(
        (scope: 'workspace' | 'project') => {
            setState((prev) => ({
                ...prev,
                scopeType: scope,
            }));
            onScopeChange?.(scope);
        },
        [onScopeChange]
    );

    const handleApprovalAuditEvent = useCallback((
        event: Omit<StudioApprovalAuditEvent, 'id' | 'happenedAt'>,
    ) => {
        setApprovalAuditEvents((prev) => [
            {
                ...event,
                id: `approval-${Date.now()}-${prev.length}`,
                happenedAt: new Date().toISOString(),
            },
            ...prev,
        ].slice(0, 12));
    }, []);

    // Message handling
    const handleSendMessage = useCallback(
        (content: string) => {
            const newMessage: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content,
                timestamp: new Date().toISOString(),
            };

            setState((prev) => ({
                ...prev,
                messages: [...prev.messages, newMessage],
                isStreaming: true,
            }));

            if (onSendMessage) {
                if (chatBrainStreamingEnabled) {
                    Promise.resolve(onSendMessage(content)).catch((error) => {
                        setState((prev) => ({
                            ...prev,
                            messages: [
                                ...prev.messages,
                                {
                                    id: `${Date.now()}-assistant-error`,
                                    role: 'assistant',
                                    content: `Studio action failed: ${error instanceof Error ? error.message : String(error)}`,
                                    timestamp: new Date().toISOString(),
                                    phase: prev.currentPhase,
                                },
                            ],
                            isStreaming: false,
                        }));
                    });
                    return;
                }

                Promise.resolve(onSendMessage(content))
                    .then((response) => {
                        if (typeof response === 'string' && response.trim()) {
                            setState((prev) => ({
                                ...prev,
                                messages: [
                                    ...prev.messages,
                                    {
                                        id: `${Date.now()}-assistant`,
                                        role: 'assistant',
                                        content: response,
                                        timestamp: new Date().toISOString(),
                                        phase: prev.currentPhase,
                                    },
                                ],
                            }));
                        }
                    })
                    .catch((error) => {
                        setState((prev) => ({
                            ...prev,
                            messages: [
                                ...prev.messages,
                                {
                                    id: `${Date.now()}-assistant-error`,
                                    role: 'assistant',
                                    content: `Studio action failed: ${error instanceof Error ? error.message : String(error)}`,
                                    timestamp: new Date().toISOString(),
                                    phase: prev.currentPhase,
                                },
                            ],
                        }));
                    })
                    .finally(() => {
                        setState((prev) => ({
                            ...prev,
                            isStreaming: false,
                        }));
                    });
                return;
            }

            setState((prev) => ({
                ...prev,
                messages: [
                    ...prev.messages,
                    {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant' as const,
                        content: 'Studio is not connected to an AI backend. Configure a provider or run deterministic workspace actions first.',
                        timestamp: new Date().toISOString(),
                        phase: prev.currentPhase,
                    },
                ],
                isStreaming: false,
            }));
        },
        [chatBrainStreamingEnabled, onSendMessage],
    );

    return (
        <div
            className={embedded ? studioClass.shellEmbedded : studioClass.shell}
            data-studio-theme-kind={studioThemeKind}
            data-studio-density={studioDensity}
            data-studio-view-mode={studioDisplayMode}
            data-studio-viewport={viewportTier}
        >
            <div className={studioClass.workspace}>
                <ErrorBoundary region="Mission Control">
                    <MissionControlHeader
                        currentPhase={state.currentPhase}
                        policyGates={state.policyGates}
                        userMode={state.userMode}
                        scopeType={state.scopeType}
                        workspaceName={state.workspaceName || 'Current Workspace'}
                        releasePosture={state.releasePosture}
                        studioEvidence={state.studioEvidence}
                        aiActionRegistry={state.aiActionRegistry}
                        studioActionStatus={state.studioActionStatus}
                        compactMode={compactTopBar || isGuided}
                        embedded={embedded}
                        displayMode={studioDisplayMode}
                        liteReleaseState={liteReleaseState}
                        telemetryRefreshLabel={telemetryRefreshLabel}
                        isTelemetryRefreshing={isTelemetryRefreshing}
                        onDisplayModeChange={onStudioDisplayModeChange}
                        onTelemetryRefresh={onTelemetryRefresh}
                        onUserModeChange={handleUserModeChange}
                        onScopeChange={handleScopeChange}
                        onExecuteAction={handleSendMessage}
                        verifyGateBlockedReasons={verifyGateBlockedReasons}
                        hasProjectSelected={hasProjectSelected}
                        analysisScopeNotice={analysisScopeNotice}
                        selectedProjectPath={selectedProjectPath}
                        selectedProjectName={selectedProjectName}
                        availableProjects={availableProjects}
                        onSelectProject={onSelectAnalysisProject}
                        onDismissScopeNotice={onDismissScopeNotice}
                    />

                    <PhaseStepper
                        currentPhase={state.currentPhase}
                        compactMode={compactStudio}
                        guidedMode={isGuided}
                        onSelectPhase={handlePhaseSelect}
                    />
                </ErrorBoundary>

                {/* Main Layout: 4-region shell */}
                <div
                    className={[
                        studioClass.workspaceGrid,
                        showSidebar ? 'has-sidebar' : '',
                        showContextPanel ? 'has-context' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    data-studio-layout={studioLayout}
                >
                    {showActivityBar ? (
                    <div className={studioClass.paneActivity}>
                        <ErrorBoundary region="Activity Bar">
                            <ActivityBar
                                activeTool={activeTool}
                                onToolSelect={setActiveTool}
                                onExecuteAction={handleSendMessage}
                            />
                        </ErrorBoundary>
                    </div>
                    ) : null}

                    {showSidebar ? (
                        <div className={studioClass.paneSidebar}>
                            <ErrorBoundary region="Workspace Sidebar">
                                <WorkspaceSidebar
                                    items={sidebarItems}
                                    selectedItemId={selectedSidebarItem}
                                    onItemSelect={setSelectedSidebarItem}
                                    actionItems={state.actionItems}
                                    aiActionRegistry={state.aiActionRegistry}
                                    studioActionStatus={state.studioActionStatus}
                                    approvalAuditEvents={approvalAuditEvents}
                                    proofEvents={proofEvents}
                                    executionTranscripts={executionTranscripts}
                                    onToggleActionItem={handleToggleActionItem}
                                    onExecuteAction={handleSendMessage}
                                    onRevealEvidence={onRevealEvidence}
                                    onRunCliSurfaceAction={onRunCliSurfaceAction}
                                    executingCliCommand={executingCliCommand}
                                    hasProjectSelected={hasProjectSelected}
                                    userMode={state.userMode}
                                />
                            </ErrorBoundary>
                        </div>
                    ) : null}

                    {showContextPanel ? (
                        <div className={studioClass.paneContext}>
                            <ErrorBoundary region="Context Panel">
                                <ContextPanel
                                    health={state.health}
                                    relatedFiles={state.relatedFiles}
                                    policyGates={state.policyGates}
                                    userMode={state.userMode}
                                    releasePosture={state.releasePosture}
                                    studioEvidence={state.studioEvidence}
                                    aiActionContract={state.aiActionContract}
                                    aiActionRegistry={state.aiActionRegistry}
                                    onAIActionCommand={onAIActionCommand}
                                    onApprovalAuditEvent={handleApprovalAuditEvent}
                                    onRevealEvidence={onRevealEvidence}
                                    stabilizationKpiStatus={stabilizationKpiStatus}
                                    enterpriseStabilizationLoop={enterpriseStabilizationLoop}
                                    enterpriseShipLoop={enterpriseShipLoop}
                                    executingShipLoopStepId={executingShipLoopStepId}
                                    onRunShipLoopStep={onRunShipLoopStep}
                                    canRunShipLoopStep={canRunShipLoopStep}
                                    observabilityView={observabilityView}
                                    phaseShipGuidance={phaseShipGuidance}
                                    verifyGateBlockedReasons={verifyGateBlockedReasons}
                                    policyMutationBlocked={Boolean(policyMutationBlockReason)}
                                    policyMutationReason={policyMutationBlockReason ?? undefined}
                                />
                            </ErrorBoundary>
                        </div>
                    ) : null}

                    <div
                        className={
                            showSidebar || showContextPanel
                                ? studioClass.paneChatAdjacent
                                : studioClass.paneChat
                        }
                    >
                        <ErrorBoundary region="Chat Surface">
                            <ChatSurface
                                messages={chatMessages}
                                isStreaming={state.isStreaming}
                                currentPhase={state.currentPhase}
                                scopeType={state.scopeType}
                                onSendMessage={handleSendMessage}
                                onCopyText={handleCopyText}
                                userMode={state.userMode}
                                compactMode={compactStudio || isGuided}
                                guidedMode={isGuided}
                                showDemoScenario={showDemoScenario}
                                studioEvidence={state.studioEvidence}
                                aiActionRegistry={state.aiActionRegistry}
                                onPhaseAdvance={handlePhaseSelect}
                                onAddActionItem={handleAddActionItem}
                                actionResult={incomingActionResult}
                                verifyGateBlockedReasons={verifyGateBlockedReasons}
                                actionOutcomeCallbacks={actionOutcomeCallbacks}
                                onLearnExportArchive={learnExportArchive}
                                guidedPrimaryBoardAction={guidedPrimaryBoardAction}
                                onRunGuidedCommand={onRunGuidedCommand}
                                chatBrainBoard={chatBrainBoard}
                                onExecuteChatBrainAction={onExecuteChatBrainAction}
                                chatBrainError={chatBrainError}
                                chatBrainErrorRetryable={chatBrainErrorRetryable}
                                onDismissChatBrainError={onDismissChatBrainError}
                                availableModels={availableModels}
                                selectedModelId={selectedModelId}
                                preferredModelId={preferredModelId}
                                modelsLoading={modelsLoading}
                                onModelChange={onModelChange}
                            />
                        </ErrorBoundary>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IncidentStudioVNext;
