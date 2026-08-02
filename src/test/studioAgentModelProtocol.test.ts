import { describe, expect, it, vi } from 'vitest';

import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
  parseStudioAgentModelAction,
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
      },
      steering: [],
    } satisfies StudioAgentModelContext;

    await adapter.next(context);

    expect(prompt).toContain('Source repair phase: ACTIVE');
    expect(prompt).toContain('app/package.json');
    expect(prompt).toContain('intentionally withheld until a real source transaction');
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
    await expect(inspect.next(context)).resolves.toEqual({
      type: 'tool',
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
    expect(prompt).toContain('complete incident graph');
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
