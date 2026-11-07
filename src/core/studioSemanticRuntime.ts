import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import * as vscode from 'vscode';
import { configuredStudioEmbeddingProvider } from './aiProviderService.js';
import { readStudioSemanticSources } from './studioCodeContextSearch.js';
import { readStudioWorkingBytes } from './studioNativeDocuments.js';
import { StudioSemanticIndex } from './studioSemanticIndex.js';
import { isStudioSemanticSourcePath } from './studioSemanticSourcePolicy.js';
import { studioSourceIgnore } from './studioSourceIgnore.js';
import type { StudioAgentToolContext } from './studioAgentToolRegistry.js';

export async function runStudioSemanticSearch(
  context: vscode.ExtensionContext,
  request: Record<string, unknown>,
  scope: StudioAgentToolContext
) {
  if (!vscode.workspace.isTrusted) {
    throw new Error('Semantic source retrieval requires a trusted workspace.');
  }
  const root = await fs.realpath(scope.projectPath ?? scope.workspacePath);
  const storage = context.storageUri?.fsPath ?? context.globalStorageUri.fsPath;
  if (scope.signal.aborted) {
    return { ok: false, error: 'Semantic retrieval was cancelled.' };
  }
  if (request.operation === 'clear') {
    await new StudioSemanticIndex(storage, {
      identity: 'clear-source',
      embed: async () => {
        throw new Error('Clear never requests embeddings.');
      },
    }).clearSource(root);
    return {
      ok: true,
      output: {
        state: 'cleared',
        instruction:
          'All provider vector indexes for this source were deleted. Source files were not changed.',
      },
    };
  }
  const provider = await configuredStudioEmbeddingProvider(context);
  const index = new StudioSemanticIndex(storage, provider);
  const source = await readStudioSemanticSources(root, scope.signal);
  const result = await index.search({
    root,
    documents: source.documents,
    query: request.query as string,
    signal: scope.signal,
    limit: request.limit as number | undefined,
    maxNewChunks: request.maxNewChunks as number | undefined,
  });
  const snippets: typeof result.snippets = [];
  const ignored = await studioSourceIgnore(root);
  let staleResults = 0;
  for (const snippet of result.snippets) {
    if (scope.signal.aborted) {
      return { ok: false, error: 'Semantic retrieval was cancelled.' };
    }
    const target = path.join(root, snippet.path);
    const canonical = await fs.realpath(target).catch(() => undefined);
    const relative = canonical ? path.relative(root, canonical) : '..';
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      !isStudioSemanticSourcePath(relative.replace(/\\/g, '/')) ||
      (await ignored(relative.replace(/\\/g, '/')))
    ) {
      staleResults++;
      continue;
    }
    const bytes = await readStudioWorkingBytes(canonical!).catch(() => undefined);
    if (!bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== snippet.sha256) {
      staleResults++;
      continue;
    }
    snippets.push(snippet);
  }
  return {
    ok: true,
    output: {
      ...result,
      snippets,
      sourceCoverage: source.coverage,
      staleResults,
      instruction:
        result.instruction +
        ' Returned snippets were rechecked against live source hashes after embedding. No request-wide atomic source snapshot is implied.',
    },
  };
}
