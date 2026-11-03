import { SessionHistoryPicker } from '../SessionHistoryPicker';
import {
  chatSessionContextLabel,
  chatSessionFailureLabel,
  chatSessionGroupLabel,
  chatSessionKind,
  pendingChatApprovals,
  type ChatSession,
} from '../sidebarSessions';

interface ChatToolsDrawerProps {
  open: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onClose: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
}

function sessionMetaLabel(session: ChatSession): string {
  const status =
    session.status === 'streaming'
      ? pendingChatApprovals(session).length
        ? 'Waiting for approval'
        : session.waitingForInput
          ? 'Waiting for your input'
          : 'Working…'
      : session.status === 'error'
        ? chatSessionFailureLabel(session)
        : session.incident?.repairStatus || '';
  return [chatSessionContextLabel(session), status].filter(Boolean).join(' · ');
}

/** Assistant history uses the same header picker as Create. */
export function ChatToolsDrawer(props: ChatToolsDrawerProps) {
  return (
    <SessionHistoryPicker
      {...props}
      id="workspai-chat-history"
      labels={{
        history: 'Chat history',
        search: 'Search recent chats',
        all: 'All chats',
        newSession: 'New chat',
        saved: 'Saved chats',
        current: 'Current chat',
        deleteSession: 'Delete chat',
        empty: 'No saved chats yet.',
        noMatches: 'No matching chats.',
      }}
      sessions={props.sessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        meta: sessionMetaLabel(session),
        searchText: `${chatSessionContextLabel(session)} ${chatSessionGroupLabel(chatSessionKind(session))}`,
      }))}
    />
  );
}
