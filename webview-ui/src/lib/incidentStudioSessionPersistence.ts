import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../components/StudioRedesign/state/studioState';
import type { StudioApprovalAuditEvent } from '../components/StudioRedesign/state/studioActionAudit';

export type IncidentStudioSessionPayload = {
  workspacePath: string;
  messages: ChatMessage[];
  approvalAuditEvents: StudioApprovalAuditEvent[];
  savedAt?: string;
};

export type IncidentStudioSessionSavePayload = Omit<IncidentStudioSessionPayload, 'savedAt'> & {
  savedAt?: string;
};

const SAVE_DEBOUNCE_MS = 750;

function normalizeSessionPayload(
  data: unknown,
  workspacePath: string
): IncidentStudioSessionPayload {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    workspacePath: typeof record.workspacePath === 'string' ? record.workspacePath : workspacePath,
    messages: Array.isArray(record.messages) ? (record.messages as ChatMessage[]) : [],
    approvalAuditEvents: Array.isArray(record.approvalAuditEvents)
      ? (record.approvalAuditEvents as StudioApprovalAuditEvent[])
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
};

export function useIncidentStudioSessionPersistence({
  workspacePath,
  postMessage,
  messages,
  approvalAuditEvents,
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
        approvalAuditEvents,
        savedAt: new Date().toISOString(),
      };
      postMessage('saveIncidentStudioSession', payload);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [approvalAuditEvents, messages, postMessage, workspacePath]);

  return {
    loadedSession,
    handleHostMessage,
    isSessionLoaded: hasLoadedRef.current,
  };
}
