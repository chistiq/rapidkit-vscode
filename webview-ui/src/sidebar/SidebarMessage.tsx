import type { ReactNode } from 'react';

interface SidebarMessageProps {
  role: 'user' | 'ai';
  children: ReactNode;
}

/** Shared chat row layout for Create and unified Assistant conversations. */
export function SidebarMessage({ role, children }: SidebarMessageProps) {
  if (role === 'user') {
    return (
      <article className="ws-sidebar__msg ws-sidebar__msg--user" aria-label="Your message">
        <div className="ws-sidebar__bubble" dir="auto">
          {children}
        </div>
      </article>
    );
  }

  return (
    <article className="ws-sidebar__msg ws-sidebar__msg--ai" aria-label="Assistant response">
      <div className="ws-sidebar__bubble" dir="auto">
        {children}
      </div>
    </article>
  );
}
