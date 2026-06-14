import { Activity, CheckCircle2, ChevronDown, Clock3, XCircle } from 'lucide-react';
import { useState } from 'react';
import type {
  DashboardActivityEntry,
  DashboardEvidenceCard,
  DashboardEvidencePayload,
  DashboardEvidenceStatus,
} from '@/lib/dashboardEvidence';
import { evidenceStatusLabel } from '@/lib/dashboardEvidence';
import {
  ACTIVITY_VISIBLE_EXPANDED,
  activityEntryCountLabel,
  formatActivityTimestamp,
  summarizeActivityLabels,
} from '@/lib/dashboardActivityDisplay';
import { resolveEvidenceCardCommandAction } from '@/lib/dashboardEvidenceActions';

interface CommandActivityPanelProps {
  evidence: DashboardEvidencePayload | null;
  onRunCommand: (command: string) => void;
  onRevealArtifact?: (artifactPath: string) => void;
  onClearActivity?: () => void;
}

const statusIcon: Record<DashboardEvidenceStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: Clock3,
  fail: XCircle,
  missing: Activity,
};

const statusChipClass: Record<DashboardEvidenceStatus, string> = {
  pass: 'ws-chip ws-chip--success',
  warn: 'ws-chip ws-chip--warn',
  fail: 'ws-chip ws-chip--error',
  missing: 'ws-chip ws-chip--muted',
};

export function CommandActivityPanel({
  evidence,
  onRunCommand,
  onRevealArtifact,
  onClearActivity,
}: CommandActivityPanelProps) {
  const [activityExpanded, setActivityExpanded] = useState(false);
  const cards = evidence?.cards ?? [];
  const activity = evidence?.activity ?? [];
  const visibleActivity = activity.slice(0, ACTIVITY_VISIBLE_EXPANDED);
  const activitySummary = summarizeActivityLabels(activity);

  if (cards.length === 0 && activity.length === 0) {
    return null;
  }

  return (
    <section className="command-activity-panel" aria-label="Command activity and evidence">
      <div className="command-activity-panel__head">
        <span className="command-activity-panel__title">Ops evidence loop</span>
        <span className="ws-kicker command-activity-panel__meta">
          Command → artifact → outcome → next step
        </span>
        {activity.length > 0 && onClearActivity ? (
          <button
            type="button"
            className="ws-btn ws-btn--ghost command-activity-panel__clear"
            onClick={onClearActivity}
          >
            Clear history
          </button>
        ) : null}
      </div>

      {cards.length > 0 ? (
        <div className="command-activity-panel__evidence">
          {cards.map((card) => {
            const Icon = statusIcon[card.status];
            const runAction = resolveEvidenceCardCommandAction(card);
            return (
              <button
                key={`${card.scope}-${card.id}`}
                type="button"
                className={`command-activity-panel__card command-activity-panel__card--${card.status}`}
                onClick={() => {
                  if (card.artifactPath && onRevealArtifact) {
                    onRevealArtifact(card.artifactPath);
                    return;
                  }
                  if (runAction) {
                    onRunCommand(runAction.command);
                  }
                }}
                title={
                  runAction
                    ? `${card.summary} · ${runAction.label} · ${runAction.scope} scope`
                    : card.summary
                }
              >
                <Icon size={14} aria-hidden="true" />
                <span className="command-activity-panel__card-copy">
                  <strong>{card.label}</strong>
                  <small>{card.summary}</small>
                </span>
                <span className={statusChipClass[card.status]}>
                  {evidenceStatusLabel(card.status)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {activity.length > 0 ? (
        <div className="command-activity-panel__activity">
          <button
            type="button"
            className="command-activity-panel__activity-toggle"
            onClick={() => setActivityExpanded((open) => !open)}
            aria-expanded={activityExpanded}
          >
            <span className="command-activity-panel__activity-title">
              Recent commands
              <span className="command-activity-panel__activity-count">{activity.length}</span>
            </span>
            {!activityExpanded && activitySummary ? (
              <span className="command-activity-panel__activity-summary">{activitySummary}</span>
            ) : null}
            <ChevronDown
              size={12}
              className={`command-activity-panel__activity-chevron ${activityExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
          </button>

          {activityExpanded ? (
            <ul className="command-activity-panel__activity-list">
              {visibleActivity.map((entry) => (
                <ActivityChip key={entry.id} entry={entry} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ActivityChip({ entry }: { entry: DashboardActivityEntry }) {
  const repeatLabel = activityEntryCountLabel(entry);

  return (
    <li
      className={`command-activity-panel__activity-chip command-activity-panel__activity-chip--${entry.status}`}
      title={`${entry.label} · ${entry.scope} · ${formatActivityTimestamp(entry.timestamp)}`}
    >
      <span className="command-activity-panel__activity-label">{entry.label}</span>
      {repeatLabel ? (
        <span className="command-activity-panel__activity-repeat">{repeatLabel}</span>
      ) : null}
      <span className="command-activity-panel__activity-meta">
        {formatActivityTimestamp(entry.timestamp)}
      </span>
    </li>
  );
}
