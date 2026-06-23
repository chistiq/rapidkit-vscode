import type { ReactNode } from 'react';
import { SidebarAgentAvatar } from './SidebarAgentAvatar';

interface SidebarMessageProps {
  role: 'user' | 'ai';
  children: ReactNode;
  agentActive?: boolean;
}

/** Shared chat row layout for Create / Advisor / Studio tabs. */
export function SidebarMessage({ role, children, agentActive = false }: SidebarMessageProps) {
  if (role === 'user') {
    return (
      <div className="ws-sidebar__msg ws-sidebar__msg--user">
        <div className="ws-sidebar__bubble">{children}</div>
      </div>
    );
  }

  return (
    <div className="ws-sidebar__msg ws-sidebar__msg--ai">
      <SidebarAgentAvatar active={agentActive} />
      <div className="ws-sidebar__bubble">{children}</div>
    </div>
  );
}
