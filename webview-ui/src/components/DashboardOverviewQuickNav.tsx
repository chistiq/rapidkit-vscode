import { ArrowRight, CheckCircle2, Play, Wrench } from 'lucide-react';
import type { DashboardSection } from '@/lib/dashboardSections';
import type { DashboardDay0Funnel } from '@/lib/dashboardDay0Funnel';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { buildEvidenceAttentionInbox } from '@/lib/evidenceAgentContext';

interface DashboardOverviewQuickNavProps {
  evidenceAttentionCount: number;
  operateAttentionCount: number;
  evidence?: DashboardEvidencePayload | null;
  day0Funnel?: DashboardDay0Funnel;
  onNavigate: (section: DashboardSection) => void;
}

export function DashboardOverviewQuickNav({
  evidenceAttentionCount,
  operateAttentionCount,
  evidence,
  day0Funnel,
  onNavigate,
}: DashboardOverviewQuickNavProps) {
  const topAttentionItems = buildEvidenceAttentionInbox(evidence).slice(0, 3);
  const firstArtifactStep = day0Funnel?.steps.find((step) => step.id === 'first_artifact_generated');
  const firstArtifactTiming = evidence?.onboarding?.ttfvLabel;
  const showFirstArtifactCelebration = firstArtifactStep?.state === 'complete';
  const shouldContinueRepair = Boolean(
    day0Funnel &&
      evidenceAttentionCount > 0 &&
      ['first_blocker_selected', 'studio_opened', 'verify_passed'].includes(day0Funnel.current.id)
  );
  const repairAction = {
    section: 'repair' as const,
    icon: Wrench,
    title: shouldContinueRepair ? 'Continue repair' : 'Repair workspace',
    detail: shouldContinueRepair
      ? `${day0Funnel?.current.cta ?? 'Repair'} is next in the first-value path`
      : 'Resolve blockers with evidence, Studio, verify, and refreshed artifacts',
    badge: evidenceAttentionCount > 0 ? evidenceAttentionCount : null,
  };
  const runAction = {
    section: 'operate' as const,
    icon: Play,
    title: 'Run workspace',
    detail: 'Generate or refresh health, intelligence, and release evidence',
    badge: operateAttentionCount > 0 ? operateAttentionCount : null,
  };
  const actions = evidenceAttentionCount > 0 ? [repairAction, runAction] : [runAction, repairAction];
  const actionRow = (
    <div className="home-next-actions__row">
      {actions.map((action, index) => {
        const ActionIcon = action.icon;
        return (
          <button
            key={action.section}
            type="button"
            className={`home-create-handoff__action home-next-actions__item${index === 0 ? ' home-create-handoff__action--primary' : ''}`}
            onClick={() => onNavigate(action.section)}
          >
            <ActionIcon size={15} aria-hidden="true" />
            <span>
              <strong>
                {action.title}
                {action.badge ? (
                  <span className="home-next-actions__badge">{action.badge}</span>
                ) : null}
              </strong>
              <small>{action.detail}</small>
            </span>
            <ArrowRight size={13} aria-hidden="true" className="home-create-handoff__chevron" />
          </button>
        );
      })}
    </div>
  );

  return (
    <nav className="home-next-actions" aria-label="Workspace next actions">
      {topAttentionItems.length > 0 ? (
        <div className="home-attention-rank" aria-label="Top evidence blockers">
          <span className="home-next-actions__label">Top blockers</span>
          {topAttentionItems.map((item, index) => (
            <button
              key={`${item.card.scope}-${item.card.id}`}
              type="button"
              className="home-attention-rank__item"
              onClick={() => onNavigate('repair')}
            >
              <strong>
                {index + 1}. {item.card.label}
              </strong>
              <small>{item.rankReasons.slice(0, 3).join(' · ') || item.card.summary}</small>
            </button>
          ))}
        </div>
      ) : null}
      {showFirstArtifactCelebration ? (
        <div className="home-first-artifact-celebration" aria-label="First evidence generated">
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>
            <strong>First evidence ready</strong>
            <small>
              {firstArtifactTiming
                ? `Generated in ${firstArtifactTiming}`
                : 'Workspace Intelligence has its first artifact.'}
            </small>
          </span>
        </div>
      ) : null}
      {day0Funnel ? (
        <div className="home-day0-funnel" aria-label="First-value progress">
          <button
            type="button"
            className="home-day0-funnel__focus"
            onClick={() => onNavigate(day0Funnel.recommendedFocus.section)}
          >
            <span>Next recommended focus</span>
            <strong>{day0Funnel.recommendedFocus.title}</strong>
            <small>{day0Funnel.recommendedFocus.detail}</small>
            <em>
              {day0Funnel.recommendedFocus.cta}
              <ArrowRight size={12} aria-hidden="true" />
            </em>
          </button>
          <div className="home-day0-funnel__head">
            <span>First-value path</span>
            <strong>{day0Funnel.summary}</strong>
          </div>
          <ol className="home-day0-funnel__steps">
            {day0Funnel.steps.map((step) => (
              <li
                key={step.id}
                className={`home-day0-funnel__step home-day0-funnel__step--${step.state}`}
                aria-current={step.state === 'current' ? 'step' : undefined}
              >
                <span className="home-day0-funnel__dot" aria-hidden="true" />
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
          <details className="home-day0-funnel__advanced">
            <summary>Other workspace actions</summary>
            {actionRow}
          </details>
        </div>
      ) : (
        <>
          <span className="home-next-actions__label">Next actions</span>
          {actionRow}
        </>
      )}
    </nav>
  );
}
