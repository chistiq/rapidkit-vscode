import type * as vscode from 'vscode';
import {
  appendApprovalAuditEvent,
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

export function normalizeIncidentStudioSessionPhase(value: unknown): IncidentStudioSessionPhase {
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

export async function saveDashboardIncidentStudioSession(
  context: vscode.ExtensionContext,
  workspacePath: string,
  data: unknown
): Promise<void> {
  if (!workspacePath?.trim()) {
    return;
  }

  const payload =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};

  if (typeof payload.phase === 'string') {
    const session = readIncidentStudioSession(context, workspacePath);
    await writeIncidentStudioSession(context, workspacePath, {
      ...session,
      phase: normalizeIncidentStudioSessionPhase(payload.phase),
    });
  }

  const chatMessages = Array.isArray(payload.chatMessages)
    ? payload.chatMessages
    : Array.isArray(payload.messages)
      ? payload.messages
      : null;

  if (chatMessages) {
    await replaceChatMessages(context, workspacePath, chatMessages as IncidentStudioChatMessage[]);
  }

  if (Array.isArray(payload.approvalAuditEvents)) {
    const session = readIncidentStudioSession(context, workspacePath);
    await writeIncidentStudioSession(context, workspacePath, {
      ...session,
      approvalAuditEvents: payload.approvalAuditEvents as IncidentStudioApprovalAuditEvent[],
    });
  } else if (payload.approvalAuditEvent && typeof payload.approvalAuditEvent === 'object') {
    await appendApprovalAuditEvent(
      context,
      workspacePath,
      payload.approvalAuditEvent as Omit<IncidentStudioApprovalAuditEvent, 'id' | 'happenedAt'>
    );
  }

  if (Array.isArray(payload.proofEvents)) {
    await replaceProofEvents(
      context,
      workspacePath,
      payload.proofEvents as IncidentStudioProofEvent[]
    );
  }

  if (Array.isArray(payload.executionTranscripts)) {
    await replaceExecutionTranscripts(
      context,
      workspacePath,
      payload.executionTranscripts as IncidentStudioExecutionTranscript[]
    );
  }
}
