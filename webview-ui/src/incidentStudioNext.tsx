import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { IncidentStudioVNext } from '@/components/StudioRedesign';
import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';
import type {
    AIActionContractView,
    AIActionRegistryView,
    ChatMessage,
    StudioActionStatus,
} from '@/components/StudioRedesign/state/studioState';
import type { IncidentStudioStabilizationKpiStatus } from '@/lib/incidentStudioPayload';
import { parseStudioActionCommand } from '@/components/StudioRedesign/state/studioActions';
import { mapAnalyzeReportToStudioState } from '@/lib/incidentStudioReportMapper';
import { normalizeIncidentActionResultPayload } from '@/lib/incidentStudioPayload';
import type { NormalizedIncidentActionResultPayload } from '@/lib/incidentStudioPayload';
import { resolveVerifyGateBlockedReasonsFromTelemetry } from '@/lib/incidentStudioActionOutcomePresentation';
import {
    DEFAULT_INCIDENT_STUDIO_DISPLAY_MODE,
    DEFAULT_INCIDENT_USER_MODE,
    normalizeIncidentStudioDisplayMode,
    normalizeIncidentUserMode,
    type IncidentStudioDisplayMode,
    type IncidentUserMode,
} from '@/lib/incidentStudioPreferences';
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
    
    // Report state
    const [reportExists, setReportExists] = useState<boolean | null>(null);
    const [reportData, setReportData] = useState<AnalyzeReport | null>(null);
    const [reportError, setReportError] = useState<string | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [incomingMessage, setIncomingMessage] = useState<ChatMessage | null>(null);
    const [incomingActionContract, setIncomingActionContract] = useState<AIActionContractView | null>(null);
    const [incomingActionRegistry, setIncomingActionRegistry] = useState<AIActionRegistryView | null>(null);
    const [incomingActionStatus, setIncomingActionStatus] = useState<StudioActionStatus | null>(null);
    const [incomingActionResult, setIncomingActionResult] =
        useState<NormalizedIncidentActionResultPayload | null>(null);
    const [verifyGateBlockedReasons, setVerifyGateBlockedReasons] = useState<string[]>([]);
    const [stabilizationKpiStatus, setStabilizationKpiStatus] =
        useState<IncidentStudioStabilizationKpiStatus | null>(null);
    const [preferredUserMode, setPreferredUserMode] = useState<IncidentUserMode>(DEFAULT_INCIDENT_USER_MODE);
    const [studioDisplayMode, setStudioDisplayMode] = useState<IncidentStudioDisplayMode>(
        DEFAULT_INCIDENT_STUDIO_DISPLAY_MODE,
    );
    const [telemetryRefreshLabel, setTelemetryRefreshLabel] = useState<string | null>(null);
    const [isTelemetryRefreshing, setIsTelemetryRefreshing] = useState(false);
    const reportBackedState = reportData
        ? mapAnalyzeReportToStudioState(reportData, workspaceName)
        : null;

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
            forceRefresh: true,
        });
        setIsTelemetryRefreshing(true);
    }, [workspacePath]);

    // Listen for messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

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
                    setIncomingMessage({
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
                case 'aiChatActionResult': {
                    const actionResultPayload = normalizeIncidentActionResultPayload(message.data);
                    setIncomingActionResult(actionResultPayload);
                    break;
                }
                case 'incidentStudioTelemetry':
                    setIsTelemetryRefreshing(false);
                    setTelemetryRefreshLabel(
                        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    );
                    if (message.data?.studioHardGateStatus) {
                        setVerifyGateBlockedReasons(
                            resolveVerifyGateBlockedReasonsFromTelemetry(message.data.studioHardGateStatus),
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
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleSendMessage = (message: string) => {
        if (message.startsWith('studio-action:')) {
            const actionId = parseStudioActionCommand(message);
            if (!actionId) {
                return `Unknown Studio action blocked: ${message}`;
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
        } else {
            vscode.postMessage('studioMessage', { workspacePath, message });
            return undefined;
        }
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
        vscode.postMessage('studioMessage', { workspacePath, message: query });
    };

    const handleRunGuidedCommand = (command: string) => {
        if (!command.trim() || !workspacePath) {
            return;
        }
        vscode.postMessage('runIncidentInlineCommand', {
            command,
            workspacePath,
            workspaceName,
        });
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

    const handleTelemetryRefresh = () => {
        if (!workspacePath) {
            return;
        }
        setIsTelemetryRefreshing(true);
        vscode.postMessage('requestIncidentStudioTelemetry', {
            workspacePath,
            forceRefresh: true,
        });
    };

    return (
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
                }}
                preferredUserMode={preferredUserMode}
                studioDisplayMode={studioDisplayMode}
                onStudioDisplayModeChange={handleStudioDisplayModeChange}
                telemetryRefreshLabel={telemetryRefreshLabel}
                isTelemetryRefreshing={isTelemetryRefreshing}
                onTelemetryRefresh={handleTelemetryRefresh}
                onSendMessage={handleSendMessage}
                incomingMessage={incomingMessage}
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
                onExportIncidentReproPack={handleExportIncidentReproPack}
                onImportIncidentReproPack={handleImportIncidentReproPack}
                onReplayIncidentQuery={handleReplayIncidentQuery}
                onRunGuidedCommand={handleRunGuidedCommand}
            />
        </StrictMode>
    );
};

const root = document.getElementById('root');

if (root) {
    createRoot(root).render(
        <WorkspaiThemeProvider>
            <IncidentStudioApp />
        </WorkspaiThemeProvider>,
    );
}
