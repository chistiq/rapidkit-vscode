import { History, MessageSquarePlus } from 'lucide-react';
import type { ChatSession } from '../sidebarSessions';

interface ChatSessionBarProps {
  activeSession: ChatSession | null;
  sessionCount: number;
  onNewSession: () => void;
  onOpenHistory: () => void;
}

function sessionStatusLabel(session: ChatSession | null): string | null {
  if (!session) {
    return null;
  }
  if (session.status === 'streaming') {
    return 'Replying…';
  }
  if (session.status === 'error') {
    return 'Stopped';
  }
  const turns = session.messages.filter((m) => m.content.trim().length > 0).length;
  if (turns > 0) {
    return `${Math.ceil(turns / 2)} turn${Math.ceil(turns / 2) === 1 ? '' : 's'}`;
  }
  return null;
}

/** Visible session context above Advisor / Studio composers. */
export function ChatSessionBar({
  activeSession,
  sessionCount,
  onNewSession,
  onOpenHistory,
}: ChatSessionBarProps) {
  const title = activeSession?.title ?? 'New conversation';
  const status = sessionStatusLabel(activeSession);

  return (
    <div className="ws-session-bar" role="group" aria-label="Chat session">
      <button
        type="button"
        className="ws-session-bar__context"
        onClick={onOpenHistory}
        title="Browse saved sessions"
      >
        <span className="ws-session-bar__title">{title}</span>
        {status ? <small className="ws-session-bar__meta">{status}</small> : null}
        {sessionCount > 1 ? (
          <small className="ws-session-bar__meta">{sessionCount} saved</small>
        ) : null}
      </button>
      <div className="ws-session-bar__actions">
        <button
          type="button"
          className="ws-session-bar__action"
          onClick={onNewSession}
          title="Start a new chat for a different topic"
        >
          <MessageSquarePlus size={13} aria-hidden={true} />
          <span>New chat</span>
        </button>
        <button
          type="button"
          className="ws-session-bar__action ws-session-bar__action--icon"
          onClick={onOpenHistory}
          aria-label="Session history"
          title="Session history"
        >
          <History size={13} aria-hidden={true} />
        </button>
      </div>
    </div>
  );
}
