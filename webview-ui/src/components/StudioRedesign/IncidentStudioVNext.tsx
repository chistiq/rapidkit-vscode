/**
 * IncidentStudioVNext: Main wrapper component
 * 3-column fullscreen layout: TopBar | PhaseStepper | ActivityBar + Sidebar + ContextPanel + ChatSurface (flex)
 * Input is fixed at bottom of chat, messages scroll independently.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
} from './state/studioState';
import { studioClass } from './styles/studioUi';
import { detectVSCodeThemeKind, resolveThemeKind, saveThemePreference, ThemeMode } from './styles/themeSystem';
import { ErrorBoundary } from './ErrorBoundary';
import { MissionControlHeader } from './regions/MissionControlHeader';
import { PhaseStepper } from './regions/PhaseStepper';
import { ActivityBar } from './regions/ActivityBar';
import { WorkspaceSidebar } from './regions/WorkspaceSidebar';
import { ContextPanel } from './regions/ContextPanel';
import { ChatSurface } from './regions/ChatSurface';
import type {
    IncidentReproPackEvidence,
    IncidentStudioStabilizationKpiStatus,
    NormalizedIncidentActionResultPayload,
} from '../../lib/incidentStudioPayload';
import type { IncidentStudioDisplayMode } from '../../lib/incidentStudioPreferences';
import { resolveLiteReleaseStateFromStudioContext } from '../../lib/incidentStudioLiteMode';
import { StudioApprovalAuditEvent } from './state/studioActionAudit';

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
    onImportIncidentReproPack?: () => void;
    onReplayIncidentQuery?: (query: string) => void;
    onApplyMultiFilePatch?: (
        patchId: string,
        acceptedPaths: string[],
        branchSafeApply: boolean,
    ) => void;
    guidedPrimaryBoardAction?: { label: string; command?: string } | null;
    onRunGuidedCommand?: (command: string) => void;
    preferredUserMode?: UserMode;
    onUserModeChange?: (mode: UserMode) => void;
    studioDisplayMode?: IncidentStudioDisplayMode;
    onStudioDisplayModeChange?: (mode: IncidentStudioDisplayMode) => void;
    telemetryRefreshLabel?: string | null;
    isTelemetryRefreshing?: boolean;
    onTelemetryRefresh?: () => void;
    /** When rendered inside Dashboard tab — fills host, hides duplicate chrome */
    embedded?: boolean;
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
    onImportIncidentReproPack,
    onReplayIncidentQuery,
    onApplyMultiFilePatch,
    guidedPrimaryBoardAction = null,
    onRunGuidedCommand,
    preferredUserMode,
    onUserModeChange,
    studioDisplayMode = 'full',
    onStudioDisplayModeChange,
    telemetryRefreshLabel = null,
    isTelemetryRefreshing = false,
    onTelemetryRefresh,
    embedded = false,
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

    const [state, setState] = useState<IncidentStudioState>(
        createInitialState(initialState),
    );
    const [viewportWidth, setViewportWidth] = useState<number>(
        typeof window !== 'undefined' ? window.innerWidth : 1366,
    );
    const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
    const [studioThemeKind, setStudioThemeKind] = useState<'light' | 'dark'>(() => resolveThemeKind('auto'));
    const themeSignatureRef = useRef<string>('');
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
        if (!incomingActionStatus) {
            return;
        }
        setState((prev) => ({
            ...prev,
            studioActionStatus: incomingActionStatus,
            isStreaming: incomingActionStatus.status === 'started',
        }));
    }, [incomingActionStatus]);

    useEffect(() => {
        const syncThemeKind = () => {
            const nextKind = resolveThemeKind(themeMode);
            const nextSignature = `${themeMode}:${nextKind}:${detectVSCodeThemeKind()}`;
            if (themeSignatureRef.current === nextSignature) {
                return;
            }

            themeSignatureRef.current = nextSignature;
            setStudioThemeKind(nextKind);
        };

        syncThemeKind();

        if (themeMode !== 'auto' || typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
            return;
        }

        const observer = new MutationObserver(() => {
            syncThemeKind();
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'data-vscode-theme-kind'],
            });
        }
        if (document.documentElement) {
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-vscode-theme-kind'],
            });
        }

        if (document.head) {
            observer.observe(document.head, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }

        const intervalId = window.setInterval(() => {
            syncThemeKind();
        }, 500);

        return () => {
            observer.disconnect();
            window.clearInterval(intervalId);
        };
    }, [themeMode]);

    const handleThemeModeChange = useCallback((mode: ThemeMode) => {
        saveThemePreference(mode);
        setThemeMode(mode);
    }, []);

    const sidebarItems = useMemo(
        () => [
            {
                id: 'decision-layer',
                name: 'Decision Layer',
                type: 'workspace' as const,
                command: 'studio-action:run-analyze' as const,
                description: 'Refresh the decision layer with current workspace evidence.',
            },
            {
                id: 'action-matrix',
                name: 'Action Matrix',
                type: 'workspace' as const,
                command: 'studio-action:impact-lens' as const,
                description: 'Map the safest next action and blast radius.',
            },
            {
                id: 'doctor-evidence',
                name: 'Doctor Evidence',
                type: 'module' as const,
                command: 'studio-action:run-analyze' as const,
                description: 'Hydrate health and doctor evidence.',
            },
            {
                id: 'module-graph',
                name: 'Module Graph',
                type: 'module' as const,
                command: 'studio-action:impact-lens' as const,
                description: 'Inspect module-level impact signals.',
            },
            {
                id: 'release-gates',
                name: 'Release Gates',
                type: 'module' as const,
                command: 'studio-action:verify-gates' as const,
                description: 'Run deterministic gate verification.',
            },
            {
                id: 'evidence-proof',
                name: 'Evidence Proof',
                type: 'project' as const,
                command: 'studio-action:verify-gates' as const,
                description: 'Generate or refresh proof-backed verification evidence.',
            },
        ],
        [],
    );
    const [selectedSidebarItem, setSelectedSidebarItem] = useState<string>('decision-layer');
    const [activeTool, setActiveTool] = useState<string | undefined>(undefined);
    const [approvalAuditEvents, setApprovalAuditEvents] = useState<StudioApprovalAuditEvent[]>([]);

    // Keep side regions available in common VS Code tab widths.
    const showSidebar = viewportWidth >= 1180;
    const showContextPanel = viewportWidth >= 980;
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
    const handleScopeChange = useCallback((scope: 'workspace' | 'project') => {
        setState((prev) => ({
            ...prev,
            scopeType: scope,
        }));
    }, []);

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
        [onSendMessage],
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
                {/* Top Bar */}
                <MissionControlHeader
                    currentPhase={state.currentPhase}
                    policyGates={state.policyGates}
                    userMode={state.userMode}
                    themeMode={themeMode}
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
                    onThemeModeChange={handleThemeModeChange}
                    onScopeChange={handleScopeChange}
                    onExecuteAction={handleSendMessage}
                />

                <PhaseStepper
                    currentPhase={state.currentPhase}
                    compactMode={compactStudio}
                    guidedMode={isGuided}
                    onSelectPhase={handlePhaseSelect}
                />

                {/* Main Layout: 4-region shell */}
                <div className={studioClass.workspaceGrid}>
                    <div className={studioClass.paneActivity}>
                        <ErrorBoundary region="Activity Bar">
                            <ActivityBar
                                activeTool={activeTool}
                                onToolSelect={setActiveTool}
                                onExecuteAction={handleSendMessage}
                            />
                        </ErrorBoundary>
                    </div>

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
                                    onToggleActionItem={handleToggleActionItem}
                                    onExecuteAction={handleSendMessage}
                                    onRevealEvidence={onRevealEvidence}
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
                                messages={state.messages}
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
                                guidedPrimaryBoardAction={guidedPrimaryBoardAction}
                                onRunGuidedCommand={onRunGuidedCommand}
                            />
                        </ErrorBoundary>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IncidentStudioVNext;
