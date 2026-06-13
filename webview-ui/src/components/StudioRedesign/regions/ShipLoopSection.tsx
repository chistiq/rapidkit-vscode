import React from 'react';
import { ArrowRight, Rocket } from 'lucide-react';

import type { EnterpriseShipLoopView, ShipLoopStepId } from '../../../lib/incidentStudioShipLoop';
import { studioClass } from '../styles/studioUi';

function stepStateClass(state: string): string {
  switch (state) {
    case 'pass':
      return studioClass.toneOk;
    case 'warn':
      return studioClass.toneWarn;
    case 'fail':
    case 'blocked':
      return studioClass.toneError;
    default:
      return '';
  }
}

function stepStateLabel(state: string): string {
  switch (state) {
    case 'pass':
      return 'PASS';
    case 'warn':
      return 'ATTN';
    case 'fail':
      return 'FAIL';
    case 'blocked':
      return 'BLOCK';
    default:
      return 'PENDING';
  }
}

type ShipLoopSectionProps = {
  shipLoop: EnterpriseShipLoopView | null;
  executingStepId?: ShipLoopStepId | null;
  onRunStep: (stepId: ShipLoopStepId) => void;
  canRunStep: (stepId: ShipLoopStepId) => boolean;
  embedded?: boolean;
};

export const ShipLoopSection: React.FC<ShipLoopSectionProps> = ({
  shipLoop,
  executingStepId,
  onRunStep,
  canRunStep,
  embedded = false,
}) => {
  if (!shipLoop) {
    return null;
  }

  const body = (
    <>
      <div className={studioClass.rowSm}>
        <Rocket size={14} aria-hidden="true" />
        <span className={studioClass.captionSmall}>Analyze → Verify → Readiness → Archive → Release</span>
      </div>
      <div className={`${studioClass.stackSm} ${studioClass.mtSm}`}>
        {shipLoop.steps.map((step, index) => {
          const isRunning = executingStepId === step.id;
          const disabled = isRunning || !!executingStepId || !canRunStep(step.id);
          return (
            <div key={step.id} className="studio-ship-loop__step">
              <div className="studio-ship-loop__step-head">
                <div className="studio-ship-loop__step-copy">
                  <strong>{step.label}</strong>
                  <span className={`${studioClass.caption} studio-u-text-subtle`}>{step.detail}</span>
                </div>
                <span className={`${studioClass.captionSmall} ${stepStateClass(step.state)}`}>
                  {stepStateLabel(step.state)}
                </span>
                <button
                  type="button"
                  className={`${studioClass.btnGhost} studio-ship-loop__run`}
                  disabled={disabled}
                  onClick={() => onRunStep(step.id)}
                >
                  {isRunning ? 'Running…' : step.runLabel}
                </button>
              </div>
              {step.blockers.length > 0 ? (
                <ul className={`${studioClass.caption} studio-ship-loop__blockers`}>
                  {step.blockers.slice(0, 2).map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}
              {index < shipLoop.steps.length - 1 ? (
                <ArrowRight size={12} className="studio-ship-loop__connector" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
      {shipLoop.recoveryHint ? (
        <p className={`${studioClass.caption} studio-u-text-subtle ${studioClass.mtSm}`}>
          {shipLoop.recoveryHint}
        </p>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className={`${studioClass.card} studio-ship-loop`}>{body}</div>;
  }

  return (
    <section className={studioClass.contextSection} aria-label="Enterprise ship loop">
      <div className={studioClass.sectionLabel}>Ship loop</div>
      <div className={`${studioClass.card} studio-ship-loop`}>{body}</div>
    </section>
  );
};
