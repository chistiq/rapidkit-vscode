import { describe, expect, it, vi } from 'vitest';

import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
  parseStudioAgentModelAction,
  restoreStudioAgentNativeConversation,
  type StudioAgentConversationMessage,
} from '../core/studioAgentModelProtocol.js';
import type { StudioAgentModelContext } from '../core/studioAgentSession.js';

describe('Studio Agent model protocol', () => {
  it('accepts only exact allowlisted tool actions', () => {
    expect(
      parseStudioAgentModelAction({
        text: JSON.stringify({
          schemaVersion: 'workspai.studio-agent-model-action.v1',
          action: 'tool',
          toolName: 'verify-blocker',
          input: {},
          reason: 'Verify the refreshed card',
        }),
        allowedTools: ['verify-blocker'],
      })
    ).toEqual({
      type: 'tool',
      toolName: 'verify-blocker',
      input: {},
      reason: 'Verify the refreshed card',
    });
    expect(
      parseStudioAgentModelAction({
        text: JSON.stringify({
          schemaVersion: 'workspai.studio-agent-model-action.v1',
          action: 'tool',
          toolName: 'shell',
          input: { command: 'rm -rf .' },
          reason: 'Bypass governance',
        }),
        allowedTools: ['verify-blocker'],
      }).type
    ).toBe('message');
  });

  it('accepts a single JSON fence without accepting surrounding prose', () => {
    const action = JSON.stringify({
      schemaVersion: 'workspai.studio-agent-model-action.v1',
      action: 'complete',
      summary: 'Verified result',
    });
    expect(
      parseStudioAgentModelAction({ text: `\`\`\`json\n${action}\n\`\`\``, allowedTools: [] })
    ).toEqual({ type: 'complete', summary: 'Verified result' });
    expect(
      parseStudioAgentModelAction({ text: `Here is the action:\n${action}`, allowedTools: [] }).type
    ).toBe('message');
  });

  it('grounds every turn in objective, tools, observations, and durable events', async () => {
    const complete = vi.fn(async () =>
      JSON.stringify({
        schemaVersion: 'workspai.studio-agent-model-action.v1',
        action: 'complete',
        summary: 'Verified',
      })
    );
    const adapter = new ContractStudioAgentModelAdapter('Clear readiness', complete);
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'session-1',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        blockerSignature: 'dependency-v1',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [
        {
          name: 'verify-blocker',
          title: 'Verify',
          description: 'Verify active blocker',
          inputSchema: { type: 'object' },
          activity: 'verify',
          risk: 'read',
        },
      ],
      latestObservation: { ok: true, cardBlocking: false },
      steering: ['Keep the dependency owner in scope'],
    } satisfies StudioAgentModelContext;

    await expect(adapter.next(context)).resolves.toEqual({
      type: 'complete',
      summary: 'Verified',
    });
    expect(complete.mock.calls[0]?.[0]).toContain('Clear readiness');
    expect(complete.mock.calls[0]?.[0]).toContain('verify-blocker');
    expect(complete.mock.calls[0]?.[0]).toContain('dependency-v1');
    expect(complete.mock.calls[0]?.[0]).not.toContain('inputSchema');
    expect(complete.mock.calls[0]?.[0]).toContain('never patch them directly');
    expect(complete.mock.calls[0]?.[0]).toContain(
      'Execution prerequisites outside the canonical loop'
    );
    expect(complete.mock.calls[0]?.[0]).toContain('{"id":"sync","label":"Sync"');
    expect(complete.mock.calls[0]?.[0]).toContain('{"id":"baseline","label":"Baseline"');
    expect(complete.mock.calls[0]?.[0]).toContain('Canonical Workspace Intelligence stages');
    expect(complete.mock.calls[0]?.[0]).toContain(
      '{"id":"readiness-evidence","label":"Readiness Evidence","phase":"evidence"}'
    );
    expect(complete.mock.calls[0]?.[0]).toContain(
      'Auxiliary capabilities may repair the source needed to pass a stage'
    );
    expect(complete.mock.calls[0]?.[1].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'verify-blocker' }),
        expect.objectContaining({ name: STUDIO_AGENT_COMPLETE_TOOL_NAME }),
      ])
    );
    expect(complete.mock.calls[0]?.[1].messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('Clear readiness'),
      }),
    ]);
  });

  it('keeps host filesystem identity out of provider control context', async () => {
    let prompt = '';
    const localRoot = '/home/alice/Documents/private-workspace';
    const adapter = new ContractStudioAgentModelAdapter(
      `Repair the blocker reported under ${localRoot}/api`,
      async (value) => {
        prompt = value;
        return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
      }
    );

    await adapter.next({
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'private-path-session',
        workspacePath: localRoot,
        projectPath: `${localRoot}/api`,
        cardId: 'workspaceRun',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-08-16T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      latestObservation: {
        ok: false,
        error: `Build failed at ${localRoot}/api/src/index.ts`,
      },
      steering: [`Inspect ${localRoot}/api/package.json`],
    });

    expect(prompt).not.toContain('/home/alice');
    expect(prompt).toContain('Workspace control boundary: $WORKSPACE');
    expect(prompt).toContain('Project source boundary: $PROJECT');
    expect(prompt).toContain('$LOCAL_PATH');
  });

  it('keeps prior model decisions in the next provider conversation', async () => {
    const requests: StudioAgentConversationMessage[][] = [];
    const adapter = new ContractStudioAgentModelAdapter(
      'Repair the blocker',
      async (_prompt, request) => {
        requests.push(request.messages);
        return requests.length === 1
          ? {
              callId: 'inspect-source-call-1',
              toolName: 'inspect-source',
              input: { paths: ['src/app.ts'] },
            }
          : { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Verified' } };
      }
    );
    const baseContext = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'conversation-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [
        {
          name: 'inspect-source',
          title: 'Inspect source',
          description: 'Read source.',
          inputSchema: { type: 'object' },
          activity: 'inspect',
          risk: 'read',
        },
      ],
      steering: [],
    } satisfies StudioAgentModelContext;

    await expect(adapter.next(baseContext)).resolves.toMatchObject({
      type: 'tool',
      callId: 'inspect-source-call-1',
    });
    await adapter.next({
      ...baseContext,
      latestObservation: { ok: false, error: 'later-automatic-observation' },
      recentObservations: [
        {
          toolCallId: 'inspect-source-call-1',
          toolName: 'inspect-source',
          input: { paths: ['src/app.ts'] },
          result: { ok: false, error: 'exact-native-tool-result' },
        },
      ],
    });

    expect(requests[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          toolCall: expect.objectContaining({
            callId: 'inspect-source-call-1',
            name: 'inspect-source',
          }),
        }),
        expect.objectContaining({
          role: 'tool',
          toolResult: expect.objectContaining({
            callId: 'inspect-source-call-1',
            name: 'inspect-source',
            content: expect.stringContaining('exact-native-tool-result'),
          }),
        }),
      ])
    );
    const correlatedToolResult = requests[1]?.find((message) => message.role === 'tool');
    expect(JSON.stringify(correlatedToolResult)).not.toContain('later-automatic-observation');
    expect(requests[1]?.at(-1)?.role).toBe('user');
  });

  it('carries bounded UI conversation history into a resumed Assistant request', async () => {
    let messages: StudioAgentConversationMessage[] = [];
    const adapter = new ContractStudioAgentModelAdapter(
      'Continue the investigation',
      async (_prompt, request) => {
        messages = request.messages;
        return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Explained' } };
      },
      undefined,
      [
        { role: 'user', content: 'Which service owns authentication?' },
        { role: 'assistant', content: 'I found the API boundary; I will inspect its proof next.' },
      ]
    );

    await adapter.next({
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'history-session',
        workspacePath: '/workspace',
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        status: 'running',
        createdAt: '2026-08-16T00:00:00.000Z',
        updatedAt: '2026-08-16T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      steering: [],
    });

    expect(messages.slice(0, 2)).toEqual([
      { role: 'user', content: 'Which service owns authentication?' },
      { role: 'assistant', content: 'I found the API boundary; I will inspect its proof next.' },
    ]);
    expect(messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Continue the investigation'),
    });
  });

  it('never emits an orphaned tool result when the provider conversation window is bounded', async () => {
    const requests: StudioAgentConversationMessage[][] = [];
    let turn = 0;
    const adapter = new ContractStudioAgentModelAdapter(
      'Materialize dependencies',
      async (_prompt, request) => {
        requests.push(request.messages);
        turn += 1;
        return {
          callId: `dependency-call-${turn}`,
          toolName: 'complete-dependency-transaction',
          input: { projectNames: ['catalog-api'] },
        };
      }
    );
    const baseContext = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'bounded-tool-conversation',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [
        {
          name: 'complete-dependency-transaction',
          title: 'Complete dependency transaction',
          description: 'Delegate repair to the CLI.',
          inputSchema: { type: 'object' },
          activity: 'change',
          risk: 'guarded-write',
        },
      ],
      steering: [],
    } satisfies StudioAgentModelContext;

    for (let index = 0; index < 8; index += 1) {
      const previousCallId = index > 0 ? `dependency-call-${index}` : undefined;
      await adapter.next({
        ...baseContext,
        latestObservation: { ok: false, error: `observation-${index}` },
        recentObservations: previousCallId
          ? [
              {
                toolCallId: previousCallId,
                toolName: 'complete-dependency-transaction',
                input: { projectNames: ['catalog-api'] },
                result: { ok: false, error: `observation-${index}` },
              },
            ]
          : [],
      });
    }

    for (const messages of requests) {
      messages.forEach((message, index) => {
        if (!('toolResult' in message)) return;
        const preceding = messages[index - 1];
        expect(preceding && 'toolCall' in preceding).toBe(true);
        if (preceding && 'toolCall' in preceding) {
          expect(preceding.toolCall.callId).toBe(message.toolResult.callId);
        }
      });
    }
  });

  it('restores only completed native tool rounds from a durable session', () => {
    const session = {
      schemaVersion: 'workspai.studio-agent-session.v1',
      id: 'restored-native-session',
      workspacePath: '/workspace',
      cardId: 'doctor',
      assistantMode: 'agent',
      status: 'running',
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:03.000Z',
      sequence: 4,
      events: [
        {
          schemaVersion: 'workspai.studio-agent-event.v1',
          id: 'restored-native-session:1',
          sessionId: 'restored-native-session',
          sequence: 1,
          timestamp: '2026-08-04T00:00:00.000Z',
          type: 'request.started',
          data: { request: 'Repair the dependency blocker.' },
        },
        {
          schemaVersion: 'workspai.studio-agent-event.v1',
          id: 'restored-native-session:2',
          sessionId: 'restored-native-session',
          sequence: 2,
          timestamp: '2026-08-04T00:00:01.000Z',
          type: 'tool.requested',
          toolCallId: 'completed-call',
          data: { toolName: 'inspect-source', input: { paths: ['package.json'] } },
        },
        {
          schemaVersion: 'workspai.studio-agent-event.v1',
          id: 'restored-native-session:3',
          sessionId: 'restored-native-session',
          sequence: 3,
          timestamp: '2026-08-04T00:00:02.000Z',
          type: 'tool.completed',
          toolCallId: 'completed-call',
          data: { toolName: 'inspect-source', ok: true, output: { paths: ['package.json'] } },
        },
        {
          schemaVersion: 'workspai.studio-agent-event.v1',
          id: 'restored-native-session:4',
          sessionId: 'restored-native-session',
          sequence: 4,
          timestamp: '2026-08-04T00:00:03.000Z',
          type: 'tool.requested',
          toolCallId: 'orphaned-call',
          data: { toolName: 'run-workspace-command', input: { command: 'npm test' } },
        },
      ],
    } as const;

    const restored = restoreStudioAgentNativeConversation(session);

    expect(restored).toEqual([
      { role: 'user', content: 'Repair the dependency blocker.' },
      {
        role: 'assistant',
        toolCall: {
          callId: 'completed-call',
          name: 'inspect-source',
          input: { paths: ['package.json'] },
        },
      },
      expect.objectContaining({
        role: 'tool',
        toolResult: expect.objectContaining({
          callId: 'completed-call',
          name: 'inspect-source',
          content: expect.stringContaining('package.json'),
        }),
      }),
    ]);
    expect(JSON.stringify(restored)).not.toContain('orphaned-call');
  });

  it('keeps the active source-repair directive visible on every constrained model turn', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter('Repair readiness', async (value) => {
      prompt = value;
      return { toolName: 'inspect-source', input: { paths: ['app/package.json'] } };
    });
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'source-repair-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [
        {
          name: 'inspect-source',
          title: 'Inspect source',
          description: 'Inspect exact source',
          inputSchema: { type: 'object' },
          activity: 'inspect',
          risk: 'read',
        },
      ],
      sourceRepairDirective: {
        nextAction: 'general-source-repair',
        unresolvedProjects: ['app'],
        sourceCandidates: ['app/package.json'],
        instruction:
          'Inspect any remaining path that still exists:false and create it with apply-workspace-patch using sha256 null.',
      },
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);

    expect(prompt).toContain('Source repair phase: ACTIVE');
    expect(prompt).toContain('app/package.json');
    expect(prompt).toContain('intentionally withheld until a real source transaction');
    expect(prompt).toContain('exists:false');
  });

  it('maps native allowlisted tool calls and the explicit completion tool without text JSON', async () => {
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'native-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [
        {
          name: 'inspect-remediation-plan',
          title: 'Inspect plan',
          description: 'Read the governed plan',
          inputSchema: { type: 'object', additionalProperties: false },
          activity: 'inspect',
          risk: 'read',
        },
      ],
      steering: [],
    } satisfies StudioAgentModelContext;

    const inspect = new ContractStudioAgentModelAdapter('Repair', async () => ({
      toolName: 'inspect-remediation-plan',
      input: {},
    }));
    await expect(inspect.next(context)).resolves.toMatchObject({
      type: 'tool',
      callId: expect.any(String),
      toolName: 'inspect-remediation-plan',
      input: {},
      reason: 'Model selected governed tool inspect-remediation-plan.',
    });

    const complete = new ContractStudioAgentModelAdapter('Repair', async () => ({
      toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
      input: { summary: 'Readiness verified' },
    }));
    await expect(complete.next(context)).resolves.toEqual({
      type: 'complete',
      summary: 'Readiness verified',
    });
  });

  it('bounds caller-provided objectives so source bodies cannot dominate every model turn', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter(
      `repair\n${'source-body-'.repeat(4000)}TAIL-MUST-NOT-SURVIVE`,
      async (value) => {
        prompt = value;
        return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
      }
    );
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'bounded-session',
        workspacePath: '/workspace',
        cardId: 'assistant:ask',
        assistantMode: 'ask',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      steering: [],
    } satisfies StudioAgentModelContext;
    await adapter.next(context);
    expect(prompt).toContain('[objective truncated]');
    expect(prompt).not.toContain('TAIL-MUST-NOT-SURVIVE');
  });

  it('uses the persisted execution policy instead of issuing conflicting selected-mode instructions', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter(
      'Explain the dependency graph',
      async (value) => {
        prompt = value;
        return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Explained' } };
      }
    );
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'agent-question',
        workspacePath: '/workspace',
        cardId: 'assistant:agent:evidence-answer',
        assistantMode: 'agent',
        executionPolicy: {
          schemaVersion: 'workspai.assistant-execution-policy.v1',
          selectedMode: 'agent',
          requestIntent: 'question',
          routeConfidence: 'high',
          profile: 'evidence-answer',
          toolMode: 'ask',
        },
        status: 'running',
        createdAt: '2026-08-20T00:00:00.000Z',
        updatedAt: '2026-08-20T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);
    expect(prompt).toContain('under the ASK execution policy');
    expect(prompt).toContain('selected AGENT mode');
    expect(prompt).toContain('Do not modify files');
    expect(prompt).not.toContain('Own the task from evidence inspection through source change');
  });

  it('excludes repeated request chatter from durable turn context', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter('Repair readiness', async (value) => {
      prompt = value;
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
    });
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'compact-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 2,
        events: [
          {
            schemaVersion: 'workspai.studio-agent-event.v1',
            id: 'compact-session:1',
            sessionId: 'compact-session',
            sequence: 1,
            timestamp: '2026-07-20T00:00:00.000Z',
            type: 'request.started',
            data: { request: 'DO-NOT-REPEAT-REQUEST-BODY' },
          },
          {
            schemaVersion: 'workspai.studio-agent-event.v1',
            id: 'compact-session:2',
            sessionId: 'compact-session',
            sequence: 2,
            timestamp: '2026-07-20T00:00:01.000Z',
            type: 'tool.completed',
            data: { toolName: 'inspect-evidence', ok: true },
          },
        ],
      },
      tools: [],
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);
    expect(prompt).not.toContain('DO-NOT-REPEAT-REQUEST-BODY');
    expect(prompt).toContain('inspect-evidence');
  });

  it('keeps durable event history compact instead of replaying full tool outputs', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter('Repair readiness', async (value) => {
      prompt = value;
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
    });
    const hugeOutput = 'EXPENSIVE-EVENT-BODY-'.repeat(2_000);
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'bounded-events-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 1,
        events: [
          {
            schemaVersion: 'workspai.studio-agent-event.v1',
            id: 'bounded-events-session:1',
            sessionId: 'bounded-events-session',
            sequence: 1,
            timestamp: '2026-07-20T00:00:00.000Z',
            type: 'tool.completed',
            data: { toolName: 'inspect-evidence', ok: true, output: { transcript: hugeOutput } },
          },
        ],
      },
      tools: [],
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);
    expect(prompt).not.toContain('EXPENSIVE-EVENT-BODY');
    expect(prompt.length).toBeLessThan(20_000);
  });

  it('keeps the causal dependency next action while dropping execution transcript noise', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter('Repair readiness', async (value) => {
      prompt = value;
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
    });
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'dependency-observation-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      latestObservation: {
        ok: false,
        error: 'Use the audit-authorized dependency upgrade.',
        output: {
          nextAction: 'upgrade-dependency-security',
          upgradeCandidates: [{ packageName: 'next', currentRange: '16.2.10', target: 'latest' }],
          execution: { transcript: 'NOISY-TRANSCRIPT-'.repeat(4_000) },
        },
      },
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);
    expect(prompt).toContain('Use the audit-authorized dependency upgrade.');
    expect(prompt).toContain('upgrade-dependency-security');
    expect(prompt).toContain('"packageName":"next"');
    expect(prompt).not.toContain('NOISY-TRANSCRIPT');
  });

  it('keeps bounded inspected source and dependent blocker ownership visible across tool turns', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter('Repair readiness', async (value) => {
      prompt = value;
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
    });
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'causal-memory-session',
        workspacePath: '/workspace',
        cardId: 'readiness',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      latestObservation: {
        ok: false,
        cardBlocking: true,
        output: {
          incidentGraph: {
            resolved: false,
            blockingCards: [{ id: 'workspaceVerify', blockers: ['readiness is blocked'] }],
          },
          activeHandoff: {
            cardId: 'workspaceVerify',
            blockers: ['readiness is blocked'],
          },
        },
      },
      recentObservations: [
        {
          toolCallId: 'inspect-source-call',
          toolName: 'inspect-source',
          input: { paths: ['api/package.json'] },
          result: {
            ok: true,
            output: [
              {
                path: 'api/package.json',
                sha256: 'source-sha',
                content: '{"dependencies":{"example":"1.0.0"}}',
                truncated: false,
              },
            ],
          },
        },
      ],
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);

    expect(prompt).toContain('workspaceVerify');
    expect(prompt).toContain('readiness is blocked');
    expect(prompt).toContain('api/package.json');
    expect(prompt).toContain('\\"example\\":\\"1.0.0\\"');
    expect(prompt).toContain('selected card and its causal action set');
    expect(prompt).toContain('Do not absorb unrelated blocking cards');
  });

  it('does not duplicate the latest source inspection in recent causal observations', async () => {
    let prompt = '';
    const latestObservation = {
      ok: true,
      output: [
        {
          path: 'app/package.json',
          sha256: 'source-sha',
          content: 'LATEST-SOURCE-CONTENT',
          truncated: false,
        },
      ],
    };
    const adapter = new ContractStudioAgentModelAdapter('Repair', async (value) => {
      prompt = value;
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
    });
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'deduplicated-latest-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-30T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      latestObservation,
      recentObservations: [
        {
          toolCallId: 'inspect-source-call',
          toolName: 'inspect-source',
          input: { paths: ['app/package.json'] },
          result: latestObservation,
        },
      ],
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);

    expect(prompt.match(/LATEST-SOURCE-CONTENT/g)).toHaveLength(1);
  });

  it('preserves a typed missing-file observation for model reasoning', async () => {
    let prompt = '';
    const adapter = new ContractStudioAgentModelAdapter(
      'Inspect package manager state',
      async (value) => {
        prompt = value;
        return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Done' } };
      }
    );
    await adapter.next({
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'missing-file-observation-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-08-07T00:00:00.000Z',
        updatedAt: '2026-08-07T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      latestObservation: {
        ok: true,
        output: [
          {
            path: 'pnpm-lock.yaml',
            exists: false,
            sha256: null,
            content: '',
            truncated: false,
          },
        ],
      },
      steering: [],
    });

    expect(prompt).toContain('pnpm-lock.yaml');
    expect(prompt).toContain('"exists":false');
  });

  it('retries a provider context overflow once with a compact causal prompt', async () => {
    const prompts: string[] = [];
    const adapter = new ContractStudioAgentModelAdapter('Repair doctor', async (prompt) => {
      prompts.push(prompt);
      if (prompts.length === 1) {
        throw new Error('Message exceeds token limit.');
      }
      return { toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME, input: { summary: 'Recovered' } };
    });
    const largePriorSource = 'PRIOR-SOURCE-'.repeat(2_000);
    const context = {
      session: {
        schemaVersion: 'workspai.studio-agent-session.v1',
        id: 'context-overflow-session',
        workspacePath: '/workspace',
        cardId: 'doctor',
        assistantMode: 'agent',
        status: 'running',
        createdAt: '2026-07-30T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
        sequence: 0,
        events: [],
      },
      tools: [],
      latestObservation: {
        ok: true,
        output: [
          {
            path: 'canvas-web/package.json',
            sha256: 'latest-sha',
            content: '{"dependencies":{"next":"16.2.10"}}',
            truncated: false,
          },
        ],
      },
      recentObservations: [
        {
          toolCallId: 'prior-inspect-source-call',
          toolName: 'inspect-source',
          input: { paths: ['old/package.json'] },
          result: {
            ok: true,
            output: [
              {
                path: 'old/package.json',
                sha256: 'old-sha',
                content: largePriorSource,
                truncated: false,
              },
            ],
          },
        },
      ],
      steering: [],
    } satisfies StudioAgentModelContext;

    await expect(adapter.next(context)).resolves.toEqual({
      type: 'complete',
      summary: 'Recovered',
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('canvas-web/package.json');
    expect(prompts[1]).not.toContain('PRIOR-SOURCE');
    expect(prompts[1].length).toBeLessThan(prompts[0].length);
  });
});
