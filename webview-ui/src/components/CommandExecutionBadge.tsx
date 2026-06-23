import type { DashboardCommandExecutionChannel } from '@workspai-contracts/dashboardCommandExecutionChannel';
import { dashboardCommandExecutionChannelLabel } from '@workspai-contracts/dashboardCommandExecutionChannel';

interface CommandExecutionBadgeProps {
  channel?: DashboardCommandExecutionChannel;
  compact?: boolean;
  className?: string;
}

export function CommandExecutionBadge({
  channel,
  compact = false,
  className = '',
}: CommandExecutionBadgeProps) {
  if (!channel) {
    return null;
  }

  const label = dashboardCommandExecutionChannelLabel(channel);

  return (
    <span
      className={`ws-exec-badge ws-exec-badge--${channel}${compact ? ' ws-exec-badge--compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={`Runs in ${label}`}
      title={`Runs in ${label}`}
    >
      {label}
    </span>
  );
}
