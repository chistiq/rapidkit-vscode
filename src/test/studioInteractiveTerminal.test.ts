import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({
  terminal: undefined as any,
  ends: [] as Array<(value: any) => void>,
  closes: [] as Array<(value: any) => void>,
  integration: true,
  integrationListeners: [] as Array<(value: any) => void>,
  execute: vi.fn(),
  sendText: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('vscode', () => ({
  window: {
    createTerminal: () => {
      const terminal = {
        show: vi.fn(),
        sendText: mocked.sendText,
        dispose: mocked.dispose,
        shellIntegration: mocked.integration ? { executeCommand: mocked.execute } : undefined,
      };
      mocked.terminal = terminal;
      return terminal;
    },
    onDidEndTerminalShellExecution: (listener: (value: any) => void) => {
      mocked.ends.push(listener);
      return { dispose: vi.fn() };
    },
    onDidCloseTerminal: (listener: (value: any) => void) => {
      mocked.closes.push(listener);
      return { dispose: vi.fn() };
    },
    onDidChangeTerminalShellIntegration: (listener: (value: any) => void) => {
      mocked.integrationListeners.push(listener);
      return { dispose: vi.fn() };
    },
  },
}));
import {
  StudioInteractiveTerminalManager,
  studioInteractiveTerminalTools,
} from '../core/studioInteractiveTerminal.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
const roots: string[] = [];
const managers: StudioInteractiveTerminalManager[] = [];
afterEach(async () => {
  managers.splice(0).forEach((manager) => manager.dispose());
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
  vi.useRealTimers();
  vi.clearAllMocks();
  mocked.ends.length = 0;
  mocked.closes.length = 0;
  mocked.integration = true;
  mocked.terminal = undefined;
  mocked.integrationListeners.length = 0;
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-terminal-'));
  roots.push(root);
  const manager = new StudioInteractiveTerminalManager();
  managers.push(manager);
  const controller = new AbortController();
  const context = {
    sessionId: 'session',
    requestId: 'r',
    toolCallId: 't',
    workspacePath: root,
    signal: controller.signal,
  };
  const execution = {
    read: async function* () {
      yield 'Ready for input\n';
    },
  };
  mocked.execute.mockReturnValue(execution);
  return { manager, context, controller, execution };
}
describe('Interactive terminal tools', () => {
  it.each([
    'npx workspai@0.79.0 agent bootstrap --json',
    'workspai agent bootstrap --for-agent codex --json',
    'workspai agent bootstrap --help',
    'workspai agent bootstrap --no-live-inputs --json',
  ])('preserves exact-approved terminal access for a distinct CLI request: %s', async (command) => {
    const { manager, context } = await fixture();
    const tool = studioInteractiveTerminalTools(manager).find(
      (entry) => entry.name === 'start-terminal'
    )!;
    expect(await tool.authorize!({ command }, context)).toMatchObject({
      risk: 'invasive',
      approval: { execution: 'once' },
    });
    expect(mocked.execute).not.toHaveBeenCalled();
  });
  it('returns a recoverable bootstrap redirect to the model and continues through a read without approval', async () => {
    const { manager, context } = await fixture();
    const registry = new StudioAgentToolRegistry();
    studioInteractiveTerminalTools(manager).forEach((tool) => registry.register(tool));
    registry.register({
      name: 'inspect-project-agent-entry',
      title: 'Inspect grounding',
      description: 'Read grounding',
      inputSchema: { type: 'object' },
      risk: 'read',
      activity: 'inspect',
      execute: async () => ({ ok: true, output: { groundingReady: false, status: 'degraded' } }),
    });
    const approval = vi.fn(async (request) => ({
      approved: false,
      fingerprint: request.fingerprint,
    }));
    const actions = [
      {
        type: 'tool' as const,
        toolName: 'start-terminal',
        input: { command: 'workspai agent bootstrap --json' },
        reason: 'Inspect grounding',
      },
      {
        type: 'tool' as const,
        toolName: 'inspect-project-agent-entry',
        input: {},
        reason: 'Use the supported read capability',
      },
      {
        type: 'complete' as const,
        summary: 'The project grounding is degraded. The read completed and no files were changed.',
      },
    ];
    let index = 0;
    const state = await new StudioAgentSession(
      {
        workspacePath: context.workspacePath,
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        workspaceTrusted: true,
        permissionLevel: 'autopilot',
        requiresVerifiedCompletion: false,
        requestToolApproval: approval,
      },
      { next: async () => actions[index++] ?? actions[2] },
      registry,
      { save: async () => {} }
    ).run('Inspect project agent entry and report the current grounding');
    expect(approval).not.toHaveBeenCalled();
    expect(mocked.execute).not.toHaveBeenCalled();
    expect(state.status).toBe('completed');
    expect(
      state.events.some(
        (event) =>
          event.type === 'tool.failed' &&
          event.data.authorizationRejected === true &&
          String(event.data.error).includes('inspect-project-agent-entry')
      )
    ).toBe(true);
    expect(
      state.events.some(
        (event) =>
          event.type === 'tool.completed' && event.data.toolName === 'inspect-project-agent-entry'
      )
    ).toBe(true);
  });
  it.each([
    'workspai agent bootstrap --project app --json',
    'npx --yes workspai agent bootstrap --strict --json',
    'wspai agent bootstrap --json',
  ])(
    'redirects bootstrap to a scoped read before requesting terminal approval: %s',
    async (command) => {
      const { manager, context } = await fixture();
      const tool = studioInteractiveTerminalTools(manager).find(
        (entry) => entry.name === 'start-terminal'
      )!;
      expect(() => tool.authorize!({ command }, context)).toThrow('inspect-project-agent-entry');
      expect(mocked.execute).not.toHaveBeenCalled();
      expect(mocked.terminal).toBeUndefined();
    }
  );
  it.each(['adopt', 'import'] as const)(
    'keeps explicit %s consent tied to the exact source and workspace even in Autopilot',
    async (operation) => {
      const { manager, context } = await fixture();
      const registry = new StudioAgentToolRegistry();
      studioInteractiveTerminalTools(manager).forEach((tool) => registry.register(tool));
      const approvals: Array<{ fingerprint: string; displayCommand?: string }> = [];
      const actions = [
        {
          type: 'tool' as const,
          toolName: 'start-terminal',
          input: {
            command: `workspai ${operation} ../user-project --workspace ./chosen-workspace --json`,
            cwd: '.',
          },
          reason: 'Ask before onboarding existing source',
        },
        {
          type: 'report' as const,
          summary: 'Onboarding was declined; existing source remains unchanged.',
          nextSteps: ['Continue the original project task'],
        },
      ];
      let index = 0;
      const state = await new StudioAgentSession(
        {
          workspacePath: context.workspacePath,
          cardId: 'assistant:agent',
          assistantMode: 'agent',
          executionAuthority: 'workspace',
          workspaceTrusted: true,
          permissionLevel: 'autopilot',
          requiresVerifiedCompletion: false,
          requestToolApproval: async (request) => {
            approvals.push(request);
            return { approved: false, fingerprint: request.fingerprint };
          },
        },
        { next: async () => actions[index++] ?? actions[1] },
        registry,
        { save: async () => {} }
      ).run('Fix a test in my existing project');
      expect(approvals).toHaveLength(1);
      expect(approvals[0].displayCommand).toContain('../user-project');
      expect(approvals[0].displayCommand).toContain('./chosen-workspace');
      expect(mocked.execute).not.toHaveBeenCalled();
      expect(
        state.events.some(
          (event) => event.type === 'tool.failed' && event.data.toolName === 'start-terminal'
        )
      ).toBe(true);
      const tool = registry.get('start-terminal')!;
      const original = await tool.authorize!(actions[0].input, context);
      const changed = await tool.authorize!(
        {
          ...actions[0].input,
          command: actions[0].input.command.replace('chosen-workspace', 'another-workspace'),
        },
        context
      );
      expect(changed.approval?.fingerprint).not.toBe(original.approval?.fingerprint);
    }
  );
  it('resolves the documented workspace alias without executing a literal placeholder directory', async () => {
    const { manager, context } = await fixture();
    expect(await manager.start({ command: 'node -i', cwd: '$WORKSPACE' }, context)).toMatchObject({
      ok: true,
    });
    manager.cancelSession(context.sessionId);
    await expect(
      manager.start({ command: 'node -i', cwd: '$LOCAL_PATH' }, context)
    ).rejects.toThrow('redacted display path');
    await expect(
      manager.start({ command: 'node -i', cwd: '$WORKSPACE/../outside' }, context)
    ).rejects.toThrow();
  });
  it('keeps an explicitly approved background service observable without blocking other work', async () => {
    const { manager, context } = await fixture();
    const result = await manager.start({ command: 'npm run dev', background: true }, context);
    expect(result.ok).toBe(true);
    expect(manager.hasRunning(context.sessionId)).toBe(false);
    const id = (result.output as { terminalId: string }).terminalId;
    expect(await manager.read({ terminalId: id }, context)).toMatchObject({
      output: { state: 'running', background: true },
    });
    manager.cancelSession(context.sessionId);
    expect(await manager.read({ terminalId: id }, context)).toMatchObject({
      output: { state: 'closed' },
    });
  });
  it('requires exact one-run approval and captures output, interactive stdin and observed exit status', async () => {
    const { manager, context, execution } = await fixture();
    const start = studioInteractiveTerminalTools(manager).find(
      (tool) => tool.name === 'start-terminal'
    )!;
    const request = { command: 'node -i' };
    const authorization = await start.authorize!(request, context);
    expect(authorization).toMatchObject({ risk: 'invasive', approval: { execution: 'once' } });
    const result = await start.execute(request, {
      ...context,
      approval: {
        fingerprint: authorization.approval!.fingerprint,
        approvedBy: 'user',
        approvedAt: new Date().toISOString(),
      },
    });
    const id = (result.output as { terminalId: string }).terminalId;
    await Promise.resolve();
    expect(await manager.read({ terminalId: id }, context)).toMatchObject({
      output: { state: 'running', output: 'Ready for input\n' },
    });
    manager.input({ terminalId: id, text: '1+1' }, context);
    expect(mocked.sendText).toHaveBeenCalledWith('1+1', true);
    mocked.ends.forEach((listener) => listener({ execution, exitCode: 0 }));
    expect(await manager.read({ terminalId: id }, context)).toMatchObject({
      output: { state: 'exited', exitCode: 0 },
    });
    expect(manager.hasRunning(context.sessionId)).toBe(false);
  });
  it('isolates terminal ownership and terminates a running command on cancellation', async () => {
    const { manager, context, controller } = await fixture();
    const result = await manager.start({ command: 'node -i' }, context);
    const id = (result.output as { terminalId: string }).terminalId;
    await expect(
      manager.read({ terminalId: id }, { ...context, sessionId: 'other' })
    ).rejects.toThrow('not owned');
    controller.abort();
    expect(mocked.dispose).toHaveBeenCalled();
    expect(await manager.read({ terminalId: id }, context)).toMatchObject({
      output: { state: 'closed', exitCode: undefined },
    });
  });
  it('wakes a pending read as soon as new output arrives and removes the timeout', async () => {
    const { manager, context } = await fixture();
    let emit!: (value: IteratorResult<string>) => void;
    const stream = {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise<IteratorResult<string>>((resolve) => {
              emit = resolve;
            }),
        };
      },
    };
    mocked.execute.mockReturnValue({ read: () => stream });
    const result = await manager.start({ command: 'node -i' }, context);
    const terminalId = (result.output as { terminalId: string }).terminalId;
    vi.useFakeTimers();
    const reading = manager.read({ terminalId, offset: 0, waitMs: 30_000 }, context);
    emit({ done: false, value: 'new output' });
    await expect(reading).resolves.toMatchObject({
      output: { output: 'new output', offset: 10, waitedMs: 0 },
    });
    expect(vi.getTimerCount()).toBe(0);
    emit({ done: true, value: undefined });
  });

  it.each(['exit', 'close', 'cancel', 'dispose'] as const)(
    'wakes pending reads immediately on %s without stale callbacks',
    async (ending) => {
      const { manager, context, controller, execution } = await fixture();
      const result = await manager.start({ command: 'node -i' }, context);
      await Promise.resolve();
      const terminalId = (result.output as { terminalId: string }).terminalId;
      vi.useFakeTimers();
      const reading = manager.read(
        { terminalId, offset: 'Ready for input\n'.length, waitMs: 30_000 },
        context
      );
      if (ending === 'exit')
        mocked.ends.forEach((listener) => listener({ execution, exitCode: 0 }));
      if (ending === 'close') mocked.closes.forEach((listener) => listener(mocked.terminal));
      if (ending === 'cancel') controller.abort();
      if (ending === 'dispose') manager.dispose();
      await expect(reading).resolves.toMatchObject({
        output: { state: ending === 'exit' ? 'exited' : 'closed', waitedMs: 0 },
      });
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('releases a failed startup and permits another command instead of retaining a phantom running terminal', async () => {
    const { manager, context, execution } = await fixture();
    mocked.execute.mockImplementationOnce(() => {
      throw new Error('shell integration failure');
    });
    expect(await manager.start({ command: 'node -i' }, context)).toMatchObject({
      ok: false,
      error: expect.stringContaining('shell integration failure'),
    });
    expect(manager.hasRunning(context.sessionId)).toBe(false);
    mocked.execute.mockReturnValue(execution);
    expect(await manager.start({ command: 'node -i' }, context)).toMatchObject({ ok: true });
  });

  it('settles startup immediately when the visible terminal closes before shell integration', async () => {
    const { manager, context } = await fixture();
    mocked.integration = false;
    const starting = manager.start({ command: 'node -i' }, context);
    await vi.waitFor(() => expect(mocked.integrationListeners).toHaveLength(1));
    mocked.closes.forEach((listener) => listener(mocked.terminal));
    await expect(starting).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('No command was sent'),
    });
    expect(mocked.execute).not.toHaveBeenCalled();
    expect(manager.hasRunning(context.sessionId)).toBe(false);
  });

  it('does not let a late exit event resurrect a cancelled terminal', async () => {
    const { manager, context, controller, execution } = await fixture();
    const result = await manager.start({ command: 'node -i' }, context);
    controller.abort();
    mocked.ends.forEach((listener) => listener({ execution, exitCode: 0 }));
    expect(
      await manager.read(
        { terminalId: (result.output as { terminalId: string }).terminalId },
        context
      )
    ).toMatchObject({ output: { state: 'closed', exitCode: undefined } });
  });

  it.each([true, false])(
    'counts actual terminal output as progress, while retaining loop detection when output advances=%s',
    async (advances) => {
      const registry = new StudioAgentToolRegistry();
      let cursor = 0;
      let decisions = 0;
      registry.register({
        name: 'read-terminal',
        title: 'Read',
        description: 'Read',
        inputSchema: {},
        activity: 'inspect',
        risk: 'read',
        execute: async () => ({
          ok: true,
          output: { terminalId: 'terminal', state: 'running', offset: advances ? ++cursor : 0 },
        }),
      });
      registry.register({
        name: 'verify-blocker',
        title: 'Verify',
        description: 'Verify',
        inputSchema: {},
        activity: 'verify',
        risk: 'read',
        execute: async () => ({ ok: true, cardBlocking: false }),
      });
      const result = await new StudioAgentSession(
        {
          workspacePath: '/workspace',
          cardId: 'assistant:agent',
          assistantMode: 'agent',
          executionAuthority: 'workspace',
          permissionLevel: 'autopilot',
          workspaceTrusted: true,
          requiresVerifiedCompletion: false,
          maxModelDecisionsWithoutSourceProgress: 3,
        },
        {
          next: async () =>
            ++decisions <= 8
              ? { type: 'tool', toolName: 'read-terminal', input: {}, reason: 'Observe progress' }
              : { type: 'complete', summary: 'Finished observing the terminal output.' },
        },
        registry,
        { save: async () => {} }
      ).run('Observe command output');
      const breaker = result.events.some(
        (event) =>
          event.type === 'model.checkpoint' &&
          event.data.recovery === 'provider-call-circuit-breaker'
      );
      expect(breaker).toBe(!advances);
      if (advances) expect(decisions).toBe(9);
    }
  );

  it('does not send an unobservable command when shell integration is unavailable', async () => {
    const { manager, context } = await fixture();
    mocked.integration = false;
    vi.useFakeTimers();
    const running = manager.start({ command: 'node -i' }, context);
    // realpath completes on a real filesystem before the integration timer is installed.
    await vi.waitFor(() => expect(mocked.terminal.shellIntegration).toBeUndefined());
    await vi.advanceTimersByTimeAsync(5_100);
    expect(await running).toMatchObject({
      ok: false,
      error: expect.stringContaining('No command was sent'),
    });
    expect(mocked.execute).not.toHaveBeenCalled();
  });
});
