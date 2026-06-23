import * as vscode from 'vscode';

import { createExtensionWebviewMessage } from '../../contracts/webviewProtocol';

export const INCIDENT_STUDIO_SESSION_KEY_PREFIX = 'rapidkit.incidentStudio.session.';

export const MAX_INCIDENT_STUDIO_APPROVAL_AUDIT_EVENTS = 50;
export const MAX_INCIDENT_STUDIO_CHAT_MESSAGES = 100;
export const MAX_INCIDENT_STUDIO_PROOF_EVENTS = 50;
export const MAX_INCIDENT_STUDIO_EXECUTION_TRANSCRIPTS = 50;

export type IncidentStudioSessionPhase = 'detect' | 'diagnose' | 'plan' | 'verify' | 'learn';

export type IncidentStudioApprovalAuditOperation =
  | 'approval-confirmed'
  | 'approval-revoked'
  | 'apply-requested'
  | 'verify-requested'
  | 'rollback-requested';

export type IncidentStudioApprovalAuditEvent = {
  id: string;
  actionId: string;
  operation: IncidentStudioApprovalAuditOperation;
  title: string;
  summary?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  detail?: string;
  provider?: string;
  happenedAt: string;
};

export type IncidentStudioChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  phase?: IncidentStudioSessionPhase;
  confidence?: number;
  sources?: Array<{
    type?: string;
    label?: string;
    freshness?: string;
    confidence?: number;
  }>;
};

export type IncidentStudioProofEvent = {
  schemaVersion: 'workspai.studio.proof-event.v1';
  actionId: string;
  actionTitle?: string;
  status: 'started' | 'completed' | 'failed';
  summary: string;
  generatedAt: string;
  evidencePath?: string | null;
  evidenceSha256?: string | null;
  score?: number;
  verdict?: 'ready' | 'needs-attention' | 'blocked';
  gatePassed?: boolean;
  commandCount?: number;
  failedCommandCount?: number;
  executionTranscriptId?: string;
  durationMs?: number;
  source: 'studio-action' | 'ai-action' | 'ship-loop' | 'inline-command';
};

export type IncidentStudioExecutionTranscriptStep = {
  id: string;
  command: string;
  status: 'passed' | 'failed' | 'blocked' | 'skipped';
  exitCode?: number | null;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  cwd?: string;
  stdoutPreview?: string;
  stderrPreview?: string;
  failureReason?: string;
};

export type IncidentStudioExecutionTranscript = {
  schemaVersion: 'workspai.studio.execution-transcript.v1';
  id: string;
  actionId: string;
  source: IncidentStudioProofEvent['source'];
  title: string;
  status: 'completed' | 'failed' | 'blocked';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  commandCount: number;
  failedCommandCount: number;
  steps: IncidentStudioExecutionTranscriptStep[];
  evidencePath?: string | null;
  evidenceSha256?: string | null;
};

export type IncidentStudioSession = {
  workspacePath: string;
  phase: IncidentStudioSessionPhase;
  approvalAuditEvents: IncidentStudioApprovalAuditEvent[];
  proofEvents: IncidentStudioProofEvent[];
  executionTranscripts: IncidentStudioExecutionTranscript[];
  chatMessages: IncidentStudioChatMessage[];
  updatedAt: string;
};

function buildIncidentStudioSessionKey(workspacePath: string): string {
  return `${INCIDENT_STUDIO_SESSION_KEY_PREFIX}${workspacePath.trim()}`;
}

