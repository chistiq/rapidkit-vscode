import { isDashboardEvidenceCardId, type DashboardEvidenceCardId } from './dashboardEvidenceCards';

export type WebviewProtocolRequestId = string | number;

export type WebviewProtocolMeta = {
  requestId?: WebviewProtocolRequestId;
  source?: string;
  version?: string;
};

export type DashboardEvidenceRefreshMode = 'full' | 'patch';

export type RequestDashboardEvidenceData = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  reportPath?: string;
  refreshMode?: DashboardEvidenceRefreshMode;
  requestId?: number;
};

export type RefreshDashboardEvidenceCardData = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  cardId?: DashboardEvidenceCardId;
  cardIds?: DashboardEvidenceCardId[];
  requestId?: number;
};

export type TrackDashboardCommandData = {
  command: string;
};

export type TrackDashboardNavigationData = {
  section: string;
  operateZone?: string;
  source?: string;
};

export type CopyTextData = {
  text: string;
};

export type AICreationMode = 'workspace' | 'project';

export type AICreationStackIntent = 'balanced' | 'frontend' | 'backend' | 'polyglot' | 'enterprise';

export type AIParseCreationData = {
  prompt: string;
  mode?: AICreationMode;
  framework?: string;
  stackIntent?: AICreationStackIntent;
};

export type AIQueryData = {
  mode?: 'ask' | 'debug';
  question: string;
  context?: unknown;
  requestId?: number;
  history?: unknown[];
  modelId?: string;
};

export type AICancelQueryData = {
  requestId?: number;
};

export type IncidentScopeMode = 'workspace' | 'project';

export type IncidentChatStartData = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
  resumeConversationId?: string;
  scopeMode?: IncidentScopeMode;
  requestId?: string;
};

export type IncidentChatSyncWorkspaceData = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
  forceRefresh?: boolean;
  scopeMode?: IncidentScopeMode;
  requestId?: string;
};

export type IncidentChatQueryData = {
  conversationId?: string;
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  projectType?: string;
  message?: string;
  modelId?: string;
  scopeMode?: IncidentScopeMode;
  requestId?: string;
};

export type IncidentChatApplyPatchData = {
  conversationId?: string;
  patchId?: string;
  acceptedPaths?: string[];
  branchSafeApply?: boolean;
  workspacePath?: string;
  requestId?: string;
};

export type IncidentChatFeedbackData = {
  conversationId?: string;
  workspacePath?: string;
  projectPath?: string;
  messageId?: string;
  rating?: 'helpful' | 'not-helpful';
  note?: string;
  requestId?: string;
};

export type IncidentPredictionAcceptedData = {
  conversationId?: string;
  workspacePath?: string;
  projectPath?: string;
  warningId?: string;
  predictionKey?: string;
};

export type WorkspaceStatusHostData = {
  hasWorkspace: boolean;
  hasProjectSelected?: boolean;
  workspaceName?: string;
  workspacePath?: string;
  projectName?: string;
  projectPath?: string;
  projectType?: string;
  installedModules?: unknown[];
  projectCapabilities?: unknown;
  isRunning?: boolean;
  runningPort?: number;
  source?: string;
};

export type WorkspaceProjectsHostData = {
  workspacePath: string;
  projects: unknown[];
};

export type ReportLoadedHostData = unknown;

export type AIActionRegistryLoadedHostData = {
  updatedAt: string;
  entries: unknown[];
};

export type IncidentStudioTelemetryHostData = unknown;

export type RecentWorkspacesHostData = unknown[];

export type ExampleWorkspacesHostData = unknown[];

export type AvailableKitsHostData = unknown[];

export type OpenProjectModalHostData = {
  framework: string;
};

export type OpenAICreateModalHostData = {
  mode?: AICreationMode;
  targetWorkspaceName?: string;
  targetWorkspacePath?: string;
};

export type ModuleHostData = Record<string, unknown>;

export type OpenAIModalHostData = unknown;

export type SetCreatingWorkspaceHostData = {
  isLoading: boolean;
};

export type ExampleProgressHostData = {
  exampleName: string | null;
};

