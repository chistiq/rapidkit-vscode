import { describe, expect, it, vi } from 'vitest';
import {
  StudioAgentToolRegistry,
  type StudioAgentToolDefinition,
} from '../core/studioAgentToolRegistry.js';
import { studioToolSearchTool, StudioToolDeferral } from '../core/studioToolDiscovery.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
  STUDIO_AGENT_REPORT_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';
import { StudioAgentSession, type StudioAgentModelContext } from '../core/studioAgentSession.js';
import { parseJsonToolEnvelope } from '../core/aiToolTransport.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

const owner = {
  sessionId: 'parent',
  requestId: 'request',
  toolCallId: 'search',
  workspacePath: '/workspace',
  signal: new AbortController().signal,
};
function capability(
  name: string,
  description = 'Inspect an optional capability'
): StudioAgentToolDefinition {
  return {
    name,
    title: name,
    description,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { query: { type: 'string' } },
    },
    activity: 'inspect',
    risk: 'read',
    scopeIndependent: true,
    execute: vi.fn(async () => ({ ok: true, output: { source: name } })),
  };
}
function registry() {
  const tools = new StudioAgentToolRegistry();
  tools.register(capability('inspect-source'));
  for (let at = 0; at < 30; at++)
    tools.register(
      capability(
        `optional-${at}`,
        'Inspect a specialized capability with its exact invocation schema. '.repeat(8)
      )
    );
  tools.register(capability('inspect-notebook', 'Inspect notebook cell outputs and kernel status'));
  tools.register(studioToolSearchTool(tools));
  return tools;
}
function context(tools: StudioAgentToolRegistry): StudioAgentModelContext {
  return {
    session: {
      schemaVersion: 'workspai.studio-agent-session.v1',
      id: 'session',
      workspacePath: '/workspace',
      cardId: 'assistant:ask',
      assistantMode: 'ask',
      status: 'running',
      createdAt: '2026-11-01',
      updatedAt: '2026-11-01',
      sequence: 0,
      events: [],
    },
    tools: tools.list(),
    steering: [],
  };
}

