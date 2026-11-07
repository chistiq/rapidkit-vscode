import { inspectStudioWorkspaceInventory } from './studioWorkspaceInventory.js';
import { projectStudioGraphObservation } from './studioGraphObservation.js';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';
import type { StudioAgentWorkspaiToolHost } from './studioAgentWorkspaiTools.js';
import { waitForStudioLanguageProvider } from './studioLanguageProvider.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function compactProvider(provider: string, value: unknown) {
  const raw = record(value);
  if (provider === 'source') {
    return { observation: raw };
  }
  const output = record(raw.output);
  if (provider === 'graph' && output.result) {
    return {
      observation: {
        ok: raw.ok,
        error: raw.error,
        scope: output.scope,
        coverage: output.coverage,
        exitCode: output.exitCode,
        extensionProjection: output.extensionProjection,
        ...projectStudioGraphObservation(record(output.result), 3500),
      },
    };
  }
  if (provider === 'language' && Array.isArray(output.symbols)) {
    return {
      observation: {
        ok: raw.ok,
        error: raw.error,
        ...projectStudioGraphObservation({ symbols: output.symbols.slice(0, 8) }, 4500),
        truncated: output.truncated === true || output.symbols.length > 8,
        provenance: 'installed-language-provider',
      },
    };
  }
  return { observation: raw };
}

/** Keep tool declaration independent of the editor runtime. The source reader is
 * loaded on invocation; its static vscode import uses the extension-host loader. */
export function studioCodeContextTool(
  host: Pick<StudioAgentWorkspaiToolHost, 'graphSearch' | 'codeIntelligence'>
): StudioAgentToolDefinition {
  return {
    name: 'search-code-context',
    title: 'Find relevant code context',
    activity: 'inspect',
    risk: 'read',
    description:
      'Retrieve compact current source snippets ranked by code keywords, plus optional existing Workspai Graph and installed language-symbol evidence in parallel. Works without adoption. Returns provenance, source hashes, ranges, coverage and provider failures. This is hybrid lexical/Graph/language retrieval, not an embedding index. Use concrete keywords, then inspect exact files before changes.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 300 },
        glob: { type: 'string', maxLength: 500 },
        symbol: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Optional precise symbol query for installed language providers.',
        },
        includeGraph: { type: 'boolean', default: true },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
      },
    },
    async execute(raw, context) {
      const input = (raw ?? {}) as {
        query?: unknown;
        glob?: unknown;
        symbol?: unknown;
        includeGraph?: unknown;
        limit?: unknown;
      };
      if (
        typeof input.query !== 'string' ||
        input.query.trim().length < 2 ||
        input.query.length > 300 ||
        /[\0\r\n]/.test(input.query) ||
        (input.glob !== undefined && (typeof input.glob !== 'string' || input.glob.length > 500)) ||
        (input.symbol !== undefined &&
          (typeof input.symbol !== 'string' ||
            !input.symbol.trim() ||
            input.symbol.length > 200)) ||
        (input.includeGraph !== undefined && typeof input.includeGraph !== 'boolean') ||
        (input.limit !== undefined &&
          (!Number.isSafeInteger(input.limit) ||
            (input.limit as number) < 1 ||
            (input.limit as number) > 12))
      ) {
        throw new Error(
          'Code context requires a bounded query, optional source glob/symbol and limit from 1 to 12.'
        );
      }
      const controller = new AbortController();
      const abort = () => controller.abort();
      context.signal.addEventListener('abort', abort, { once: true });
      if (context.signal.aborted) {
        abort();
      }
      const timer = setTimeout(abort, 20_000);
      const scope = {
        workspacePath: context.workspacePath,
        projectPath: context.projectPath,
        signal: controller.signal,
      };
      const providers: Array<{ name: string; run: () => Promise<unknown> }> = [
        {
          name: 'source',
          run: async () => {
            const { searchStudioCodeContext } = await import('./studioCodeContextSearch.js');
            return searchStudioCodeContext({
              query: input.query as string,
              root: context.projectPath ?? context.workspacePath,
              glob: input.glob as string | undefined,
              limit: input.limit as number | undefined,
              signal: controller.signal,
            });
          },
        },
      ];
      if (input.symbol && host.codeIntelligence) {
        providers.push({
          name: 'language',
          run: () =>
            host.codeIntelligence!({
              ...scope,
              operation: 'workspace-symbols',
              query: input.symbol as string,
            }),
        });
      }
      if (input.includeGraph !== false && host.graphSearch) {
        providers.push({
          name: 'graph',
          run: async () => {
            const inventory = await inspectStudioWorkspaceInventory(
              context.projectPath ?? context.workspacePath
            );
            if (inventory.management !== 'workspai') {
              return {
                available: false,
                reason:
                  'No verified Workspai ownership; ordinary source retrieval remains available. No adoption or intelligence build was requested.',
              };
            }
            if (controller.signal.aborted) {
              throw new Error('Graph context retrieval was cancelled.');
            }
            return host.graphSearch!({
              ...scope,
              query: input.query as string,
              operation: 'search',
              limit: 6,
            });
          },
        });
      }
      try {
        const results = await Promise.allSettled(
          providers.map((provider) =>
            waitForStudioLanguageProvider(provider.run, controller.signal, 20_000)
          )
        );
        if (context.signal.aborted) {
          return { ok: false, changed: false, error: 'Code context retrieval was cancelled.' };
        }
        const evidence = results.map((result, index) => ({
          provider: providers[index].name,
          ...(result.status === 'fulfilled'
            ? {
                status:
                  record(result.value).ok === false || record(result.value).available === false
                    ? 'unavailable'
                    : 'returned',
                ...compactProvider(providers[index].name, result.value),
              }
            : {
                status: 'unavailable',
                error:
                  result.reason instanceof Error ? result.reason.message : String(result.reason),
              }),
        }));
        return {
          ok: evidence.some((entry) => entry.status === 'returned'),
          changed: false,
          output: {
            retrieval: 'hybrid-lexical-graph-language',
            evidence,
            instruction:
              'Provider failures do not disable other tools. Empty or omitted evidence does not prove absence; use a narrower source query or another appropriate tool.',
          },
        };
      } finally {
        clearTimeout(timer);
        context.signal.removeEventListener('abort', abort);
      }
    },
  };
}
