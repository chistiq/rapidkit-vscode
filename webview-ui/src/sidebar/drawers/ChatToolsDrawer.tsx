import { type ReactNode } from 'react';
import { History, Lightbulb, Trash2 } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import type { ChatSession } from '../sidebarSessions';
import type { SidebarScope } from '../sidebarTypes';

interface ChatToolsDrawerProps {
  open: boolean;
  contextLabel: string;
  scope: SidebarScope;
  sessions: ChatSession[];
  activeSessionId: string | null;
  suggestions: string[];
  onClose: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onPickSuggestion: (text: string) => void;
  toolbar?: ReactNode;
  footerActions?: ReactNode;
}

/** Advisor / Studio tools drawer: sessions, suggestions, modes, actions. */
export function ChatToolsDrawer(props: ChatToolsDrawerProps) {
  const scopeTitle = props.scope.projectName
    ? props.scope.projectName
    : props.scope.workspaceName || 'Workspace';
  const scopeSubtitle = props.scope.projectName
    ? 'Project-scoped questions'
    : 'Workspace-level questions';

  return (
    <Drawer
      open={props.open}
      sizing="auto"
      title={props.contextLabel}
      subtitle={`${scopeTitle} · ${scopeSubtitle}`}
      onClose={props.onClose}
    >
      {props.toolbar ? (
        <section className="ws-drawer-section">{props.toolbar}</section>
      ) : null}

      <section className="ws-drawer-section">
        <div className="ws-drawer-section__head">
          <span className="ws-drawer-section__label">
            <History size={11} aria-hidden={true} /> Sessions
          </span>
          <button type="button" className="ws-drawer__link" onClick={props.onNewSession}>
            New chat
          </button>
        </div>
        <p className="ws-drawer-hint">
          Follow-ups stay in the active thread. Start a new chat when the topic changes.
        </p>
        {props.sessions.length === 0 ? (
          <p className="ws-drawer-hint">No saved sessions yet.</p>
        ) : (
          <div className="ws-drawer-session-list">
            {props.sessions.map((session) => {
              const turnCount = Math.ceil(
                session.messages.filter((m) => m.content.trim().length > 0).length / 2
              );
              const statusLabel =
                session.status === 'streaming'
                  ? 'Replying…'
                  : session.status === 'error'
                    ? 'Stopped'
                    : turnCount > 0
                      ? `${turnCount} turn${turnCount === 1 ? '' : 's'}`
                      : 'Draft';
              return (
              <div
                key={session.sessionId}
                className={`ws-drawer-session${
                  session.sessionId === props.activeSessionId ? ' is-active' : ''
                }`}
              >
                <button
                  type="button"
                  className="ws-drawer-session__select"
                  onClick={() => {
                    props.onSelectSession(session.sessionId);
                    props.onClose();
                  }}
                >
                  <span className="ws-drawer-session__title">{session.title}</span>
                  <small className="ws-drawer-session__meta">{statusLabel}</small>
                </button>
                <button
                  type="button"
                  className="ws-drawer-session__delete"
                  aria-label="Delete session"
                  onClick={() => props.onDeleteSession(session.sessionId)}
                >
                  <Trash2 size={11} aria-hidden={true} />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="ws-drawer-section">
        <span className="ws-drawer-section__label">
          <Lightbulb size={11} aria-hidden={true} /> Suggested questions
        </span>
        <div className="ws-drawer-menu">
          {props.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="ws-drawer-menu__item ws-drawer-menu__item--compact"
              onClick={() => props.onPickSuggestion(suggestion)}
            >
              <span>
                <strong>{suggestion}</strong>
              </span>
            </button>
          ))}
        </div>
      </section>

      {props.footerActions ? (
        <section className="ws-drawer-section">
          <span className="ws-drawer-section__label">Actions</span>
          <div className="ws-drawer-inline-actions">{props.footerActions}</div>
        </section>
      ) : null}
    </Drawer>
  );
}
