import * as fs from 'fs';
import * as path from 'path';

import type { DashboardEvidenceCardId } from '../../contracts/dashboardEvidenceCards.js';
import { resolveReportBinding } from '../../core/dashboardReportRegistry.js';

const METADATA_DIRS = ['.workspai', '.rapidkit'] as const;

export function extractWorkspacePathFromDoctorReportPath(filePath: string): string | undefined {
  for (const metadataDir of METADATA_DIRS) {
    const workspaceSuffix = `${path.sep}${metadataDir}${path.sep}reports${path.sep}doctor-last-run.json`;
    const workspaceIdx = filePath.lastIndexOf(workspaceSuffix);
    if (workspaceIdx > 0) {
      return filePath.slice(0, workspaceIdx);
    }

    const projectSuffix = `${path.sep}${metadataDir}${path.sep}reports${path.sep}doctor-project-last-run.json`;
    const projectIdx = filePath.lastIndexOf(projectSuffix);
    if (projectIdx > 0) {
      const projectRoot = filePath.slice(0, projectIdx);
      return findWorkspaceRootSync(projectRoot) ?? projectRoot;
    }
  }

  return undefined;
}

function findWorkspaceRootSync(startPath: string): string | undefined {
  let current = startPath;
  const root = path.parse(current).root;

  while (current && current !== root) {
    if (
      fs.existsSync(path.join(current, '.workspai-workspace')) ||
      fs.existsSync(path.join(current, '.rapidkit-workspace'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return undefined;
}

export function extractWorkspacePathFromReportPath(filePath: string): string | undefined {
  for (const metadataDir of METADATA_DIRS) {
    const reportsMarker = `${path.sep}${metadataDir}${path.sep}reports${path.sep}`;
    const reportsIdx = filePath.lastIndexOf(reportsMarker);
    if (reportsIdx > 0) {
      const rootCandidate = filePath.slice(0, reportsIdx);
      const fileName = path.basename(filePath);
      if (fileName === 'doctor-project-last-run.json') {
        return findWorkspaceRootSync(rootCandidate) ?? rootCandidate;
      }
      return rootCandidate;
    }

    const archiveSuffix = `${path.sep}${metadataDir}${path.sep}archive-manifest.json`;
    const archiveIdx = filePath.lastIndexOf(archiveSuffix);
    if (archiveIdx > 0) {
      return filePath.slice(0, archiveIdx);
    }
  }

  return extractWorkspacePathFromDoctorReportPath(filePath);
}

export type DashboardEvidenceRefreshContext = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  reportPath?: string;
  cardIds?: DashboardEvidenceCardId[];
  refreshMode?: 'full' | 'patch';
  requestId?: number;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type CreateDoctorTelemetryRefreshControllerOptions = {
  onRefresh: (context?: DashboardEvidenceRefreshContext) => void | Promise<void>;
  onError?: (error: unknown) => void;
  delayMs?: number;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

export function createDoctorTelemetryRefreshController(
  options: CreateDoctorTelemetryRefreshControllerOptions
) {
  const delayMs = options.delayMs ?? 250;
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const onError = options.onError ?? (() => undefined);
  let timer: TimerHandle | undefined;
  let pendingContext: DashboardEvidenceRefreshContext | undefined;

  return {
    schedule(filePath?: string) {
      const binding = filePath ? resolveReportBinding(filePath) : undefined;
      const context: DashboardEvidenceRefreshContext | undefined = filePath
        ? {
            reportPath: filePath,
            workspacePath: extractWorkspacePathFromReportPath(filePath),
            ...(binding?.cardId
              ? {
                  cardIds: [binding.cardId as DashboardEvidenceCardId],
                  refreshMode: 'patch' as const,
                }
              : {}),
          }
        : undefined;
      pendingContext = mergeDashboardEvidenceRefreshContexts(pendingContext, context);

      if (timer) {
        clearTimer(timer);
      }

      timer = setTimer(() => {
        timer = undefined;
        const contextToRefresh = pendingContext;
        pendingContext = undefined;
        void Promise.resolve(options.onRefresh(contextToRefresh)).catch((error) => {
          onError(error);
        });
      }, delayMs);
    },
    dispose() {
      if (!timer) {
        return;
      }
      clearTimer(timer);
      timer = undefined;
      pendingContext = undefined;
    },
  };
}

export function mergeDashboardEvidenceRefreshContexts(
  current: DashboardEvidenceRefreshContext | undefined,
  next: DashboardEvidenceRefreshContext | undefined
): DashboardEvidenceRefreshContext | undefined {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  if (current.workspacePath && next.workspacePath && current.workspacePath !== next.workspacePath) {
    return next;
  }

  const cardIds = Array.from(new Set([...(current.cardIds ?? []), ...(next.cardIds ?? [])]));
  return {
    ...current,
    ...next,
    workspacePath: next.workspacePath ?? current.workspacePath,
    projectPath: next.projectPath ?? current.projectPath,
    projectName: next.projectName ?? current.projectName,
    reportPath: next.reportPath ?? current.reportPath,
    ...(cardIds.length > 0 ? { cardIds, refreshMode: 'patch' as const } : {}),
  };
}
