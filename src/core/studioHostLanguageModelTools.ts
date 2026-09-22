import * as vscode from 'vscode';

import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';

export type StudioHostLanguageModelToolInfo = {
  name: string;
  description: string;
  tags: string[];
  inputSchema?: Record<string, unknown>;
  readLike: boolean;
};

const READ_LIKE_TAGS = new Set(['read', 'readonly', 'read-only', 'search', 'fetch', 'web']);

export function isReadLikeHostLanguageModelTool(tags: readonly string[]): boolean {
  return tags.some((tag) => READ_LIKE_TAGS.has(tag.trim().toLowerCase()));
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
  return parts.join('\n\n').slice(0, 24_000);
}

export async function invokeStudioHostLanguageModelTool(input: {
  name: string;
  arguments?: Record<string, unknown>;
  signal?: AbortSignal;
  token?: vscode.CancellationToken;
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
  const tokenSource = new vscode.CancellationTokenSource();
  const onAbort = () => tokenSource.cancel();
  input.signal?.addEventListener('abort', onAbort, { once: true });
  const subscription = input.token?.onCancellationRequested(() => tokenSource.cancel());
  try {
    const result = await vscode.lm.invokeTool(
      name,
      { input: input.arguments ?? {}, toolInvocationToken: undefined },
      tokenSource.token
    );
    const text = textFromHostToolResult(result);
    return {
      ok: true,
      output: {
        schemaVersion: 'workspai.studio-host-tool-result.v1',
        name,
        readLike: tool.readLike,
        tags: tool.tags,
        text,
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

export function studioHostLanguageModelToolAdapters(token?: vscode.CancellationToken): {
  listHostTools(): StudioAgentToolResult;
  invokeHostTool(input: {
    name: string;
    arguments?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<StudioAgentToolResult>;
} {
  return {
    listHostTools() {
      const tools = listStudioHostLanguageModelTools();
      return {
        ok: true,
        output: {
          schemaVersion: 'workspai.studio-host-tool-catalog.v1',
          count: tools.length,
          tools: tools.map(({ name, description, tags, readLike }) => ({
            name,
            description,
            tags,
            readLike,
          })),
        },
      };
    },
    invokeHostTool(input) {
      return invokeStudioHostLanguageModelTool({ ...input, token });
    },
  };
}
