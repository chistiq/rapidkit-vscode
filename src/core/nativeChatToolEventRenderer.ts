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

function fileChangeRecords(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const output = eventRecord(data.output);
  const raw = Array.isArray(output.fileChanges)
    ? output.fileChanges
    : Array.isArray(data.fileChanges)
      ? data.fileChanges
      : [];
  return raw.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
  );
}

function renderNativeFileChangeMarkdown(files: Array<Record<string, unknown>>): string {
  const blocks = files.slice(0, 12).map((file) => {
    const relativePath = String(file.relativePath ?? 'file').replace(/\\/g, '/');
    const lines = Array.isArray(file.diffLines) ? file.diffLines : [];
    const added = lines.filter(
      (line) =>
        Boolean(line) && typeof line === 'object' && (line as { type?: string }).type === 'added'
    ).length;
    const removed = lines.filter(
      (line) =>
        Boolean(line) && typeof line === 'object' && (line as { type?: string }).type === 'removed'
    ).length;
    const hunk = lines
      .slice(0, 80)
      .map((line) => {
        if (!line || typeof line !== 'object') {
          return '';
        }
        const typed = line as { type?: string; content?: string };
        const marker = typed.type === 'added' ? '+' : typed.type === 'removed' ? '-' : ' ';
        return `${marker}${String(typed.content ?? '')}`;
      })
      .join('\n');
    const header = `**${relativePath}** \`+${added} −${removed}\``;
    return hunk.trim() ? `${header}\n\n\`\`\`diff\n${hunk}\n\`\`\`` : header;
  });
  return `### Changed files\n\n${blocks.join('\n\n')}\n\n`;
}

function cliRepairProgressTitle(repair: Record<string, unknown>): string | undefined {
  const phase = typeof repair.phase === 'string' ? repair.phase : undefined;
  const state = typeof repair.state === 'string' ? repair.state : undefined;
  if (repair.recovery === 'source-replan') {
    return 'Choosing a different fix';
  }
  if (state === 'decision-required' || repair.requiresUserDecision === true) {
    return 'Decision needed';
  }
  if (state === 'rolled-back') {
    return 'Restored the last change';
  }
  if (state === 'closed') {
    return 'Verified the change';
  }
  if (phase === 'plan' || phase === 'approval') {
    return 'Preparing the change';
  }
  if (phase === 'execute' || phase === 'complete') {
    return 'Applying the repair';
  }
  return undefined;
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
    const phaseTitle = cliRepairProgressTitle(repair);
    if (phaseTitle) {
      stream.progress(phaseTitle);
      return;
    }
    const message =
      (typeof data.message === 'string' && data.message) ||
      (typeof repair.message === 'string' && repair.message);
    if (message) {
      stream.progress(deduplicateStudioMessage(message) ?? message);
    }
    return;
  }
  if (event.type === 'tool.completed') {
    const files = fileChangeRecords(data);
    if (files.length > 0) {
      stream.markdown(renderNativeFileChangeMarkdown(files));
      return;
    }
    stream.progress(`Completed: ${tool}`);
    return;
  }
  if (event.type === 'tool.failed') {
    const files = fileChangeRecords(data);
    if (files.length > 0) {
      stream.markdown(renderNativeFileChangeMarkdown(files));
    }
    const error = typeof data.error === 'string' ? deduplicateStudioMessage(data.error) : undefined;
    stream.progress(error ? error : `Needs attention: ${tool}`);
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
    const text = data.text.trim();
    if (text.length < 12 || /^[{[]/.test(text) || /"toolName"\s*:/.test(text)) {
      return;
    }
    stream.markdown(`${text}\n\n`);
  }
}
