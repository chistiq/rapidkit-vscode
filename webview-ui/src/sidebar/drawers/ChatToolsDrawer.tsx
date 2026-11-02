import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageSquarePlus, Search, Trash2, X } from 'lucide-react';
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

/** Non-modal history picker anchored to the chat header; never covers the composer. */
export function ChatToolsDrawer(props: ChatToolsDrawerProps) {
  const [query, setQuery] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  const sessions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return props.sessions.filter(
      (session) =>
        !term ||
        `${session.title} ${chatSessionContextLabel(session)} ${chatSessionGroupLabel(chatSessionKind(session))}`
          .toLocaleLowerCase()
          .includes(term)
    );
  }, [props.sessions, query]);

  useEffect(() => {
    if (!props.open) return;
    setQuery('');
    const trigger = document.activeElement as HTMLElement | null;
    search.current?.focus();
    const fit = () => {
      const picker = panel.current;
      const composer = picker
        ?.closest('.ws-sidebar__tabpanel--chat')
        ?.querySelector('.ws-composer-dock');
      if (picker && composer) {
        picker.style.maxHeight = `${Math.max(70, Math.min(360, composer.getBoundingClientRect().top - picker.getBoundingClientRect().top - 8))}px`;
      }
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : undefined;
    const host = panel.current?.closest('.ws-sidebar__tabpanel--chat');
    if (host) {
      observer?.observe(host);
    }
    const composer = host?.querySelector('.ws-composer-dock');
    if (composer) {
      observer?.observe(composer);
    }
    window.addEventListener('resize', fit);
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger?.contains(target)) close.current();
    };
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      observer?.disconnect();
      window.removeEventListener('resize', fit);
      if (
        document.activeElement === document.body ||
        panel.current?.contains(document.activeElement)
      ) {
        trigger?.focus();
      }
    };
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div
      ref={panel}
      id="workspai-chat-history"
      className="ws-chat-history"
      role="dialog"
      aria-label="Chat history"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          props.onClose();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const rows = Array.from(
            panel.current?.querySelectorAll<HTMLButtonElement>('.ws-chat-history__select') ?? []
          );
          if (!rows.length) return;
          event.preventDefault();
          const index = rows.findIndex((row) => row === document.activeElement);
          rows[
            index < 0
              ? event.key === 'ArrowDown'
                ? 0
                : rows.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
          ]?.focus();
        }
      }}
    >
      <div className="ws-chat-history__search">
        <Search size={13} aria-hidden="true" />
        <input
          ref={search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Search recent chats"
          aria-label="Search recent chats"
        />
        <button type="button" aria-label="Close chat history" onClick={props.onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="ws-chat-history__head">
        <span>All chats · {sessions.length}</span>
        <button
          type="button"
          onClick={() => {
            props.onNewSession();
            props.onClose();
          }}
        >
          <MessageSquarePlus size={13} aria-hidden="true" /> New chat
        </button>
      </div>
      <div className="ws-chat-history__list" role="list" aria-label="Saved chats">
        {sessions.map((session) => (
          <div
            role="listitem"
            key={session.sessionId}
            className={`ws-chat-history__row${session.sessionId === props.activeSessionId ? ' is-active' : ''}`}
          >
            <button
              type="button"
              className="ws-chat-history__select"
              aria-current={session.sessionId === props.activeSessionId ? 'true' : undefined}
              onClick={() => {
                props.onSelectSession(session.sessionId);
                props.onClose();
              }}
            >
              <span className="ws-chat-history__title" dir="auto">
                {session.title}
              </span>
              <small>{sessionMetaLabel(session)}</small>
            </button>
            {session.sessionId === props.activeSessionId ? (
              <Check size={13} aria-label="Current chat" />
            ) : null}
            <button
              type="button"
              className="ws-chat-history__delete"
              aria-label={`Delete chat: ${session.title}`}
              onClick={() => props.onDeleteSession(session.sessionId)}
            >
              <Trash2 size={12} aria-hidden="true" />
            </button>
          </div>
        ))}
        {!sessions.length ? (
          <p className="ws-chat-history__empty">
            {query.trim() ? 'No matching chats.' : 'No saved chats yet.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
