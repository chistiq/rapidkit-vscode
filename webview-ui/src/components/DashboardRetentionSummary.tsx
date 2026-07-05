import type { DashboardRetentionCohortSummary } from '@/lib/dashboardEvidence';

type DashboardRetentionSummaryProps = {
  summary?: DashboardRetentionCohortSummary | null;
};

const activationStageLabel: Record<DashboardRetentionCohortSummary['activationStage'], string> = {
  not_started: 'Not started',
  first_artifact: 'First evidence',
  first_blocker_fixed: 'Fix recorded',
  studio_opened: 'Studio opened',
  verify_passed: 'Verify passed',
  returned_after_verify: 'Returned after verify',
};

const repairLoopStageLabel: Record<DashboardRetentionCohortSummary['repairLoopStage'], string> = {
  not_started: 'Not started',
  needs_fix: 'Needs fix',
  fix_recorded: 'Fix recorded',
  studio_opened: 'Studio opened',
  verify_passed: 'Verify passed',
  returned_to_dashboard: 'Returned to dashboard',
};

const focusLabel: Record<DashboardRetentionCohortSummary['nextRecommendedFocus'], string> = {
  setup: 'Create or import',
  generate_first_artifact: 'Generate evidence',
  fix_first_blocker: 'Repair blocker',
  verify_fix: 'Verify fix',
  return_to_dashboard: 'Refresh dashboard',
  reduce_command_failures: 'Reduce failures',
  sustain: 'Keep evidence fresh',
};

function formatTtfv(summary: DashboardRetentionCohortSummary): string {
  if (!summary.ttfvResolved || summary.ttfvMs == null) {
    return 'Pending';
  }
  if (summary.ttfvMs < 60_000) {
    return '<1m';
  }
  const minutes = Math.round(summary.ttfvMs / 60_000);
  return `${minutes}m`;
}

function formatFailureRate(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function DashboardRetentionSummary({ summary }: DashboardRetentionSummaryProps) {
  if (!summary) {
    return null;
  }

  return (
    <section className="home-retention-summary" aria-label="Local product learning">
      <details className="home-retention-summary__details">
        <summary className="home-retention-summary__head">
          <span>Progress</span>
          <strong>{summary.activationCompletionScore}%</strong>
        </summary>
        <div className="home-retention-summary__grid">
          <span>
            <small>Activation</small>
            <strong>{activationStageLabel[summary.activationStage]}</strong>
          </span>
          <span>
            <small>Repair loop</small>
            <strong>{repairLoopStageLabel[summary.repairLoopStage]}</strong>
          </span>
          <span>
            <small>First evidence</small>
            <strong>{formatTtfv(summary)}</strong>
          </span>
          <span>
            <small>Command friction</small>
            <strong>{formatFailureRate(summary.commandFailureRate)}</strong>
          </span>
        </div>
        <p className="home-retention-summary__focus">
          <span>Suggested product focus</span>
          <strong>{focusLabel[summary.nextRecommendedFocus]}</strong>
          {summary.repeatedFailureFriction ? <em>Repeated command friction detected</em> : null}
        </p>
      </details>
    </section>
  );
}
