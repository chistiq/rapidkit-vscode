import type * as vscode from 'vscode';

import type { DashboardEvidenceStatus } from './dashboardEvidenceBridge';
import { activityStatusFromEvidenceStatus, resolveReportBinding } from './dashboardReportRegistry';

export type DashboardActivityStatus = 'dispatched' | 'completed' | 'failed';

export type DashboardActivityEntry = {
  id: string;
  command: string;
  label: string;
  scope: 'workspace' | 'project' | 'system';
  status: DashboardActivityStatus;
  timestamp: number;
  detail?: string;
  runCount?: number;
};

const ACTIVITY_KEY = 'rapidkit.dashboard.activityLog';
const MAX_ENTRIES = 12;
const COALESCE_MS = 120_000;

const DASHBOARD_COMMAND_LABELS: Record<
  string,
  { label: string; scope: DashboardActivityEntry['scope'] }
> = {
  checkWorkspaceHealth: { label: 'Workspace Doctor', scope: 'workspace' },
  workspaceAnalyze: { label: 'Workspace Analyze', scope: 'workspace' },
  workspaceReadiness: { label: 'Release Readiness', scope: 'workspace' },
  workspaceAutopilotRelease: { label: 'Autopilot Release', scope: 'workspace' },
  workspaceBootstrap: { label: 'Bootstrap', scope: 'workspace' },
  workspaceSetup: { label: 'Setup', scope: 'workspace' },
  mirrorSync: { label: 'Mirror Sync', scope: 'workspace' },
  mirrorStatus: { label: 'Mirror Status', scope: 'workspace' },
  cacheStatus: { label: 'Cache Status', scope: 'workspace' },
  workspaceInfra: { label: 'Infra Plan', scope: 'workspace' },
  workspaceSnapshotCreate: { label: 'Snapshot Create', scope: 'workspace' },
  workspaceShare: { label: 'Share Export', scope: 'workspace' },
  workspaceArchive: { label: 'Archive', scope: 'workspace' },
  projectInit: { label: 'Project Init', scope: 'project' },
  projectDev: { label: 'Project Dev', scope: 'project' },
  projectDoctor: { label: 'Project Doctor', scope: 'project' },
  projectLint: { label: 'Project Lint', scope: 'project' },
  projectFormat: { label: 'Project Format', scope: 'project' },
  importWorkspace: { label: 'Import Workspace', scope: 'system' },
  openCreateWorkspace: { label: 'Create Workspace', scope: 'system' },
};

export function resolveDashboardCommandActivity(command: string): {
  label: string;
  scope: DashboardActivityEntry['scope'];
} {
  const resolved = DASHBOARD_COMMAND_LABELS[command];
  if (resolved) {
    return resolved;
  }
  return {
    label: command.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    scope: 'system',
  };
}

export function getDashboardActivityLog(
  context: vscode.ExtensionContext
): DashboardActivityEntry[] {
  const raw = context.globalState.get<DashboardActivityEntry[]>(ACTIVITY_KEY, []);
  return Array.isArray(raw) ? raw.slice(0, MAX_ENTRIES) : [];
}

export function mergeDashboardActivityEntry(
  current: DashboardActivityEntry[],
  incoming: Omit<DashboardActivityEntry, 'id' | 'timestamp' | 'runCount'> & {
    timestamp?: number;
    runCount?: number;
  },
  options?: { coalesceMs?: number; maxEntries?: number }
): DashboardActivityEntry[] {
  const coalesceMs = options?.coalesceMs ?? COALESCE_MS;
  const maxEntries = options?.maxEntries ?? MAX_ENTRIES;
  const timestamp = incoming.timestamp ?? Date.now();
  const [latest, ...rest] = current;

  if (latest && latest.command === incoming.command && timestamp - latest.timestamp < coalesceMs) {
    const merged: DashboardActivityEntry = {
      ...latest,
      timestamp,
      status: incoming.status ?? latest.status,
      detail: incoming.detail ?? latest.detail,
      runCount: (latest.runCount ?? 1) + 1,
    };
    return [merged, ...rest].slice(0, maxEntries);
  }

  const nextEntry: DashboardActivityEntry = {
    id: `${incoming.command}-${timestamp}`,
    timestamp,
    status: incoming.status ?? 'dispatched',
    command: incoming.command,
    label: incoming.label,
    scope: incoming.scope,
    detail: incoming.detail,
    runCount: incoming.runCount ?? 1,
  };

  return [nextEntry, ...current].slice(0, maxEntries);
}

export async function appendDashboardActivity(
  context: vscode.ExtensionContext,
  entry: Omit<DashboardActivityEntry, 'id' | 'timestamp' | 'status' | 'runCount'> & {
    status?: DashboardActivityStatus;
    timestamp?: number;
    runCount?: number;
  }
): Promise<DashboardActivityEntry[]> {
  const current = getDashboardActivityLog(context);
  const next = mergeDashboardActivityEntry(current, {
    ...entry,
    status: entry.status ?? 'dispatched',
  });
  await context.globalState.update(ACTIVITY_KEY, next);
  return next;
}

export async function finalizeDashboardActivity(
  context: vscode.ExtensionContext,
  command: string,
  evidenceStatus: DashboardEvidenceStatus,
  detail?: string
): Promise<DashboardActivityEntry[]> {
  const current = getDashboardActivityLog(context);
  const nextStatus = activityStatusFromEvidenceStatus(evidenceStatus);
  let updated = false;
  const next = current.map((entry) => {
    if (!updated && entry.command === command && entry.status === 'dispatched') {
      updated = true;
      return {
        ...entry,
        status: nextStatus,
        detail: detail ?? entry.detail,
      };
    }
    return entry;
  });
  if (updated) {
    await context.globalState.update(ACTIVITY_KEY, next);
  }
  return next;
}

export async function finalizeDashboardActivityFromReport(
  context: vscode.ExtensionContext,
  reportPath: string,
  evidenceStatus: DashboardEvidenceStatus,
  detail?: string
): Promise<DashboardActivityEntry[]> {
  const binding = resolveReportBinding(reportPath);
  if (!binding) {
    return getDashboardActivityLog(context);
  }
  return finalizeDashboardActivity(context, binding.command, evidenceStatus, detail);
}

export async function clearDashboardActivity(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(ACTIVITY_KEY, []);
}

export async function markDashboardActivityCompleted(
  context: vscode.ExtensionContext,
  command: string,
  detail?: string
): Promise<DashboardActivityEntry[]> {
  return finalizeDashboardActivity(context, command, 'pass', detail);
}
