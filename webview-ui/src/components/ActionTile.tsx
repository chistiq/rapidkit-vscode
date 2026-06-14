import type { ButtonHTMLAttributes, ReactNode } from 'react';

import type { DashboardEvidenceStatus } from '@/lib/dashboardEvidence';
import { evidenceStatusLabel } from '@/lib/dashboardEvidence';

export type ActionTileVariant = 'default' | 'primary' | 'danger' | 'warn' | 'builder';

export interface ActionTileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  detail?: string;
  variant?: ActionTileVariant;
  fullWidth?: boolean;
  evidenceStatus?: DashboardEvidenceStatus;
  pending?: boolean;
  stateLabel?: string;
}

function variantClass(variant: ActionTileVariant): string {
  if (variant === 'default') {
    return '';
  }
  return ` ws-action-tile--${variant} workspai-action-tile--${variant}`;
}

const evidenceChipClass: Record<Exclude<DashboardEvidenceStatus, 'missing'>, string> = {
  pass: 'ws-chip ws-chip--success',
  warn: 'ws-chip ws-chip--warn',
  fail: 'ws-chip ws-chip--error',
};

export function ActionTile({
  icon,
  label,
  detail,
  variant = 'default',
  fullWidth = false,
  evidenceStatus,
  pending = false,
  stateLabel,
  className = '',
  type = 'button',
  disabled,
  ...rest
}: ActionTileProps) {
  const effectiveDisabled = Boolean(disabled || pending);
  const visibleStateLabel = pending ? stateLabel || 'Running' : stateLabel;
  const stateClass = pending
    ? 'workspai-action-tile__state workspai-action-tile__state--pending'
    : 'workspai-action-tile__state';

  return (
    <button
      type={type}
      className={`ws-action-tile workspai-action-tile${variantClass(variant)}${fullWidth ? ' ws-action-tile--full workspai-action-tile--full' : ''}${pending ? ' ws-action-tile--pending workspai-action-tile--pending' : ''}${className ? ` ${className}` : ''}`}
      disabled={effectiveDisabled}
      aria-busy={pending || undefined}
      {...rest}
    >
      <span className="workspai-action-tile__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="workspai-action-tile__copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {visibleStateLabel ? (
        <span className={stateClass} aria-label={pending ? 'Command running' : undefined}>
          {visibleStateLabel}
        </span>
      ) : evidenceStatus && evidenceStatus !== 'missing' ? (
        <span
          className={`${evidenceChipClass[evidenceStatus]} workspai-action-tile__evidence workspai-action-tile__evidence--${evidenceStatus}`}
          aria-label={`Evidence: ${evidenceStatusLabel(evidenceStatus)}`}
        >
          {evidenceStatusLabel(evidenceStatus)}
        </span>
      ) : null}
    </button>
  );
}

export type ActionTileGridLayout = '2col' | 'operate' | 'governance' | 'project' | 'auto';

interface ActionTileGridProps {
  layout?: ActionTileGridLayout;
  className?: string;
  children: ReactNode;
}

export function ActionTileGrid({ layout = '2col', className = '', children }: ActionTileGridProps) {
  return (
    <div
      className={`workspai-action-grid workspai-action-grid--${layout}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}
