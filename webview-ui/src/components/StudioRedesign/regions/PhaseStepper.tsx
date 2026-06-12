import React from 'react';
import { IncidentPhase, PHASE_LABELS, PHASE_SEQUENCE, PHASE_SHORT } from '../state/studioState';
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

                return (
                    <button
                        key={phase}
                        type="button"
                        className={stepClass}
                        aria-label={`Phase ${idx + 1}: ${PHASE_LABELS[phase]}`}
                        aria-current={isActive ? 'step' : undefined}
                        onClick={() => onSelectPhase(phase)}
                        title={PHASE_LABELS[phase]}
                    >
                        <span className="studio-phase-step__index">{isDone ? '✓' : idx + 1}</span>
                        {showLabels ? <span>{label}</span> : null}
                    </button>
                );
            })}
        </nav>
    );
};
