import { describe, expect, it, vi } from 'vitest';

import { renderNativeStudioAgentEvent } from '../core/nativeChatToolEventRenderer';

function event(type: string, data: Record<string, unknown>) {
  return {
    schemaVersion: 'workspai.studio-agent-event.v1',
    id: `event-${type}`,
    sessionId: 'session-1',
    sequence: 1,
    timestamp: '2026-08-11T00:00:00.000Z',
    type,
    data,
  } as any;
}

describe('nativeChatToolEventRenderer', () => {
  it('projects shared Studio tool lifecycle events into native Chat activity', () => {
    const stream = { markdown: vi.fn(), progress: vi.fn() };

    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.started', { toolName: 'inspect-source' })
    );
    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.progress', {
        toolName: 'apply-workspace-patch',
        repair: { message: 'CLI checkpoint created.' },
      })
    );
    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.completed', { toolName: 'apply-workspace-patch' })
    );

    expect(stream.progress).toHaveBeenNthCalledWith(1, 'Inspect Source…');
    expect(stream.progress).toHaveBeenNthCalledWith(2, 'CLI checkpoint created.');
    expect(stream.progress).toHaveBeenNthCalledWith(3, 'Completed: Apply Workspace Patch');
  });

  it('renders changed-file diffs into native Chat markdown', () => {
    const stream = { markdown: vi.fn(), progress: vi.fn() };
    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.completed', {
        toolName: 'apply-workspace-patch',
        output: {
          fileChanges: [
            {
              relativePath: 'api/package.json',
              diffLines: [
                { type: 'removed', content: '  "name": "api"' },
                { type: 'added', content: '  "name": "commerce-api"' },
              ],
            },
          ],
        },
      })
    );
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('```diff'));
    expect(stream.markdown).toHaveBeenCalledWith(expect.stringContaining('api/package.json'));
    expect(stream.progress).not.toHaveBeenCalled();
  });

  it('renders governed process lifecycle and automatic rollback receipts', () => {
    const stream = { markdown: vi.fn(), progress: vi.fn() };
    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.progress', {
        toolName: 'run-workspace-command',
        process: { phase: 'running', processId: 42, elapsedMs: 1250 },
      })
    );
    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.failed', {
        toolName: 'run-workspace-command',
        error: 'Mutation was rolled back.',
        output: {
          rollback: {
            restoredFingerprint: 'a'.repeat(64),
            changedPaths: ['src/index.ts'],
          },
        },
      })
    );
    expect(stream.progress).toHaveBeenCalledWith('PID 42 running · 1250 ms');
    expect(stream.progress).toHaveBeenCalledWith(
      'Restored the pre-command checkpoint (1 source path(s))'
    );
    expect(stream.progress).toHaveBeenCalledWith('Failed: Mutation was rolled back.');
  });

  it('does not call remaining verify work completed', () => {
    const stream = { markdown: vi.fn(), progress: vi.fn() };
    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.completed', { toolName: 'verify-blocker', ok: false, cardBlocking: true })
    );
    renderNativeStudioAgentEvent(
      stream as any,
      event('verify.completed', {
        ok: false,
        cardBlocking: true,
        error: 'The blocker remains active.',
      })
    );
    expect(stream.progress).toHaveBeenCalledTimes(1);
    expect(stream.progress).toHaveBeenCalledWith('Verify found remaining work');
  });

  it('humanizes a command-only repair transaction failure', () => {
    const stream = { markdown: vi.fn(), progress: vi.fn() };
    renderNativeStudioAgentEvent(
      stream as any,
      event('tool.failed', {
        toolName: 'execute-remediation-step',
        error:
          'Workspace repair transaction violates contract: /tmp/repair.json must NOT have fewer than 1 items',
      })
    );
    expect(stream.progress).toHaveBeenCalledWith(
      'Failed: The CLI repair transaction could not start because this command-only step has no file checkpoint.'
    );
  });

  it('streams model narration without exposing internal event envelopes', () => {
    const stream = { markdown: vi.fn(), progress: vi.fn() };
    renderNativeStudioAgentEvent(
      stream as any,
      event('model.message', { text: 'Inspecting the failing adapter.' })
    );
    expect(stream.markdown).toHaveBeenCalledWith('Inspecting the failing adapter.\n\n');
    renderNativeStudioAgentEvent(
      stream as any,
      event('model.message', { text: '{"toolName":"inspect-source"}' })
    );
    expect(stream.markdown).toHaveBeenCalledTimes(1);
  });
});
