import { AlertCircle, ArrowRight, Dot, Sparkles } from 'lucide-react';
import type { DashboardEvidenceCard, DashboardNextStep } from '@/lib/dashboardEvidence';
import { dashboardSectionLabel, type DashboardSection } from '@/lib/dashboardSections';

interface DashboardNextStepRailProps {
  steps: DashboardNextStep[];
  onNavigateSection: (section: DashboardSection) => void;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onOpenIncidentStudio?: (
    target: NonNullable<DashboardEvidenceCard['incidentStudioTarget']>
  ) => void;
}

const priorityIcon = {
  critical: AlertCircle,
  recommended: Dot,
  optional: Sparkles,
} as const;

function stepActionHint(step: DashboardNextStep): string | null {
  if (step.command && step.incidentStudioTarget) {
    return step.commandLabel ? `Runs ${step.commandLabel}` : 'Runs command';
  }
  if (step.command) {
    return step.commandLabel ? `Runs ${step.commandLabel}` : 'Runs command';
  }
  if (step.incidentStudioTarget) {
    return 'Opens Incident Studio';
  }
  if (step.section) {
    return 'Opens tab';
  }
  return null;
}

export function DashboardNextStepRail({
  steps,
  onNavigateSection,
  onRunCommand,
  onOpenIncidentStudio,
}: DashboardNextStepRailProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <section className="dashboard-next-step-rail" aria-label="Recommended next steps">
      <div className="dashboard-next-step-rail__head">
        <span className="dashboard-next-step-rail__title">Next steps</span>
        <span className="ws-kicker dashboard-next-step-rail__meta">
          Context-aware workflow guidance
        </span>
      </div>
      <div className="dashboard-next-step-rail__list">
        {steps.map((step) => {
          const Icon = priorityIcon[step.priority];
          const sectionLabel = step.section ? dashboardSectionLabel(step.section) : null;
          const actionHint = stepActionHint(step);

          const handleClick = () => {
            if (step.section) {
              onNavigateSection(step.section);
            }
            if (step.command) {
              onRunCommand(step.command, step.commandData);
              return;
            }
            if (step.incidentStudioTarget && onOpenIncidentStudio) {
              onOpenIncidentStudio(step.incidentStudioTarget);
            }
          };

          return (
            <button
              key={step.id}
              type="button"
              className={`dashboard-next-step-rail__item dashboard-next-step-rail__item--${step.priority}`}
              onClick={handleClick}
              title={step.detail}
            >
              <Icon size={13} aria-hidden="true" />
              <span className="dashboard-next-step-rail__item-copy">
                <span className="dashboard-next-step-rail__item-title-row">
                  <strong>{step.title}</strong>
                  {sectionLabel ? (
                    <span className="ws-chip ws-chip--muted dashboard-next-step-rail__section-badge">
                      {sectionLabel}
                    </span>
                  ) : null}
                </span>
                <small>{step.detail}</small>
                {actionHint ? (
                  <span className="dashboard-next-step-rail__action-hint">{actionHint}</span>
                ) : null}
              </span>
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