function normalizePhase(value: unknown): IncidentStudioSessionPhase {
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

function normalizeApprovalOperation(value: unknown): IncidentStudioApprovalAuditOperation {
  if (
    value === 'approval-confirmed' ||
    value === 'approval-revoked' ||
    value === 'apply-requested' ||
    value === 'verify-requested' ||
    value === 'rollback-requested'
  ) {
    return value;
  }
  return 'approval-confirmed';
}

function normalizeApprovalAuditEvent(
  value: unknown,
  index: number
): IncidentStudioApprovalAuditEvent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const event = value as Record<string, unknown>;
  const actionId = typeof event.actionId === 'string' ? event.actionId.trim() : '';
  const title = typeof event.title === 'string' ? event.title.trim() : '';
  if (!actionId || !title) {
    return null;
  }

  return {
    id:
      typeof event.id === 'string' && event.id.trim()
        ? event.id.trim()
        : `approval-${Date.now()}-${index}`,
    actionId,
    operation: normalizeApprovalOperation(event.operation),
    title,
    summary: typeof event.summary === 'string' ? event.summary : undefined,
    riskLevel:
      event.riskLevel === 'low' || event.riskLevel === 'medium' || event.riskLevel === 'high'
        ? event.riskLevel
        : undefined,
    detail: typeof event.detail === 'string' ? event.detail : undefined,
    provider: typeof event.provider === 'string' ? event.provider : undefined,
    happenedAt:
      typeof event.happenedAt === 'string' && event.happenedAt.trim()
        ? event.happenedAt
        : new Date().toISOString(),
  };
}

function normalizeChatMessage(value: unknown, index: number): IncidentStudioChatMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const message = value as Record<string, unknown>;
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (!content) {
    return null;
  }

  const role = message.role === 'assistant' ? 'assistant' : 'user';

  return {
    id:
      typeof message.id === 'string' && message.id.trim()
        ? message.id.trim()
        : `message-${Date.now()}-${index}`,
    role,
    content,
    timestamp:
      typeof message.timestamp === 'string' && message.timestamp.trim()
        ? message.timestamp
        : new Date().toISOString(),
    phase: message.phase ? normalizePhase(message.phase) : undefined,
    confidence:
      typeof message.confidence === 'number' && Number.isFinite(message.confidence)
        ? message.confidence
        : undefined,
    sources: Array.isArray(message.sources)
      ? message.sources
          .filter(
            (source): source is Record<string, unknown> => !!source && typeof source === 'object'
          )
          .map((source) => ({
            type: typeof source.type === 'string' ? source.type : undefined,
            label: typeof source.label === 'string' ? source.label : undefined,
            freshness: typeof source.freshness === 'string' ? source.freshness : undefined,
            confidence:
              typeof source.confidence === 'number' && Number.isFinite(source.confidence)
                ? source.confidence
                : undefined,
          }))
      : undefined,
  };
}

function normalizeProofEvent(value: unknown, index: number): IncidentStudioProofEvent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const event = value as Record<string, unknown>;
  const actionId = typeof event.actionId === 'string' ? event.actionId.trim() : '';
  const summary = typeof event.summary === 'string' ? event.summary.trim() : '';
  if (!actionId || !summary) {
    return null;
  }

  const status =
    event.status === 'started' || event.status === 'completed' || event.status === 'failed'
      ? event.status
      : 'completed';
  const source =
    event.source === 'studio-action' ||
    event.source === 'ai-action' ||
    event.source === 'ship-loop' ||
    event.source === 'inline-command'
      ? event.source
      : 'studio-action';
  const verdict =
    event.verdict === 'ready' || event.verdict === 'needs-attention' || event.verdict === 'blocked'
      ? event.verdict
      : undefined;

  return {
    schemaVersion: 'workspai.studio.proof-event.v1',
    actionId,
    actionTitle: typeof event.actionTitle === 'string' ? event.actionTitle : undefined,
    status,
    summary,
    generatedAt:
      typeof event.generatedAt === 'string' && event.generatedAt.trim()
        ? event.generatedAt
        : new Date(Date.now() + index).toISOString(),
    evidencePath:
      typeof event.evidencePath === 'string' || event.evidencePath === null
        ? event.evidencePath
        : undefined,
    evidenceSha256: typeof event.evidenceSha256 === 'string' ? event.evidenceSha256 : undefined,
    score:
      typeof event.score === 'number' && Number.isFinite(event.score) ? event.score : undefined,
    verdict,
    gatePassed: typeof event.gatePassed === 'boolean' ? event.gatePassed : undefined,
    commandCount:
      typeof event.commandCount === 'number' && Number.isFinite(event.commandCount)
        ? event.commandCount
        : undefined,
    failedCommandCount:
      typeof event.failedCommandCount === 'number' && Number.isFinite(event.failedCommandCount)
        ? event.failedCommandCount
        : undefined,
    executionTranscriptId:
      typeof event.executionTranscriptId === 'string' && event.executionTranscriptId.trim()
        ? event.executionTranscriptId.trim()
        : undefined,
    durationMs:
      typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
        ? Math.max(0, Math.round(event.durationMs))
        : undefined,
    source,
  };
}

