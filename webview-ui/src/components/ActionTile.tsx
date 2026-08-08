import type { ButtonHTMLAttributes, ReactNode } from 'react';

import type { DashboardEvidenceCard, DashboardEvidenceStatus } from '@/lib/dashboardEvidence';
import { resolveEvidenceCardPosture } from '@/lib/dashboardEvidence';
import type { DashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import { CommandExecutionBadge } from '@/components/CommandExecutionBadge';
import { EvidencePostureIcon } from '@/components/EvidencePostureIcon';

export type ActionTileVariant = 'default' | 'primary' | 'danger' | 'warn' | 'builder';

export interface ActionTileProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  detail?: string;
  variant?: ActionTileVariant;
  fullWidth?: boolean;
  evidenceStatus?: DashboardEvidenceStatus;
  evidenceCard?: DashboardEvidenceCard;
  pending?: boolean;
  stateLabel?: string;
  actionContract?: DashboardCommandActionContract;
}

function variantClass(variant: ActionTileVariant): string {
  if (variant === 'default') {
    return '';
  }
  return ` ws-action-tile--${variant} workspai-action-tile--${variant}`;
}

const evidenceChipClass = {
  healthy: 'ws-chip ws-chip--success',
  attention: 'ws-chip ws-chip--warn',
  blocked: 'ws-chip ws-chip--error',
};

export function ActionTile({
  icon,
  label,
  detail,
  variant = 'default',
  fullWidth = false,
  evidenceStatus,
  evidenceCard,
  pending = false,
  stateLabel,
  actionContract,
  className = '',
  type = 'button',
  disabled,
  ...rest
}: ActionTileProps) {
  const effectiveDisabled = Boolean(disabled || pending);
  const visibleStateLabel = pending ? stateLabel || 'Running' : stateLabel;
  const evidencePosture = evidenceCard
    ? resolveEvidenceCardPosture(evidenceCard)
    : evidenceStatus
      ? evidenceStatus === 'pass'
        ? 'healthy'
        : evidenceStatus === 'fail'
          ? 'blocked'
          : 'attention'
      : undefined;
  const evidenceLabel =
    evidencePosture === 'healthy'
      ? 'Healthy'
      : evidencePosture === 'blocked'
        ? 'Blocked'
        : 'Needs attention';
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
        <strong className="workspai-action-tile__label">
          {label}
          <CommandExecutionBadge
            channel={actionContract?.executionChannel}
            compact
            className="workspai-action-tile__exec-badge"
          />
        </strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {visibleStateLabel ? (
        <span className={stateClass} aria-label={pending ? 'Command running' : undefined}>
          {visibleStateLabel}
        </span>
      ) : evidencePosture ? (
        <span
          className={`${evidenceChipClass[evidencePosture]} workspai-action-tile__evidence workspai-action-tile__evidence--${evidencePosture}`}
          aria-label={`Evidence: ${evidenceLabel}`}
        >
          <EvidencePostureIcon posture={evidencePosture} size={15} />
          {evidenceLabel}
        </span>
      ) : null}
      {actionContract ? (
        <span className="workspai-action-tile__contract" aria-label="Action contract">
          <span>{actionContract.executionScope}</span>
          <span>{actionContract.artifactLabel}</span>
          {actionContract.disabledReason ? <span>{actionContract.disabledReason}</span> : null}
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
