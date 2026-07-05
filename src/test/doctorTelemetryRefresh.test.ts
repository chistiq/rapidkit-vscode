import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

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

  it('walks up from project doctor reports to the workspace marker', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-doctor-ws-'));
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(path.join(projectPath, '.rapidkit', 'reports'));
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');
    const reportPath = path.join(
      projectPath,
      '.rapidkit',
      'reports',
      'doctor-project-last-run.json'
    );

    expect(extractWorkspacePathFromReportPath(reportPath)).toBe(workspacePath);
    expect(extractWorkspacePathFromDoctorReportPath(reportPath)).toBe(workspacePath);

    await fs.remove(workspacePath);
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
      cardIds: ['doctor'],
      refreshMode: 'patch',
    });

    controller.dispose();
  });

  it('coalesces rapid report writes in the same workspace into one patch refresh', async () => {
    const onRefresh = vi.fn();
    const controller = createDoctorTelemetryRefreshController({ onRefresh, delayMs: 250 });
    const workspacePath = '/tmp/workspace';

    for (const reportName of [
      'doctor-last-run.json',
      'analyze-last-run.json',
      'release-readiness-last-run.json',
      'pipeline-last-run.json',
      'doctor-last-run.json',
    ]) {
      controller.schedule(`${workspacePath}/.rapidkit/reports/${reportName}`);
    }

    vi.advanceTimersByTime(250);
    await Promise.resolve();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith({
      workspacePath,
      reportPath: `${workspacePath}/.rapidkit/reports/doctor-last-run.json`,
      cardIds: ['doctor', 'analyze', 'readiness', 'pipeline'],
      refreshMode: 'patch',
    });

    controller.dispose();
  });

  it('does not merge report bursts across different workspaces', async () => {
    const onRefresh = vi.fn();
    const controller = createDoctorTelemetryRefreshController({ onRefresh, delayMs: 250 });

    controller.schedule('/tmp/first/.rapidkit/reports/doctor-last-run.json');
    controller.schedule('/tmp/second/.rapidkit/reports/analyze-last-run.json');

    vi.advanceTimersByTime(250);
    await Promise.resolve();

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledWith({
      workspacePath: '/tmp/second',
      reportPath: '/tmp/second/.rapidkit/reports/analyze-last-run.json',
      cardIds: ['analyze'],
      refreshMode: 'patch',
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
      cardIds: ['doctor'],
      refreshMode: 'patch',
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(refreshError);
  });
});