function normalizeExecutionTranscriptStep(
  value: unknown,
  index: number
): IncidentStudioExecutionTranscriptStep | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const step = value as Record<string, unknown>;
  const command = typeof step.command === 'string' ? step.command.trim() : '';
  if (!command) {
    return null;
  }

  const status =
    step.status === 'passed' ||
    step.status === 'failed' ||
    step.status === 'blocked' ||
    step.status === 'skipped'
      ? step.status
      : step.exitCode === 0
        ? 'passed'
        : 'failed';

  return {
    id:
      typeof step.id === 'string' && step.id.trim()
        ? step.id.trim()
        : `step-${Date.now()}-${index}`,
    command,
    status,
    exitCode:
      typeof step.exitCode === 'number' && Number.isFinite(step.exitCode)
        ? step.exitCode
        : step.exitCode === null
          ? null
          : undefined,
    startedAt:
      typeof step.startedAt === 'string' && step.startedAt.trim() ? step.startedAt : undefined,
    completedAt:
      typeof step.completedAt === 'string' && step.completedAt.trim()
        ? step.completedAt
        : undefined,
    durationMs:
      typeof step.durationMs === 'number' && Number.isFinite(step.durationMs)
        ? Math.max(0, Math.round(step.durationMs))
        : undefined,
    cwd: typeof step.cwd === 'string' && step.cwd.trim() ? step.cwd : undefined,
    stdoutPreview:
      typeof step.stdoutPreview === 'string' && step.stdoutPreview.trim()
        ? step.stdoutPreview.slice(0, 4000)
        : undefined,
    stderrPreview:
      typeof step.stderrPreview === 'string' && step.stderrPreview.trim()
        ? step.stderrPreview.slice(0, 4000)
        : undefined,
    failureReason:
      typeof step.failureReason === 'string' && step.failureReason.trim()
        ? step.failureReason.slice(0, 1000)
        : undefined,
  };
}

function normalizeExecutionTranscript(
  value: unknown,
  index: number
): IncidentStudioExecutionTranscript | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const transcript = value as Record<string, unknown>;
  const id = typeof transcript.id === 'string' ? transcript.id.trim() : '';
  const actionId = typeof transcript.actionId === 'string' ? transcript.actionId.trim() : '';
  const title = typeof transcript.title === 'string' ? transcript.title.trim() : '';
  const steps = Array.isArray(transcript.steps)
    ? transcript.steps
        .map((step, stepIndex) => normalizeExecutionTranscriptStep(step, stepIndex))
        .filter((step): step is IncidentStudioExecutionTranscriptStep => step !== null)
    : [];
  if (!id || !actionId || !title || steps.length === 0) {
    return null;
  }

  const source =
    transcript.source === 'studio-action' ||
    transcript.source === 'ai-action' ||
    transcript.source === 'ship-loop' ||
    transcript.source === 'inline-command'
      ? transcript.source
      : 'studio-action';
  const status =
    transcript.status === 'completed' ||
    transcript.status === 'failed' ||
    transcript.status === 'blocked'
      ? transcript.status
      : steps.some((step) => step.status === 'failed' || step.status === 'blocked')
        ? 'failed'
        : 'completed';
  const startedAt =
    typeof transcript.startedAt === 'string' && transcript.startedAt.trim()
      ? transcript.startedAt
      : steps[0]?.startedAt || new Date(Date.now() + index).toISOString();
  const completedAt =
    typeof transcript.completedAt === 'string' && transcript.completedAt.trim()
      ? transcript.completedAt
      : steps[steps.length - 1]?.completedAt || startedAt;

  return {
    schemaVersion: 'workspai.studio.execution-transcript.v1',
    id,
    actionId,
    source,
    title,
    status,
    startedAt,
    completedAt,
    durationMs:
      typeof transcript.durationMs === 'number' && Number.isFinite(transcript.durationMs)
        ? Math.max(0, Math.round(transcript.durationMs))
        : Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
    commandCount:
      typeof transcript.commandCount === 'number' && Number.isFinite(transcript.commandCount)
        ? transcript.commandCount
        : steps.length,
    failedCommandCount:
      typeof transcript.failedCommandCount === 'number' &&
      Number.isFinite(transcript.failedCommandCount)
        ? transcript.failedCommandCount
        : steps.filter((step) => step.status === 'failed' || step.status === 'blocked').length,
    steps,
    evidencePath:
      typeof transcript.evidencePath === 'string' || transcript.evidencePath === null
        ? transcript.evidencePath
        : undefined,
    evidenceSha256:
      typeof transcript.evidenceSha256 === 'string' ? transcript.evidenceSha256 : undefined,
  };
}

