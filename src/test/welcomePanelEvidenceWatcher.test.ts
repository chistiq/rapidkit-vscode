import { beforeEach, describe, expect, it, vi } from 'vitest';

const { watcherRecords } = vi.hoisted(() => ({
  watcherRecords: [] as Array<{
    pattern: unknown;
    create?: (uri: { fsPath: string }) => void;
    change?: (uri: { fsPath: string }) => void;
    delete?: (uri: { fsPath: string }) => void;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  RelativePattern: class RelativePattern {
    constructor(
      public readonly base: { fsPath: string },
      public readonly pattern: string
    ) {}
  },
  workspace: {
    createFileSystemWatcher: (pattern: unknown) => {
      const record = { pattern, dispose: vi.fn() } as (typeof watcherRecords)[number];
      watcherRecords.push(record);
      return {
        onDidCreate: (callback: (uri: { fsPath: string }) => void) => {
          record.create = callback;
          return { dispose: vi.fn() };
        },
        onDidChange: (callback: (uri: { fsPath: string }) => void) => {
          record.change = callback;
          return { dispose: vi.fn() };
        },
        onDidDelete: (callback: (uri: { fsPath: string }) => void) => {
          record.delete = callback;
          return { dispose: vi.fn() };
        },
        dispose: record.dispose,
      };
    },
  },
}));

import { registerWelcomePanelDoctorEvidenceWatcher } from '../ui/panels/welcomePanelDoctorEvidenceWatcher';

describe('welcomePanelEvidenceWatcher', () => {
  beforeEach(() => {
    watcherRecords.splice(0);
  });

  it('watches report and foundation artifacts for open and managed workspaces', () => {
    const scheduled: Array<string | undefined> = [];
    const disposables: Array<{ dispose: () => void }> = [];
    const controller = registerWelcomePanelDoctorEvidenceWatcher(disposables, (filePath) =>
      scheduled.push(filePath)
    );

    expect(watcherRecords).toHaveLength(2);
    controller.watchWorkspace('/tmp/managed-workspace');
    expect(watcherRecords).toHaveLength(4);

    watcherRecords[2].change?.({
      fsPath: '/tmp/managed-workspace/.workspai/reports/workspace-explain-last-run.json',
    });
    watcherRecords[3].delete?.({
      fsPath: '/tmp/managed-workspace/.workspai/workspace.contract.json',
    });

    expect(scheduled).toEqual([
      '/tmp/managed-workspace/.workspai/reports/workspace-explain-last-run.json',
      '/tmp/managed-workspace/.workspai/workspace.contract.json',
    ]);

    controller.watchWorkspace('/tmp/managed-workspace');
    expect(watcherRecords).toHaveLength(4);
    controller.watchWorkspace('/tmp/another-workspace');
    expect(watcherRecords).toHaveLength(6);
    expect(watcherRecords[2].dispose).toHaveBeenCalledTimes(1);
    expect(watcherRecords[3].dispose).toHaveBeenCalledTimes(1);

    controller.dispose();
    expect(watcherRecords[0].dispose).toHaveBeenCalledTimes(1);
    expect(watcherRecords[1].dispose).toHaveBeenCalledTimes(1);
    expect(watcherRecords[4].dispose).toHaveBeenCalledTimes(1);
    expect(watcherRecords[5].dispose).toHaveBeenCalledTimes(1);
  });
});