export type ModulesCatalogHostData =
  | unknown[]
  | {
      modules: unknown[];
      meta?: Record<string, unknown> | null;
    };

export type InstallStatusHostData = Record<string, unknown>;

export type InstallProgressHostData = Record<string, unknown>;

export type SetActiveViewHostData = {
  view: string;
};

export type DashboardCommandFailedHostData = {
  command: string;
  reason: string;
};

export type ReportExistsResultHostData = {
  exists: boolean;
  workspacePath?: string;
};

export type AIModelsListHostData = {
  models: unknown[];
};

export type AICreationProgressHostData = Record<string, unknown>;

export type AICreationDoneHostData = Record<string, unknown>;

export type AICreationErrorHostData = {
  error: string;
};

export type AIProviderHealthCheckHostData = Record<string, unknown>;

export type AIModuleSuggestionsHostData = {
  loading: boolean;
  modelId?: string;
  suggestions?: unknown[];
  error?: string;
};

export type AIChunkUpdateHostData = {
  text: string;
  requestId: number;
};

export type StudioAssistantMessageHostData = {
  role?: string;
  content: string;
  provider?: string;
};

export type StudioActionStatusHostData = Record<string, unknown>;

export type StudioActionContractHostData = Record<string, unknown>;

export type AIContextContractHostData = Record<string, unknown> & {
  requestId: number;
};

export type AIModelUsedHostData = {
  modelId: string;
  requestId: number;
};

export type WorkspaceToolStatusHostData = Record<string, unknown>;

export type WorkspaiSettingsHostData = Record<string, unknown>;

export type UpdateVersionHostData = string;

export type AIChatActionProgressHostData = Record<string, unknown> & {
  stage?: string;
  progress?: number;
  note?: string;
};

export type AIChatErrorHostData = Record<string, unknown> & {
  conversationId?: string;
  code?: string;
  message?: string;
  retryable?: boolean;
};

export type IncidentStudioShipEvidenceHostData = Record<string, unknown>;

export type RunShipLoopStepDoneHostData = Record<string, unknown>;

export type ShipLoopPatchReverifyHintHostData = Record<string, unknown>;

export type IncidentStudioSessionLoadedHostData = unknown;

export type RunIncidentInlineCommandDoneHostData = Record<string, unknown>;

export type UiPreferencesHostData = Record<string, unknown>;

export type WebviewToExtensionMessage<C extends string = string, D = unknown> = {
  command: C;
  data?: D;
  meta?: WebviewProtocolMeta;
};

export type WebviewFromExtensionMessage<C extends string = string, D = unknown> = {
  command: C;
  data?: D;
  meta?: WebviewProtocolMeta;
  error?: unknown;
};

