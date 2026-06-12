import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateFileSystemWatcher,
  watcherRegistrations,
  mockExecuteCommand,
  mockLoadWorkspaces,
  mockClearCache,
  mockGetVersionInfo,
} = vi.hoisted(() => ({
  mockCreateFileSystemWatcher: vi.fn(),
  watcherRegistrations: [] as Array<{
    onDidCreate?: () => void;
    onDidChange?: () => void;
    onDidDelete?: () => void;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  mockExecuteCommand: vi.fn(),
  mockLoadWorkspaces: vi.fn(),
  mockClearCache: vi.fn(),
  mockGetVersionInfo: vi.fn(),
}));

vi.mock('vscode', () => {
  class EventEmitter<T = unknown> {
    readonly event = vi.fn();
    fire = vi.fn((_value?: T) => undefined);
    dispose = vi.fn(() => undefined);
  }

  class TreeItem {
    label?: string;
    collapsibleState?: number;

    constructor(label?: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    id: string;

    constructor(id: string) {
      this.id = id;
    }
  }

  const createWatcher = () => {
    const registration = {
      onDidCreate: undefined as (() => void) | undefined,
      onDidChange: undefined as (() => void) | undefined,
      onDidDelete: undefined as (() => void) | undefined,
      dispose: vi.fn(),
    };

    watcherRegistrations.push(registration);

    return {
      onDidCreate: (cb: () => void) => {
        registration.onDidCreate = cb;
      },
      onDidChange: (cb: () => void) => {
        registration.onDidChange = cb;
      },
      onDidDelete: (cb: () => void) => {
        registration.onDidDelete = cb;
      },
      dispose: registration.dispose,
    };
  };

  mockCreateFileSystemWatcher.mockImplementation(createWatcher);

  return {
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
      })),
      showWarningMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showInformationMessage: vi.fn(),
    },
    workspace: {
      createFileSystemWatcher: mockCreateFileSystemWatcher,
    },
    commands: {
      executeCommand: mockExecuteCommand,
    },
    EventEmitter,
    TreeItem,
    ThemeIcon,
    CodeActionKind: {
      QuickFix: 'quickfix',
      Refactor: 'refactor',
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
  };
});

vi.mock('../core/workspaceManager', () => ({
  WorkspaceManager: {
    getInstance: () => ({
      loadWorkspaces: mockLoadWorkspaces,
      addWorkspace: vi.fn(),
      removeWorkspace: vi.fn(),
    }),
  },
}));

vi.mock('../core/coreVersionService', () => ({
  CoreVersionService: {
    getInstance: () => ({
      clearCache: mockClearCache,
      getVersionInfo: mockGetVersionInfo,
    }),
  },
}));

import { WorkspaceExplorerProvider } from '../ui/treeviews/workspaceExplorer';
import { DoctorEvidenceProvider } from '../ui/treeviews/doctorEvidenceProvider';

describe('watcher debounce behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    watcherRegistrations.length = 0;

    mockLoadWorkspaces.mockResolvedValue([]);
    mockGetVersionInfo.mockResolvedValue({
      coreVersion: null,
      npmVersion: null,
      hasUpdate: false,
    });
  });

  it('debounces workspace explorer watcher refresh events', async () => {
    const provider = new WorkspaceExplorerProvider();
    const refreshSpy = vi.spyOn(provider, 'refresh').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();
    watcher.onDidChange?.();
    watcher.onDidDelete?.();

    expect(refreshSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(249);
    expect(refreshSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(refreshSpy).toHaveBeenCalledTimes(1);

    provider.dispose();
  });

  it('cancels pending workspace explorer refresh timer on dispose', async () => {
    const provider = new WorkspaceExplorerProvider();
    const refreshSpy = vi.spyOn(provider, 'refresh').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();

    provider.dispose();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(refreshSpy).toHaveBeenCalledTimes(0);
  });

  it('debounces doctor evidence reload events', async () => {
    const provider = new DoctorEvidenceProvider(() => '/tmp/workspace');
    const reloadSpy = vi.spyOn(provider as any, 'reload').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();
    watcher.onDidChange?.();

    expect(reloadSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(199);
    expect(reloadSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(reloadSpy).toHaveBeenCalledTimes(1);

    provider.dispose();
  });

  it('cancels pending doctor evidence timer on dispose', async () => {
    const provider = new DoctorEvidenceProvider(() => '/tmp/workspace');
    const reloadSpy = vi.spyOn(provider as any, 'reload').mockResolvedValue(undefined);

    const watcher = watcherRegistrations[0];
    watcher.onDidCreate?.();

    provider.dispose();

    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(reloadSpy).toHaveBeenCalledTimes(0);
  });
});
