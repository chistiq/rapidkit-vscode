import type { ReactNode } from 'react';

export type SectionScope = 'workspace' | 'project' | 'catalog';

const SCOPE_LABEL: Record<SectionScope, string> = {
  workspace: 'Workspace',
  project: 'Project',
  catalog: 'Catalog',
};

function ScopeBadge({ scope }: { scope: SectionScope }) {
  return <span className={`workspai-section-scope workspai-section-scope--${scope}`}>{SCOPE_LABEL[scope]}</span>;
}

interface SectionHeaderProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  scope?: SectionScope;
  count?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  icon,
  title,
  scope,
  count,
  actions,
  className = '',
}: SectionHeaderProps) {
  return (
    <div className={`section-title workspai-section-head${className ? ` ${className}` : ''}`}>
      {icon}
      <span className="workspai-section-head__title">{title}</span>
      {scope ? <ScopeBadge scope={scope} /> : null}
      {count != null && count !== '' ? <span className="section-count">{count}</span> : null}
      {actions ? <span className="workspai-section-head__actions">{actions}</span> : null}
    </div>
  );
}

interface ColumnHeaderProps {
  title: string;
  subtitle?: string;
  scope?: SectionScope;
}

export function ColumnHeader({ title, subtitle, scope }: ColumnHeaderProps) {
  return (
    <div className="enterprise-flow-column-head">
      <span className="workspai-section-head__column-title">
        {title}
        {scope ? <ScopeBadge scope={scope} /> : null}
      </span>
      {subtitle ? <small>{subtitle}</small> : null}
    </div>
  );
}
