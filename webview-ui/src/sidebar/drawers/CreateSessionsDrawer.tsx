import { Trash2 } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import type { CreateSession } from '../createTypes';

interface CreateSessionsDrawerProps {
  open: boolean;
  sessions: CreateSession[];
  activeSessionId: string | null;
  onClose: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

function statusLabel(session: CreateSession): string {
  const labels: Record<CreateSession['status'], string> = {
    planning: 'Planning',
    ready: 'Ready',
    running: 'Creating',
    done: 'Done',
    error: 'Stopped',
  };
  return `${labels[session.status]} · ${session.method === 'ai' ? 'AI' : 'Manual'} ${session.target}`;
}

export function CreateSessionsDrawer(props: CreateSessionsDrawerProps) {
  return (
    <Drawer
      open={props.open}
      sizing="compact"
      title="Creations"
      subtitle="One durable session for every workspace or project"
      onClose={props.onClose}
    >
      <section className="ws-drawer-section ws-drawer-section--flush">
        <div className="ws-drawer-section__head">
          <span className="ws-drawer-section__label">History</span>
          <button type="button" className="ws-drawer__link" onClick={props.onNewSession}>
            New creation
          </button>
        </div>
        {props.sessions.length === 0 ? (
          <p className="ws-drawer-hint">No saved creation sessions yet.</p>
        ) : (
          <div className="ws-drawer-session-list">
            <div className="ws-drawer-session-group">
              {props.sessions.map((session) => (
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
                    <small className="ws-drawer-session__meta">{statusLabel(session)}</small>
                  </button>
                  <button
                    type="button"
                    className="ws-drawer-session__delete"
                    aria-label={`Delete ${session.title}`}
                    disabled={session.status === 'planning' || session.status === 'running'}
                    title={
                      session.status === 'planning' || session.status === 'running'
                        ? 'A running creation session cannot be deleted'
                        : 'Delete creation session'
                    }
                    onClick={() => props.onDeleteSession(session.sessionId)}
                  >
                    <Trash2 size={11} aria-hidden={true} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </Drawer>
  );
}
