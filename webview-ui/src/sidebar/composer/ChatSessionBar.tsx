import { History, MessageSquarePlus } from 'lucide-react';
import type { ChatSession } from '../sidebarSessions';

interface ChatSessionBarProps {
  activeSession: ChatSession | null;
  sessionCount: number;
  compact?: boolean;
  allowNewSession?: boolean;
  statusText?: string | null;
  onNewSession: () => void;
  onOpenHistory: () => void;
}

function sessionStatusLabel(session: ChatSession | null): string | null {
  if (!session) {
    return null;
  }
  if (session.status === 'streaming') {
    return session.activityLabel || 'Replying…';
  }
  if (session.status === 'error') {
    return 'Stopped';
  }
  if (session.incident?.repairStatus) {
    const statusLabels: Record<string, string> = {
      ready: 'Ready',
      running: 'Running',
      review: 'Needs review',
      done: 'Done',
      blocked: 'Blocked',
    };
    const label = statusLabels[session.incident.repairStatus] ?? session.incident.repairStatus;
    return session.incident.lastActionTitle
      ? `${label} · ${session.incident.lastActionTitle}`
      : label;
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
  compact = false,
  allowNewSession = true,
  statusText,
  onNewSession,
  onOpenHistory,
}: ChatSessionBarProps) {
  const title = activeSession?.title ?? 'New conversation';
  const status = statusText === undefined ? sessionStatusLabel(activeSession) : statusText;

  return (
    <div
      className={`ws-session-bar${compact ? ' ws-session-bar--compact' : ''}`}
      role="group"
      aria-label="Chat session"
    >
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
        {allowNewSession ? (
          <button
            type="button"
            className="ws-session-bar__action"
            onClick={onNewSession}
            title="Start a new chat for a different topic"
          >
            <MessageSquarePlus size={13} aria-hidden={true} />
            <span>{compact ? 'New' : 'New chat'}</span>
          </button>
        ) : null}
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
