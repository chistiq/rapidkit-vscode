export type IncidentStudioDisplayMode = 'lite' | 'full';
export type IncidentUserMode = 'guided' | 'standard' | 'expert';
export type DashboardEvidenceViewMode = 'guided' | 'balanced' | 'expanded';

export function normalizeEvidenceViewMode(value: unknown): DashboardEvidenceViewMode {
  if (value === 'guided' || value === 'balanced' || value === 'expanded') {
    return value;
  }
  return 'guided';
}

export function normalizeIncidentStudioDisplayMode(value: unknown): IncidentStudioDisplayMode {
  return value === 'full' ? 'full' : 'lite';
}

export function getIncidentStudioDisplayMode(
  prefs: Record<string, unknown>,
  workspacePath?: string
): IncidentStudioDisplayMode {
  const displayModeByWorkspace =
    prefs?.incidentStudioDisplayModeByWorkspace &&
    typeof prefs.incidentStudioDisplayModeByWorkspace === 'object'
      ? (prefs.incidentStudioDisplayModeByWorkspace as Record<string, unknown>)
      : {};

  if (workspacePath) {
    const scoped = displayModeByWorkspace[workspacePath];
    if (scoped === 'lite' || scoped === 'full') {
      return scoped;
    }
  }

  if (prefs?.incidentStudioDisplayMode === 'lite' || prefs?.incidentStudioDisplayMode === 'full') {
    return prefs.incidentStudioDisplayMode as IncidentStudioDisplayMode;
  }

  return 'lite';
}

export function normalizeIncidentUserMode(value: unknown): IncidentUserMode {
  if (value === 'guided' || value === 'standard' || value === 'expert') {
    return value;
  }
  return 'standard';
}
