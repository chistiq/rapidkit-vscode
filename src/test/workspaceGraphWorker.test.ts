import { describe, expect, it, vi } from 'vitest';

import {
  createWorkspaceGraphWorker,
  type WorkspaceGraphWorkerFactory,
} from '../../webview-ui/src/lib/workspaceGraphWorker.js';

function factory(overrides: Partial<WorkspaceGraphWorkerFactory> = {}) {
  const worker = { terminate: vi.fn() } as unknown as Worker;
  const value: WorkspaceGraphWorkerFactory = {
    fetchSource: vi.fn(async () => 'self.onmessage = () => undefined;'),
    createObjectUrl: vi.fn(() => 'blob:workspai-graph-worker'),
    revokeObjectUrl: vi.fn(),
    createWorker: vi.fn(() => worker),
    ...overrides,
  };
  return { value, worker };
}

describe('Workspace Graph Webview worker loader', () => {
  it('loads an extension-owned resource through a disposable blob worker', async () => {
    const testFactory = factory();
    const handle = await createWorkspaceGraphWorker(
      'https://file+.vscode-resource.vscode-cdn.net/ext/dist/graphWorker.js',
      testFactory.value
    );

    expect(testFactory.value.fetchSource).toHaveBeenCalledWith(
      'https://file+.vscode-resource.vscode-cdn.net/ext/dist/graphWorker.js'
    );
    expect(testFactory.value.createWorker).toHaveBeenCalledWith('blob:workspai-graph-worker');
    handle.dispose();
    handle.dispose();
    expect(testFactory.worker.terminate).toHaveBeenCalledTimes(1);
    expect(testFactory.value.revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('revokes the temporary URL when Worker construction fails', async () => {
    const testFactory = factory({
      createWorker: vi.fn(() => {
        throw new Error('worker blocked');
      }),
    });

    await expect(createWorkspaceGraphWorker('worker.js', testFactory.value)).rejects.toThrow(
      'worker blocked'
    );
    expect(testFactory.value.revokeObjectUrl).toHaveBeenCalledWith('blob:workspai-graph-worker');
  });
});
