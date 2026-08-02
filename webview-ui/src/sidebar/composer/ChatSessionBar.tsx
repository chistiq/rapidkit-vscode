import { History, MessageSquarePlus } from 'lucide-react';
import { chatSessionContextLabel, type ChatSession } from '../sidebarSessions';

interface ChatSessionBarProps {
  activeSession: ChatSession | null;
  sessionCount: number;
  compact?: boolean;
  allowNewSession?: boolean;
  statusText?: string | null;
  contextText?: string | null;
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
  if (session.incident?.repairStatus) {
    const statusLabels: Record<string, string> = {
      ready: 'Ready',
      running: 'Running',
      review: 'Decision required',
      done: 'Done',
      blocked: 'Blocked',
    };
    const label = statusLabels[session.incident.repairStatus] ?? session.incident.repairStatus;
    return session.incident.lastActionTitle
      ? `${label} · ${session.incident.lastActionTitle}`
      : label;
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
  compact = false,
  allowNewSession = true,
  statusText,
  contextText,
  onNewSession,
  onOpenHistory,
}: ChatSessionBarProps) {
  const title = activeSession?.title ?? 'New conversation';
  const status = statusText === undefined ? sessionStatusLabel(activeSession) : statusText;
  const context =
    contextText === undefined
      ? activeSession?.incident || activeSession?.scope || activeSession?.editorIssue
        ? chatSessionContextLabel(activeSession)
        : null
      : contextText;

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
        {context ? <small className="ws-session-bar__scope">{context}</small> : null}
        <span className="ws-session-bar__summary">
          <span className="ws-session-bar__title">{title}</span>
          {status ? <small className="ws-session-bar__meta">{status}</small> : null}
          {sessionCount > 1 ? (
            <small className="ws-session-bar__meta">{sessionCount} saved</small>
          ) : null}
        </span>
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
          aria-label="Switch session or workspace context"
          title="Switch session or workspace context"
        >
          <History size={13} aria-hidden={true} />
        </button>
      </div>
    </div>
  );
}
