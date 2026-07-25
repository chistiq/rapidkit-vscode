import type { WorkspaceGraphStreamEnvelope } from '../contracts/workspaceGraphStream.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseWorkspaceGraphStreamEnvelope(
  value: unknown
): WorkspaceGraphStreamEnvelope | null {
  if (!isRecord(value) || value.schemaVersion !== 'workspace-graph-stream.v1') {
    return null;
  }
  const requiredStrings = [
    'type',
    'workspaceId',
    'sessionId',
    'modelHash',
    'graphHash',
    'generatedAt',
    'causationId',
    'correlationId',
  ];
  if (requiredStrings.some((key) => typeof value[key] !== 'string' || !value[key])) {
    return null;
  }
  if (
    !Number.isInteger(value.generation) ||
    !Number.isInteger(value.revision) ||
    !isRecord(value.payload)
  ) {
    return null;
  }
  return value as WorkspaceGraphStreamEnvelope;
}

export class WorkspaceGraphNdjsonDecoder {
  private buffer = '';

  public push(chunk: string): WorkspaceGraphStreamEnvelope[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines.flatMap((line) => this.parseLine(line));
  }

  public flush(): WorkspaceGraphStreamEnvelope[] {
    const tail = this.buffer;
    this.buffer = '';
    return this.parseLine(tail);
  }

  private parseLine(line: string): WorkspaceGraphStreamEnvelope[] {
    const normalized = line.trim();
    if (!normalized) {
      return [];
    }
    try {
      const event = parseWorkspaceGraphStreamEnvelope(JSON.parse(normalized));
      return event ? [event] : [];
    } catch {
      return [];
    }
  }
}
