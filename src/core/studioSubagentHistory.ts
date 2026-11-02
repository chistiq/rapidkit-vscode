import type * as vscode from 'vscode';
import type { StudioAgentEvent, StudioAgentPersistedSession } from './studioAgentEvents.js';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';
import { VSCodeStudioAgentSessionStore } from './studioAgentSessionStore.js';
import { StudioHostToolOutputStore } from './studioHostToolOutputStore.js';
import { redactLocalPathsForConsumer } from './consumerPathRedaction.js';

const visible = new Set([
  'tool.started',
  'tool.completed',
  'tool.failed',
  'tool.progress',
  'model.message',
  'session.completed',
  'session.failed',
  'session.cancelled',
]);
const transient = new Set(['idle', 'running', 'waiting-permission', 'verifying']);
function status(recorded: string, active: boolean): string {
  return !active && transient.has(recorded) ? 'interrupted' : recorded;
}
function events(snapshot: StudioAgentPersistedSession) {
  return snapshot.events.filter((event) => visible.has(event.type));
}
function publicEvent(event: StudioAgentEvent) {
  const detail = redactLocalPathsForConsumer(JSON.stringify(event.data));
  return {
    sequence: event.sequence,
    type: event.type,
    toolCallId: event.toolCallId,
    detail: detail.slice(0, 1_200),
    truncated: detail.length > 1_200,
  };
}

export function studioSubagentHistoryTool(
  context: vscode.ExtensionContext
): StudioAgentToolDefinition {
  return {
    name: 'inspect-subagent-history',
    title: 'Read delegated task activity',
    scopeIndependent: true,
    description:
      "List this chat's delegated tasks or page one child's recorded public activity and retained output references. Supply childSessionId and outputRef to recover that child's retained text/images without rerunning tools. Historical findings never verify the parent outcome. Inactive unfinished traces are interrupted, not running. No other parent chat can be selected.",
    activity: 'inspect',
    risk: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        childSessionId: { type: 'string', minLength: 1, maxLength: 200 },
        outputRef: { type: 'string', maxLength: 200 },
        requestId: { type: 'string', maxLength: 200 },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 40 },
      },
    },
    async execute(raw, owner) {
      const input = (raw ?? {}) as {
        childSessionId?: unknown;
        outputRef?: unknown;
        requestId?: unknown;
        offset?: unknown;
        limit?: unknown;
      };
      const offset = input.offset ?? 0,
        limit = input.limit ?? 20;
      if (
        !Number.isSafeInteger(offset) ||
        (offset as number) < 0 ||
        !Number.isSafeInteger(limit) ||
        (limit as number) < 1 ||
        (limit as number) > 40 ||
        ['childSessionId', 'outputRef', 'requestId'].some((key) => {
          const value = input[key as 'childSessionId'];
          return (
            value !== undefined &&
            (typeof value !== 'string' || !value.trim() || value.length > 200)
          );
        }) ||
        (input.outputRef !== undefined && input.childSessionId === undefined)
      ) {
        throw new Error('Provide an owned child identity and valid history pagination.');
      }
      const store = new VSCodeStudioAgentSessionStore(context);
      const instruction =
        'Subtask history only. Review current source, effects and applicable checks before accepting the parent outcome. Active traces can change during pagination.';
      if (typeof input.childSessionId !== 'string') {
        const children = (await store.listChildren(owner.sessionId))
          .filter((child) => !input.requestId || child.requestId === input.requestId)
          .map((child) => ({
            ...child,
            recordedStatus: child.status,
            status: status(child.status, child.active),
          }));
        const page = children.slice(offset as number, (offset as number) + (limit as number));
        return {
          ok: true,
          output: {
            children: page,
            total: children.length,
            nextOffset:
              (offset as number) + page.length < children.length
                ? (offset as number) + page.length
                : null,
            instruction,
          },
        };
      }
      const child = await store.loadChild(owner.sessionId, input.childSessionId);
      if (!child || (input.requestId && child.session.parent?.requestId !== input.requestId)) {
        return { ok: false, error: 'This child is unavailable in the owning chat/request.' };
      }
      const root = context.storageUri?.fsPath ?? context.globalStorageUri.fsPath;
      const outputs = new StudioHostToolOutputStore(root);
      if (typeof input.outputRef === 'string') {
        const result = await outputs.read(child.session.id, input.outputRef);
        const end = Math.min(result.text.length, (offset as number) + 12_000);
        if ((offset as number) > result.text.length) {
          throw new Error('Output offset exceeds retained text.');
        }
        return {
          ok: true,
          ...((offset as number) === 0 && result.images?.length ? { images: result.images } : {}),
          output: {
            outputRef: input.outputRef,
            imageCount: result.images?.length ?? 0,
            text: result.text.slice(offset as number, end),
            nextOffset: end < result.text.length ? end : null,
            totalChars: result.totalChars,
            retainedChars: result.text.length,
            completeOutputRetained: result.text.length === result.totalChars,
            instruction,
          },
        };
      }
      const all = events(child.session);
      const page: ReturnType<typeof publicEvent>[] = [];
      let chars = 0;
      for (const event of all.slice(offset as number, (offset as number) + (limit as number))) {
        const item = publicEvent(event);
        const length = JSON.stringify(item).length;
        if (chars + length > 12_000) {
          break;
        }
        page.push(item);
        chars += length;
      }
      return {
        ok: true,
        output: {
          childSessionId: child.session.id,
          parent: child.session.parent,
          status: status(child.session.status, child.active),
          recordedStatus: child.session.status,
          active: child.active,
          snapshotSequence: child.session.sequence,
          events: page,
          total: all.length,
          nextOffset:
            (offset as number) + page.length < all.length ? (offset as number) + page.length : null,
          outputs: await outputs.list(child.session.id),
          instruction,
        },
      };
    },
  };
}

export async function renderStudioSubagentHistory(
  context: vscode.ExtensionContext,
  target: {
    sessionId: string;
    requestId: string;
    toolCallId: string;
  }
): Promise<string> {
  if (Object.values(target).some((value) => !value || value.length > 200)) {
    throw new Error('Invalid subagent activity identity.');
  }
  const store = new VSCodeStudioAgentSessionStore(context);
  const children = (await store.listChildren(target.sessionId)).filter(
    (child) => child.requestId === target.requestId && child.toolCallId === target.toolCallId
  );
  const lines = [
    'Workspai · Delegated activity',
    'Recorded subtask evidence; parent acceptance remains separate.',
    '',
  ];
  for (const metadata of children) {
    const child = await store.loadChild(target.sessionId, metadata.childSessionId);
    if (!child) {
      continue;
    }
    lines.push(
      `${metadata.kind} · ${status(child.session.status, child.active)}`,
      metadata.objective,
      `Child: ${metadata.childSessionId}`,
      ''
    );
    const all = events(child.session);
    if (all.length > 100) {
      lines.push(`Showing the last 100 of ${all.length} public events.`);
    }
    for (const event of all.slice(-100)) {
      const view = publicEvent(event);
      lines.push(
        `${view.sequence} · ${view.type}`,
        view.detail + (view.truncated ? ' [truncated]' : ''),
        ''
      );
    }
  }
  if (!children.length) {
    lines.push(
      'No retained child activity is available for this request. The task may still be starting or its trace may have expired.'
    );
  }
  return redactLocalPathsForConsumer(lines.join('\n'));
}
