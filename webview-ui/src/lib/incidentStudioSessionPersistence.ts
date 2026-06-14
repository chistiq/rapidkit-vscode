import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMessage,
  StudioExecutionTranscript,
  StudioProofEvent,
} from '../components/StudioRedesign/state/studioState';
import type { StudioApprovalAuditEvent } from '../components/StudioRedesign/state/studioActionAudit';

export type IncidentStudioSessionPayload = {
  workspacePath: string;
  messages: ChatMessage[];
  approvalAuditEvents: StudioApprovalAuditEvent[];
  proofEvents: StudioProofEvent[];
  executionTranscripts: StudioExecutionTranscript[];
  savedAt?: string;
};

export type IncidentStudioSessionSavePayload = IncidentStudioSessionPayload & {
  chatMessages: ChatMessage[];
  savedAt?: string;
};

const SAVE_DEBOUNCE_MS = 750;

function normalizeSessionPayload(
  data: unknown,
  workspacePath: string
): IncidentStudioSessionPayload {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const messages = Array.isArray(record.messages)
    ? (record.messages as ChatMessage[])
    : Array.isArray(record.chatMessages)
      ? (record.chatMessages as ChatMessage[])
      : [];
  return {
    workspacePath: typeof record.workspacePath === 'string' ? record.workspacePath : workspacePath,
    messages,
    approvalAuditEvents: Array.isArray(record.approvalAuditEvents)
      ? (record.approvalAuditEvents as StudioApprovalAuditEvent[])
      : [],
    proofEvents: Array.isArray(record.proofEvents)
      ? (record.proofEvents as StudioProofEvent[])
      : [],
    executionTranscripts: Array.isArray(record.executionTranscripts)
      ? (record.executionTranscripts as StudioExecutionTranscript[])
      : [],
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : undefined,
  };
}

export function isIncidentStudioSessionHostCommand(command: string): boolean {
  return command === 'incidentStudioSessionLoaded';
}

type UseIncidentStudioSessionPersistenceOptions = {
  workspacePath: string;
  postMessage: (command: string, data?: unknown) => void;
  messages: ChatMessage[];
  approvalAuditEvents: StudioApprovalAuditEvent[];
  proofEvents: StudioProofEvent[];
  executionTranscripts: StudioExecutionTranscript[];
};

export function useIncidentStudioSessionPersistence({
  workspacePath,
  postMessage,
  messages,
  approvalAuditEvents,
  proofEvents,
  executionTranscripts,
}: UseIncidentStudioSessionPersistenceOptions) {
  const [loadedSession, setLoadedSession] = useState<IncidentStudioSessionPayload | null>(null);
  const hasLoadedRef = useRef(false);
  const skipNextSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workspacePath) {
      return;
    }
    hasLoadedRef.current = false;
    skipNextSaveRef.current = true;
    setLoadedSession(null);
    postMessage('loadIncidentStudioSession', { workspacePath });
  }, [postMessage, workspacePath]);

  const handleHostMessage = useCallback(
    (command: string, data?: unknown) => {
      if (command !== 'incidentStudioSessionLoaded') {
        return false;
      }

      hasLoadedRef.current = true;
      skipNextSaveRef.current = true;
      setLoadedSession(normalizeSessionPayload(data, workspacePath));
      return true;
    },
    [workspacePath]
  );

  useEffect(() => {
    if (!workspacePath || !hasLoadedRef.current) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const payload: IncidentStudioSessionSavePayload = {
        workspacePath,
        messages,
        chatMessages: messages,
        approvalAuditEvents,
        proofEvents,
        executionTranscripts,
        savedAt: new Date().toISOString(),
      };
      postMessage('saveIncidentStudioSession', payload);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    approvalAuditEvents,
    executionTranscripts,
    messages,
    postMessage,
    proofEvents,
    workspacePath,
  ]);

  return {
    loadedSession,
    handleHostMessage,
    isSessionLoaded: hasLoadedRef.current,
  };
}