export type DashboardHostWebviewMessage =
  | WebviewFromExtensionMessage<'updateWorkspaceStatus', WorkspaceStatusHostData>
  | WebviewFromExtensionMessage<'workspaceProjects', WorkspaceProjectsHostData>
  | WebviewFromExtensionMessage<'reportLoaded', ReportLoadedHostData>
  | WebviewFromExtensionMessage<'aiActionRegistryLoaded', AIActionRegistryLoadedHostData>
  | WebviewFromExtensionMessage<'incidentStudioTelemetry', IncidentStudioTelemetryHostData>
  | WebviewFromExtensionMessage<'updateRecentWorkspaces', RecentWorkspacesHostData>
  | WebviewFromExtensionMessage<'updateExampleWorkspaces', ExampleWorkspacesHostData>
  | WebviewFromExtensionMessage<'updateAvailableKits', AvailableKitsHostData>
  | WebviewFromExtensionMessage<'openProjectModal', OpenProjectModalHostData>
  | WebviewFromExtensionMessage<'openWorkspaceModal'>
  | WebviewFromExtensionMessage<'openAICreateModal', OpenAICreateModalHostData>
  | WebviewFromExtensionMessage<'openModuleInstallModal', ModuleHostData>
  | WebviewFromExtensionMessage<'showModuleDetailsModal', ModuleHostData>
  | WebviewFromExtensionMessage<'openAIModal', OpenAIModalHostData>
  | WebviewFromExtensionMessage<'setCreatingWorkspace', SetCreatingWorkspaceHostData>
  | WebviewFromExtensionMessage<'closeProjectModal'>
  | WebviewFromExtensionMessage<'setCloning', ExampleProgressHostData>
  | WebviewFromExtensionMessage<'setUpdating', ExampleProgressHostData>
  | WebviewFromExtensionMessage<'updateModulesCatalog', ModulesCatalogHostData>
  | WebviewFromExtensionMessage<'installStatusUpdate', InstallStatusHostData>
  | WebviewFromExtensionMessage<'installProgressUpdate', InstallProgressHostData>
  | WebviewFromExtensionMessage<'setActiveView', SetActiveViewHostData>
  | WebviewFromExtensionMessage<'dashboardCommandFailed', DashboardCommandFailedHostData>
  | WebviewFromExtensionMessage<'reportExistsResult', ReportExistsResultHostData>
  | WebviewFromExtensionMessage<'aiModelsList', AIModelsListHostData>
  | WebviewFromExtensionMessage<'aiCreationStarted'>
  | WebviewFromExtensionMessage<'aiCreationProgress', AICreationProgressHostData>
  | WebviewFromExtensionMessage<'aiCreationDone', AICreationDoneHostData>
  | WebviewFromExtensionMessage<'aiCreationError', AICreationErrorHostData>
  | WebviewFromExtensionMessage<'aiCreationThinking', { thinking: boolean }>
  | WebviewFromExtensionMessage<'aiProviderHealthCheck', AIProviderHealthCheckHostData>
  | WebviewFromExtensionMessage<'aiModuleSuggestions', AIModuleSuggestionsHostData>
  | WebviewFromExtensionMessage<'aiChunkUpdate', AIChunkUpdateHostData>
  | WebviewFromExtensionMessage<'studioAssistantMessage', StudioAssistantMessageHostData>
  | WebviewFromExtensionMessage<'studioActionStatus', StudioActionStatusHostData>
  | WebviewFromExtensionMessage<'studioActionContract', StudioActionContractHostData>
  | WebviewFromExtensionMessage<'aiContextContract', AIContextContractHostData>
  | WebviewFromExtensionMessage<'aiModelUsed', AIModelUsedHostData>
  | WebviewFromExtensionMessage<'workspaceToolStatus', WorkspaceToolStatusHostData>
  | WebviewFromExtensionMessage<'workspaceGraphProjectionLive', Record<string, unknown>>
  | WebviewFromExtensionMessage<'workspaceGraphStreamStatus', Record<string, unknown>>
  | WebviewFromExtensionMessage<'workspaceGraphMemorySample', Record<string, unknown>>
  | WebviewFromExtensionMessage<'workspaceGraphRecordingState', WorkspaceGraphRecordingState>
  | WebviewFromExtensionMessage<'workspaiSettings', WorkspaiSettingsHostData>
  | WebviewFromExtensionMessage<'updateVersion', UpdateVersionHostData>
  | WebviewFromExtensionMessage<'openIncidentStudio', Record<string, unknown>>
  | WebviewFromExtensionMessage<'openWorkspaceShareDashboard', Record<string, unknown>>
  | WebviewFromExtensionMessage<'aiChatActionProgress', AIChatActionProgressHostData>
  | WebviewFromExtensionMessage<'aiChatError', AIChatErrorHostData>
  | WebviewFromExtensionMessage<'incidentStudioShipEvidence', IncidentStudioShipEvidenceHostData>
  | WebviewFromExtensionMessage<'runShipLoopStepDone', RunShipLoopStepDoneHostData>
  | WebviewFromExtensionMessage<'shipLoopPatchReverifyHint', ShipLoopPatchReverifyHintHostData>
  | WebviewFromExtensionMessage<'incidentStudioSessionLoaded', IncidentStudioSessionLoadedHostData>
  | WebviewFromExtensionMessage<
      'runIncidentInlineCommandDone',
      RunIncidentInlineCommandDoneHostData
    >
  | WebviewFromExtensionMessage<'uiPreferences', UiPreferencesHostData>;

