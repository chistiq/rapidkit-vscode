import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDoctorTelemetryRefreshController,
  extractWorkspacePathFromDoctorReportPath,
  extractWorkspacePathFromReportPath,
} from '../ui/panels/doctorTelemetryRefresh';

describe('doctorTelemetryRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('extracts the workspace root from doctor report paths', () => {
    expect(
      extractWorkspacePathFromDoctorReportPath('/tmp/demo/.rapidkit/reports/doctor-last-run.json')
    ).toBe('/tmp/demo');

    expect(
      extractWorkspacePathFromDoctorReportPath('/tmp/demo/somewhere-else/report.json')
    ).toBeUndefined();
  });

  it('extracts the workspace root from generic report paths', () => {
    expect(
      extractWorkspacePathFromReportPath('/tmp/demo/.rapidkit/reports/analyze-last-run.json')
    ).toBe('/tmp/demo');
    expect(extractWorkspacePathFromReportPath('/tmp/demo/.rapidkit/archive-manifest.json')).toBe(
      '/tmp/demo'
    );
  });

  it('debounces doctor telemetry refresh and keeps the latest workspace path', async () => {
    const onRefresh = vi.fn();
    const controller = createDoctorTelemetryRefreshController({ onRefresh, delayMs: 250 });
    const thirdReport = '/tmp/third/.rapidkit/reports/doctor-last-run.json';

    controller.schedule('/tmp/first/.rapidkit/reports/doctor-last-run.json');
    controller.schedule('/tmp/second/.rapidkit/reports/doctor-last-run.json');
    controller.schedule(thirdReport);

    vi.advanceTimersByTime(249);
    expect(onRefresh).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith({
      workspacePath: '/tmp/third',
      reportPath: thirdReport,
    });

    controller.dispose();
  });

  it('cancels a pending doctor telemetry refresh on dispose', async () => {
    const onRefresh = vi.fn();
    const controller = createDoctorTelemetryRefreshController({ onRefresh, delayMs: 250 });

    controller.schedule('/tmp/demo/.rapidkit/reports/doctor-last-run.json');
    controller.dispose();

    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('captures async refresh failures without leaking unhandled rejections', async () => {
    const refreshError = new Error('refresh failed');
    const onRefresh = vi.fn().mockRejectedValue(refreshError);
    const onError = vi.fn();
    const controller = createDoctorTelemetryRefreshController({
      onRefresh,
      onError,
      delayMs: 250,
    });

    controller.schedule('/tmp/demo/.rapidkit/reports/doctor-last-run.json');
    vi.advanceTimersByTime(250);
    await Promise.resolve();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith({
      workspacePath: '/tmp/demo',
      reportPath: '/tmp/demo/.rapidkit/reports/doctor-last-run.json',
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(refreshError);
  });
});
