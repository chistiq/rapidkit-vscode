import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE_DOCTOR_SUFFIX = `${path.sep}.rapidkit${path.sep}reports${path.sep}doctor-last-run.json`;
const PROJECT_DOCTOR_SUFFIX = `${path.sep}.rapidkit${path.sep}reports${path.sep}doctor-project-last-run.json`;

export function extractWorkspacePathFromDoctorReportPath(filePath: string): string | undefined {
  const workspaceIdx = filePath.lastIndexOf(WORKSPACE_DOCTOR_SUFFIX);
  if (workspaceIdx > 0) {
    return filePath.slice(0, workspaceIdx);
  }

  const projectIdx = filePath.lastIndexOf(PROJECT_DOCTOR_SUFFIX);
  if (projectIdx > 0) {
    const projectRoot = filePath.slice(0, projectIdx);
    return findWorkspaceRootSync(projectRoot) ?? projectRoot;
  }

  return undefined;
}

function findWorkspaceRootSync(startPath: string): string | undefined {
  let current = startPath;
  const root = path.parse(current).root;

  while (current && current !== root) {
    if (fs.existsSync(path.join(current, '.rapidkit-workspace'))) {
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
  const reportsMarker = `${path.sep}.rapidkit${path.sep}reports${path.sep}`;
  const reportsIdx = filePath.lastIndexOf(reportsMarker);
  if (reportsIdx > 0) {
    const rootCandidate = filePath.slice(0, reportsIdx);
    const fileName = path.basename(filePath);
    if (fileName === 'doctor-project-last-run.json') {
      return findWorkspaceRootSync(rootCandidate) ?? rootCandidate;
    }
    return rootCandidate;
  }

  const archiveSuffix = `${path.sep}.rapidkit${path.sep}archive-manifest.json`;
  const archiveIdx = filePath.lastIndexOf(archiveSuffix);
  if (archiveIdx > 0) {
    return filePath.slice(0, archiveIdx);
  }

  return extractWorkspacePathFromDoctorReportPath(filePath);
}

export type DashboardEvidenceRefreshContext = {
  workspacePath?: string;
  projectPath?: string;
  projectName?: string;
  reportPath?: string;
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

  return {
    schedule(filePath?: string) {
      const context: DashboardEvidenceRefreshContext | undefined = filePath
        ? {
            reportPath: filePath,
            workspacePath: extractWorkspacePathFromReportPath(filePath),
          }
        : undefined;

      if (timer) {
        clearTimer(timer);
      }

      timer = setTimer(() => {
        timer = undefined;
        void Promise.resolve(options.onRefresh(context)).catch((error) => {
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
    },
  };
}
