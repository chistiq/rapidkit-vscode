import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '@/components/StudioRedesign/state/studioState';
import {
  buildIncidentChatQueryPayload,
  buildIncidentChatStartPayload,
  isIncidentDuplicateRequest,
  normalizeIncidentActionResultPayload,
  normalizeIncidentDonePayload,
  normalizeIncidentPartialFailurePayload,
  normalizeIncidentProtocolMeta,
  type IncidentProjectSelection,
  type NormalizedIncidentActionResultPayload,
} from '@/lib/incidentStudioPayload';
import { logChatBrain } from '@/lib/chatBrainDebug';

export type IncidentStudioChatBrainBoard = {
  actions?: Array<{ label: string }>;
  data?: { command?: string };
};

export type IncidentStudioChatBrainHostMessage = {
  command: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type UseIncidentStudioChatBrainOptions = {
  workspacePath: string;
  workspaceName?: string;
  projectSelection?: IncidentProjectSelection | null;
  modelId?: string | null;
  postMessage: (command: string, data?: unknown) => void;
};

function createRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAssistantChatMessage(input: {
  id: string;
  content: string;
  phase?: ChatMessage['phase'];
}): ChatMessage {
  return {
    id: input.id,
    role: 'assistant',
    content: input.content,
    timestamp: new Date().toISOString(),
    phase: input.phase ?? 'diagnose',
    sources: [{ type: 'system', label: 'chat-brain' }],
  };
}

export function useIncidentStudioChatBrain({
  workspacePath,
  workspaceName,
  projectSelection,
  modelId,
  postMessage,
}: UseIncidentStudioChatBrainOptions) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [incomingMessage, setIncomingMessage] = useState<ChatMessage | null>(null);
  const [incomingActionResult, setIncomingActionResult] =
    useState<NormalizedIncidentActionResultPayload | null>(null);
  const [board, setBoard] = useState<IncidentStudioChatBrainBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamTextRef = useRef('');
  const messageIdRef = useRef<string | null>(null);
  const lastDoneRequestIdRef = useRef<string | null>(null);
  const lastActionResultRequestIdRef = useRef<string | null>(null);
  const lastPartialFailureRequestIdRef = useRef<string | null>(null);
  const lastErrorRequestIdRef = useRef<string | null>(null);

  const resetStreamState = useCallback(() => {
    streamTextRef.current = '';
    setStreamText('');
    messageIdRef.current = null;
  }, []);

  const submitQuery = useCallback(
    (query: string) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery || !workspacePath.trim()) {
        return;
      }

      const nextConversationId =
        conversationId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (!conversationId) {
        setConversationId(nextConversationId);
        postMessage(
          'aiChatStart',
          buildIncidentChatStartPayload({
            workspacePath,
            projectSelection,
            resumeConversationId: nextConversationId,
            requestId: createRequestId('cb'),
          })
        );
      }

      setIsStreaming(true);
      setError(null);
      setIncomingActionResult(null);
      setBoard(null);
      resetStreamState();

      postMessage(
        'aiChatQuery',
        buildIncidentChatQueryPayload({
          conversationId: nextConversationId,
          workspacePath,
          projectSelection,
          requestId: createRequestId('cbq'),
          modelId: modelId ?? undefined,
          message: trimmedQuery,
        })
      );
    },
    [conversationId, modelId, postMessage, projectSelection, resetStreamState, workspacePath]
  );

  const handleHostMessage = useCallback(
    (message: IncidentStudioChatBrainHostMessage): boolean => {
      switch (message.command) {
        case 'aiChatStarted':
          if (typeof message.data?.conversationId === 'string') {
            setConversationId(message.data.conversationId);
          }
          resetStreamState();
          setIsStreaming(false);
          logChatBrain(message.command, message.data);
          return true;
        case 'aiChatChunk':
          if (
            typeof message.data?.messageId === 'string' &&
            message.data.messageId !== messageIdRef.current
          ) {
            messageIdRef.current = message.data.messageId;
            const nextChunk = typeof message.data?.chunk === 'string' ? message.data.chunk : '';
            streamTextRef.current = nextChunk;
            setStreamText(nextChunk);
          } else {
            const nextChunk =
              streamTextRef.current +
              (typeof message.data?.chunk === 'string' ? message.data.chunk : '');
            streamTextRef.current = nextChunk;
            setStreamText(nextChunk);
          }
          setIsStreaming(true);
          setError(null);
          logChatBrain(message.command, message.data);
          return true;
        case 'aiChatActionBoard':
          if (message.data?.board) {
            setBoard(message.data.board as IncidentStudioChatBrainBoard);
          }
          logChatBrain(message.command, message.data);
          return true;
        case 'aiChatActionResult': {
          const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
          if (
            isIncidentDuplicateRequest(lastActionResultRequestIdRef.current, protocolMeta.requestId)
          ) {
            return true;
          }
          lastActionResultRequestIdRef.current = protocolMeta.requestId;
          setIncomingActionResult(normalizeIncidentActionResultPayload(message.data));
          if (message.data?.board) {
            setBoard(message.data.board as IncidentStudioChatBrainBoard);
          }
          logChatBrain(message.command, message.data);
          return true;
        }
        case 'aiChatDone': {
          const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
          if (isIncidentDuplicateRequest(lastDoneRequestIdRef.current, protocolMeta.requestId)) {
            return true;
          }
          lastDoneRequestIdRef.current = protocolMeta.requestId;
          setIsStreaming(false);

          const donePayload = normalizeIncidentDonePayload(message.data);
          const finalText =
            typeof donePayload.finalText === 'string' && donePayload.finalText.trim()
              ? donePayload.finalText
              : streamTextRef.current;

          if (finalText.trim()) {
            setIncomingMessage(
              buildAssistantChatMessage({
                id: messageIdRef.current || `assistant-${Date.now()}`,
                content: finalText,
              })
            );
          }

          resetStreamState();
          logChatBrain(message.command, message.data);
          return true;
        }
        case 'aiChatPartialFailure': {
          const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
          if (
            isIncidentDuplicateRequest(
              lastPartialFailureRequestIdRef.current,
              protocolMeta.requestId
            )
          ) {
            return true;
          }
          lastPartialFailureRequestIdRef.current = protocolMeta.requestId;

          const partialFailure = normalizeIncidentPartialFailurePayload(message.data);
          setIsStreaming(false);

          if (streamTextRef.current.trim()) {
            setIncomingMessage(
              buildAssistantChatMessage({
                id: messageIdRef.current || `assistant-partial-${Date.now()}`,
                content: `${streamTextRef.current}\n\nResponse interrupted before completion.`,
              })
            );
          }

          resetStreamState();
          if (message.data?.board) {
            setBoard(message.data.board as IncidentStudioChatBrainBoard);
          }
          setError(partialFailure.message);
          logChatBrain(message.command, message.data);
          return true;
        }
        case 'aiChatError': {
          const protocolMeta = normalizeIncidentProtocolMeta(message.meta);
          if (isIncidentDuplicateRequest(lastErrorRequestIdRef.current, protocolMeta.requestId)) {
            return true;
          }
          lastErrorRequestIdRef.current = protocolMeta.requestId;

          setIsStreaming(false);
          if (streamTextRef.current.trim()) {
            setIncomingMessage(
              buildAssistantChatMessage({
                id: messageIdRef.current || `assistant-partial-${Date.now()}`,
                content: `${streamTextRef.current}\n\nResponse interrupted before completion.`,
              })
            );
          }
          resetStreamState();
          setError(
            typeof message.data?.message === 'string'
              ? message.data.message
              : 'Chat Brain request failed.'
          );
          logChatBrain(message.command, message.data);
          return true;
        }
        default:
          return false;
      }
    },
    [resetStreamState]
  );

  return {
    workspaceName,
    conversationId,
    streamText,
    isStreaming,
    incomingMessage,
    incomingActionResult,
    board,
    error,
    submitQuery,
    handleHostMessage,
  };
}

export const INCIDENT_STUDIO_CHAT_BRAIN_HOST_COMMANDS = [
  'aiChatStarted',
  'aiChatChunk',
  'aiChatActionBoard',
  'aiChatActionResult',
  'aiChatDone',
  'aiChatPartialFailure',
  'aiChatError',
] as const;

export function isIncidentStudioChatBrainHostCommand(
  value: string
): value is (typeof INCIDENT_STUDIO_CHAT_BRAIN_HOST_COMMANDS)[number] {
  return (INCIDENT_STUDIO_CHAT_BRAIN_HOST_COMMANDS as readonly string[]).includes(value);
}
