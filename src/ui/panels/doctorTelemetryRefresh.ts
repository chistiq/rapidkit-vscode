import * as path from 'path';

export function extractWorkspacePathFromDoctorReportPath(filePath: string): string | undefined {
  const suffix = `${path.sep}.rapidkit${path.sep}reports${path.sep}doctor-last-run.json`;
  const idx = filePath.lastIndexOf(suffix);
  if (idx <= 0) {
    return undefined;
  }
  return filePath.slice(0, idx);
}

export function extractWorkspacePathFromReportPath(filePath: string): string | undefined {
  const reportsMarker = `${path.sep}.rapidkit${path.sep}reports${path.sep}`;
  const reportsIdx = filePath.lastIndexOf(reportsMarker);
  if (reportsIdx > 0) {
    return filePath.slice(0, reportsIdx);
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
