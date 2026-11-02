import { describe, expect, it, vi } from 'vitest';
import { studioResearchSubagentTool } from '../core/studioResearchSubagent.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';

describe('Read-only research delegation', () => {
  it('runs isolated children concurrently, returns bounded findings and cannot close the parent verifier', async () => {
    const save = vi.fn(async () => {});
    const children: string[] = [];
    let started = 0;
    let unblock: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const tool = studioResearchSubagentTool({
      store: { save },
      createRegistry: () => new StudioAgentToolRegistry(),
      createModel: (objective) => ({
        next: async (context) => {
          children.push(context.session.id);
          expect(context.session.assistantMode).toBe('ask');
          expect(context.tools).toEqual([]);
          started += 1;
          if (started === 2) unblock!();
          await barrier;
          return { type: 'complete', summary: `Findings for ${objective}` };
        },
      }),
    });
    const registry = new StudioAgentToolRegistry();
    registry.register(tool);
    let decisions = 0;
    const parent = await new StudioAgentSession(
      {
        workspacePath: '/workspace',
        assistantMode: 'agent',
        cardId: 'assistant:agent',
        executionAuthority: 'workspace',
        requiresVerifiedCompletion: true,
        permissionLevel: 'autopilot',
        workspaceTrusted: true,
        maxTurns: 2,
      },
      {
        next: async () =>
          ++decisions === 1
            ? {
                type: 'tool',
                toolName: 'delegate-research',
                input: { objectives: ['inspect A', 'inspect B'] },
                reason: 'Independent investigations',
              }
            : { type: 'complete', summary: 'All work is verified.' },
      },
      registry,
      { save }
    ).run('Investigate and fix');
    expect(new Set(children).size).toBe(2);
    expect(parent.status).toBe('failed');
    expect(parent.events.some((event) => event.type === 'session.completed')).toBe(false);
    const result = parent.events.find((event) => event.type === 'tool.completed')?.data;
    expect(JSON.stringify(result)).toContain('research-only');
    expect(JSON.stringify(result)).toContain('Findings for inspect B');
  });

  it('returns a child clarification to the parent instead of keeping the tool pending', async () => {
    const tool = studioResearchSubagentTool({
      store: { save: async () => {} },
      createRegistry: () => new StudioAgentToolRegistry(),
      createModel: () => ({
        next: async () => ({ type: 'input', question: 'Which target?', reason: 'Missing target' }),
      }),
    });
    const result = await tool.execute(
      { objectives: ['Inspect the target'] },
      {
        sessionId: 'parent',
        requestId: 'request',
        toolCallId: 'child',
        workspacePath: '/workspace',
        signal: new AbortController().signal,
      }
    );
    expect(result).toMatchObject({
      ok: false,
      output: {
        results: [expect.objectContaining({ status: 'waiting-input', answer: 'Which target?' })],
      },
    });
  });

  it('cancels a waiting child without waiting for an unresponsive model', async () => {
    let began: (() => void) | undefined;
    const running = new Promise<void>((resolve) => {
      began = resolve;
    });
    const tool = studioResearchSubagentTool({
      store: { save: async () => {} },
      createRegistry: () => new StudioAgentToolRegistry(),
      createModel: () => ({
        next: async () => {
          began!();
          return new Promise(() => {});
        },
      }),
    });
    const controller = new AbortController();
    const result = tool.execute(
      { objectives: ['inspect'] },
      {
        sessionId: 'parent',
        requestId: 'r',
        toolCallId: 't',
        workspacePath: '/workspace',
        signal: controller.signal,
      }
    );
    await running;
    controller.abort();
    expect(JSON.stringify(await result)).toContain('cancelled');
  });
});