export type NormalizedWebviewMessage = {
  command: string;
  data: any;
  meta?: WebviewProtocolMeta;
  error?: string | null;
};

export type DashboardEvidenceWebviewMessage =
  | WebviewToExtensionMessage<'requestDashboardEvidence', RequestDashboardEvidenceData>
  | WebviewToExtensionMessage<'refreshDashboardEvidenceCard', RefreshDashboardEvidenceCardData>
  | WebviewToExtensionMessage<'clearDashboardActivity'>
  | WebviewToExtensionMessage<'dismissDashboardOpsChain'>
  | WebviewToExtensionMessage<'trackDashboardCommand', TrackDashboardCommandData>
  | WebviewToExtensionMessage<'trackDashboardNavigation', TrackDashboardNavigationData>;

export type WorkspaceGraphStreamWebviewMessage =
  | WebviewToExtensionMessage<'startWorkspaceGraphStream', { workspacePath: string }>
  | WebviewToExtensionMessage<'stopWorkspaceGraphStream'>
  | WebviewToExtensionMessage<'resyncWorkspaceGraphStream'>
  | WebviewToExtensionMessage<'startWorkspaceGraphRecording', WorkspaceGraphRecordingStartInput>
  | WebviewToExtensionMessage<
      'appendWorkspaceGraphRecordingFrame',
      WorkspaceGraphRecordingFrameInput
    >
  | WebviewToExtensionMessage<'stopWorkspaceGraphRecording', WorkspaceGraphRecordingStopInput>
  | WebviewToExtensionMessage<'openWorkspaceGraphRecording'>;

export type AIWebviewMessage =
  | WebviewToExtensionMessage<'aiCancelQuery', AICancelQueryData>
  | WebviewToExtensionMessage<'aiQuery', AIQueryData>
  | WebviewToExtensionMessage<'aiParseCreation', AIParseCreationData>
  | WebviewToExtensionMessage<'aiChatStart', IncidentChatStartData>
  | WebviewToExtensionMessage<'aiChatSyncWorkspace', IncidentChatSyncWorkspaceData>
  | WebviewToExtensionMessage<'aiChatQuery', IncidentChatQueryData>
  | WebviewToExtensionMessage<'aiChatApplyPatch', IncidentChatApplyPatchData>
  | WebviewToExtensionMessage<'aiChatFeedback', IncidentChatFeedbackData>
  | WebviewToExtensionMessage<'incidentPredictionAccepted', IncidentPredictionAcceptedData>;

export function createWebviewMessage<C extends string, D = unknown>(
  command: C,
  data?: D,
  meta?: WebviewProtocolMeta
): WebviewToExtensionMessage<C, D> {
  return meta ? { command, data, meta } : { command, data };
}

