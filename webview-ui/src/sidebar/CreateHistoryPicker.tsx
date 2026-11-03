import { SessionHistoryPicker } from './SessionHistoryPicker';
import type { CreateSession } from './createTypes';

interface CreateHistoryPickerProps {
  open: boolean;
  sessions: CreateSession[];
  activeSessionId: string | null;
  activeOperationSessionId: string | null;
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

export function CreateHistoryPicker(props: CreateHistoryPickerProps) {
  return (
    <SessionHistoryPicker
      {...props}
      id="workspai-create-history"
      labels={{
        history: 'Creation history',
        search: 'Search recent creations',
        all: 'All creations',
        newSession: 'New creation',
        saved: 'Saved creations',
        current: 'Current creation',
        deleteSession: 'Delete creation',
        empty: 'No saved creation sessions yet.',
        noMatches: 'No matching creations.',
      }}
      sessions={props.sessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        meta: statusLabel(session),
        deleteDisabled: session.sessionId === props.activeOperationSessionId,
        deleteDisabledReason: 'Stop or finish the active creation before deleting it',
      }))}
    />
  );
}
