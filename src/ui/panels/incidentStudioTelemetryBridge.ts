import * as vscode from 'vscode';

import { createExtensionWebviewMessage } from '../../contracts/webviewProtocol';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import {
  buildIncidentStudioTelemetryFromCache,
  buildIncidentStudioTelemetryPayload,
  filterDoctorSummaryForProjectScope,
  shouldUseIncidentStudioTelemetryCache,
  type CachedIncidentStudioTelemetry,
  type IncidentStudioTelemetryPayload,
} from './incidentStudioTelemetry';
import { readDoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import {
  readIncidentStudioUiPreferences,
  setIncidentStudioUiPreference,
} from './incidentStudioUiPreferencesBridge';

export const INCIDENT_STUDIO_TELEMETRY_CACHE_TTL_MS = 5 * 60 * 1000;

export type ResolveIncidentStudioTelemetryOptions = {
  context: vscode.ExtensionContext;
  workspacePath?: string;
  projectPath?: string;
  forceRefresh?: boolean;
  readDoctorSummary?: (workspacePath?: string) => Promise<unknown | null | undefined>;
};

function buildTelemetryCacheKey(workspacePath: string, projectPath?: string): string {
  return projectPath
    ? `incident-studio-telemetry-${workspacePath}::${projectPath}`
    : `incident-studio-telemetry-${workspacePath}`;
}

export async function resolveIncidentStudioTelemetry(
  options: ResolveIncidentStudioTelemetryOptions
): Promise<IncidentStudioTelemetryPayload | null> {
  const workspacePath = options.workspacePath?.trim();
  if (!workspacePath) {
    return null;
  }

  const normalizedProjectPath =
    typeof options.projectPath === 'string' && options.projectPath.trim().length > 0
      ? options.projectPath.trim()
      : undefined;
  const readDoctorSummary = options.readDoctorSummary ?? readDoctorEvidenceSnapshot;
  const doctorSummary = filterDoctorSummaryForProjectScope(
    await readDoctorSummary(workspacePath),
    normalizedProjectPath
  );

  const cacheKey = buildTelemetryCacheKey(workspacePath, normalizedProjectPath);
  const cachedData = options.context.globalState.get<
    CachedIncidentStudioTelemetry & { timestamp: number }
  >(cacheKey);
  const now = Date.now();

  if (
    !options.forceRefresh &&
    cachedData &&
    shouldUseIncidentStudioTelemetryCache(cachedData, now, INCIDENT_STUDIO_TELEMETRY_CACHE_TTL_MS)
  ) {
    return buildIncidentStudioTelemetryFromCache(cachedData, doctorSummary);
  }

  const tracker = WorkspaceUsageTracker.getInstance();
  const [
    commandSummary,
    onboardingSummary,
    ctaVariantBreakdown,
    studioHardGateStatus,
    studioRollbackKpiStatus,
    studioStabilizationKpiStatus,
    studioReproPackKpiStatus,
    releaseReadinessValidationKpiStatus,
    enterpriseStabilizationGateStatus,
  ] = await Promise.all([
    tracker.getCommandTelemetrySummary(workspacePath, 'last7d'),
    tracker.getOnboardingExperimentStats(workspacePath, 'last7d'),
    tracker.getStudioCtaVariantBreakdown(workspacePath, 'last7d', normalizedProjectPath),
    tracker.getStudioHardGateStatus(workspacePath, 'last7d', {}, normalizedProjectPath),
    tracker.getStudioRollbackKpiStatus(workspacePath, 'last7d', {}, normalizedProjectPath),
    tracker.getStudioStabilizationKpiStatus(workspacePath, 'last7d', {}, normalizedProjectPath),
    tracker.getStudioReproPackKpiStatus(workspacePath, 'last7d', {}, normalizedProjectPath),
    tracker.getReleaseReadinessValidationKpiStatus(workspacePath, 'last30d', normalizedProjectPath),
    tracker.getEnterpriseStabilizationGateStatus(workspacePath, normalizedProjectPath),
  ]);

  const telemetryData = buildIncidentStudioTelemetryPayload(
    commandSummary,
    onboardingSummary,
    ctaVariantBreakdown,
    doctorSummary,
    studioHardGateStatus,
    studioRollbackKpiStatus,
    studioStabilizationKpiStatus,
    studioReproPackKpiStatus,
    releaseReadinessValidationKpiStatus,
    enterpriseStabilizationGateStatus
  );

  await options.context.globalState.update(cacheKey, {
    ...telemetryData,
    timestamp: now,
  });

  return telemetryData;
}

export async function postIncidentStudioTelemetry(
  webview: vscode.Webview,
  options: ResolveIncidentStudioTelemetryOptions
): Promise<void> {
  try {
    const telemetryData = await resolveIncidentStudioTelemetry(options);
    webview.postMessage(createExtensionWebviewMessage('incidentStudioTelemetry', telemetryData));
  } catch (error) {
    console.warn('[IncidentStudio] telemetry refresh failed:', error);
    webview.postMessage(createExtensionWebviewMessage('incidentStudioTelemetry', null));
  }
}

export function postIncidentStudioUiPreferences(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  workspacePath?: string
): void {
  webview.postMessage(
    createExtensionWebviewMessage(
      'uiPreferences',
      readIncidentStudioUiPreferences(context, { workspacePath })
    )
  );
}

export async function handleIncidentStudioSetUiPreference(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  key: string,
  value: unknown,
  options?: {
    workspacePath?: string;
    resolveWorkspacePath?: () => string | undefined;
  }
): Promise<void> {
  const result = await setIncidentStudioUiPreference(context, key, value, options);
  webview.postMessage(createExtensionWebviewMessage('uiPreferences', result.preferences));
}
