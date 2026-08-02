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
      style={
        {
          '--ws-phase-count': STUDIO_INTELLIGENCE_PHASES.length,
        } as CSSProperties
      }
    >
      <div className="ws-sidebar__intelligence-rail-head">
        <span>Workspace Intelligence</span>
        <strong>{activeLabel}</strong>
        <small>
          {activeIndex + 1}/{STUDIO_INTELLIGENCE_PHASES.length}
        </small>
      </div>
      <div className="ws-sidebar__intelligence-rail-track" key={activePhase}>
        {STUDIO_INTELLIGENCE_PHASES.map((phase, index) => (
          <div
            key={phase.id}
            className="ws-sidebar__intelligence-phase"
            data-state={index < activeIndex ? 'past' : index === activeIndex ? 'active' : 'future'}
            style={{ gridColumn: index + 1 }}
            aria-current={index === activeIndex ? 'step' : undefined}
            title={`${index + 1}. ${phase.label}`}
          >
            <span className="ws-sidebar__intelligence-phase-dot" aria-hidden="true" />
            <span className="ws-sidebar__sr-only">
              {index + 1}. {phase.label}
            </span>
          </div>
        ))}
      </div>
    </nav>
  );
}
