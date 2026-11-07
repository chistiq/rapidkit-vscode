import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ provider: vi.fn(), sources: vi.fn(), trusted: true }));
vi.mock('vscode', () => ({
  workspace: {
    get isTrusted() {
      return mock.trusted;
    },
  },
}));
vi.mock('../core/aiProviderService.js', () => ({
  configuredStudioEmbeddingProvider: mock.provider,
}));
vi.mock('../core/studioCodeContextSearch.js', () => ({ readStudioSemanticSources: mock.sources }));
import { runStudioSemanticSearch } from '../core/studioSemanticRuntime.js';
let root: string;
beforeEach(async () => {
  vi.clearAllMocks();
  mock.trusted = true;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-semantic-runtime-'));
  await fs.outputFile(path.join(root, 'project/main.ts'), 'export const value = 1;');
  mock.sources.mockResolvedValue({
    documents: [{ path: 'main.ts', text: 'export const value = 1;' }],
    coverage: {},
  });
  mock.provider.mockResolvedValue({
    identity: 'fixture',
    embed: async (texts: string[]) => ({ vectors: texts.map(() => [1, 0]) }),
  });
});
afterEach(async () => {
  await fs.remove(root);
});
const context = () => ({ storageUri: { fsPath: path.join(root, 'storage') } }) as never;
const scope = () => ({
  sessionId: 's',
  requestId: 'r',
  toolCallId: 't',
  workspacePath: path.join(root, 'project'),
  signal: new AbortController().signal,
});
describe('Semantic runtime boundary', () => {
  it('revalidates live source hashes and drops an embedding result made stale during the provider request', async () => {
    let changed = false;
    mock.provider.mockResolvedValue({
      identity: 'fixture',
      embed: async (texts: string[]) => {
        if (!changed) {
          await fs.writeFile(path.join(root, 'project/main.ts'), 'export const value = 2;');
          changed = true;
        }
        return { vectors: texts.map(() => [1, 0]) };
      },
    });
    const result = await runStudioSemanticSearch(context(), { query: 'value' }, scope());
    expect(result).toMatchObject({ ok: true, output: { snippets: [], staleResults: 1 } });
  });
  it('deletes every provider cache for this source even when embedding configuration is unavailable', async () => {
    await runStudioSemanticSearch(context(), { query: 'value' }, scope());
    mock.provider.mockClear().mockRejectedValue(new Error('disabled'));
    expect(await runStudioSemanticSearch(context(), { operation: 'clear' }, scope())).toMatchObject(
      { ok: true, output: { state: 'cleared' } }
    );
    expect(mock.provider).not.toHaveBeenCalled();
    expect(await fs.readdir(path.join(root, 'storage/assistant-semantic-index'))).toEqual([]);
  });
  it('drops source aliases redirected into sensitive canonical paths even with a matching source hash', async () => {
    const text = 'export const value = 1;';
    await fs.outputFile(path.join(root, 'project/.docker/config.json'), text);
    await fs.remove(path.join(root, 'project/main.ts'));
    await fs.symlink(
      path.join(root, 'project/.docker/config.json'),
      path.join(root, 'project/main.ts')
    );
    const result = await runStudioSemanticSearch(context(), { query: 'value' }, scope());
    expect(result).toMatchObject({ ok: true, output: { snippets: [], staleResults: 1 } });
  });
  it('does not invoke provider or source discovery in an untrusted workspace', async () => {
    mock.trusted = false;
    await expect(runStudioSemanticSearch(context(), { query: 'value' }, scope())).rejects.toThrow(
      'trusted'
    );
    expect(mock.provider).not.toHaveBeenCalled();
    expect(mock.sources).not.toHaveBeenCalled();
  });
});
