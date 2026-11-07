import { describe, expect, it } from 'vitest';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_REPORT_TOOL_NAME,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
  STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION,
  type StudioAgentConversationMessage,
} from '../core/studioAgentModelProtocol.js';
import { StudioAgentSession, type StudioAgentModelContext } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { reviewStudioTaskCompletion } from '../core/studioTaskCompletionReview.js';
import { studioActivityReceipt } from '../contracts/studioActivity.js';

function context(): StudioAgentModelContext {
  const state = new StudioAgentSession(
    {
      id: 'repair',
      workspacePath: '/workspace',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      cardId: 'assistant:agent',
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
    },
    { next: async () => ({ type: 'complete', summary: 'unused' }) },
    new StudioAgentToolRegistry(),
    { save: async () => {} }
  ).snapshot();
  state.events = [
    {
      schemaVersion: 'workspai.studio-agent-event.v1',
      id: 'start',
      sessionId: 'repair',
      requestId: 'request',
      sequence: 1,
      timestamp: '2026-11-07T00:00:00Z',
      type: 'request.started',
      data: { request: 'Fix setup and lint' },
    },
    {
      schemaVersion: 'workspai.studio-agent-event.v1',
      id: 'check',
      sessionId: 'repair',
      requestId: 'request',
      sequence: 2,
      timestamp: '2026-11-07T00:00:01Z',
      type: 'tool.completed',
      toolCallId: 'read',
      data: { toolName: 'inspect-source', ok: true },
    },
  ];
  return {
    session: state,
    steering: [],
    tools: ['inspect-source', 'inspect-workspace-changes', 'another-capability'].map((name) => ({
      name,
      title: name,
      description: 'Read current project evidence',
      activity: 'inspect' as const,
      risk: 'read' as const,
      inputSchema: {
        type: 'object',
        properties: { paths: { type: 'array', items: { type: 'string' } } },
      },
    })),
  };
}
const outcome = {
  toolName: STUDIO_AGENT_REPORT_TOOL_NAME,
  input: { summary: 'Checks remain open.', nextSteps: ['Run the original workflow.'] },
};
const verified = [
  {
    requirement: 'Fix setup',
    status: 'verified',
    evidenceSequences: [2],
    detail: 'Observed the requested result in the current source.',
  },
];