describe('Portable Studio capability discovery', () => {
  it('pages the complete live catalog without executing capabilities or repeating their schemas', async () => {
    const tools = registry();
    const search = tools.get('search-studio-tools')!;
    const names: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const result = await search.execute({ offset, limit: 8 }, owner);
      expect(result.ok).toBe(true);
      const page = result.output as { tools: Array<{ name: string }>; nextOffset: number | null };
      expect(JSON.stringify(page)).not.toContain('inputSchema');
      names.push(...page.tools.map((tool) => tool.name));
      offset = page.nextOffset;
    }
    expect(new Set(names)).toEqual(new Set(tools.list().map((tool) => tool.name)));
    for (const tool of tools.list().filter((tool) => tool !== search))
      expect(tool.execute).not.toHaveBeenCalled();
    tools.register(capability('late-host-adapter', 'Read a newly installed capability'));
    expect(await search.execute({ names: ['late-host-adapter'] }, owner)).toMatchObject({
      ok: true,
      output: { tools: [{ name: 'late-host-adapter' }] },
    });
    const selected = Array.from({ length: 8 }, (_, at) => `optional-${at}`);
    expect((await search.execute({ names: selected }, owner)).output).toMatchObject({
      total: 8,
      nextOffset: null,
      tools: expect.arrayContaining(
        selected.map((name) => ({
          name,
          title: name,
          description: expect.any(String),
          activity: 'inspect',
          risk: 'read',
        }))
      ),
    });
  });

  it('ranks matching capabilities, states lexical ranking and validates unavailable names and pages', async () => {
    const search = registry().get('search-studio-tools')!;
    expect(await search.execute({ query: 'notebook kernel' }, owner)).toMatchObject({
      ok: true,
      output: { ranking: 'lexical', tools: [{ name: 'inspect-notebook' }] },
    });
    expect(await search.execute({ names: ['unregistered-write'] }, owner)).toMatchObject({
      ok: false,
    });
    for (const input of [
      { offset: -1 },
      { limit: 9 },
      { names: [] },
      { names: [''] },
      { query: 3 },
      { query: 'x'.repeat(301) },
    ]) {
      await expect(search.execute(input, owner)).rejects.toThrow('pagination');
    }
    expect(await search.execute({ query: 'unknown-specialization' }, owner)).toMatchObject({
      ok: true,
      output: { tools: [], nextOffset: null },
    });
  });

  it('loads schemas only from successful discovery receipts in the current registry, bounds loaded state and pins causal recovery', async () => {
    const tools = registry();
    const state = context(tools);
    const deferral = new StudioToolDeferral();
    const selected = deferral.select(state);
    expect(selected.tools.map((tool) => tool.name)).toEqual([
      'inspect-source',
      'search-studio-tools',
    ]);
    expect(selected.deferredNames).toContain('inspect-notebook');
    const result = await tools
      .get('search-studio-tools')!
      .execute({ names: ['inspect-notebook'] }, owner);
    state.recentObservations = [
      { toolName: 'search-studio-tools', toolCallId: 'load', input: {}, result },
    ];
    expect(deferral.select(state).tools.some((tool) => tool.name === 'inspect-notebook')).toBe(
      true
    );
    state.recentObservations = [
      {
        toolName: 'untrusted-tool',
        toolCallId: 'fake',
        input: {},
        result: {
          ok: true,
          output: {
            schemaVersion: 'workspai.studio-tool-search.v1',
            tools: [{ name: 'optional-1' }],
          },
        },
      },
    ];
    expect(deferral.select(state).tools.some((tool) => tool.name === 'optional-1')).toBe(false);
    state.requiredCausalAction = { toolName: 'optional-1', input: {}, reason: 'Exact recovery' };
    expect(deferral.select(state).tools.some((tool) => tool.name === 'optional-1')).toBe(true);
    state.requiredCausalAction = undefined;
    for (let at = 0; at < 30; at++) {
      state.recentObservations = [
        {
          toolName: 'search-studio-tools',
          toolCallId: `load-${at}`,
          input: {},
          result: await tools
            .get('search-studio-tools')!
            .execute({ names: [`optional-${at}`] }, owner),
        },
      ];
      deferral.select(state);
    }
    expect(deferral.select(state).tools).toHaveLength(18);
    state.session = { ...state.session, id: 'different-session' };
    state.recentObservations = [];
    expect(deferral.select(state).tools).toHaveLength(2);
    state.tools = state.tools.filter((tool) => tool.name !== 'search-studio-tools');
    expect(deferral.select(state).tools).toHaveLength(32);
  });

  it.each(['ask', 'plan', 'agent', 'goal'] as const)(
    "does not acquire another mode's authority through discovery in %s",
    async (mode) => {
      const tools = createStudioAgentWorkspaiToolRegistry({
        host: {} as StudioAgentWorkspaiToolHost,
        cardId: `assistant:${mode}`,
        assistantMode: mode,
      });
      tools.register(studioToolSearchTool(tools));
      const readOnly = mode === 'ask' || mode === 'plan';
      const result = await tools
        .get('search-studio-tools')!
        .execute({ names: ['apply-workspace-patch'] }, owner);
      expect(result.ok).toBe(!readOnly);
      expect(Boolean(tools.get('apply-workspace-patch'))).toBe(!readOnly);
    }
  );

  it.each(['native', 'json'] as const)(
    'executes a discovered capability through the actual runtime with %s transport',
    async (transport) => {
      const tools = registry();
      let turn = 0;
      const model = new ContractStudioAgentModelAdapter(
        'Read notebook kernel status',
        async (_prompt, request) => {
          expect(request.tools.some((tool) => tool.name === 'search-studio-tools')).toBe(true);
          expect(request.tools.some((tool) => tool.name === 'inspect-notebook')).toBe(turn > 0);
          const action =
            turn++ === 0
              ? { toolName: 'search-studio-tools', input: { names: ['inspect-notebook'] } }
              : turn === 2
                ? { toolName: 'inspect-notebook', input: { query: 'kernel' } }
                : {
                    toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
                    input: { summary: 'The notebook source was inspected.' },
                  };
          if (transport === 'native') return action;
          const decoded = parseJsonToolEnvelope(JSON.stringify(action), request.tools);
          if (!decoded)
            throw new Error('The advertised tool cannot be invoked using JSON transport.');
          return decoded;
        }
      ).enableToolDeferral();
      const result = await new StudioAgentSession(
        {
          workspacePath: '/workspace',
          cardId: 'assistant:ask',
          assistantMode: 'ask',
          permissionLevel: 'default',
          workspaceTrusted: true,
          requiresVerifiedCompletion: false,
        },
        model,
        tools,
        { save: async () => {} }
      ).run('Read notebook kernel status');
      expect(result.status).toBe('completed');
      expect(turn).toBe(3);
      expect(tools.get('inspect-notebook')!.execute).toHaveBeenCalledOnce();
      expect(
        result.events
          .filter((event) => event.type === 'tool.completed')
          .map((event) => event.data.toolName)
      ).toEqual(['search-studio-tools', 'inspect-notebook']);
    }
  );

  it('reduces the initial schema payload and preserves answer-only boundaries', async () => {
    const tools = registry();
    const state = context(tools);
    const sizes: number[] = [];
    const complete = async (_prompt: string, request: { tools: Array<{ name: string }> }) => {
      sizes.push(Buffer.byteLength(JSON.stringify(request.tools)));
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
    };
    await new ContractStudioAgentModelAdapter('Inspect', complete).next(state);
    const deferred = new ContractStudioAgentModelAdapter('Inspect', complete).enableToolDeferral();
    await deferred.next(state);
    expect(sizes[1]).toBeLessThan(sizes[0] / 3);
    const observed: string[][] = [];
    const terminal = new ContractStudioAgentModelAdapter('Inspect', async (_prompt, request) => {
      observed.push(request.tools.map((tool) => tool.name));
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
    }).enableToolDeferral();
    await terminal.next({ ...state, finalAnswerOnly: true });
    await terminal.next({ ...state, finalOutcomeOnly: true });
    expect(observed).toEqual([[STUDIO_AGENT_COMPLETE_TOOL_NAME], [STUDIO_AGENT_REPORT_TOOL_NAME]]);
  });
});
