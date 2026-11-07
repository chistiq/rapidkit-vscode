import { createHash } from 'node:crypto';
import type { StudioAgentToolResult } from './studioAgentToolRegistry.js';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Bound source at complete lines, and preserve the exact next location. */
export function projectStudioSourceRead(entry: Record<string, unknown>, limit = 4_000) {
  if (entry.contentOmitted === true || entry.content === '[omitted from durable session]') {
    return {
      ...entry,
      contentOmitted: true,
      instruction:
        'Only historical read metadata is retained here. Source bytes were omitted from storage; inspect current source when the actual bytes or fresh edit authority are needed.',
    };
  }
  const full = String(entry.content ?? '');
  let end = Math.min(full.length, limit);
  if (end < full.length) {
    const newline = full.lastIndexOf('\n', end - 1);
    if (newline >= 0) {
      end = newline + 1;
    } else if (/[\uD800-\uDBFF]/.test(full[end - 1] ?? '')) {
      end--;
    }
  }
  const content = full.slice(0, end);
  const clipped = end < full.length;
  const start = typeof entry.lineStart === 'number' ? entry.lineStart : 1;
  const incompleteLine = (clipped || entry.truncated === true) && !content.endsWith('\n');
  const lines = content ? content.split('\n').length - (content.endsWith('\n') ? 1 : 0) : 0;
  const completeLines = Math.max(0, lines - (incompleteLine ? 1 : 0));
  const lineEnd = start + completeLines - 1;
  return {
    ...entry,
    content,
    lineStart: start,
    lineEnd,
    truncated: clipped || entry.truncated === true,
    ...(incompleteLine ? { partialLastLine: true } : {}),
    ...(clipped || entry.truncated === true
      ? {
          nextRead:
            incompleteLine && completeLines === 0
              ? {
                  tool: 'search-workspace',
                  instruction:
                    'This source line exceeds the preview budget. Use focused search or language/symbol tools for the missing segment rather than repeating the same prefix.',
                }
              : {
                  tool: 'inspect-source',
                  input: { paths: [entry.path], lineStart: lineEnd + 1, lineEnd: lineEnd + 160 },
                },
        }
      : {}),
  };
}

/** Distribute preview space across every batch result instead of truncating the JSON envelope. */
export function projectStudioReadResult(
  toolName: string,
  result: StudioAgentToolResult,
  input?: unknown
): StudioAgentToolResult {
  if (toolName === 'onboard-project') {
    const output = record(result.output);
    const refreshed = record(output.refreshedInstructions);
    if (refreshed.output) {
      const instructions = projectStudioReadResult(
        'inspect-agent-instructions',
        refreshed as StudioAgentToolResult,
        {}
      );
      return {
        ...result,
        output: {
          ...output,
          refreshedInstructions: instructions,
          nextReads: record(instructions.output).nextReads ?? [],
        },
      };
    }
    return result;
  }
  if (
    !['inspect-source', 'inspect-workspace-batch', 'inspect-agent-instructions'].includes(toolName)
  ) {
    return result;
  }
  let files = 0;
  const count = (value: unknown, depth = 0): void => {
    if (depth > 9) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => count(item, depth + 1));
      return;
    }
    const node = record(value);
    if (typeof node.path === 'string' && typeof node.content === 'string') {
      files++;
    } else {
      Object.values(node).forEach((item) => {
        if (item && typeof item === 'object') {
          count(item, depth + 1);
        }
      });
    }
  };
  count(result.output);
  const limit = Math.min(4_000, Math.max(256, Math.floor(12_000 / Math.max(1, files))));
  const project = (value: unknown, depth = 0): unknown => {
    if (depth > 9) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => project(item, depth + 1));
    }
    const node = record(value);
    if (!Object.keys(node).length) {
      return value;
    }
    if (typeof node.path === 'string' && typeof node.content === 'string') {
      if (typeof node.locator === 'string' && typeof node.offset === 'number') {
        let end = Math.min(node.content.length, limit);
        if (/[\uD800-\uDBFF]/.test(node.content[end - 1] ?? '')) {
          end--;
        }
        const content = node.content.slice(0, end);
        const consumedBytes = Buffer.byteLength(content, 'utf8');
        return {
          ...node,
          content,
          consumedBytes,
          contentSha256: createHash('sha256').update(content).digest('hex'),
          truncated: end < node.content.length || node.truncated === true,
          nextOffset: node.offset + consumedBytes,
        };
      }
      return projectStudioSourceRead(node, limit);
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        child && typeof child === 'object' ? project(child, depth + 1) : child,
      ])
    );
  };
  const projected = project(result.output);
  if (toolName === 'inspect-agent-instructions') {
    const next = record(projected);
    const prior = record(input);
    next.nextReads = (Array.isArray(next.documents) ? next.documents : []).flatMap((raw) => {
      const doc = record(raw);
      return doc.truncated === true && Number(doc.consumedBytes) > 0
        ? [
            {
              tool: 'inspect-agent-instructions',
              input: {
                ...(typeof prior.path === 'string' ? { path: prior.path } : {}),
                document: doc.locator,
                offset: doc.nextOffset,
              },
              reason:
                'Continue the unread instruction bytes at this exact offset; earlier bytes are already returned.',
            },
          ]
        : [];
    });
  }
  return { ...result, output: projected };
}
