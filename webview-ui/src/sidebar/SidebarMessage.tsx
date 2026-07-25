import type { ReactNode } from 'react';

interface SidebarMessageProps {
  role: 'user' | 'ai';
  children: ReactNode;
}

/** Shared chat row layout for Create and unified Assistant conversations. */
export function SidebarMessage({ role, children }: SidebarMessageProps) {
  if (role === 'user') {
    return (
      <div className="ws-sidebar__msg ws-sidebar__msg--user">
        <div className="ws-sidebar__bubble">{children}</div>
      </div>
    );
  }

  return (
    <div className="ws-sidebar__msg ws-sidebar__msg--ai">
      <div className="ws-sidebar__bubble">{children}</div>
    </div>
  );
}
