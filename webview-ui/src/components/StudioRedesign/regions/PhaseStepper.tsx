import React from 'react';
import { IncidentPhase, PHASE_HINTS, PHASE_LABELS, PHASE_SEQUENCE, PHASE_SHORT } from '../state/studioState';
import { studioClass } from '../styles/studioUi';

interface PhaseStepperProps {
    currentPhase: IncidentPhase;
    compactMode?: boolean;
    guidedMode?: boolean;
    onSelectPhase: (phase: IncidentPhase) => void;
}

export const PhaseStepper: React.FC<PhaseStepperProps> = ({
    currentPhase,
    compactMode = false,
    guidedMode = false,
    onSelectPhase,
}) => {
    const activeIndex = PHASE_SEQUENCE.indexOf(currentPhase);
    const showLabels = !compactMode || guidedMode;

    return (
        <nav
            aria-label="Incident workflow phases"
            className={studioClass.phaseStepper}
        >
            {PHASE_SEQUENCE.map((phase, idx) => {
                const isActive = phase === currentPhase;
                const isDone = idx < activeIndex;
                const stepClass = [
                    studioClass.phaseStep,
                    isActive ? 'is-active' : '',
                    isDone ? 'is-done' : '',
                ]
                    .filter(Boolean)
                    .join(' ');
                const label = guidedMode ? PHASE_SHORT[phase] : PHASE_LABELS[phase];

                const phaseHint = PHASE_HINTS[phase];

                return (
                    <button
                        key={phase}
                        type="button"
                        className={stepClass}
                        aria-label={`Phase ${idx + 1}: ${PHASE_LABELS[phase]}. ${phaseHint}`}
                        aria-current={isActive ? 'step' : undefined}
                        aria-describedby={isActive ? `studio-phase-hint-${phase}` : undefined}
                        onClick={() => onSelectPhase(phase)}
                        title={phaseHint}
                    >
                        <span className="studio-phase-step__main">
                            <span className="studio-phase-step__index">{isDone ? '✓' : idx + 1}</span>
                            {showLabels ? <span className="studio-phase-step__label">{label}</span> : null}
                        </span>
                        {isActive && showLabels ? (
                            <span
                                id={`studio-phase-hint-${phase}`}
                                className="studio-phase-step__hint"
                            >
                                {phaseHint}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </nav>
    );
};