export function createExtensionWebviewMessage<C extends string, D = unknown>(
  command: C,
  data?: D,
  meta?: WebviewProtocolMeta,
  error?: unknown
): WebviewFromExtensionMessage<C, D> {
  const message: WebviewFromExtensionMessage<C, D> = { command };
  if (data !== undefined) {
    message.data = data;
  }
  if (meta) {
    message.meta = meta;
  }
  if (error !== undefined) {
    message.error = error;
  }
  return message;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeWebviewMessage(value: unknown): NormalizedWebviewMessage | null {
  if (!isRecord(value) || typeof value.command !== 'string' || value.command.trim().length === 0) {
    return null;
  }

  const meta = isRecord(value.meta) ? normalizeWebviewProtocolMeta(value.meta) : undefined;
  const data = value.data;
  const error = normalizeWebviewMessageError(value.error);
  const normalized = meta
    ? {
        command: value.command,
        data,
        meta,
      }
    : {
        command: value.command,
        data,
      };
  return value.error !== undefined ? { ...normalized, error } : normalized;
}

export const normalizeExtensionWebviewMessage = normalizeWebviewMessage;

function normalizeWebviewMessageError(error: unknown): string | null {
  if (error === null) {
    return null;
  }
  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (error instanceof Error) {
    return error.message.trim() || error.name || 'Unknown error';
  }
  if (error === undefined) {
    return null;
  }
  return String(error);
}

export function normalizeWebviewProtocolMeta(
  value: Record<string, unknown>
): WebviewProtocolMeta | undefined {
  const requestId = readProtocolRequestId(value, 'requestId');
  const source = readStringField(value, 'source');
  const version = readStringField(value, 'version');
  if (requestId === undefined && source === undefined && version === undefined) {
    return undefined;
  }
  return { requestId, source, version };
}

export function getWebviewMessageDataRecord(
  message: WebviewToExtensionMessage
): Record<string, unknown> {
  return isRecord(message.data) ? message.data : {};
}

export function getWebviewMessageRequestId(
  message: WebviewToExtensionMessage
): WebviewProtocolRequestId | undefined {
  const metaRequestId = message.meta?.requestId;
  if (typeof metaRequestId === 'string' || typeof metaRequestId === 'number') {
    return metaRequestId;
  }
  return readProtocolRequestId(getWebviewMessageDataRecord(message), 'requestId');
}

export function readStringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

export function readTrimmedStringField(
  data: Record<string, unknown>,
  key: string
): string | undefined {
  const value = readStringField(data, key)?.trim();
  return value ? value : undefined;
}

export function readNumberField(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readBooleanField(data: Record<string, unknown>, key: string): boolean | undefined {
  const value = data[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function readStringArrayField(
  data: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = data[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((entry): entry is string => typeof entry === 'string');
  return strings.length > 0 ? strings : undefined;
}

export function readProtocolRequestId(
  data: Record<string, unknown>,
  key: string
): WebviewProtocolRequestId | undefined {
  const value = data[key];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export function readStringRequestId(data: Record<string, unknown>): string | undefined {
  const value = readProtocolRequestId(data, 'requestId');
  return typeof value === 'string' ? value : undefined;
}

export function readDashboardEvidenceRefreshMode(
  data: Record<string, unknown>,
  fallback: DashboardEvidenceRefreshMode = 'full'
): DashboardEvidenceRefreshMode {
  return data.refreshMode === 'patch' || data.refreshMode === 'full' ? data.refreshMode : fallback;
}

export function readDashboardEvidenceCardIds(
  data: Record<string, unknown>
): DashboardEvidenceCardId[] | undefined {
  const cardIds = data.cardIds;
  if (Array.isArray(cardIds)) {
    const validIds = cardIds.filter(
      (entry): entry is DashboardEvidenceCardId =>
        typeof entry === 'string' && isDashboardEvidenceCardId(entry)
    );
    return validIds.length > 0 ? validIds : undefined;
  }

  const cardId = data.cardId;
  return typeof cardId === 'string' && isDashboardEvidenceCardId(cardId) ? [cardId] : undefined;
}

export function readAICreationMode(data: Record<string, unknown>): AICreationMode {
  return data.mode === 'project' ? 'project' : 'workspace';
}

export function readAICreationStackIntent(
  data: Record<string, unknown>
): AICreationStackIntent | undefined {
  return data.stackIntent === 'frontend' ||
    data.stackIntent === 'backend' ||
    data.stackIntent === 'polyglot' ||
    data.stackIntent === 'enterprise' ||
    data.stackIntent === 'balanced'
    ? data.stackIntent
    : undefined;
}

export function readAIQueryMode(data: Record<string, unknown>): 'ask' | 'debug' {
  return data.mode === 'debug' ? 'debug' : 'ask';
}

export function readIncidentScopeMode(
  data: Record<string, unknown>
): IncidentScopeMode | undefined {
  return data.scopeMode === 'project' || data.scopeMode === 'workspace'
    ? data.scopeMode
    : undefined;
}

export function readIncidentFeedbackRating(
  data: Record<string, unknown>
): 'helpful' | 'not-helpful' {
  return data.rating === 'not-helpful' ? 'not-helpful' : 'helpful';
}
import type {
  WorkspaceGraphRecordingFrameInput,
  WorkspaceGraphRecordingStartInput,
  WorkspaceGraphRecordingState,
  WorkspaceGraphRecordingStopInput,
} from './workspaceGraphRecording.js';
