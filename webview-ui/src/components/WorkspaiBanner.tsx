import type { ReactNode } from 'react';

interface WorkspaiBannerProps {
  title: string;
  onDismiss?: () => void;
  dismissLabel?: string;
  children: ReactNode;
}

export function WorkspaiBanner({
  title,
  onDismiss,
  dismissLabel = 'Dismiss',
  children,
}: WorkspaiBannerProps) {
  return (
    <section className="workspai-banner" aria-label={title}>
      <div className="workspai-banner__head">
        <h3 className="workspai-banner__title">{title}</h3>
        {onDismiss ? (
          <button type="button" className="enterprise-button enterprise-button--secondary" onClick={onDismiss}>
            {dismissLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
