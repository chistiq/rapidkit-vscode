import type * as vscode from 'vscode';
import { VSCodeStudioAgentSessionStore } from './studioAgentSessionStore.js';
import { studioSessionRequestId } from './studioRequestHistory.js';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';

/** Discover only this chat's historical evidence, never another chat or current verification. */
export function studioSessionHistoryTool(
  context: vscode.ExtensionContext
): StudioAgentToolDefinition {
  return {
    name: 'inspect-assistant-history',
    title: 'Read previous request evidence',
    description:
      'List saved requests in this chat or page a specific request by requestId. Recover prior findings, command outcomes and workspace destination after reload. This is historical evidence, not proof of current file state or fresh verification. No other chat can be selected.',
    activity: 'inspect',
    risk: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', maxLength: 200 },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 40 },
      },
    },
    async execute(raw, owner) {
      const input = (raw ?? {}) as { requestId?: unknown; offset?: unknown; limit?: unknown };
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 20;
      if (
        !Number.isSafeInteger(offset) ||
        (offset as number) < 0 ||
        !Number.isSafeInteger(limit) ||
        (limit as number) < 1 ||
        (limit as number) > 40 ||
        (input.requestId !== undefined &&
          (typeof input.requestId !== 'string' ||
            !input.requestId.trim() ||
            input.requestId.length > 200))
      ) {
        throw new Error('Provide a request identity and valid history pagination.');
      }
      const store = new VSCodeStudioAgentSessionStore(context);
      const page = <T>(entries: T[]) => {
        const end = Math.min(entries.length, (offset as number) + (limit as number));
        return {
          entries: entries.slice(offset as number, end),
          total: entries.length,
          nextOffset: end < entries.length ? end : null,
        };
      };
      const instruction =
        'Historical evidence only. Inspect current source and run applicable checks before using an old result as current truth.';
      if (typeof input.requestId !== 'string') {
        return {
          ok: true,
          output: { ...page(await store.listRequests(owner.sessionId)), instruction },
        };
      }
      const saved = await store.loadRequest(owner.sessionId, input.requestId);
      if (!saved) {
        return { ok: false, error: 'This request is not available in the owning chat history.' };
      }
      const events = saved.events.filter(
        (event) => event.requestId === studioSessionRequestId(saved)
      );
      return {
        ok: true,
        output: {
          requestId: input.requestId,
          status: saved.status,
          updatedAt: saved.updatedAt,
          executionTarget: saved.executionTarget,
          ...page(events),
          instruction,
        },
      };
    },
  };
}
