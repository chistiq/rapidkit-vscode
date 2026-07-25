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
    <label className="ws-view-select" title={EVIDENCE_VIEW_MODE_HINTS[value]}>
      <span>Show</span>
      <select
        aria-label="Artifact detail level"
        value={value}
        onChange={(event) => onChange(event.target.value as EvidenceViewMode)}
      >
        {EVIDENCE_VIEW_MODES.map((mode) => {
          return (
            <option key={mode} value={mode}>
              {EVIDENCE_VIEW_MODE_LABELS[mode]}
            </option>
          );
        })}
      </select>
    </label>
  );
}
