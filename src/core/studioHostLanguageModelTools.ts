import { StudioHostToolOutputStore } from './studioHostToolOutputStore.js';
import { assertStudioSessionRetained, isStudioSessionDeleted } from './studioSessionDeletion.js';
import { randomUUID } from 'node:crypto';
import { AI_IMAGE_MIME_TYPES, collectToolImages, type AIImageContent } from './aiImageContent.js';
import * as vscode from 'vscode';

import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';

export type StudioHostLanguageModelToolInfo = {
  name: string;
  description: string;
  tags: string[];
  inputSchema?: Record<string, unknown>;
  readLike: boolean;
};

const READ_LIKE_TAGS = new Set(['read', 'readonly', 'read-only', 'search', 'fetch']);

export function isReadLikeHostLanguageModelTool(tags: readonly string[]): boolean {
  const normalized = tags.map((tag) => tag.trim().toLowerCase());
  const effects = new Set([
    'write',
    'edit',
    'delete',
    'create',
    'update',
    'execute',
    'terminal',
    'mutation',
  ]);
  return (
    normalized.some((tag) => READ_LIKE_TAGS.has(tag)) && !normalized.some((tag) => effects.has(tag))
  );
}

export function listStudioHostLanguageModelTools(): StudioHostLanguageModelToolInfo[] {
  return [...vscode.lm.tools]
    .filter((tool) => typeof tool.name === 'string' && tool.name.trim().length > 0)
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      tags: [...tool.tags],
      ...(tool.inputSchema && typeof tool.inputSchema === 'object'
        ? { inputSchema: tool.inputSchema as Record<string, unknown> }
        : {}),
      readLike: isReadLikeHostLanguageModelTool(tool.tags),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function textFromHostToolResult(result: vscode.LanguageModelToolResult): string {
  const parts = result.content
    .map((part) => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return part.value;
      }
      const candidate = part as { value?: unknown };
      return typeof candidate.value === 'string' ? candidate.value : '';
    })
    .filter((part) => part.trim().length > 0);
  return parts.join('\n\n');
}

export async function invokeStudioHostLanguageModelTool(input: {
  name: string;
  arguments?: Record<string, unknown>;
  signal?: AbortSignal;
  token?: vscode.CancellationToken;
  toolInvocationToken?: vscode.ChatParticipantToolToken;
  retainOutput?: (
    text: string,
    images?: AIImageContent[]
  ) => Promise<{
    outputRef: string;
    retainedChars: number;
    durable?: boolean;
    retentionError?: string;
  }>;
}): Promise<StudioAgentToolResult> {
  const name = input.name.trim();
  const catalog = listStudioHostLanguageModelTools();
  const tool = catalog.find((entry) => entry.name === name);
  if (!tool) {
    return {
      ok: false,
      error: `Host tool ${name} is not registered in this VS Code window.`,
    };
  }
  if (input.signal?.aborted || input.token?.isCancellationRequested) {
    return { ok: false, error: 'Host tool invocation was cancelled before execution.' };
  }
  const tokenSource = new vscode.CancellationTokenSource();
  const onAbort = () => tokenSource.cancel();
  input.signal?.addEventListener('abort', onAbort, { once: true });
  const subscription = input.token?.onCancellationRequested(() => tokenSource.cancel());
  try {
    const result = await vscode.lm.invokeTool(
      name,
      { input: input.arguments ?? {}, toolInvocationToken: input.toolInvocationToken },
      tokenSource.token
    );
    if (tokenSource.token.isCancellationRequested) {
      return {
        ok: false,
        error: 'Host tool invocation was cancelled. Its effects may need review.',
      };
    }
    const contentParts = result.content.map((part) => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return { kind: 'text', supported: true };
      }
      const mime = (part as { mimeType?: unknown }).mimeType;
      const mimeType =
        typeof mime === 'string' && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime)
          ? mime.slice(0, 120)
          : undefined;
      return {
        kind: mimeType?.startsWith('image/') ? 'image' : mimeType ? 'data' : 'unknown',
        supported: Boolean(mimeType && AI_IMAGE_MIME_TYPES.has(mimeType)),
        ...(mimeType ? { mimeType } : {}),
      };
    });
    const text = textFromHostToolResult(result);
    let images: AIImageContent[] = [];
    let imageError: string | undefined;
    try {
      images = collectToolImages(result.content);
    } catch (error) {
      // Execution already succeeded. An oversized observation must not invite replaying its effects.
      imageError = error instanceof Error ? error.message : String(error);
    }
    let retained: Awaited<ReturnType<NonNullable<typeof input.retainOutput>>> | undefined;
    let retentionError: string | undefined;
    try {
      retained =
        text.length > 24_000 || images.length
          ? await input.retainOutput?.(text, images)
          : undefined;
    } catch (error) {
      retentionError = String(error);
    }
    return {
      ok: true,
      ...(images.length ? { images } : {}),
      output: {
        schemaVersion: 'workspai.studio-host-tool-result.v1',
        name,
        readLike: tool.readLike,
        tags: tool.tags,
        contentParts,
        text: text.slice(0, 24_000),
        totalChars: text.length,
        truncated: text.length > 24_000,
        imageCount: images.length,
        ...(imageError ? { imageError } : {}),
        ...(retentionError ? { retentionError } : {}),
        ...(retained
          ? {
              ...retained,
              nextOffset: text.length > 24_000 ? 24_000 : null,
              completeOutputRetained: retained.retainedChars === text.length,
              instruction:
                'Read remaining text pages or recover images with read-host-tool-output and outputRef (images are returned at offset 0). Do not repeat a tool with effects merely to retrieve its output.',
            }
          : {}),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    input.signal?.removeEventListener('abort', onAbort);
    subscription?.dispose();
    tokenSource.dispose();
  }
}

