export type WorkspaceGraphWorkerHandle = {
  worker: Worker;
  dispose(): void;
};

export type WorkspaceGraphWorkerFactory = {
  fetchSource(uri: string): Promise<string>;
  createObjectUrl(source: string): string;
  revokeObjectUrl(uri: string): void;
  createWorker(uri: string): Worker;
};

const browserWorkspaceGraphWorkerFactory: WorkspaceGraphWorkerFactory = {
  fetchSource: async (uri) => {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Workspace Graph worker fetch failed (${response.status})`);
    }
    return response.text();
  },
  createObjectUrl: (source) => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })),
  revokeObjectUrl: (uri) => URL.revokeObjectURL(uri),
  createWorker: (uri) => new Worker(uri),
};

/**
 * VS Code Webviews cannot construct a Worker directly from a vscode-resource
 * URI. Fetch the extension-owned bundle and execute it from a CSP-approved,
 * short-lived blob URL instead.
 */
export async function createWorkspaceGraphWorker(
  resourceUri: string,
  factory: WorkspaceGraphWorkerFactory = browserWorkspaceGraphWorkerFactory
): Promise<WorkspaceGraphWorkerHandle> {
  const source = await factory.fetchSource(resourceUri);
  const objectUrl = factory.createObjectUrl(source);
  let worker: Worker;
  try {
    worker = factory.createWorker(objectUrl);
  } catch (error) {
    factory.revokeObjectUrl(objectUrl);
    throw error;
  }
  let disposed = false;
  return {
    worker,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      worker.terminate();
      factory.revokeObjectUrl(objectUrl);
    },
  };
}
