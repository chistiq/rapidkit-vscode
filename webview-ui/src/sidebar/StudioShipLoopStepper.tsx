import { PlayCircle } from 'lucide-react';

import {
  deriveSidebarShipLoopView,
  type SidebarShipLoopStepId,
} from '@/lib/sidebarShipLoop';

type SidebarShipLoopCard = {
  id: SidebarShipLoopStepId | 'autopilot';
  status: 'pass' | 'warn' | 'fail' | 'missing';
  summary?: string;
  blockers?: string[];
};

type StudioShipLoopStepperProps = {
  cards: SidebarShipLoopCard[];
  context: {
    workspacePath: string;
    projectPath?: string;
    projectName?: string;
  };
  busy?: boolean;
  onRunStep: (stepId: SidebarShipLoopStepId) => void;
};

const STATE_LABEL: Record<string, string> = {
  pass: 'Passed',
  warn: 'Attention',
  fail: 'Blocked',
  missing: 'Missing',
  blocked: 'Blocked',
};

export function StudioShipLoopStepper({
  cards,
  context,
  busy = false,
  onRunStep,
}: StudioShipLoopStepperProps) {
  const view = deriveSidebarShipLoopView(cards);
  if (view.steps.length === 0) {
    return null;
  }
  const workspaceLabel = context.workspacePath.split(/[\\/]/).filter(Boolean).pop() ?? 'workspace';
  const scopeLabel = context.projectName || context.projectPath?.split(/[\\/]/).filter(Boolean).pop();

  return (
    <div className="ws-sidebar__ship-loop" role="region" aria-label="Release path">
      <div className="ws-sidebar__ship-loop-head">
        <div className="ws-sidebar__ship-loop-title">
          <strong>Release path</strong>
          <small>
            {workspaceLabel}
            {scopeLabel ? ` / ${scopeLabel}` : ''}
          </small>
        </div>
        {view.nextStepId ? (
          <span className="ws-sidebar__ship-loop-next">Next: {view.nextStepId}</span>
        ) : (
          <span className="ws-sidebar__ship-loop-next">All core steps passed</span>
        )}
      </div>
      <p className="ws-sidebar__ship-loop-hint">
        Release checks are scoped to this workspace evidence. Use this only when you came from
        readiness or verify gates.
      </p>
      {view.recoveryHint ? <p className="ws-sidebar__ship-loop-hint">{view.recoveryHint}</p> : null}
      <ol className="ws-sidebar__ship-loop-steps">
        {view.steps.map((step) => {
          const isNext = step.id === view.nextStepId;
          const canRun = step.runnable && !busy;
          return (
            <li
              key={step.id}
              className="ws-sidebar__ship-loop-step"
              data-state={step.state}
              data-current={isNext ? 'true' : 'false'}
            >
              <div className="ws-sidebar__ship-loop-step-copy">
                <strong>{step.label}</strong>
                <small>
                  {STATE_LABEL[step.state] ?? step.state}
                  {step.blockers[0] ? ` · ${step.blockers[0]}` : ''}
                </small>
              </div>
              <button
                type="button"
                className="ws-sidebar__inline"
                disabled={!canRun}
                title={step.blockers[0] ?? step.detail}
                onClick={() => onRunStep(step.id as SidebarShipLoopStepId)}
              >
                <PlayCircle size={12} strokeWidth={1.75} aria-hidden="true" />
                {isNext ? step.runLabel : 'Run'}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