describe('Efficient workspace execution without capability restrictions', () => {
  it.each(['envelope', 'legacy'] as const)(
    'recovers a registered %s tool decision without an extra provider call',
    async (transport) => {
      const state = context();
      let calls = 0;
      const model = new ContractStudioAgentModelAdapter('Inspect', async () => {
        calls++;
        return JSON.stringify(
          transport === 'envelope'
            ? { toolName: 'inspect-source', input: { paths: ['file.ts'] }, callId: 'explicit-call' }
            : {
                schemaVersion: STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION,
                action: 'tool',
                toolName: 'inspect-source',
                input: { paths: ['file.ts'] },
              }
        );
      }).enableEfficientContext();
      expect(await model.next(state)).toMatchObject({
        type: 'tool',
        toolName: 'inspect-source',
        input: { paths: ['file.ts'] },
      });
      expect(calls).toBe(1);
    }
  );

  it.each([
    { toolName: 'invented-tool', input: {} },
    { toolName: 'inspect-source', input: [] },
    { toolName: 'inspect-source', input: {}, bypass: true },
  ])('does not normalize an invalid or invented tool envelope %#', async (response) => {
    const model = new ContractStudioAgentModelAdapter('Inspect', async () =>
      JSON.stringify(response)
    ).enableEfficientContext();
    expect((await model.next(context())).type).toBe('message');
  });
  it('sends source once and reduces actual serialized payload while retaining every tool schema, original task and pending control', async () => {
    const state = context();
    const source = `CURRENT-SOURCE-${'const value = 42;\n'.repeat(220)}`;
    const result = {
      ok: true,
      output: [{ path: 'service.ts', content: source, sha256: 'a'.repeat(64) }],
    };
    state.session.events[1].data.output = result.output;
    state.recentObservations = [
      { toolCallId: 'read', toolName: 'inspect-source', input: { paths: ['service.ts'] }, result },
    ];
    state.latestObservation = result;
    state.pendingEffectVerificationScopes = ['dependency-state'];
    const history: StudioAgentConversationMessage[] = [
      { role: 'user', content: 'Current task' },
      {
        role: 'assistant',
        toolCall: { callId: 'read', name: 'inspect-source', input: { paths: ['service.ts'] } },
      },
      {
        role: 'tool',
        toolResult: { callId: 'read', name: 'inspect-source', content: JSON.stringify(result) },
      },
    ];
    const payloads: Array<{
      messages: StudioAgentConversationMessage[];
      tools: Array<{ name: string; inputSchema: Record<string, unknown> }>;
    }> = [];
    for (const efficient of [false, true]) {
      const model = new ContractStudioAgentModelAdapter(
        'Fix both setup and lint; preserve my files.',
        async (_prompt, request) => {
          payloads.push(request);
          return outcome;
        },
        undefined,
        history
      );
      if (efficient) model.enableEfficientContext();
      await model.next(state);
    }
    const [legacy, efficient] = payloads.map((request) => JSON.stringify(request));
    expect(efficient.match(/CURRENT-SOURCE-/g)).toHaveLength(1);
    expect(efficient.length).toBeLessThan(legacy.length * 0.8);
    expect(efficient).toContain('Fix both setup and lint; preserve my files.');
    expect(efficient).toContain('dependency-state');
    expect(
      payloads[1].tools.filter((tool) => state.tools.some((entry) => entry.name === tool.name))
    ).toEqual(
      payloads[0].tools.filter((tool) => state.tools.some((entry) => entry.name === tool.name))
    );
  });

  it('references repeated fresh reads only while their exact original result remains in the same payload', async () => {
    const state = context();
    state.session.events = [
      state.session.events[0],
      ...[0, 1].map((index) => ({
        ...state.session.events[1],
        id: `read-${index}`,
        toolCallId: `read-${index}`,
        sequence: index + 2,
        data: { toolName: 'inspect-workspace-changes', ok: true },
      })),
    ];
    const messages: StudioAgentConversationMessage[] = [];
    for (let index = 0; index < 2; index++)
      messages.push(
        { role: 'user', content: 'Continue' },
        {
          role: 'assistant',
          toolCall: { callId: `read-${index}`, name: 'inspect-workspace-changes', input: {} },
        },
        {
          role: 'tool',
          toolResult: {
            callId: `read-${index}`,
            name: 'inspect-workspace-changes',
            content: JSON.stringify({
              selectedTool: 'inspect-workspace-changes',
              sequence: index + 2,
              latestObservation: { ok: true, output: { diff: 'EXACT-DIFF-' + 'x'.repeat(2000) } },
            }),
          },
        }
      );
    const model = new ContractStudioAgentModelAdapter(
      'Review changes',
      async (_prompt, request) => {
        const body = JSON.stringify(request.messages);
        expect(body.match(/EXACT-DIFF-/g)).toHaveLength(1);
        const results = request.messages.filter((message) => 'toolResult' in message);
        expect(JSON.parse(results[1].toolResult.content)).toMatchObject({
          sameResultAs: 'read-0',
          freshObservation: true,
          sequence: 3,
        });
        expect(results[0].toolResult.callId).toBe('read-0');
        return outcome;
      },
      undefined,
      messages
    ).enableEfficientContext();
    await model.next(state);
  });

  it.each(['different-input', 'different-result', 'write', 'image'] as const)(
    'keeps independent outputs for %s',
    async (kind) => {
      const state = context();
      if (kind === 'write') state.tools[0].activity = 'change';
      const messages: StudioAgentConversationMessage[] = [];
      for (let index = 0; index < 2; index++)
        messages.push(
          { role: 'user', content: 'Continue' },
          {
            role: 'assistant',
            toolCall: {
              callId: `call-${index}`,
              name: 'inspect-source',
              input: { paths: [kind === 'different-input' ? `${index}.ts` : 'same.ts'] },
            },
          },
          {
            role: 'tool',
            toolResult: {
              callId: `call-${index}`,
              name: 'inspect-source',
              content: 'SOURCE-' + 'x'.repeat(1000) + (kind === 'different-result' ? index : ''),
              ...(kind === 'image'
                ? { images: [{ mimeType: 'image/png', base64: 'aGVsbG8=' }] }
                : {}),
            },
          }
        );
      await new ContractStudioAgentModelAdapter(
        'Inspect',
        async (_prompt, request) => {
          expect(JSON.stringify(request.messages).match(/SOURCE-/g)).toHaveLength(2);
          return outcome;
        },
        undefined,
        messages
      )
        .enableEfficientContext()
        .next(state);
    }
  );

  it.each(['native', 'json'] as const)(
    'requires an evidence-linked coverage review for %s completion',
    async (transport) => {
      const state = context();
      const model = new ContractStudioAgentModelAdapter(
        'Fix both reported failures',
        async (_prompt, request) => {
          const tool = request.tools.find(
            (entry) => entry.name === STUDIO_AGENT_COMPLETE_TOOL_NAME
          )!;
          expect(tool.inputSchema.required).toContain('review');
          return transport === 'native'
            ? {
                toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
                input: { summary: 'Both fixed.', review: verified },
              }
            : JSON.stringify({
                schemaVersion: STUDIO_AGENT_MODEL_ACTION_SCHEMA_VERSION,
                action: 'complete',
                summary: 'Both fixed.',
                review: verified,
              });
        }
      ).enableEfficientContext();
      expect(await model.next(state)).toMatchObject({ type: 'complete', review: verified });
    }
  );

  it('keeps tools available after an unresolved review and rejects failed, invented or other-request evidence', async () => {
    const state = context();
    expect(
      reviewStudioTaskCompletion(
        'Done',
        [
          {
            ...verified[0],
            status: 'unresolved',
            evidenceSequences: [],
            detail: 'Original workflow has not run.',
          },
        ],
        state
      )
    ).toMatchObject({ type: 'feedback' });
    for (const sequence of [999, 1])
      expect(
        reviewStudioTaskCompletion(
          'Done',
          [{ ...verified[0], evidenceSequences: [sequence] }],
          state
        ).type
      ).toBe('message');
    state.session.events[1].requestId = 'another-request';
    expect(reviewStudioTaskCompletion('Done', verified, state).type).toBe('message');
    state.session.events[1].requestId = 'request';
    state.session.events[1].data.ok = false;
    expect(reviewStudioTaskCompletion('Done', verified, state).type).toBe('message');
    state.session.events[1].data.ok = true;
    let turn = 0;
    const model = new ContractStudioAgentModelAdapter('Fix setup', async (_prompt, request) => {
      expect(request.tools.some((tool) => tool.name === 'another-capability')).toBe(true);
      return turn++ === 0
        ? {
            toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
            input: {
              summary: 'Done',
              review: [{ ...verified[0], status: 'unresolved', evidenceSequences: [] }],
            },
          }
        : { toolName: 'another-capability', input: {} };
    }).enableEfficientContext();
    expect((await model.next(state)).type).toBe('feedback');
    expect(await model.next(state)).toMatchObject({ type: 'tool', toolName: 'another-capability' });
  });

  it('accepts retained successful receipts after raw-event compaction without accepting another request', () => {
    const state = context();
    const receipt = studioActivityReceipt(state.session.events[1])!;
    state.session.activityLog = [receipt];
    state.session.events = [
      {
        ...state.session.events[1],
        type: 'model.checkpoint',
        sequence: 600,
        data: { summary: 'Compacted' },
      },
    ];
    expect(reviewStudioTaskCompletion('Reviewed', verified, state).type).toBe('complete');
    state.session.activityLog = [{ ...receipt, requestId: 'older-request' }];
    expect(reviewStudioTaskCompletion('Reviewed', verified, state).type).toBe('message');
  });

  it('retains the end of a long user request and does not change canonical Goal context or its tools', async () => {
    const state = context();
    const task =
      'Original request\n' + 'log line\n'.repeat(1500) + '\nALSO FIX THE EARLIER SETUP FAILURE';
    await new ContractStudioAgentModelAdapter(task, async (prompt) => {
      expect(prompt).toContain('ALSO FIX THE EARLIER SETUP FAILURE');
      return outcome;
    })
      .enableEfficientContext()
      .next(state);
    state.session.executionAuthority = 'workspai-cli';
    await new ContractStudioAgentModelAdapter('Canonical repair', async (prompt, request) => {
      expect(prompt).toContain('Canonical Workspace Intelligence invariant:');
      expect(
        request.tools.find((tool) => tool.name === STUDIO_AGENT_COMPLETE_TOOL_NAME)!.inputSchema
          .required
      ).not.toContain('review');
      return outcome;
    })
      .enableEfficientContext()
      .next(state);
  });
});
