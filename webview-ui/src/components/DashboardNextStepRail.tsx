import { useState } from 'react';
import { AlertCircle, ArrowRight, Dot, Sparkles } from 'lucide-react';
import type { DashboardEvidenceCard, DashboardNextStep } from '@/lib/dashboardEvidence';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import { buildDashboardCommandActionContract } from '@/lib/dashboardCommandActionContract';
import { dashboardSectionLabel, type DashboardSection } from '@/lib/dashboardSections';
import type { DashboardOperateZone } from '@/lib/dashboardOperateZones';
import {
  WORKSPAI_DASHBOARD_NEXT_STEPS_META,
  WORKSPAI_INCIDENT_STUDIO_OPEN_HINT,
} from '@/lib/workspaiAiNarrative';

interface DashboardNextStepRailProps {
  steps: DashboardNextStep[];
  evidence?: DashboardEvidencePayload | null;
  onNavigateSection: (
    section: DashboardSection,
    options?: { operateZone?: DashboardOperateZone }
  ) => void;
  onRunCommand: (command: string, data?: Record<string, unknown>) => void;
  onOpenIncidentStudio?: (
    target: NonNullable<DashboardEvidenceCard['incidentStudioTarget']>
  ) => void;
  maxVisible?: number;
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
    return WORKSPAI_INCIDENT_STUDIO_OPEN_HINT;
  }
  if (step.section) {
    return step.operateZone ? 'Opens Run section' : 'Opens tab';
  }
  return null;
}

export function DashboardNextStepRail({
  steps,
  onNavigateSection,
  onRunCommand,
  onOpenIncidentStudio,
  maxVisible = 3,
  evidence,
}: DashboardNextStepRailProps) {
  const [expanded, setExpanded] = useState(false);
  if (steps.length === 0) {
    return null;
  }
  const visibleSteps = expanded ? steps : steps.slice(0, maxVisible);
  const hiddenCount = Math.max(0, steps.length - visibleSteps.length);

  return (
    <section className="ws-dashboard-next-step-rail" aria-label="Recommended next steps">
      <div className="ws-dashboard-next-step-rail__head">
        <span className="ws-dashboard-next-step-rail__title">Next steps</span>
        <span className="ws-kicker ws-dashboard-next-step-rail__meta">
          {WORKSPAI_DASHBOARD_NEXT_STEPS_META}
        </span>
      </div>
      <div className="ws-dashboard-next-step-rail__list">
        {visibleSteps.map((step) => {
          const Icon = priorityIcon[step.priority];
          const sectionLabel = step.section ? dashboardSectionLabel(step.section) : null;
          const actionHint = stepActionHint(step);
          const actionContract = step.command
            ? buildDashboardCommandActionContract(step.command, { evidence })
            : undefined;

          const handleClick = () => {
            if (step.section) {
              onNavigateSection(step.section, { operateZone: step.operateZone });
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
              className={`ws-dashboard-next-step-rail__item ws-dashboard-next-step-rail__item--${step.priority}`}
              onClick={handleClick}
              title={step.detail}
            >
              <Icon size={13} aria-hidden="true" />
              <span className="ws-dashboard-next-step-rail__item-copy">
                <span className="ws-dashboard-next-step-rail__item-title-row">
                  <strong>{step.title}</strong>
                  {sectionLabel ? (
                    <span className="ws-chip ws-chip--muted ws-dashboard-next-step-rail__section-badge">
                      {sectionLabel}
                    </span>
                  ) : null}
                </span>
                <small>{step.detail}</small>
                {actionHint ? (
                  <span className="ws-dashboard-next-step-rail__action-hint">{actionHint}</span>
                ) : null}
                {actionContract ? (
                  <span className="ws-dashboard-next-step-rail__contract" aria-label="Action contract">
                    <span>{actionContract.executionScope}</span>
                    <span>{actionContract.artifactLabel}</span>
                  </span>
                ) : null}
              </span>
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {hiddenCount > 0 || expanded ? (
        <div className="ws-dashboard-next-step-rail__footer">
          <span>
            {expanded
              ? `${steps.length} recommendations shown`
              : `${hiddenCount} more recommendation${hiddenCount === 1 ? '' : 's'} hidden`}
          </span>
          <button
            type="button"
            className="ws-btn ws-btn--ghost"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : 'Show all'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