function createEmptyIncidentStudioSession(workspacePath: string): IncidentStudioSession {
  return {
    workspacePath: workspacePath.trim(),
    phase: 'detect',
    approvalAuditEvents: [],
    proofEvents: [],
    executionTranscripts: [],
    chatMessages: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeIncidentStudioSession(
  workspacePath: string,
  value: unknown
): IncidentStudioSession {
  if (!value || typeof value !== 'object') {
    return createEmptyIncidentStudioSession(workspacePath);
  }

  const session = value as Record<string, unknown>;
  const approvalAuditEvents = Array.isArray(session.approvalAuditEvents)
    ? session.approvalAuditEvents
        .map((event, index) => normalizeApprovalAuditEvent(event, index))
        .filter((event): event is IncidentStudioApprovalAuditEvent => event !== null)
        .slice(0, MAX_INCIDENT_STUDIO_APPROVAL_AUDIT_EVENTS)
    : [];
  const chatMessages = Array.isArray(session.chatMessages)
    ? session.chatMessages
        .map((message, index) => normalizeChatMessage(message, index))
        .filter((message): message is IncidentStudioChatMessage => message !== null)
        .slice(-MAX_INCIDENT_STUDIO_CHAT_MESSAGES)
    : [];
  const proofEvents = Array.isArray(session.proofEvents)
    ? session.proofEvents
        .map((event, index) => normalizeProofEvent(event, index))
        .filter((event): event is IncidentStudioProofEvent => event !== null)
        .slice(0, MAX_INCIDENT_STUDIO_PROOF_EVENTS)
    : [];
  const executionTranscripts = Array.isArray(session.executionTranscripts)
    ? session.executionTranscripts
        .map((transcript, index) => normalizeExecutionTranscript(transcript, index))
        .filter(
          (transcript): transcript is IncidentStudioExecutionTranscript => transcript !== null
        )
        .slice(0, MAX_INCIDENT_STUDIO_EXECUTION_TRANSCRIPTS)
    : [];

  return {
    workspacePath: workspacePath.trim(),
    phase: normalizePhase(session.phase),
    approvalAuditEvents,
    proofEvents,
    executionTranscripts,
    chatMessages,
    updatedAt:
      typeof session.updatedAt === 'string' && session.updatedAt.trim()
        ? session.updatedAt
        : new Date().toISOString(),
  };
}

export function readIncidentStudioSession(
  context: vscode.ExtensionContext,
  workspacePath: string
): IncidentStudioSession {
  const trimmedWorkspacePath = workspacePath.trim();
  if (!trimmedWorkspacePath) {
    return createEmptyIncidentStudioSession('');
  }

  const stored = context.globalState.get<unknown>(
    buildIncidentStudioSessionKey(trimmedWorkspacePath)
  );
  return normalizeIncidentStudioSession(trimmedWorkspacePath, stored);
}

export async function writeIncidentStudioSession(
  context: vscode.ExtensionContext,
  workspacePath: string,
  session: IncidentStudioSession
): Promise<IncidentStudioSession> {
  const trimmedWorkspacePath = workspacePath.trim();
  if (!trimmedWorkspacePath) {
    return createEmptyIncidentStudioSession('');
  }

  const normalized = normalizeIncidentStudioSession(trimmedWorkspacePath, {
    ...session,
    workspacePath: trimmedWorkspacePath,
    updatedAt: new Date().toISOString(),
  });

  await context.globalState.update(buildIncidentStudioSessionKey(trimmedWorkspacePath), normalized);
  return normalized;
}

export async function appendApprovalAuditEvent(
  context: vscode.ExtensionContext,
  workspacePath: string,
  event: Omit<IncidentStudioApprovalAuditEvent, 'id' | 'happenedAt'> &
    Partial<Pick<IncidentStudioApprovalAuditEvent, 'id' | 'happenedAt'>>
): Promise<IncidentStudioSession> {
  const session = readIncidentStudioSession(context, workspacePath);
  const normalizedEvent =
    normalizeApprovalAuditEvent(event, session.approvalAuditEvents.length) ||
    normalizeApprovalAuditEvent(
      {
        ...event,
        title: event.title || 'Approval event',
        actionId: event.actionId || 'unknown-action',
      },
      session.approvalAuditEvents.length
    );

  if (!normalizedEvent) {
    return session;
  }

  return writeIncidentStudioSession(context, workspacePath, {
    ...session,
    approvalAuditEvents: [normalizedEvent, ...session.approvalAuditEvents].slice(
      0,
      MAX_INCIDENT_STUDIO_APPROVAL_AUDIT_EVENTS
    ),
  });
}

export async function replaceProofEvents(
  context: vscode.ExtensionContext,
  workspacePath: string,
  proofEvents: IncidentStudioProofEvent[]
): Promise<IncidentStudioSession> {
  const session = readIncidentStudioSession(context, workspacePath);
  const normalizedProofEvents = proofEvents
    .map((event, index) => normalizeProofEvent(event, index))
    .filter((event): event is IncidentStudioProofEvent => event !== null)
    .slice(0, MAX_INCIDENT_STUDIO_PROOF_EVENTS);

  return writeIncidentStudioSession(context, workspacePath, {
    ...session,
    proofEvents: normalizedProofEvents,
  });
}

export async function replaceExecutionTranscripts(
  context: vscode.ExtensionContext,
  workspacePath: string,
  executionTranscripts: IncidentStudioExecutionTranscript[]
): Promise<IncidentStudioSession> {
  const session = readIncidentStudioSession(context, workspacePath);
  const normalizedTranscripts = executionTranscripts
    .map((transcript, index) => normalizeExecutionTranscript(transcript, index))
    .filter((transcript): transcript is IncidentStudioExecutionTranscript => transcript !== null)
    .slice(0, MAX_INCIDENT_STUDIO_EXECUTION_TRANSCRIPTS);

  return writeIncidentStudioSession(context, workspacePath, {
    ...session,
    executionTranscripts: normalizedTranscripts,
  });
}

export async function replaceChatMessages(
  context: vscode.ExtensionContext,
  workspacePath: string,
  messages: IncidentStudioChatMessage[]
): Promise<IncidentStudioSession> {
  const session = readIncidentStudioSession(context, workspacePath);
  const normalizedMessages = messages
    .map((message, index) => normalizeChatMessage(message, index))
    .filter((message): message is IncidentStudioChatMessage => message !== null)
    .slice(-MAX_INCIDENT_STUDIO_CHAT_MESSAGES);

  return writeIncidentStudioSession(context, workspacePath, {
    ...session,
    chatMessages: normalizedMessages,
  });
}

export async function postSessionToWebview(
  webview: vscode.Webview,
  workspacePath: string,
  context: vscode.ExtensionContext
): Promise<void> {
  const session = readIncidentStudioSession(context, workspacePath);
  webview.postMessage(createExtensionWebviewMessage('incidentStudioSessionLoaded', session));
}
