import type * as vscode from 'vscode';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';

/** Declaration stays importable without loading the VS Code runtime. */
export function studioSemanticSearchTool(
  context: vscode.ExtensionContext
): StudioAgentToolDefinition {
  return {
    name: 'search-semantic-code',
    title: 'Search the independent semantic code index',
    risk: 'read',
    activity: 'inspect',
    description:
      'Find current code by meaning through real embedding vectors. Requires explicit semanticSearch settings, an embedding model and local or current-API embedding endpoint. Builds a bounded incremental private vector cache, works without Workspai adoption, reports coverage and embedding usage separately from chat tokens. Clear deletes all provider indexes for this source, even while disabled. Disabled/unavailable providers never prevent ordinary code search. Source snippets are sent only to the explicitly enabled embedding route; raw source is not stored in the vector cache.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        operation: { type: 'string', enum: ['search', 'clear'], default: 'search' },
        query: { type: 'string', minLength: 1, maxLength: 500 },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
        maxNewChunks: { type: 'integer', minimum: 0, maximum: 128, default: 64 },
      },
    },
    async execute(raw, scope) {
      const request = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      if (
        Object.keys(request).some(
          (key) => !['operation', 'query', 'limit', 'maxNewChunks'].includes(key)
        ) ||
        !['search', 'clear'].includes(String(request.operation ?? 'search'))
      ) {
        throw new Error('Invalid semantic search operation.');
      }
      if (
        request.operation !== 'clear' &&
        (typeof request.query !== 'string' ||
          !request.query.trim() ||
          request.query.length > 500 ||
          (request.limit !== undefined &&
            (!Number.isInteger(request.limit) ||
              Number(request.limit) < 1 ||
              Number(request.limit) > 12)) ||
          (request.maxNewChunks !== undefined &&
            (!Number.isInteger(request.maxNewChunks) ||
              Number(request.maxNewChunks) < 0 ||
              Number(request.maxNewChunks) > 128)))
      ) {
        throw new Error('Supply a bounded semantic query and valid limit/indexing allowance.');
      }
      const { runStudioSemanticSearch } = await import('./studioSemanticRuntime.js');
      return runStudioSemanticSearch(context, request, scope);
    },
  };
}
