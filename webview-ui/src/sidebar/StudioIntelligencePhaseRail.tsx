import { useEffect, useRef, useState } from 'react';
import {
  buildStudioIntelligencePhaseWindow,
  resolveStudioIntelligencePhaseDirection,
  studioIntelligencePhaseIndex,
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
  const activeIndex = studioIntelligencePhaseIndex(activePhase);
  const phases = buildStudioIntelligencePhaseWindow(activePhase);

  useEffect(() => {
    setDirection(resolveStudioIntelligencePhaseDirection(previousIndex.current, activeIndex));
    previousIndex.current = activeIndex;
  }, [activeIndex]);

  return (
    <nav
      className="ws-sidebar__intelligence-rail"
      aria-label="Workspace Intelligence repair loop"
      data-direction={direction}
      data-running={running ? 'true' : 'false'}
    >
      <div className="ws-sidebar__intelligence-rail-track" key={activePhase}>
        {phases.map((phase, index) => (
          <div
            key={`${phase.id}:${phase.offset}`}
            className="ws-sidebar__intelligence-phase"
            data-state={phase.state}
            data-offset={phase.offset}
            style={{ gridColumn: index + 1 }}
            aria-current={phase.state === 'active' ? 'step' : undefined}
          >
            <span className="ws-sidebar__intelligence-phase-dot" aria-hidden="true" />
            <span>{phase.label}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}
