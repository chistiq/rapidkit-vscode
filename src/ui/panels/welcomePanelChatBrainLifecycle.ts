import * as vscode from 'vscode';

import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import {
  createProjectSystemGraphWatcher,
  type ProjectSystemGraphWatcherHandle,
} from '../../core/systemGraphIndexer';
import {
  getWebviewMessageDataRecord,
  readBooleanField,
  readIncidentFeedbackRating,
  readIncidentScopeMode,
  readStringField,
  readTrimmedStringField,
  type WebviewFromExtensionMessage,
} from '../../contracts/webviewProtocol';
import { buildIncidentMemoryEnrichmentSuggestion } from './incidentStudioMemory';
import { buildSyncSystemGraphSnapshot } from './incidentStudioSyncGraph';
import { buildIncidentResumeSnapshot, type IncidentResumeSnapshot } from './incidentStudioResume';
import type { ChatBrainConversation } from './welcomePanelChatBrainQuery';
import type { IncidentStudioUiPreferences } from './incidentStudioUiPreferencesBridge';
import type { IncidentWorkspaceGraphSnapshot } from './welcomePanel.shared.js';

export type ImportedIncidentReplay = {
  packId: string;
  actionType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  likelyFailureMode?: string;
  verifyChecklist: string[];
  blockedReasons: string[];
  relatedFiles: string[];
  importedFrom?: string;
};

export type ChatBrainLifecycleHost = {
  context: vscode.ExtensionContext;
  chatBrainConversations: Map<string, ChatBrainConversation>;
  incidentResumeByWorkspace: Map<string, IncidentResumeSnapshot>;
  pendingImportedIncidentReplayByWorkspace: Map<string, ImportedIncidentReplay>;
  systemGraphWatcherByPath: Map<string, ProjectSystemGraphWatcherHandle>;
  getChatBrainQueryTokenSource: () => vscode.CancellationTokenSource | undefined;
  setChatBrainQueryTokenSource: (value: vscode.CancellationTokenSource | undefined) => void;
  getActiveChatBrainConversationId: () => string | undefined;
  setActiveChatBrainConversationId: (value: string | undefined) => void;
  getActiveChatBrainRequestId: () => string | undefined;
  setActiveChatBrainRequestId: (value: string | undefined) => void;
  getSelectedProject: () => { path: string; name?: string } | null | undefined;
  postChatBrainWebviewMessage: (message: WebviewFromExtensionMessage) => void;
  inferFrameworkFromWorkspace: (workspacePath: string) => Promise<string>;
  getWorkspaceGraphSnapshot: (options: {
    workspacePath?: string;
    projectPath?: string;
    projectName?: string;
    projectType?: string;
    scopeIntent?: 'workspace' | 'project';
  }) => Promise<IncidentWorkspaceGraphSnapshot>;
  trackStudioEvent: (
    eventName: string,
    workspacePath: string | undefined,
    properties: Record<string, unknown>
  ) => void;
  getUiPreferences: (workspacePath?: string) => IncidentStudioUiPreferences;
};

