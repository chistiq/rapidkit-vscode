import { describe, expect, it } from 'vitest';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
  type StudioAgentConversationMessage,
} from '../core/studioAgentModelProtocol.js';
import type { StudioAgentModelContext } from '../core/studioAgentSession.js';

function context(): StudioAgentModelContext {
  return {
    session: {
      schemaVersion: 'workspai.studio-agent-session.v1',
      id: 'context-budget',
      workspacePath: '/workspace',
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      status: 'running',
      sequence: 0,
      createdAt: '2026-11-02T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
      events: [],
    },
    tools: [
      {
        name: 'inspect-source',
        title: 'Read source',
        description: 'Inspect exact source.',
        inputSchema: { type: 'object' },
        activity: 'inspect',
        risk: 'read',
      },
    ],
    steering: [],
  };
}

describe('Proportionate model context', () => {
  it('keeps current source once in its correlated tool result and includes uncorrelated controller observations', async () => {
    const state = context();
    const source = { ok: true, output: { content: 'CURRENT_SOURCE_BODY_' + 'x'.repeat(5000) } };
    let turn = 0;
    const model = new ContractStudioAgentModelAdapter(
      'Fix the focused source issue.',
      async (prompt, request) => {
        turn++;
        if (turn === 1)
          return { callId: 'read-1', toolName: 'inspect-source', input: { paths: ['one.ts'] } };
        const serialized = JSON.stringify(request.messages);
        expect(serialized.split('CURRENT_SOURCE_BODY_')).toHaveLength(2);
        expect(prompt).not.toContain('CURRENT_SOURCE_BODY_');
        expect(prompt).toContain('read-1');
        expect(prompt).toContain('AUTONOMOUS_VERIFIER_OBSERVATION');
        const result = request.messages.find((message) => 'toolResult' in message);
        expect(result && 'toolResult' in result && result.toolResult.callId).toBe('read-1');
        return {
          toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
          input: { summary: 'Reviewed the result.' },
        };
      }
    );
    await model.next(state);
    await model.next({
      ...state,
      latestObservation: { ok: true, output: { detail: 'AUTONOMOUS_VERIFIER_OBSERVATION' } },
      recentObservations: [
        {
          toolCallId: 'read-1',
          toolName: 'inspect-source',
          input: { paths: ['one.ts'] },
          result: source,
        },
      ],
    });
  });

  it('references a latest observation only when that exact result is present in the conversation', async () => {
    const state = context();
    const source = { ok: true, output: { content: 'EXACT_LATEST_SOURCE' } };
    let turn = 0;
    const model = new ContractStudioAgentModelAdapter(
      'Inspect source.',
      async (prompt, request) => {
        if (++turn === 1) return { callId: 'read', toolName: 'inspect-source', input: {} };
        expect(prompt).not.toContain('EXACT_LATEST_SOURCE');
        expect(JSON.stringify(request.messages)).toContain('EXACT_LATEST_SOURCE');
        return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Read.' } };
      }
    );
    await model.next(state);
    await model.next({
      ...state,
      latestObservation: source,
      recentObservations: [
        { toolCallId: 'read', toolName: 'inspect-source', input: {}, result: source },
      ],
    });
  });

  it('bounds old tool exchanges without orphaning results or dropping the current observation', async () => {
    const state = context();
    let turn = 0;
    let sent: StudioAgentConversationMessage[] = [];
    const model = new ContractStudioAgentModelAdapter(
      'Inspect distinct files.',
      async (_prompt, request) => {
        sent = request.messages;
        return {
          callId: `call-${++turn}`,
          toolName: 'inspect-source',
          input: { paths: [`${turn}.ts`] },
        };
      }
    );
    for (let index = 0; index < 5; index++) {
      const observation = {
        ok: true,
        output: {
          parts: Array.from({ length: 10 }, () => `OBSERVATION_${index}_` + 'x'.repeat(1800)),
        },
      };
      await model.next({
        ...state,
        latestObservation: observation,
        recentObservations: index
          ? [
              {
                toolCallId: `call-${index}`,
                toolName: 'inspect-source',
                input: {},
                result: observation,
              },
            ]
          : [],
      });
    }
    const history = sent.slice(0, -1);
    expect(
      history.some((message) => 'toolCall' in message && message.toolCall.callId === 'call-4')
    ).toBe(true);
    expect(
      history.some((message) => 'toolResult' in message && message.toolResult.callId === 'call-4')
    ).toBe(true);
    expect(JSON.stringify(history).length).toBeLessThanOrEqual(48_000);
    expect(JSON.stringify(history)).toContain('OBSERVATION_4_');
    expect(JSON.stringify(history)).not.toContain('OBSERVATION_1_');
    for (const [index, message] of history.entries()) {
      if ('toolResult' in message) {
        const preceding = history[index - 1];
        expect(preceding && 'toolCall' in preceding && preceding.toolCall.callId).toBe(
          message.toolResult.callId
        );
      }
    }
  });

  it('keeps the canonical execution contract on governed paths and omits its full schedule from ordinary project work', async () => {
    const state = context();
    const prompts: string[] = [];
    const model = new ContractStudioAgentModelAdapter('Inspect.', async (prompt) => {
      prompts.push(prompt);
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done.' } };
    });
    await model.next(state);
    await model.next({ ...state, session: { ...state.session, executionAuthority: 'cli' } });
    expect(prompts[0]).not.toContain('Canonical Workspace Intelligence stages:');
    expect(prompts[0]).toContain('Workspai');
    expect(prompts[0]).toContain('SHA-protected');
    expect(prompts[1]).toContain('Canonical Workspace Intelligence stages:');
    expect(prompts[1]).toContain('Canonical agent read order:');
    expect(prompts[0].length).toBeLessThan(prompts[1].length);
  });
});
