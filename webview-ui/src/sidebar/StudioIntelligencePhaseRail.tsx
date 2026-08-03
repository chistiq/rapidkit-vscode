import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  resolveStudioIntelligencePhaseDirection,
  STUDIO_INTELLIGENCE_PHASES,
  studioIntelligencePhaseIndex,
  studioIntelligencePhaseLabel,
  type StudioIntelligencePhaseId,
} from '@/lib/studioIntelligencePhaseRail';

type StudioIntelligencePhaseRailProps = {
  activePhase: StudioIntelligencePhaseId;
  running: boolean;
};

export function StudioIntelligencePhaseRail({
  activePhase,
  running,
}: StudioIntelligencePhaseRailProps) {
  const previousIndex = useRef(studioIntelligencePhaseIndex(activePhase));
  const [direction, setDirection] = useState<'forward' | 'backward' | 'idle'>('idle');
  const activeIndex = Math.max(0, studioIntelligencePhaseIndex(activePhase));
  const activeLabel = studioIntelligencePhaseLabel(activePhase) ?? 'Model';
  const phaseCount = STUDIO_INTELLIGENCE_PHASES.length;

  useEffect(() => {
    setDirection(resolveStudioIntelligencePhaseDirection(previousIndex.current, activeIndex));
    previousIndex.current = activeIndex;
  }, [activeIndex]);

  return (
    <nav
      className="ws-sidebar__intelligence-rail"
      role="progressbar"
      aria-label="Workspace Intelligence repair loop"
      aria-valuemax={phaseCount}
      aria-valuemin={1}
      aria-valuenow={activeIndex + 1}
      aria-valuetext={`${activeLabel}, step ${activeIndex + 1} of ${phaseCount}`}
      data-direction={direction}
      data-running={running ? 'true' : 'false'}
      style={{ '--ws-phase-count': phaseCount } as CSSProperties}
    >
      <div className="ws-sidebar__intelligence-rail-head">
        <span>Intelligence loop</span>
        <div>
          <strong>{activeLabel}</strong>
          <small>
            {activeIndex + 1} of {phaseCount}
          </small>
        </div>
      </div>
      <div className="ws-sidebar__intelligence-rail-track" key={activePhase}>
        {STUDIO_INTELLIGENCE_PHASES.map((phase, index) => (
          <div
            key={phase.id}
            className="ws-sidebar__intelligence-phase"
            data-state={index < activeIndex ? 'past' : index === activeIndex ? 'active' : 'future'}
            aria-current={index === activeIndex ? 'step' : undefined}
            aria-label={`${index + 1}. ${phase.label}`}
            title={`${index + 1}. ${phase.label}`}
          >
            <span className="ws-sidebar__intelligence-phase-segment" aria-hidden="true" />
          </div>
        ))}
      </div>
    </nav>
  );
}
