import type * as vscode from 'vscode';

import type { StudioAgentEvent } from './studioAgentEvents.js';
import { deduplicateStudioMessage } from './studioRepairPresentation.js';

type NativeAgentStream = Pick<vscode.ChatResponseStream, 'markdown' | 'progress'>;

function eventRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayToolName(value: unknown): string {
  return String(value ?? 'workspace action')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Projects shared StudioAgentSession events into VS Code's native Chat activity stream. */
export function renderNativeStudioAgentEvent(
  stream: NativeAgentStream,
  event: StudioAgentEvent
): void {
  const data = eventRecord(event.data);
  const tool = displayToolName(data.toolName);
  if (event.type === 'tool.started') {
    stream.progress(`${tool}…`);
    return;
  }
  if (event.type === 'tool.progress') {
    const repair = eventRecord(data.repair);
    const message =
      (typeof data.message === 'string' && data.message) ||
      (typeof repair.message === 'string' && repair.message);
    if (message) {
      stream.progress(deduplicateStudioMessage(message) ?? message);
    }
    return;
  }
  if (event.type === 'tool.completed') {
    stream.progress(`Completed: ${tool}`);
    return;
  }
  if (event.type === 'tool.failed') {
    stream.progress(`Needs attention: ${tool}`);
    return;
  }
  if (event.type === 'model.checkpoint') {
    const summary = typeof data.summary === 'string' ? data.summary : undefined;
    if (summary) {
      stream.progress(summary);
    }
    return;
  }
  if (event.type === 'model.message' && typeof data.text === 'string' && data.text.trim()) {
    stream.markdown(`${data.text.trim()}\n\n`);
  }
}