export function studioHostLanguageModelToolAdapters(
  token?: vscode.CancellationToken,
  toolInvocationToken?: vscode.ChatParticipantToolToken,
  storage?: { root: string }
): {
  listRetainedHostToolOutputs(input: { sessionId?: string }): Promise<StudioAgentToolResult>;
  readHostToolOutput(input: {
    outputRef: string;
    sessionId?: string;
    offset?: number;
    limit?: number;
  }): Promise<StudioAgentToolResult>;
  listHostTools(): StudioAgentToolResult;
  invokeHostTool(input: {
    name: string;
    sessionId?: string;
    arguments?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<StudioAgentToolResult>;
} {
  // Scoped to this host adapter. Bounded memory; references cannot expose another session's output.
  const outputs = new Map<
    string,
    {
      text: string;
      totalChars: number;
      owner?: string;
      images?: AIImageContent[];
      createdAt: number;
    }
  >();
  const durable = storage ? new StudioHostToolOutputStore(storage.root) : undefined;
  const retainOutput = async (text: string, owner?: string, images?: AIImageContent[]) => {
    if (storage && owner) {
      await assertStudioSessionRetained(storage.root, owner);
    }
    const outputRef = `host-output-${randomUUID()}`;
    const retained = text.slice(0, 2_000_000);
    outputs.set(outputRef, {
      text: retained,
      totalChars: text.length,
      owner,
      images,
      createdAt: Date.now(),
    });
    while (
      outputs.size > 8 ||
      [...outputs.values()].reduce(
        (sum, entry) =>
          sum +
          entry.text.length +
          (entry.images?.reduce((bytes, image) => bytes + image.base64.length, 0) ?? 0),
        0
      ) > 16_000_000
    ) {
      outputs.delete(outputs.keys().next().value!);
    }
    if (durable && owner) {
      try {
        await durable.save(owner, outputRef, retained, text.length, images);
        return { outputRef, retainedChars: retained.length, durable: true };
      } catch (error) {
        // The tool already ran. Storage failure must never turn a successful effect into a retry.
        return {
          outputRef,
          retainedChars: retained.length,
          durable: false,
          retentionError: `Output remains in memory only: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    return { outputRef, retainedChars: retained.length, durable: false };
  };
  return {
    async listRetainedHostToolOutputs(input) {
      if (
        storage &&
        input.sessionId &&
        (await isStudioSessionDeleted(storage.root, input.sessionId))
      ) {
        for (const [key, value] of outputs) {
          if (value.owner === input.sessionId) {
            outputs.delete(key);
          }
        }
        return { ok: true, output: { outputs: [] } };
      }
      const retained = new Map<
        string,
        { outputRef: string; retainedChars: number; totalChars: number; imageCount?: number }
      >();
      let retentionError: string | undefined;
      if (durable && input.sessionId) {
        try {
          for (const entry of await durable.list(input.sessionId)) {
            retained.set(entry.outputRef, entry);
          }
        } catch (error) {
          retentionError = `Retained output listing is unavailable: ${String(error)}`;
        }
      }
      for (const [outputRef, entry] of outputs) {
        if (Date.now() - entry.createdAt > 7 * 24 * 60 * 60 * 1000) {
          outputs.delete(outputRef);
          continue;
        }
        if (entry.owner === input.sessionId) {
          retained.set(outputRef, {
            outputRef,
            retainedChars: entry.text.length,
            totalChars: entry.totalChars,
            ...(entry.images?.length ? { imageCount: entry.images.length } : {}),
          });
        }
      }
      if (retentionError && !retained.size) {
        return { ok: false, error: retentionError };
      }
      return {
        ok: true,
        output: {
          outputs: [...retained.values()],
          ...(retentionError ? { retentionError } : {}),
          instruction:
            'Read these results with read-host-tool-output. Do not repeat an operation with effects to retrieve its result.',
        },
      };
    },
    async readHostToolOutput(input) {
      if (
        storage &&
        input.sessionId &&
        (await isStudioSessionDeleted(storage.root, input.sessionId))
      ) {
        outputs.delete(input.outputRef);
        return { ok: false, error: 'This chat was deleted; its retained output is unavailable.' };
      }
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 16_000;
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 24_000
      ) {
        return {
          ok: false,
          error: 'Invalid host output pagination; limit must be between 1 and 24000.',
        };
      }
      let entry = outputs.get(input.outputRef);
      if (
        entry &&
        (entry.owner !== input.sessionId || Date.now() - entry.createdAt > 7 * 24 * 60 * 60 * 1000)
      ) {
        entry = undefined;
      }
      if (!entry && durable && input.sessionId) {
        entry = await durable
          .read(input.sessionId, input.outputRef)
          .then((result) => ({ ...result, owner: input.sessionId, createdAt: Date.now() }))
          .catch(() => undefined);
      }
      if (!entry) {
        return {
          ok: false,
          error:
            'This output reference is unavailable in the current host session. Inspect durable evidence before repeating any operation with effects.',
        };
      }
      if (offset > entry.text.length) {
        return { ok: false, error: 'Offset exceeds the retained host output.' };
      }
      const end = Math.min(entry.text.length, offset + limit);
      return {
        ok: true,
        ...(offset === 0 && entry.images?.length ? { images: entry.images } : {}),
        output: {
          outputRef: input.outputRef,
          text: entry.text.slice(offset, end),
          offset,
          nextOffset: end < entry.text.length ? end : null,
          retainedChars: entry.text.length,
          totalChars: entry.totalChars,
          imageCount: entry.images?.length ?? 0,
          completeOutputRetained: entry.text.length === entry.totalChars,
        },
      };
    },
    listHostTools() {
      const tools = listStudioHostLanguageModelTools();
      return {
        ok: true,
        output: {
          schemaVersion: 'workspai.studio-host-tool-catalog.v1',
          count: tools.length,
          tools: tools.map(({ name, description, tags, readLike, inputSchema }) => ({
            name,
            description,
            tags,
            readLike,
            inputSchema,
          })),
        },
      };
    },
    async invokeHostTool(input) {
      if (
        storage &&
        input.sessionId &&
        (await isStudioSessionDeleted(storage.root, input.sessionId))
      ) {
        return { ok: false, error: 'This chat was deleted; the tool was not invoked.' };
      }
      return invokeStudioHostLanguageModelTool({
        ...input,
        token,
        toolInvocationToken,
        retainOutput: (text, images) => retainOutput(text, input.sessionId, images),
      });
    },
  };
}
