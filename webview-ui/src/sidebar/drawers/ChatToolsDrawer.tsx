import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { History, Lightbulb, Trash2 } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import {
  basenameFromPath,
  chatSessionContextLabel,
  chatSessionGroupLabel,
  chatSessionKind,
  type ChatSession,
  type ChatSessionKind,
} from '../sidebarSessions';
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

type DrawerMainTab = 'sessions' | 'questions';

function sessionMetaLabel(session: ChatSession, fallback: string): string {
  if (!session.incident) {
    const context = chatSessionContextLabel(session);
    return context === 'No workspace selected' ? fallback : `${fallback} · ${context}`;
  }
  const statusLabels: Record<string, string> = {
    ready: 'Ready',
    running: 'Running',
    review: 'Review',
    done: 'Done',
    blocked: 'Blocked',
  };
  const status = session.incident.repairStatus
    ? statusLabels[session.incident.repairStatus] ?? session.incident.repairStatus
    : fallback;
  const affectedCount = session.incident.affectedProjectNames?.length ?? 0;
  const scope =
    session.incident.scope === 'workspace'
      ? `Workspace repair${affectedCount > 0 ? ` · ${affectedCount} affected project${affectedCount === 1 ? '' : 's'}` : ''}`
      : session.incident.projectName ||
        basenameFromPath(session.incident.projectPath) ||
        'Project repair';
  const seen = session.incident.lastSeenAt
    ? new Date(session.incident.lastSeenAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const lastAction = session.incident.lastActionTitle
    ? ` · ${session.incident.lastActionTitle}`
    : '';
  return `${status} · ${scope} · ${session.incident.cardLabel ?? session.incident.cardId}${lastAction}${seen ? ` · ${seen}` : ''}`;
}

function groupedSessions(sessions: ChatSession[]): Array<{
  kind: ChatSessionKind;
  label: string;
  sessions: ChatSession[];
}> {
  const order: ChatSessionKind[] = ['editor-issue', 'artifact', 'scope', 'global'];
  return order
    .map((kind) => ({
      kind,
      label: chatSessionGroupLabel(kind),
      sessions: sessions.filter((session) => chatSessionKind(session) === kind),
    }))
    .filter((group) => group.sessions.length > 0);
}

function firstSessionKind(sessions: ChatSession[]): ChatSessionKind | null {
  return groupedSessions(sessions)[0]?.kind ?? null;
}

/** Advisor / Studio tools drawer: sessions, suggestions, modes, actions. */
export function ChatToolsDrawer(props: ChatToolsDrawerProps) {
  const sessionGroups = useMemo(() => groupedSessions(props.sessions), [props.sessions]);
  const [mainTab, setMainTab] = useState<DrawerMainTab>('sessions');
  const [sessionKind, setSessionKind] = useState<ChatSessionKind | null>(() =>
    firstSessionKind(props.sessions)
  );
  const activeGroup =
    sessionGroups.find((group) => group.kind === sessionKind) ?? sessionGroups[0] ?? null;
  const activeIncident = props.sessions.find(
    (session) => session.sessionId === props.activeSessionId
  )?.incident;
  const activeIncidentAffectedCount = activeIncident?.affectedProjectNames?.length ?? 0;
  const scopeTitle = activeIncident
    ? activeIncident.scope === 'project'
      ? activeIncident.projectName ||
        basenameFromPath(activeIncident.projectPath) ||
        'Project repair'
      : activeIncident.workspaceName ||
        basenameFromPath(activeIncident.workspacePath) ||
        'Workspace repair'
    : props.scope.projectName
      ? props.scope.projectName
      : props.scope.workspaceName || basenameFromPath(props.scope.workspacePath) || 'Workspace';
  const scopeSubtitle = activeIncident
    ? activeIncident.scope === 'project'
      ? 'Project repair'
      : `Workspace repair${activeIncidentAffectedCount > 0 ? ` · ${activeIncidentAffectedCount} affected project${activeIncidentAffectedCount === 1 ? '' : 's'}` : ''}`
    : props.scope.projectName
      ? 'Project-scoped questions'
      : 'Workspace-level questions';

  useEffect(() => {
    if (mainTab === 'questions' || sessionGroups.length === 0) {
      return;
    }
    if (!sessionGroups.some((group) => group.kind === sessionKind)) {
      setSessionKind(sessionGroups[0].kind);
    }
  }, [mainTab, sessionGroups, sessionKind]);

  return (
    <Drawer
      open={props.open}
      sizing="compact"
      title={mainTab === 'sessions' ? 'Chats' : 'Questions'}
      subtitle={`${scopeTitle} · ${scopeSubtitle}`}
      onClose={props.onClose}
    >
      <div className="ws-drawer-tabs" role="tablist" aria-label={`${props.contextLabel} tools`}>
        <button
          type="button"
          className="ws-drawer-tab"
          aria-selected={mainTab === 'sessions'}
          onClick={() => setMainTab('sessions')}
        >
          Sessions
        </button>
        <button
          type="button"
          className="ws-drawer-tab"
          aria-selected={mainTab === 'questions'}
          onClick={() => setMainTab('questions')}
        >
          Questions
        </button>
      </div>

      {mainTab === 'sessions' ? (
      <section className="ws-drawer-section ws-drawer-section--flush">
        <div className="ws-drawer-section__head">
          <span className="ws-drawer-section__label">
            <History size={11} aria-hidden={true} /> Sessions
          </span>
          <button type="button" className="ws-drawer__link" onClick={props.onNewSession}>
            New chat
          </button>
        </div>
        {props.sessions.length === 0 ? (
          <p className="ws-drawer-hint">No saved sessions yet.</p>
        ) : (
          <>
          <div className="ws-drawer-category-tabs" role="tablist" aria-label="Session categories">
            {sessionGroups.map((group) => (
              <button
                key={group.kind}
                type="button"
                className="ws-drawer-category-tab"
                aria-selected={group.kind === activeGroup?.kind}
                onClick={() => setSessionKind(group.kind)}
              >
                <span>{group.label}</span>
                <small>{group.sessions.length}</small>
              </button>
            ))}
          </div>
          <div className="ws-drawer-session-list">
            {activeGroup ? (
              <div key={activeGroup.kind} className="ws-drawer-session-group">
                {activeGroup.sessions.map((session) => {
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
                        <small className="ws-drawer-session__meta">
                          {sessionMetaLabel(session, statusLabel)}
                        </small>
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
            ) : null}
          </div>
          </>
        )}
      </section>
      ) : (
        <>
          {props.toolbar ? (
            <section className="ws-drawer-section ws-drawer-section--flush">
              <span className="ws-drawer-section__label">Mode</span>
              {props.toolbar}
            </section>
          ) : null}

      {props.suggestions.length > 0 ? (
        <section className="ws-drawer-section ws-drawer-section--flush">
          <span className="ws-drawer-section__label">
            <Lightbulb size={11} aria-hidden={true} /> Questions
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
      ) : (
        <section className="ws-drawer-section ws-drawer-section--flush">
          <p className="ws-drawer-hint">No suggested questions for this scope.</p>
        </section>
      )}
        </>
      )}

      {mainTab === 'questions' && props.footerActions ? (
        <section className="ws-drawer-section">
          <span className="ws-drawer-section__label">Actions</span>
          <div className="ws-drawer-inline-actions">{props.footerActions}</div>
        </section>
      ) : null}
    </Drawer>
  );
}
