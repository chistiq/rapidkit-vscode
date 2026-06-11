import type { ReactNode } from 'react';

interface WorkspaiEmptyStateProps {
  icon: ReactNode;
  title?: string;
  description?: ReactNode;
  muted?: boolean;
}

export function WorkspaiEmptyState({ icon, title, description, muted = false }: WorkspaiEmptyStateProps) {
  return (
    <div className={`workspai-empty-state${muted ? ' workspai-empty-state--muted' : ''}`}>
      <span className="workspai-empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      {title ? <p className="workspai-empty-state__title">{title}</p> : null}
      {description ? <div className="workspai-empty-state__desc">{description}</div> : null}
    </div>
  );
}
