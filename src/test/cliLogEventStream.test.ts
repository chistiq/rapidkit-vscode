import { describe, expect, it } from 'vitest';

import { CliLogEventStreamParser } from '../core/cliLogEventStream';

function event(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 'cli-log-event-v1',
    runId: 'run-12345678',
    timestamp: '2026-06-22T10:00:00.000Z',
    level: 'info',
    event: 'progress',
    component: 'workspace.model',
    message: 'Building workspace model',
    ...overrides,
  });
}

describe('CliLogEventStreamParser', () => {
  it('decodes complete NDJSON lines', () => {
    const parser = new CliLogEventStreamParser();
    const events = parser.push(`${event()}\n${event({ event: 'run.completed' })}\n`);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('progress');
    expect(events[1].event).toBe('run.completed');
  });

  it('buffers partial lines across chunk boundaries', () => {
    const parser = new CliLogEventStreamParser();
    const line = event();
    const firstHalf = line.slice(0, 20);
    const secondHalf = line.slice(20);

    expect(parser.push(firstHalf)).toEqual([]);
    const events = parser.push(`${secondHalf}\n`);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('Building workspace model');
  });

  it('ignores non-event text lines (plain logs, blank lines)', () => {
    const parser = new CliLogEventStreamParser();
    const events = parser.push(`plain text noise\n\n${event()}\nnot json {oops\n`);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('progress');
  });

  it('flushes a trailing line without a newline', () => {
    const parser = new CliLogEventStreamParser();
    expect(parser.push(event({ event: 'run.completed' }))).toEqual([]);
    const flushed = parser.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0].event).toBe('run.completed');
  });

  it('returns nothing on flush when the buffer is empty or blank', () => {
    const parser = new CliLogEventStreamParser();
    parser.push(`${event()}\n`);
    expect(parser.flush()).toEqual([]);
  });
});
