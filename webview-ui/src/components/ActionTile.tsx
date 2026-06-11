import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ActionTileVariant = 'default' | 'primary' | 'danger' | 'warn' | 'builder';

export interface ActionTileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  detail?: string;
  variant?: ActionTileVariant;
  fullWidth?: boolean;
}

function variantClass(variant: ActionTileVariant): string {
  if (variant === 'default') {
    return '';
  }
  return ` workspai-action-tile--${variant}`;
}

export function ActionTile({
  icon,
  label,
  detail,
  variant = 'default',
  fullWidth = false,
  className = '',
  type = 'button',
  ...rest
}: ActionTileProps) {
  return (
    <button
      type={type}
      className={`workspai-action-tile${variantClass(variant)}${fullWidth ? ' workspai-action-tile--full' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      <span className="workspai-action-tile__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="workspai-action-tile__copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </button>
  );
}

export type ActionTileGridLayout = '2col' | 'operate' | 'project' | 'auto';

interface ActionTileGridProps {
  layout?: ActionTileGridLayout;
  className?: string;
  children: ReactNode;
}

export function ActionTileGrid({
  layout = '2col',
  className = '',
  children,
}: ActionTileGridProps) {
  return (
    <div
      className={`workspai-action-grid workspai-action-grid--${layout}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}
