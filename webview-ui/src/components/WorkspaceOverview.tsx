import { AlertCircle, ClipboardCheck, Shield } from 'lucide-react';
import {
  formatHomeEvidenceDetail,
  formatHomeGovernanceDetail,
  homeEvidenceMetricValue,
  homeGovernanceMetricValue,
  type DashboardEvidencePayload,
} from '@/lib/dashboardEvidence';
import type { WorkspaceStatus } from '@/types';

interface WorkspaceOverviewProps {
  workspaceStatus: WorkspaceStatus;
  evidence?: DashboardEvidencePayload | null;
  evidenceAttentionCount?: number;
  operateAttentionCount?: number;
  onOpenEvidence?: () => void;
  onOpenRunGovernance?: () => void;
}

export function WorkspaceOverview({
  workspaceStatus,
  evidence = null,
  evidenceAttentionCount = 0,
  operateAttentionCount = 0,
  onOpenEvidence,
  onOpenRunGovernance,
}: WorkspaceOverviewProps) {
  const hasWorkspace = Boolean(workspaceStatus.hasWorkspace && workspaceStatus.workspacePath);

  const evidenceValue = homeEvidenceMetricValue(evidence, evidenceAttentionCount);
  const governanceValue = homeGovernanceMetricValue(evidence, operateAttentionCount, hasWorkspace);
  const ttfvLabel = evidence?.onboarding?.ttfvLabel ?? null;

  const metrics = [
    {
      label: 'Workspace repair',
      value: evidenceValue,
      detail: formatHomeEvidenceDetail(evidence),
      icon: ClipboardCheck,
      state:
        evidenceAttentionCount > 0
          ? 'attention'
          : evidenceValue === 'Healthy'
            ? 'ready'
            : hasWorkspace
              ? 'idle'
              : 'idle',
      onClick: onOpenEvidence,
    },
    {
      label: 'Governance',
      value: governanceValue,
      detail: formatHomeGovernanceDetail(evidence),
      icon: operateAttentionCount > 0 ? AlertCircle : Shield,
      state: operateAttentionCount > 0 ? 'attention' : hasWorkspace ? 'ready' : 'idle',
      onClick: onOpenRunGovernance,
    },
  ];

  return (
    <section className="ws-overview-shell workspace-overview" aria-label="Home health and status">
      <div className="workspace-overview-title">
        <div className="workspace-overview-heading">
          <Shield size={14} />
          <span>Workspace command summary</span>
          <small>
            {hasWorkspace
              ? 'Workspace-first signals with project attribution when needed'
              : 'Open a workspace to unlock governed operations'}
          </small>
          {ttfvLabel ? (
            <small className="workspace-overview-ttfv" aria-label="Time to first value">
              Time to first value: {ttfvLabel}
            </small>
          ) : null}
        </div>
      </div>

      <div className="workspace-overview-grid" data-metric-count={metrics.length}>
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const interactive = Boolean(metric.onClick);
          const className = `ws-metric workspace-metric workspace-metric--${metric.state}${interactive ? ' workspace-metric--interactive' : ''}`;
          const content = (
            <>
              <Icon size={15} />
              <span>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
                <em>{metric.detail}</em>
              </span>
            </>
          );

          if (interactive) {
            return (
              <button
                key={metric.label}
                type="button"
                className={className}
                onClick={metric.onClick}
                title={`Open ${metric.label}`}
              >
                {content}
              </button>
            );
          }

          return (
            <div key={metric.label} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
