import { describe, expect, it, vi } from 'vitest';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { studioReadProgress, studioObservationReuse } from '../core/studioReadProgress.js';
import { buildStudioIncompleteAnswer } from '../core/studioAgentOutcome.js';

function create(
  next: ConstructorParameters<typeof StudioAgentSession>[1]['next'],
  registry = new StudioAgentToolRegistry()
) {
  return new StudioAgentSession(
    {
      workspacePath: '/workspace',
      cardId: 'assistant',
      assistantMode: 'ask',
      executionAuthority: 'workspace',
      permissionLevel: 'default',
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
    },
    { next },
    registry,
    { save: async () => {} }
  );
}
describe('Connection recovery and read progress', () => {
  it('does not advertise a stale successful command after failure, rollback, or a different source fingerprint', () => {
    const state = create(async () => ({ type: 'complete', summary: 'answer' })).snapshot();
    const input = { executable: 'node', args: ['--test'] };
    const event = (sequence: number, ok: boolean, output: Record<string, unknown>) => ({
      schemaVersion: 'workspai.studio-agent-event.v1' as const,
      id: String(sequence),
      sessionId: state.id,
      sequence,
      timestamp: new Date().toISOString(),
      type: ok ? ('tool.completed' as const) : ('tool.failed' as const),
      data: { toolName: 'run-workspace-command', input, ok, output },
    });
    state.events = [event(1, true, { exitCode: 0, sourceFingerprint: 'a'.repeat(64) })];
    expect(studioObservationReuse(state)?.successfulCommands).toHaveLength(1);
    state.events.push(event(2, false, { exitCode: 1 }));
    expect(studioObservationReuse(state)).toBeUndefined();
    state.events = [
      event(1, true, { exitCode: 0, sourceFingerprint: 'a'.repeat(64) }),
      {
        ...event(2, true, { exitCode: 0, sourceFingerprint: 'b'.repeat(64) }),
        data: {
          ...event(2, true, { exitCode: 0, sourceFingerprint: 'b'.repeat(64) }).data,
          input: { executable: 'other-check' },
        },
      },
    ];
    expect(studioObservationReuse(state)?.successfulCommands).toEqual([
      expect.objectContaining({ sequence: 2, sourceFingerprint: 'b'.repeat(64) }),
    ]);
    state.events = [
      event(1, true, {
        exitCode: 0,
        sourceFingerprint: 'a'.repeat(64),
        sourceRecovery: { state: 'restored' },
      }),
    ];
    expect(studioObservationReuse(state)).toBeUndefined();
  });
  it('keeps successful observation/check references beyond alternating tools and invalidates them after mutation or scope changes', () => {
    const state = create(async () => ({ type: 'complete', summary: 'answer' })).snapshot();
    const event = (sequence: number, data: Record<string, unknown>) => ({
      schemaVersion: 'workspai.studio-agent-event.v1' as const,
      id: String(sequence),
      sessionId: state.id,
      sequence,
      timestamp: new Date().toISOString(),
      type: 'tool.completed' as const,
      data,
    });
    state.events = [
      event(1, {
        toolName: 'inspect-agent-instructions',
        ok: true,
        input: { path: 'src/file.py' },
      }),
      event(2, {
        toolName: 'run-workspace-command',
        ok: true,
        input: { executable: 'poetry', args: ['run', 'mypy', 'src'] },
        output: { exitCode: 0, sourceFingerprint: 'a'.repeat(64) },
      }),
      event(3, { toolName: 'inspect-workspace-changes', ok: true, input: {} }),
      event(4, {
        toolName: 'run-workspace-command',
        ok: false,
        input: { executable: 'false' },
        output: { exitCode: 1 },
      }),
    ];
    expect(studioObservationReuse(state)).toMatchObject({
      observations: [{ sequence: 1 }, { sequence: 3 }],
      successfulCommands: [{ sequence: 2, sourceFingerprint: 'a'.repeat(64) }],
    });
    state.events.push(event(5, { toolName: 'apply-workspace-edits', changed: true, ok: true }));
    expect(studioObservationReuse(state)).toBeUndefined();
    state.events.push(event(6, { toolName: 'inspect-source', ok: true, input: {} }));
    state.events.push({ ...event(7, {}), type: 'workspace.target.bound' });
    expect(studioObservationReuse(state)).toBeUndefined();
  });
  it('retries a transient model decision once without repeating a successful tool', async () => {
    const execute = vi.fn(async () => ({ ok: true, output: 'Current source' }));
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-source',
      title: 'Read',
      description: 'Read source',
      activity: 'inspect',
      risk: 'read',
      inputSchema: {},
      execute,
    });
    let call = 0;
    const session = create(async () => {
      call += 1;
      if (call === 1)
        return { type: 'tool', toolName: 'inspect-source', input: {}, reason: 'Inspect source' };
      if (call === 2) throw new Error('network request aborted');
      return { type: 'complete', summary: 'The source defines the requested behavior.' };
    }, registry);
    const result = await session.run('Explain source');
    expect(result.status).toBe('completed');
    expect(execute).toHaveBeenCalledOnce();
    expect(result.events.some((event) => event.data.recovery === 'model-connection-retry')).toBe(
      true
    );
    expect(call).toBe(3);
  });
  it('retains a localized honest result after a second connection failure and does not retry authentication errors', async () => {
    const next = vi.fn(async () => {
      throw new Error('network request aborted');
    });
    const session = create(next);
    const result = await session.run(
      '\u06cc\u06a9 \u067e\u0631\u0648\u0698\u0647 \u0628\u0633\u0627\u0632'
    );
    expect(next).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('failed');
    expect(result.budgetLedger?.totalProviderRequests).toBe(2);
    const failure = result.events.find((event) => event.type === 'session.failed')!;
    expect(failure.data.terminalReason).toBe('ai-provider-unavailable');
    expect(String(failure.data.answer)).toContain(
      '\u067e\u0627\u0633\u062e \u0627\u06cc\u0646 \u067e\u0631\u0633\u0634'
    );
    expect(String(failure.data.answer)).not.toContain('This request remains incomplete');
    expect(buildStudioIncompleteAnswer(result, { reason: 'network request aborted' })).toContain(
      'network request aborted'
    );
    const auth = vi.fn(async () => {
      throw new Error('invalid_api_key');
    });
    await create(auth).run('Explain source');
    expect(auth).toHaveBeenCalledOnce();
  });
  it('distinguishes a model deadline from a connection failure without repeating the decision', async () => {
    const next = vi.fn(async () => {
      throw new Error('AI model request timed out after 180000ms. Recorded work is retained.');
    });
    const result = await create(next).run('Explain this project');
    expect(next).toHaveBeenCalledOnce();
    expect(
      result.events.find((event) => event.type === 'session.failed')?.data.terminalReason
    ).toBe('ai-provider-timeout');
  });
  it('does not retry or rewrite the cancelled session after a late transport rejection', async () => {
    let reject!: (error: Error) => void;
    const next = vi.fn(
      () =>
        new Promise<never>((_resolve, fail) => {
          reject = fail;
        })
    );
    const session = create(next);
    const running = session.run('Explain source');
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    session.cancel();
    expect((await running).status).toBe('cancelled');
    reject(new Error('network request aborted'));
    await Promise.resolve();
    expect(next).toHaveBeenCalledOnce();
    expect(session.snapshot().status).toBe('cancelled');
  });
  it('reports repeated reads without stopping them, and resets feedback after actual progress', () => {
    const state = create(async () => ({ type: 'complete', summary: 'answer' })).snapshot();
    const event = (sequence: number, data: Record<string, unknown>) => ({
      schemaVersion: 'workspai.studio-agent-event.v1' as const,
      id: String(sequence),
      sessionId: state.id,
      sequence,
      timestamp: new Date().toISOString(),
      type: 'tool.completed' as const,
      data,
    });
    state.events = [1, 2, 3].map((sequence) =>
      event(sequence, { toolName: 'inspect-source', input: { paths: ['page.tsx'] }, ok: true })
    );
    expect(studioReadProgress(state)).toMatchObject({
      readsSinceChange: 3,
      repeated: [
        { tool: 'inspect-source', input: { paths: ['page.tsx'] }, count: 3, lastSequence: 3 },
      ],
    });
    state.events.push({ ...event(4, {}), type: 'workspace.target.bound' });
    expect(studioReadProgress(state)).toBeUndefined();
    state.events.push(
      event(5, { toolName: 'inspect-source', input: { paths: ['page.tsx'], lineStart: 1 } })
    );
    state.events.push(
      event(6, { toolName: 'inspect-source', input: { lineStart: 1, paths: ['page.tsx'] } })
    );
    expect(studioReadProgress(state)).toMatchObject({
      readsSinceChange: 2,
      repeated: [{ count: 2 }],
    });
    state.events.push(event(7, { toolName: 'apply-workspace-edits', changed: true }));
    expect(studioReadProgress(state)).toBeUndefined();
  });
});
