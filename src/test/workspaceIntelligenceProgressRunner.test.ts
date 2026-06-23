import { describe, expect, it, vi, beforeEach } from 'vitest';

const showErrorMessage = vi.fn();
const progressReport = vi.fn();

vi.mock('vscode', () => ({
  ProgressLocation: { Notification: 15 },
  window: {
    showErrorMessage: (...args: unknown[]) => showErrorMessage(...args),
    withProgress: async (
      _options: unknown,
      task: (progress: unknown, token: unknown) => unknown
    ) => {
      const progress = { report: progressReport };
      const token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      };
      return task(progress, token);
    },
  },
}));

const runRapidkitStreaming = vi.fn();
vi.mock('../core/streamingRapidkitRunner', () => ({
  runRapidkitStreaming: (...args: unknown[]) => runRapidkitStreaming(...args),
}));

import {
  runWorkspaceIntelligenceCommandWithProgress,
  runWorkspaceIntelligenceSequenceWithProgress,
  setWorkspaceEvidenceRefreshHandler,
} from '../core/workspaceIntelligenceProgressRunner';

function lifecycle(eventName: string, command: string[]): Record<string, unknown> {
  return {
    schemaVersion: 'cli-log-event-v1',
    runId: 'run-12345678',
    timestamp: '2026-06-22T10:00:00.000Z',
    level: eventName === 'run.failed' ? 'error' : 'info',
    event: eventName,
    component: 'workspace.verify',
    message: eventName === 'run.failed' ? 'gate blocked' : 'completed',
    command,
  };
}

describe('runWorkspaceIntelligenceCommandWithProgress', () => {
  beforeEach(() => {
    showErrorMessage.mockReset();
    progressReport.mockReset();
    runRapidkitStreaming.mockReset();
    setWorkspaceEvidenceRefreshHandler(undefined);
  });

  it('refreshes evidence after a successful workspace run', async () => {
    const refresh = vi.fn();
    setWorkspaceEvidenceRefreshHandler(refresh);
    runRapidkitStreaming.mockResolvedValueOnce({
      exitCode: 0,
      events: [],
      lastLifecycleEvent: lifecycle('run.completed', ['workspace', 'verify']),
      result: { verdict: 'ready' },
      stdout: '{}',
      stderr: '',
      failed: false,
    });

    const result = await runWorkspaceIntelligenceCommandWithProgress({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      title: 'Workspace Verify — ws',
      featureLabel: 'Workspace Verify',
    });

    expect(result?.failed).toBe(false);
    expect(refresh).toHaveBeenCalledWith('/tmp/ws');
    expect(showErrorMessage).not.toHaveBeenCalled();
  });

  it('surfaces a failure and still refreshes evidence for a workspace lifecycle failure', async () => {
    const refresh = vi.fn();
    setWorkspaceEvidenceRefreshHandler(refresh);
    runRapidkitStreaming.mockResolvedValueOnce({
      exitCode: 2,
      events: [],
      lastLifecycleEvent: lifecycle('run.failed', ['workspace', 'verify']),
      result: null,
      stdout: '',
      stderr: 'gate blocked',
      failed: true,
    });

    await runWorkspaceIntelligenceCommandWithProgress({
      command: ['workspace', 'verify', '--json'],
      cwd: '/tmp/ws',
      title: 'Workspace Verify — ws',
      featureLabel: 'Workspace Verify',
    });

    expect(showErrorMessage).toHaveBeenCalledWith('Workspace Verify failed: gate blocked');
    expect(refresh).toHaveBeenCalledWith('/tmp/ws');
  });
});

describe('runWorkspaceIntelligenceSequenceWithProgress', () => {
  beforeEach(() => {
    showErrorMessage.mockReset();
    progressReport.mockReset();
    runRapidkitStreaming.mockReset();
    setWorkspaceEvidenceRefreshHandler(undefined);
  });

  it('stops at the first failing step', async () => {
    runRapidkitStreaming
      .mockResolvedValueOnce({
        exitCode: 0,
        events: [],
        lastLifecycleEvent: lifecycle('run.completed', ['workspace', 'model']),
        result: {},
        stdout: '{}',
        stderr: '',
        failed: false,
      })
      .mockResolvedValueOnce({
        exitCode: 2,
        events: [],
        lastLifecycleEvent: lifecycle('run.failed', ['workspace', 'snapshot']),
        result: null,
        stdout: '',
        stderr: 'snapshot error',
        failed: true,
      });

    const results = await runWorkspaceIntelligenceSequenceWithProgress({
      title: 'Intelligence Chain — ws',
      cwd: '/tmp/ws',
      steps: [
        { command: ['workspace', 'model', '--json', '--write'], label: 'Model' },
        { command: ['workspace', 'snapshot', '--json'], label: 'Snapshot' },
        { command: ['workspace', 'diff', '--json'], label: 'Diff' },
      ],
    });

    expect(results).toHaveLength(2);
    expect(runRapidkitStreaming).toHaveBeenCalledTimes(2);
    expect(showErrorMessage).toHaveBeenCalledWith('Snapshot failed: gate blocked');
  });

  it('runs all steps and refreshes evidence once when every step succeeds', async () => {
    const refresh = vi.fn();
    setWorkspaceEvidenceRefreshHandler(refresh);
    runRapidkitStreaming.mockResolvedValue({
      exitCode: 0,
      events: [],
      lastLifecycleEvent: lifecycle('run.completed', ['workspace', 'model']),
      result: {},
      stdout: '{}',
      stderr: '',
      failed: false,
    });

    const results = await runWorkspaceIntelligenceSequenceWithProgress({
      title: 'Intelligence Chain — ws',
      cwd: '/tmp/ws',
      steps: [
        { command: ['workspace', 'model', '--json', '--write'], label: 'Model' },
        { command: ['workspace', 'snapshot', '--json'], label: 'Snapshot' },
      ],
    });

    expect(results).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
