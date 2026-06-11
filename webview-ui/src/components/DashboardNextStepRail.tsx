import { AlertCircle, ArrowRight, Dot, Sparkles } from 'lucide-react';
import type { DashboardEvidenceCard, DashboardNextStep } from '@/lib/dashboardEvidence';
import type { DashboardSection } from '@/lib/dashboardSections';

interface DashboardNextStepRailProps {
    steps: DashboardNextStep[];
    onNavigateSection: (section: DashboardSection) => void;
    onRunCommand: (command: string, data?: Record<string, unknown>) => void;
    onOpenIncidentStudio?: (target: NonNullable<DashboardEvidenceCard['incidentStudioTarget']>) => void;
}

const priorityIcon = {
    critical: AlertCircle,
    recommended: Dot,
    optional: Sparkles,
} as const;

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
                <span className="dashboard-next-step-rail__meta">Context-aware workflow guidance</span>
            </div>
            <div className="dashboard-next-step-rail__list">
                {steps.map((step) => {
                    const Icon = priorityIcon[step.priority];
                    const handleClick = () => {
                        if (step.command) {
                            onRunCommand(step.command, step.commandData);
                            return;
                        }
                        if (step.incidentStudioTarget && onOpenIncidentStudio) {
                            onOpenIncidentStudio(step.incidentStudioTarget);
                            return;
                        }
                        if (step.section) {
                            onNavigateSection(step.section);
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
                                <strong>{step.title}</strong>
                                <small>{step.detail}</small>
                            </span>
                            <ArrowRight size={12} aria-hidden="true" />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
