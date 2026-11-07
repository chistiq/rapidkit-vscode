import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  tools: new Map<string, any>(),
  inventory: vi.fn(),
  graph: vi.fn(),
  trusted: true,
  folders: [] as any[],
  dispose: vi.fn(),
}));
vi.mock('vscode', () => ({
  lm: {
    registerTool: (name: string, tool: unknown) => {
      mock.tools.set(name, tool);
      return { dispose: () => mock.dispose(name) };
    },
  },
  workspace: {
    get isTrusted() {
      return mock.trusted;
    },
    get workspaceFolders() {
      return mock.folders;
    },
  },
  LanguageModelTextPart: class {
    constructor(readonly value: string) {}
  },
  LanguageModelToolResult: class {
    constructor(readonly content: unknown[]) {}
  },
}));
vi.mock('../core/studioWorkspaceInventory.js', () => ({
  inspectStudioWorkspaceInventory: mock.inventory,
}));
vi.mock('../core/studioWorkspaceIntelligenceReads.js', () => ({
  studioWorkspaceIntelligenceReaders: () => ({ graphSearch: mock.graph }),
}));
import { registerStudioPublicIntelligenceTools } from '../core/studioPublicIntelligenceTools.js';
import manifest from '../../package.json';

const folder = (name: string, file: string) => ({
  name,
  uri: { scheme: 'file', fsPath: file, toString: () => `file:${file}` },
});
const token = () => ({
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose() {} }),
});
const result = async (name: string, input: unknown, cancellation = token()) =>
  JSON.parse((await mock.tools.get(name).invoke({ input }, cancellation)).content[0].value);
beforeEach(() => {
  vi.clearAllMocks();
  mock.tools.clear();
  mock.trusted = true;
  mock.folders = [folder('workspace', '/open/workspace')];
  mock.inventory.mockResolvedValue({
    management: 'none',
    availability: { status: 'available' },
    projects: [],
    workspaiSignature: { status: 'absent' },
  });
  mock.graph.mockResolvedValue({
    ok: true,
    output: {
      scope: 'project:api',
      coverage: { graphSourceHash: 'proof-hash', truncated: false },
      result: { matches: [{ path: 'src/api.ts', proof: 'locator' }] },
    },
  });
});

describe('Workspai public VS Code intelligence tools', () => {
  it('registers exactly the contributed read-only tool surface and disposes its registrations', async () => {
    const registration = registerStudioPublicIntelligenceTools();
    expect([...mock.tools.keys()]).toEqual(
      manifest.contributes.languageModelTools.map((tool) => tool.name)
    );
    expect(
      manifest.contributes.languageModelTools.every((tool) => tool.tags.includes('read'))
    ).toBe(true);
    const inventory = await result('workspai_workspace_inventory', {});
    expect(inventory).toMatchObject({
      ok: true,
      source: 'workspai_workspace_inventory',
      selectedFolder: 'workspace',
      result: { management: 'none', projects: [] },
    });
    expect(mock.inventory).toHaveBeenCalledWith('/open/workspace');
    expect(mock.graph).not.toHaveBeenCalled();
    registration.dispose();
    expect(mock.dispose).toHaveBeenCalledTimes(2);
  });

  it('requires an unambiguous open folder instead of guessing from the active editor or accessing arbitrary paths', async () => {
    registerStudioPublicIntelligenceTools();
    mock.folders.push(folder('other', '/open/other'));
    expect(await result('workspai_workspace_inventory', {})).toMatchObject({
      ok: false,
      error: expect.stringContaining('Several folders'),
    });
    expect(
      await result('workspai_workspace_inventory', { folder: '/private/other' })
    ).toMatchObject({ ok: false, error: expect.stringContaining('open filesystem') });
    expect(mock.inventory).not.toHaveBeenCalled();
    expect(await result('workspai_workspace_inventory', { folder: 'other' })).toMatchObject({
      ok: true,
      selectedFolder: 'other',
    });
    expect(mock.inventory).toHaveBeenCalledWith('/open/other');
  });

  it('preserves graph scope and CLI freshness while projecting large proof bodies', async () => {
    registerStudioPublicIntelligenceTools();
    mock.graph.mockResolvedValue({
      ok: true,
      output: {
        scope: 'project:api',
        coverage: { graphSourceHash: 'proof-hash', truncated: false },
        result: {
          matches: Array.from({ length: 80 }, (_, i) => ({ id: i, proof: 'x'.repeat(500) })),
        },
      },
    });
    const output = await result('workspai_graph_search', {
      query: 'authentication',
      project: 'api',
      limit: 12,
    });
    expect(output).toMatchObject({
      ok: true,
      scope: 'project:api',
      coverage: { graphSourceHash: 'proof-hash', truncated: false },
      projection: { applied: true, omitted: { matches: expect.any(Number) } },
    });
    expect(JSON.stringify(output).length).toBeLessThan(16_000);
    expect(mock.graph).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'authentication',
        project: 'api',
        limit: 12,
        workspacePath: '/open/workspace',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('does not dispatch a read without trust, with mutation arguments, or after cancellation', async () => {
    registerStudioPublicIntelligenceTools();
    mock.trusted = false;
    expect(await result('workspai_workspace_inventory', {})).toMatchObject({ ok: false });
    mock.trusted = true;
    expect(
      await result('workspai_graph_search', { query: 'auth', command: 'adopt .' })
    ).toMatchObject({ ok: false });
    expect(
      await result(
        'workspai_workspace_inventory',
        {},
        { ...token(), isCancellationRequested: true }
      )
    ).toMatchObject({ ok: false, error: expect.stringContaining('cancelled') });
    expect(mock.inventory).not.toHaveBeenCalled();
    expect(mock.graph).not.toHaveBeenCalled();
  });

  it('does not publish a late result after the open-folder identity changes', async () => {
    registerStudioPublicIntelligenceTools();
    mock.inventory.mockImplementationOnce(async () => {
      mock.folders = [folder('different', '/open/different')];
      return { management: 'workspai', availability: { status: 'available' } };
    });
    expect(await result('workspai_workspace_inventory', {})).toMatchObject({
      ok: false,
      error: expect.stringContaining('scope changed'),
    });
  });

  it('keeps Stop responsive when a CLI adapter ignores cancellation', async () => {
    registerStudioPublicIntelligenceTools();
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    mock.graph.mockImplementationOnce(() => {
      began();
      return new Promise<never>(() => {});
    });
    let cancel!: () => void;
    const cancellation = {
      isCancellationRequested: false,
      onCancellationRequested: (listener: () => void) => {
        cancel = listener;
        return { dispose() {} };
      },
    };
    const pending = result('workspai_graph_search', { query: 'auth' }, cancellation);
    await started;
    cancel();
    expect(await pending).toMatchObject({ ok: false, error: expect.stringContaining('cancelled') });
  });
});