export async function handleAiChatStart(
  host: ChatBrainLifecycleHost,
  data: unknown,
  requestId?: string
) {
  const input = getWebviewMessageDataRecord({ command: 'aiChatStart', data });
  const resumeConversationId = readStringField(input, 'resumeConversationId');
  const conversationId = resumeConversationId || `conv-${Date.now()}`;

  const workspacePath = readStringField(input, 'workspacePath');
  const projectPath = readTrimmedStringField(input, 'projectPath');
  const projectName = readTrimmedStringField(input, 'projectName');
  const projectType = readTrimmedStringField(input, 'projectType');
  const existingConversation = resumeConversationId
    ? host.chatBrainConversations.get(resumeConversationId)
    : undefined;

  const framework =
    existingConversation?.framework ||
    (projectPath
      ? await host.inferFrameworkFromWorkspace(projectPath)
      : workspacePath
        ? await host.inferFrameworkFromWorkspace(workspacePath)
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
    scopeMode: readIncidentScopeMode(input) ?? (projectPath ? 'project' : 'workspace'),
    importedIncidentReplay: undefined,
  };

  conversation.workspacePath = workspacePath || conversation.workspacePath;
  conversation.projectPath = projectPath || conversation.projectPath;
  conversation.projectName = projectName || conversation.projectName;
  conversation.projectType = projectType || conversation.projectType;
  conversation.framework = framework;
  if (workspacePath) {
    const pendingImportedReplay = host.pendingImportedIncidentReplayByWorkspace.get(workspacePath);
    if (pendingImportedReplay) {
      conversation.importedIncidentReplay = pendingImportedReplay;
      host.pendingImportedIncidentReplayByWorkspace.delete(workspacePath);
    }
  }
  host.chatBrainConversations.set(conversationId, conversation);

  const inlineResumeSnapshot = buildIncidentResumeSnapshot(conversation);
  if (inlineResumeSnapshot) {
    host.incidentResumeByWorkspace.set(inlineResumeSnapshot.workspacePath, inlineResumeSnapshot);
  }

  const cachedResumeSnapshot = workspacePath
    ? host.incidentResumeByWorkspace.get(workspacePath)
    : undefined;
  const resumeSnapshot = inlineResumeSnapshot || cachedResumeSnapshot;
  const resumed = Boolean(existingConversation || (resumeConversationId && resumeSnapshot));

  // ── Analytics: incident_loop_started ─────────────────────────────────────
  host.trackStudioEvent('workspai.studio.loop_started', workspacePath, {
    framework: framework ?? 'unknown',
    resumed,
    projectPath: conversation.projectPath,
  });

  host.postChatBrainWebviewMessage({
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

export async function handleAiChatSyncWorkspace(
  host: ChatBrainLifecycleHost,
  data: unknown,
  requestId?: string
) {
  const input = getWebviewMessageDataRecord({ command: 'aiChatSyncWorkspace', data });
  const workspacePath = readStringField(input, 'workspacePath');
  const explicitProjectPath = readTrimmedStringField(input, 'projectPath');
  const explicitProjectName = readTrimmedStringField(input, 'projectName');
  const explicitProjectType = readTrimmedStringField(input, 'projectType');

  // If a stream is active for another workspace, cancel it before applying sync.
  const activeConversationId = host.getActiveChatBrainConversationId();
  const activeConversation = activeConversationId
    ? host.chatBrainConversations.get(activeConversationId)
    : undefined;
  if (
    host.getChatBrainQueryTokenSource() &&
    activeConversation?.workspacePath &&
    workspacePath &&
    activeConversation.workspacePath !== workspacePath
  ) {
    const tokenSource = host.getChatBrainQueryTokenSource();
    tokenSource?.cancel();
    tokenSource?.dispose();
    host.setChatBrainQueryTokenSource(undefined);
    host.setActiveChatBrainRequestId(undefined);
    host.setActiveChatBrainConversationId(undefined);
  }

  const selectedProjectPath =
    explicitProjectPath ||
    (() => {
      const p = host.getSelectedProject();
      return p && workspacePath && isWorkspacePathAncestor(workspacePath, p.path)
        ? p.path
        : undefined;
    })();
  const cacheKey = `chat-brain-workspace-graph-${workspacePath || 'default'}-${selectedProjectPath || 'none'}`;
  const now = Date.now();
  const cacheTtl = 2 * 60 * 1000;
  const forceRefresh = readBooleanField(input, 'forceRefresh') === true;

  const postSyncedPayload = async (graph: IncidentWorkspaceGraphSnapshot, cacheHit: boolean) => {
    const systemGraphSnapshot = await buildSyncSystemGraphSnapshot({
      requestId,
      workspacePath: workspacePath || graph.workspace.path || '',
      projectPath: selectedProjectPath,
      graphSnapshot: graph,
    });

    host.postChatBrainWebviewMessage({
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

  const cached = host.context.globalState.get<{
    graph: IncidentWorkspaceGraphSnapshot;
    timestamp: number;
  }>(cacheKey);
  if (!forceRefresh && cached && now - cached.timestamp < cacheTtl) {
    await postSyncedPayload(cached.graph, true);
    return;
  }

  // Ensure a watcher is running for this workspace so file changes invalidate the cache.
  ensureSystemGraphWatcher(host, workspacePath, cacheKey);

  const graph = await host.getWorkspaceGraphSnapshot({
    workspacePath,
    projectPath: selectedProjectPath,
    projectName: explicitProjectName,
    projectType: explicitProjectType,
    scopeIntent: selectedProjectPath ? 'project' : 'workspace',
  });
  await host.context.globalState.update(cacheKey, { graph, timestamp: now });

  await postSyncedPayload(graph, false);
}

export async function handleAiChatFeedback(
  host: ChatBrainLifecycleHost,
  data: unknown,
  requestId?: string
): Promise<void> {
  const input = getWebviewMessageDataRecord({ command: 'aiChatFeedback', data });
  const conversationId = readStringField(input, 'conversationId');
  const messageId = readStringField(input, 'messageId') ?? `feedback-${Date.now()}`;
  const rating = readIncidentFeedbackRating(input);
  const note = readStringField(input, 'note')?.trim().slice(0, 500);

  const conv = conversationId ? host.chatBrainConversations.get(conversationId) : undefined;
  const workspacePath = readTrimmedStringField(input, 'workspacePath') ?? conv?.workspacePath;

  if (conv) {
    conv.phase = rating === 'helpful' ? 'learn' : conv.phase === 'learn' ? 'verify' : conv.phase;
    conv.lastActivityAt = Date.now();
    host.chatBrainConversations.set(conversationId!, conv);
  }

  host.trackStudioEvent('workspai.studio.response_feedback', workspacePath, {
    conversationId,
    messageId,
    rating,
    note,
    framework: conv?.framework ?? 'unknown',
    projectPath: conv?.projectPath,
  });

  const uiPrefs = host.getUiPreferences(workspacePath);
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
      host.postChatBrainWebviewMessage({
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

  host.postChatBrainWebviewMessage({
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

export function ensureSystemGraphWatcher(
  host: ChatBrainLifecycleHost,
  workspacePath: string | undefined,
  cacheKey: string
): void {
  if (!workspacePath) {
    return;
  }
  if (host.systemGraphWatcherByPath.has(workspacePath)) {
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
      void host.context.globalState.update(cacheKey, undefined);
    },
  })
    .then((handle) => {
      if (!host.systemGraphWatcherByPath.has(workspacePath)) {
        host.systemGraphWatcherByPath.set(workspacePath, handle);
      } else {
        // Another call already registered a watcher while we were awaiting — dispose the duplicate.
        handle.dispose();
      }
    })
    .catch(() => {
      // Watcher creation is best-effort; panel remains functional without it.
    });
}
