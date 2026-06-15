import { StrictMode, useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { IncidentStudioVNext } from '@/components/StudioRedesign';
import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';
import {
    normalizeThemeMode,
    type ThemeMode,
} from '@/components/StudioRedesign/styles/themeSystem';
import type {
    AIActionContractView,
    AIActionRegistryView,
    ChatMessage,
    StudioActionStatus,
} from '@/components/StudioRedesign/state/studioState';
import type { IncidentStudioStabilizationKpiStatus } from '@/lib/incidentStudioPayload';
import type { NormalizedIncidentActionResultPayload } from '@/lib/incidentStudioPayload';
import { parseStudioActionCommand } from '@/components/StudioRedesign/state/studioActions';
import { mapAnalyzeReportToStudioState } from '@/lib/incidentStudioReportMapper';
import { resolveVerifyGateBlockedReasonsFromTelemetry } from '@/lib/incidentStudioPolicyGateMapper';
import { resolveStudioAIActionOperationBlockReason } from '@/lib/incidentStudioAIActionGate';
import type { IncidentStudioTelemetryGateSlice } from '@/lib/incidentStudioPolicyGateMapper';
import {
    DEFAULT_INCIDENT_STUDIO_DISPLAY_MODE,
    DEFAULT_INCIDENT_USER_MODE,
    normalizeIncidentStudioDisplayMode,
    normalizeIncidentUserMode,
    type IncidentStudioDisplayMode,
    type IncidentUserMode,
} from '@/lib/incidentStudioPreferences';
import {
    isIncidentStudioChatBrainHostCommand,
    useIncidentStudioChatBrain,
} from '@/lib/incidentStudioChatBrainSession';
import { useIncidentStudioCliSurface } from '@/lib/incidentStudioCliSurfaceSession';
import { useIncidentStudioShipLoop } from '@/lib/incidentStudioShipLoopSession';
import {
    isIncidentStudioSessionHostCommand,
} from '@/lib/incidentStudioSessionPersistence';
import {
  buildIncidentChatApplyPatchPayload,
  buildIncidentChatExecuteActionPayload,
  buildIncidentChatStartPayload,
  buildIncidentChatSyncWorkspacePayload,
} from '@/lib/incidentStudioPayload';
import {
  isStudioCodeChangeActionId,
  resolveStudioActionChatBrainExecution,
  type StudioCodeChangeActionPayload,
} from '@/lib/incidentStudioCodeChangeActions';
import { vscode } from '@/vscode';
import '@/styles/workspai-tokens.css';
import '@/styles-tailwind.css';
import '@/styles/workspai-primitives.css';
import '@/styles/workspai-studio.css';
import '@/styles/workspai-studio-chrome.css';

declare global {
    interface Window {
        INCIDENT_STUDIO_WORKSPACE_PATH?: string;
        INCIDENT_STUDIO_WORKSPACE_NAME?: string;
        INCIDENT_STUDIO_PROJECT_PATH?: string;
        INCIDENT_STUDIO_PROJECT_NAME?: string;
    }
}

interface AnalyzeReport {
  schemaVersion: string;
  generatedAt: string;
  workspacePath: string;
  summary: {
    score: number;
    verdict: 'ready' | 'needs-attention' | 'blocked';
    projectCount: number;
    runtimeCount: number;
    findings: {
      fail: number;
      warn: number;
      info: number;
    };
  };
  findings: Array<{
    id: string;
    severity: 'fail' | 'warn' | 'info';
    target: string;
    title: string;
    detail: string;
    remediation: string;
  }>;
  enterpriseControls?: {
    ciGateCommand: string;
    releaseGateCommand: string;
    evidencePath?: string;
  };
  [key: string]: unknown;
}

/**
 * App wrapper to manage initialization and report checking/loading
 */
const IncidentStudioApp = () => {
    const workspacePath = window.INCIDENT_STUDIO_WORKSPACE_PATH || '';
    const workspaceName = window.INCIDENT_STUDIO_WORKSPACE_NAME || 'Unknown Workspace';
    const projectPath = window.INCIDENT_STUDIO_PROJECT_PATH || '';
    const projectName = window.INCIDENT_STUDIO_PROJECT_NAME || '';
    const hasProjectSelected = Boolean(projectPath);
    const projectSelection = hasProjectSelected
        ? { path: projectPath, name: projectName || undefined }
        : null;
    // Report state
    const [reportExists, setReportExists] = useState<boolean | null>(null);
    const [reportData, setReportData] = useState<AnalyzeReport | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [legacyIncomingMessage, setLegacyIncomingMessage] = useState<ChatMessage | null>(null);
    const [incomingActionContract, setIncomingActionContract] = useState<AIActionContractView | null>(null);
    const [incomingActionRegistry, setIncomingActionRegistry] = useState<AIActionRegistryView | null>(null);
    const [incomingActionStatus, setIncomingActionStatus] = useState<StudioActionStatus | null>(null);
    const [availableModels, setAvailableModels] = useState<
        Array<{ id: string; name: string; vendor: string }>
    >([]);
    const [preferredModelId, setPreferredModelId] = useState<string>('auto');
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
    const postHostMessage = useCallback((command: string, data?: unknown) => {
        vscode.postMessage(command, data);
    }, []);
    const chatBrain = useIncidentStudioChatBrain({
        workspacePath,
        workspaceName,
        projectSelection,
        modelId: selectedModelId,
        postMessage: postHostMessage,
    });
    const incomingMessage = legacyIncomingMessage ?? chatBrain.incomingMessage;
    const incomingActionResult = chatBrain.incomingActionResult;
    const [verifyGateBlockedReasons, setVerifyGateBlockedReasons] = useState<string[]>([]);
    const [incomingTelemetry, setIncomingTelemetry] =
        useState<IncidentStudioTelemetryGateSlice | null>(null);
    const [stabilizationKpiStatus, setStabilizationKpiStatus] =
        useState<IncidentStudioStabilizationKpiStatus | null>(null);
    const [preferredUserMode, setPreferredUserMode] = useState<IncidentUserMode>(DEFAULT_INCIDENT_USER_MODE);
    const [studioDisplayMode, setStudioDisplayMode] = useState<IncidentStudioDisplayMode>(
        DEFAULT_INCIDENT_STUDIO_DISPLAY_MODE,
    );
    const [telemetryRefreshLabel, setTelemetryRefreshLabel] = useState<string | null>(null);
    const [isTelemetryRefreshing, setIsTelemetryRefreshing] = useState(false);
    const cliSurface = useIncidentStudioCliSurface({
        workspacePath,
        workspaceName,
        projectSelection,
        userMode: preferredUserMode,
        telemetry: incomingTelemetry,
        postMessage: postHostMessage,
        onResult: (result) => {
            if (!result.success && result.error) {
                setLegacyIncomingMessage({
                    id: `cli-surface-error-${Date.now()}`,
                    role: 'assistant',
                    content: `✗ Command failed: ${result.error}`,
                    timestamp: new Date().toISOString(),
                    phase: 'verify',
                    sources: [{ type: 'system', label: 'rapidkit-cli' }],
                });
            } else if (result.success && result.output) {
                setLegacyIncomingMessage({
                    id: `cli-surface-result-${Date.now()}`,
                    role: 'assistant',
                    content: `✓ Command completed:\n\`\`\`\n${result.output}\n\`\`\``,
                    timestamp: new Date().toISOString(),
                    phase: 'verify',
                    sources: [{ type: 'system', label: 'rapidkit-cli' }],
                });
            }
        },
    });
    const reportBackedState = reportData
        ? mapAnalyzeReportToStudioState(reportData, workspaceName)
        : null;

    const shipLoop = useIncidentStudioShipLoop({
        workspacePath,
        projectPath: projectPath || undefined,
        studioEvidence: reportBackedState?.studioEvidence ?? null,
        telemetry: incomingTelemetry,
        policyGates: reportBackedState?.policyGates,
        releasePosture: reportBackedState?.releasePosture,
        verifyGateBlockedReasons,
        postMessage: postHostMessage,
        onStepResult: (result) => {
            const proofEvent = result.proofEvent;
            setIncomingActionStatus({
                actionId: proofEvent?.actionId || `ship-loop-${result.stepId}`,
                actionTitle: `Ship loop ${result.stepId}`,
                actionSummary: result.summary || result.error,
                status: result.success ? 'completed' : 'failed',
                detail: result.error,
                result: {
                    summary: result.summary || result.error || `Ship loop ${result.stepId}`,
                    proofEvent,
                    executionTranscript: result.executionTranscript,
                    commandCount: result.executionTranscript?.commandCount,
                    failedCommandCount: result.executionTranscript?.failedCommandCount,
                    evidencePath: proofEvent?.evidencePath,
                    evidenceSha256: proofEvent?.evidenceSha256,
                },
                updatedAt: proofEvent?.generatedAt || new Date().toISOString(),
            });
        },
    });
    const sessionHostMessageHandlerRef = useRef<
        ((command: string, data?: unknown) => boolean) | null
    >(null);

    // Check if analyze report exists and load it on mount
    useEffect(() => {
        if (!workspacePath) return;

        // First, check if report exists
        vscode.postMessage('checkReportExists', { workspacePath });

        // Then try to load it
        setReportLoading(true);
        vscode.postMessage('loadReport', { workspacePath });
        vscode.postMessage('loadAIActionRegistry', { workspacePath });
        vscode.postMessage('getUiPreferences', { workspacePath });
        vscode.postMessage('requestIncidentStudioTelemetry', {
            workspacePath,
            projectPath: projectPath || undefined,
            forceRefresh: true,
        });
        vscode.postMessage('requestWorkspaiSettings');
        shipLoop.requestShipEvidence();
        setIsTelemetryRefreshing(true);
    }, [projectPath, shipLoop.requestShipEvidence, workspacePath]);

    // Listen for messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (isIncidentStudioChatBrainHostCommand(message.command)) {
                chatBrain.handleHostMessage(message);
                return;
            }

            if (isIncidentStudioSessionHostCommand(message.command)) {
                sessionHostMessageHandlerRef.current?.(message.command, message.data);
                return;
            }

            switch (message.command) {
                case 'reportExistsResult':
                    setReportExists(message.exists);
                    break;

                case 'reportLoaded':
                    setReportLoading(false);
                    if (message.error) {
                        setReportError(message.error);
                        setReportData(null);
                    } else {
                        setReportData(message.data);
                        setReportError(null);
                    }
                    break;
                case 'studioAssistantMessage':
                    setLegacyIncomingMessage({
                        id: `host-${Date.now()}`,
                        role: 'assistant',
                        content:
                            typeof message.data?.content === 'string'
                                ? message.data.content
                                : 'No response returned.',
                        timestamp: new Date().toISOString(),
                        phase: 'diagnose',
                        sources: [
                            {
                                type: 'system',
                                label:
                                    typeof message.data?.provider === 'string'
                                        ? message.data.provider
                                        : 'ai-provider',
                            },
                        ],
                    });
                    break;
                case 'studioActionContract':
                    setIncomingActionContract({
                        actionId: message.data?.actionId,
                        contract: message.data?.contract ?? null,
                        validation: message.data?.validation ?? {
                            status: 'blocked',
                            issues: [],
                            canApply: false,
                            canVerify: false,
                            canRollback: false,
                        },
                        parseError: message.data?.parseError,
                        rawJson: message.data?.rawJson,
                        provider: message.data?.provider,
                        receivedAt: new Date().toISOString(),
                    });
                    break;
                case 'studioActionStatus':
                    setIncomingActionStatus({
                        actionId:
                            typeof message.data?.actionId === 'string'
                                ? message.data.actionId
                                : 'unknown',
                        actionTitle:
                            typeof message.data?.actionTitle === 'string'
                                ? message.data.actionTitle
                                : undefined,
                        actionSummary:
                            typeof message.data?.actionSummary === 'string'
                                ? message.data.actionSummary
                                : undefined,
                        status:
                            message.data?.status === 'completed' || message.data?.status === 'failed'
                                ? message.data.status
                                : 'started',
                        detail:
                            typeof message.data?.detail === 'string'
                                ? message.data.detail
                                : undefined,
                        result:
                            message.data?.result && typeof message.data.result === 'object'
                                ? message.data.result
                                : undefined,
                        updatedAt:
                            typeof message.data?.updatedAt === 'string'
                                ? message.data.updatedAt
                                : new Date().toISOString(),
                    });
                    break;
                case 'aiActionRegistryLoaded':
                    setIncomingActionRegistry({
                        updatedAt: message.data?.updatedAt ?? new Date().toISOString(),
                        entries: Array.isArray(message.data?.entries) ? message.data.entries : [],
                    });
                    break;
                case 'incidentStudioTelemetry':
                    setIsTelemetryRefreshing(false);
                    setIncomingTelemetry(message.data ?? null);
                    setTelemetryRefreshLabel(
                        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    );
                    if (message.data) {
                        setVerifyGateBlockedReasons(
                            resolveVerifyGateBlockedReasonsFromTelemetry(message.data),
                        );
                    }
                    if (message.data?.studioStabilizationKpiStatus) {
                        setStabilizationKpiStatus(message.data.studioStabilizationKpiStatus);
                    }
                    break;
                case 'uiPreferences':
                    setPreferredUserMode(normalizeIncidentUserMode(message.data?.incidentUserMode));
                    setStudioDisplayMode(
                        normalizeIncidentStudioDisplayMode(message.data?.incidentStudioDisplayMode),
                    );
                    break;
                case 'workspaiSettings': {
                    const preferredModel =
                        typeof message.data?.preferredModel === 'string' &&
                        message.data.preferredModel.trim().length > 0
                            ? message.data.preferredModel.trim()
                            : 'auto';
                    const models = Array.isArray(message.data?.models)
                        ? message.data.models.filter(
                              (model: unknown): model is { id: string; name: string; vendor: string } =>
                                  Boolean(model) &&
                                  typeof (model as { id?: unknown }).id === 'string' &&
                                  typeof (model as { name?: unknown }).name === 'string' &&
                                  typeof (model as { vendor?: unknown }).vendor === 'string',
                          )
                        : [];
                    setPreferredModelId(preferredModel);
                    setAvailableModels(models);
                    setModelsLoading(false);
                    setThemeMode(normalizeThemeMode(message.data?.themeMode));
                    setSelectedModelId(preferredModel === 'auto' ? null : preferredModel);
                    break;
                }
                case 'aiModelsList':
                    if (Array.isArray(message.data?.models)) {
                        const models = message.data.models.filter(
                            (model: unknown): model is { id: string; name: string; vendor: string } =>
                                Boolean(model) &&
                                typeof (model as { id?: unknown }).id === 'string' &&
                                typeof (model as { name?: unknown }).name === 'string' &&
                                typeof (model as { vendor?: unknown }).vendor === 'string',
                        );
                        setAvailableModels(models);
                        setModelsLoading(false);
                        setSelectedModelId((current) => {
                            if (!current) {
                                return null;
                            }
                            return models.some((model) => model.id === current) ? current : null;
                        });
                    }
                    break;
                case 'runIncidentInlineCommandDone':
                    cliSurface.handleHostMessage(message);
                    shipLoop.handleHostMessage(message.command, message.data, message.meta);
                    break;
                case 'incidentStudioShipEvidence':
                case 'runShipLoopStepDone':
                case 'shipLoopPatchReverifyHint':
                    shipLoop.handleHostMessage(message.command, message.data, message.meta);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [chatBrain.handleHostMessage, cliSurface.handleHostMessage, shipLoop.handleHostMessage]);

    const handleSendMessage = (message: string) => {
        if (message.startsWith('studio-action:')) {
            const actionId = parseStudioActionCommand(message);
            if (!actionId) {
                return `Unknown Studio action blocked: ${message}`;
            }

            if (isStudioCodeChangeActionId(actionId)) {
                const resolution = resolveStudioActionChatBrainExecution(
                    actionId,
                    reportBackedState?.studioEvidence ?? null,
                    projectSelection,
                );
                if (resolution) {
                    handleChatBrainExecuteAction(
                        resolution.actionType,
                        `studio-${actionId}-${Date.now()}`,
                        resolution.payload,
                        resolution.userMessage,
                    );
                    return resolution.userMessage;
                }
            }

            vscode.postMessage('runStudioAction', {
                workspacePath,
                workspaceName,
                actionId,
            });
            return `Running ${actionId.replace(/-/g, ' ')} from Studio.`;
        }

        if (message.startsWith('/runAnalyze')) {
            vscode.postMessage('runAnalyze', { workspacePath });
            return 'Running workspace analysis.';
        }

        chatBrain.submitQuery(message);
        return undefined;
    };

    const ensureChatBrainConversation = () => {
        if (!workspacePath) {
            return null;
        }

        const conversationId =
            chatBrain.conversationId ||
            `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        if (!chatBrain.conversationId) {
            chatBrain.setConversationId(conversationId);
            vscode.postMessage(
                'aiChatStart',
                buildIncidentChatStartPayload({
                    workspacePath,
                    requestId: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    resumeConversationId: conversationId,
                    projectSelection,
                    scopeMode: hasProjectSelected ? 'project' : 'workspace',
                }),
            );
            vscode.postMessage(
                'aiChatSyncWorkspace',
                buildIncidentChatSyncWorkspacePayload({
                    workspacePath,
                    requestId: `cbs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    projectSelection,
                    scopeMode: hasProjectSelected ? 'project' : 'workspace',
                }),
            );
        }

        return conversationId;
    };

    const handleChatBrainExecuteAction = (
        actionType: string,
        actionId?: string,
        payload?: StudioCodeChangeActionPayload,
        userMessage?: string,
    ) => {
        if (!workspacePath) {
            chatBrain.setBlockingError(
                'Open a workspace before executing Studio code-change actions.',
            );
            return;
        }

        const conversationId = ensureChatBrainConversation();
        if (!conversationId || !actionType) {
            return;
        }

        if (userMessage?.trim()) {
            setLegacyIncomingMessage({
                id: `user-action-${Date.now()}`,
                role: 'user',
                content: userMessage.trim(),
                timestamp: new Date().toISOString(),
            });
        }

        chatBrain.resetForQuery();
        vscode.postMessage(
            'aiChatExecuteAction',
            buildIncidentChatExecuteActionPayload({
                conversationId,
                actionId: actionId || `action-${Date.now()}`,
                actionType,
                workspacePath,
                projectSelection,
                modelId: selectedModelId ?? undefined,
                requestId: `cba-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                payload,
            }),
        );
    };

    const handleRunAnalyzeClick = () => {
        vscode.postMessage('runAnalyze', { workspacePath });
    };

    const handleCopyCommand = (text: string) => {
        vscode.postMessage('copyText', { text });
    };

    const handleRevealEvidence = (path: string) => {
        vscode.postMessage('revealEvidence', { path, workspacePath });
    };

    const handleAIActionCommand = (operation: 'apply' | 'verify' | 'rollback') => {
        const blockReason = resolveStudioAIActionOperationBlockReason(
            operation,
            incomingActionContract,
            {
                policyMutationBlocked:
                    verifyGateBlockedReasons.length > 0 &&
                    (operation === 'apply' || operation === 'rollback'),
                policyReason: verifyGateBlockedReasons[0],
            },
        );
        if (blockReason) {
            setLegacyIncomingMessage({
                id: `ai-action-blocked-${Date.now()}`,
                role: 'assistant',
                content: `AI action ${operation} blocked: ${blockReason}`,
                timestamp: new Date().toISOString(),
                phase: 'plan',
                sources: [{ type: 'system', label: 'ai-action-gate' }],
            });
            return;
        }

        vscode.postMessage('runAIActionContractCommand', {
            workspacePath,
            workspaceName,
            operation,
            actionId: incomingActionContract?.actionId,
            summary: incomingActionContract?.contract?.summary,
            riskLevel: incomingActionContract?.contract?.riskLevel,
            confidence: incomingActionContract?.contract?.confidence,
        });
    };

    const handleExportIncidentReproPack = (
        reproPack: NonNullable<NormalizedIncidentActionResultPayload['incidentReproPack']>,
    ) => {
        vscode.postMessage('exportIncidentReproPack', {
            incidentReproPack: reproPack,
            memoryInfluenceAuditTimeline: incomingActionResult?.memoryInfluenceAuditTimeline,
            workspacePath,
        });
    };

    const handleImportIncidentReproPack = () => {
        vscode.postMessage('importIncidentReproPack');
    };

    const handleReplayIncidentQuery = (query: string) => {
        chatBrain.submitQuery(query);
    };

    const handleApplyMultiFilePatch = (
        patchId: string,
        acceptedPaths: string[],
        branchSafeApply: boolean,
    ) => {
        const conversationId = chatBrain.conversationId;
        if (!conversationId || !workspacePath) {
            return;
        }

        vscode.postMessage(
            'aiChatApplyPatch',
            buildIncidentChatApplyPatchPayload({
                conversationId,
                patchId,
                acceptedPaths,
                branchSafeApply,
                workspacePath,
                requestId: `cbp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            }),
        );
    };

    const handleExportSandboxSimulationEvidence = (
        sandboxSimulation: NonNullable<
            NormalizedIncidentActionResultPayload['sandboxSimulation']
        >,
    ) => {
        vscode.postMessage('exportSandboxSimulationEvidence', {
            sandboxSimulation,
            workspacePath: workspacePath || sandboxSimulation.workspacePath,
        });
    };

    const handleExportReleaseReadinessCommander = (
        releaseReadinessCommander: NonNullable<
            NormalizedIncidentActionResultPayload['releaseReadinessCommander']
        >,
    ) => {
        vscode.postMessage('exportReleaseReadinessCommander', {
            releaseReadinessCommander,
            workspacePath: workspacePath || releaseReadinessCommander.workspacePath,
        });
    };

    const handleRunGuidedCommand = (command: string) => {
        cliSurface.submitInlineCommand(command);
    };

    const handleRunCliSurfaceAction = (entry: { command: string; cliActionId: string }) => {
        cliSurface.submitInlineCommand(entry.command, { cliActionId: entry.cliActionId });
    };

    const handleStudioDisplayModeChange = (mode: IncidentStudioDisplayMode) => {
        const normalizedMode = normalizeIncidentStudioDisplayMode(mode);
        setStudioDisplayMode(normalizedMode);
        vscode.postMessage('setUiPreference', {
            key: 'incidentStudioDisplayMode',
            value: normalizedMode,
            workspacePath,
        });
    };

    const handleModelChange = (modelId: string | null) => {
        const normalized = modelId?.trim() || 'auto';
        setPreferredModelId(normalized);
        setSelectedModelId(normalized === 'auto' ? null : normalized);
        vscode.postMessage('setPreferredModel', { modelId: normalized });
    };

    const handleTelemetryRefresh = () => {
        if (!workspacePath) {
            return;
        }
        setIsTelemetryRefreshing(true);
        vscode.postMessage('requestIncidentStudioTelemetry', {
            workspacePath,
            projectPath: projectPath || undefined,
            forceRefresh: true,
        });
    };

    return (
        <WorkspaiThemeProvider themeMode={themeMode}>
        <StrictMode>
            {/* Report Missing Banner */}
            {!reportExists && workspacePath ? (
                <div className="studio-banner studio-banner--warn">
                    <span>
                        <strong>Workspace analysis not found.</strong> Run <code>rapidkit analyze</code> to get started with full workspace health diagnostics.
                    </span>
                    <div className="studio-banner__actions">
                        <button type="button" className="ws-btn ws-btn--primary" onClick={handleRunAnalyzeClick}>
                            Run Analyze
                        </button>
                    </div>
                </div>
            ) : null}

            {reportError && !reportData ? (
                <div className="studio-banner studio-banner--error">
                    <span>
                        <strong>Error:</strong> {reportError}
                    </span>
                    <div className="studio-banner__actions">
                        <button type="button" className="ws-btn ws-btn--primary" onClick={handleRunAnalyzeClick}>
                            Retry
                        </button>
                    </div>
                </div>
            ) : null}

            <IncidentStudioVNext
                initialState={{
                    ...(reportBackedState || {}),
                    workspaceName,
                    userMode: preferredUserMode,
                    scopeType: hasProjectSelected ? 'project' : 'workspace',
                }}
                workspacePath={workspacePath}
                sessionPostMessage={postHostMessage}
                sessionHostMessageHandlerRef={sessionHostMessageHandlerRef}
                preferredUserMode={preferredUserMode}
                studioDisplayMode={studioDisplayMode}
                onStudioDisplayModeChange={handleStudioDisplayModeChange}
                telemetryRefreshLabel={telemetryRefreshLabel}
                isTelemetryRefreshing={isTelemetryRefreshing}
                onTelemetryRefresh={handleTelemetryRefresh}
                onSendMessage={handleSendMessage}
                incomingMessage={incomingMessage}
                streamAssistantText={chatBrain.streamText}
                externalIsStreaming={chatBrain.isStreaming}
                chatBrainStreamingEnabled
                incomingActionContract={incomingActionContract}
                incomingActionRegistry={incomingActionRegistry}
                incomingActionStatus={incomingActionStatus}
                onAIActionCommand={handleAIActionCommand}
                onRevealEvidence={handleRevealEvidence}
                onCopyText={handleCopyCommand}
                showDemoScenario={false}
                incomingActionResult={incomingActionResult}
                verifyGateBlockedReasons={verifyGateBlockedReasons}
                stabilizationKpiStatus={stabilizationKpiStatus}
                incomingTelemetry={incomingTelemetry}
                onExportIncidentReproPack={handleExportIncidentReproPack}
                onExportReleaseReadiness={handleExportReleaseReadinessCommander}
                onImportIncidentReproPack={handleImportIncidentReproPack}
                onReplayIncidentQuery={handleReplayIncidentQuery}
                onApplyMultiFilePatch={handleApplyMultiFilePatch}
                onRunGuidedCommand={handleRunGuidedCommand}
                onRunCliSurfaceAction={handleRunCliSurfaceAction}
                executingCliCommand={cliSurface.executingCommand}
                shipEvidence={shipLoop.shipEvidence}
                executingShipLoopStepId={shipLoop.executingStepId}
                onRunShipLoopStep={shipLoop.runShipLoopStep}
                canRunShipLoopStep={shipLoop.canRunStep}
                hasProjectSelected={hasProjectSelected}
                chatBrainError={chatBrain.error}
                chatBrainErrorRetryable
                onDismissChatBrainError={chatBrain.clearError}
                availableModels={availableModels}
                selectedModelId={selectedModelId}
                preferredModelId={preferredModelId}
                modelsLoading={modelsLoading}
                onModelChange={handleModelChange}
                chatBrainBoard={chatBrain.board}
                onExecuteChatBrainAction={handleChatBrainExecuteAction}
            />
        </StrictMode>
        </WorkspaiThemeProvider>
    );
};

const root = document.getElementById('root');

if (root) {
    createRoot(root).render(<IncidentStudioApp />);
}
