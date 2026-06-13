import * as vscode from 'vscode';

import { getIncidentPrimaryCtaExperimentVariant } from './welcomePanelTelemetryExperiment';
import {
  normalizeIncidentRollbackApprovalMode,
  normalizeIncidentRollbackProtectedPaths,
} from './welcomePanelIncidentPolicy';
import {
  getIncidentStudioDisplayMode,
  normalizeIncidentStudioDisplayMode,
  normalizeIncidentUserMode,
  type IncidentStudioDisplayMode,
  type IncidentUserMode,
} from './welcomePanelUiPreferences';

export const INCIDENT_STUDIO_UI_PREFS_KEY = 'rapidkit.welcome.uiPreferences';

export type IncidentStudioUiPreferences = {
  setupStatusCardHidden: boolean;
  incidentUserMode: IncidentUserMode;
  incidentStudioDisplayMode: IncidentStudioDisplayMode;
  incidentAutoLearningPrompt: boolean;
  incidentPrimaryCtaExperimentVariant: 'single' | 'multi';
  incidentRollbackApprovalMode: 'never' | 'high-risk-only' | 'mutating-only' | 'always';
  incidentRollbackProtectedPaths: string[];
  dashboardSection: 'overview' | 'evidence' | 'operate' | 'console' | 'catalog' | 'workspaces';
};

export function readIncidentStudioUiPreferences(
  context: vscode.ExtensionContext,
  options?: {
    workspacePath?: string;
    telemetryWorkspacePath?: string;
  }
): IncidentStudioUiPreferences {
  const prefs = context.globalState.get<Record<string, unknown>>(INCIDENT_STUDIO_UI_PREFS_KEY, {});
  const incidentUserMode = normalizeIncidentUserMode(prefs?.incidentUserMode);
  const telemetryWorkspacePath =
    options?.telemetryWorkspacePath || options?.workspacePath || 'global';

  return {
    setupStatusCardHidden: prefs?.setupStatusCardHidden === true,
    incidentUserMode,
    incidentStudioDisplayMode: getIncidentStudioDisplayMode(prefs, options?.workspacePath),
    incidentAutoLearningPrompt: prefs?.incidentAutoLearningPrompt !== false,
    incidentPrimaryCtaExperimentVariant:
      getIncidentPrimaryCtaExperimentVariant(telemetryWorkspacePath),
    incidentRollbackApprovalMode: normalizeIncidentRollbackApprovalMode(
      prefs?.incidentRollbackApprovalMode
    ),
    incidentRollbackProtectedPaths: normalizeIncidentRollbackProtectedPaths(
      prefs?.incidentRollbackProtectedPaths
    ),
    dashboardSection:
      prefs?.dashboardSection === 'evidence' ||
      prefs?.dashboardSection === 'operate' ||
      prefs?.dashboardSection === 'console' ||
      prefs?.dashboardSection === 'catalog' ||
      prefs?.dashboardSection === 'workspaces'
        ? prefs.dashboardSection
        : 'overview',
  };
}

export async function setIncidentStudioUiPreference(
  context: vscode.ExtensionContext,
  key: string,
  value: unknown,
  options?: {
    workspacePath?: string;
    resolveWorkspacePath?: () => string | undefined;
  }
): Promise<{ workspacePath?: string; preferences: IncidentStudioUiPreferences }> {
  const current = context.globalState.get<Record<string, unknown>>(
    INCIDENT_STUDIO_UI_PREFS_KEY,
    {}
  );
  const resolvedWorkspacePath =
    typeof options?.workspacePath === 'string' && options.workspacePath.trim().length > 0
      ? options.workspacePath
      : options?.resolveWorkspacePath?.();

  if (key === 'incidentStudioDisplayMode') {
    const normalizedDisplayMode = normalizeIncidentStudioDisplayMode(value);
    const existingByWorkspace =
      current?.incidentStudioDisplayModeByWorkspace &&
      typeof current.incidentStudioDisplayModeByWorkspace === 'object'
        ? (current.incidentStudioDisplayModeByWorkspace as Record<string, unknown>)
        : {};
    const nextByWorkspace = {
      ...existingByWorkspace,
    };

    if (resolvedWorkspacePath) {
      nextByWorkspace[resolvedWorkspacePath] = normalizedDisplayMode;
    }

    const next = {
      ...current,
      incidentStudioDisplayMode: normalizedDisplayMode,
      incidentStudioDisplayModeByWorkspace: nextByWorkspace,
    };
    await context.globalState.update(INCIDENT_STUDIO_UI_PREFS_KEY, next);
    return {
      workspacePath: resolvedWorkspacePath,
      preferences: readIncidentStudioUiPreferences(context, {
        workspacePath: resolvedWorkspacePath,
        telemetryWorkspacePath: resolvedWorkspacePath,
      }),
    };
  }

  const next = {
    ...current,
    [key]: value,
  };
  await context.globalState.update(INCIDENT_STUDIO_UI_PREFS_KEY, next);
  return {
    workspacePath: resolvedWorkspacePath,
    preferences: readIncidentStudioUiPreferences(context, {
      workspacePath: resolvedWorkspacePath,
      telemetryWorkspacePath: resolvedWorkspacePath,
    }),
  };
}
