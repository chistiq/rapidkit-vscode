import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import { resolveTelemetryWorkspacePath } from './welcomePanelTelemetryWorkspace';
import { getIncidentPrimaryCtaExperimentVariant } from './welcomePanelTelemetryExperiment';

export type WelcomePanelStudioTelemetryBindings = {
  selectedProject: { path: string; workspacePath?: string } | null | undefined;
  selectedWorkspacePath?: string;
  workspaceFolders: readonly { uri: { fsPath: string } }[] | undefined;
};

export function resolveWelcomePanelTelemetryWorkspacePath(
  bindings: WelcomePanelStudioTelemetryBindings
): string | undefined {
  return resolveTelemetryWorkspacePath(
    bindings.selectedProject,
    bindings.selectedWorkspacePath,
    bindings.workspaceFolders
  );
}

export function resolveDashboardSessionWorkspacePath(
  bindings: WelcomePanelStudioTelemetryBindings,
  data: unknown
): string | undefined {
  const explicit =
    typeof data === 'object' && data !== null && 'workspacePath' in data
      ? String((data as { workspacePath?: unknown }).workspacePath || '').trim()
      : '';
  return explicit || resolveWelcomePanelTelemetryWorkspacePath(bindings);
}

export function trackWelcomePanelStudioEvent(
  bindings: WelcomePanelStudioTelemetryBindings,
  command: string,
  workspacePath?: string,
  properties?: Record<string, unknown>
): void {
  const resolvedWorkspacePath =
    workspacePath || resolveWelcomePanelTelemetryWorkspacePath(bindings);
  const experimentSeed = resolvedWorkspacePath || 'global';
  void WorkspaceUsageTracker.getInstance().trackCommandEvent(command, resolvedWorkspacePath, {
    source: 'incident_studio',
    ctaVariant: getIncidentPrimaryCtaExperimentVariant(experimentSeed),
    ...(properties || {}),
  });
}
