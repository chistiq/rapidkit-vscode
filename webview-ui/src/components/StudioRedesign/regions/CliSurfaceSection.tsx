import React from 'react';
import { Terminal } from 'lucide-react';

import {
  buildIncidentCliActionMatrix,
  type IncidentCliActionEntry,
} from '../../../lib/incidentCliActionMatrix';
import { studioClass } from '../styles/studioUi';

function cliStabilityClass(stability: 'stable' | 'advanced'): string {
  return stability === 'stable' ? 'is-stable' : 'is-advanced';
}

type CliSurfaceSectionProps = {
  hasProjectSelected: boolean;
  userMode?: 'guided' | 'expert';
  executingCommand?: string | null;
  onRunCliAction: (entry: IncidentCliActionEntry) => void;
  embedded?: boolean;
};

function filterEntries(
  entries: IncidentCliActionEntry[],
  userMode?: 'guided' | 'expert'
): IncidentCliActionEntry[] {
  if (userMode === 'guided') {
    return entries.filter((entry) => entry.stability === 'stable');
  }
  return entries;
}

export const CliSurfaceSection: React.FC<CliSurfaceSectionProps> = ({
  hasProjectSelected,
  userMode,
  executingCommand,
  onRunCliAction,
  embedded = false,
}) => {
  const matrix = buildIncidentCliActionMatrix(hasProjectSelected);
  const workspaceEntries = filterEntries(matrix.workspace, userMode);
  const projectEntries = filterEntries(matrix.project, userMode);

  if (workspaceEntries.length === 0 && projectEntries.length === 0) {
    return null;
  }

  return (
    <div className={`${studioClass.sidebarSection}${embedded ? ' studio-sidebar__section--cli-surface-embedded' : ' studio-sidebar__section--cli-surface'}`}>
      {!embedded ? (
        <div className={studioClass.panelHeader}>
          <div className={studioClass.panelHeaderTitle}>
            <span className={studioClass.kicker}>RapidKit CLI</span>
            <span className={studioClass.panelHeaderMeta}>npm surface</span>
          </div>
        </div>
      ) : null}
      {[...workspaceEntries, ...projectEntries].map((entry) => {
        const isRunning = executingCommand === entry.command;
        return (
          <div key={entry.id} className={`${studioClass.card} studio-card--cli-surface`}>
            <div className="studio-matrix-row__top">
              <div className="studio-matrix-row__select">
                <Terminal size={14} />
                <strong>{entry.label}</strong>
              </div>
              <span className={`studio-matrix-tag studio-matrix-tag--runtime ${cliStabilityClass(entry.stability)}`}>
                {entry.stability}
              </span>
            </div>
            <div className="studio-matrix-row__meta">
              <span className="studio-matrix-row__desc">{entry.detail}</span>
              <span className="studio-matrix-tag studio-matrix-tag--neutral">{entry.scope}</span>
            </div>
            <button
              type="button"
              className={`${studioClass.btnPrimary} studio-matrix-row__run`}
              disabled={!!executingCommand}
              onClick={() => onRunCliAction(entry)}
            >
              {isRunning ? 'Running…' : 'Run'}
            </button>
          </div>
        );
      })}
    </div>
  );
};
