import type { EvidenceViewMode } from '@/lib/dashboardEvidenceViewMode';
import {
  EVIDENCE_VIEW_MODE_HINTS,
  EVIDENCE_VIEW_MODE_LABELS,
  EVIDENCE_VIEW_MODES,
} from '@/lib/dashboardEvidenceViewMode';

interface EvidenceViewModeToggleProps {
  value: EvidenceViewMode;
  onChange: (mode: EvidenceViewMode) => void;
}

export function EvidenceViewModeToggle({ value, onChange }: EvidenceViewModeToggleProps) {
  return (
    <div className="evidence-view-mode" role="group" aria-label="Evidence display mode">
      <span className="evidence-view-mode__label">View</span>
      <div className="evidence-view-mode__options">
        {EVIDENCE_VIEW_MODES.map((mode) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              className={`evidence-view-mode__option${active ? ' is-active' : ''}`}
              aria-pressed={active}
              title={EVIDENCE_VIEW_MODE_HINTS[mode]}
              onClick={() => onChange(mode)}
            >
              {EVIDENCE_VIEW_MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
