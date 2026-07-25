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
    expect(complete.mock.calls[0]?.[0]).toContain('sync","kind":"preflight","label":"Sync"');
    expect(complete.mock.calls[0]?.[0]).toContain(
      'baseline","kind":"preflight","label":"Baseline"'
    );
    expect(complete.mock.calls[0]?.[0]).toContain(
      'readiness-evidence","kind":"stage","label":"Readiness Evidence"'
    );
    expect(complete.mock.calls[0]?.[0]).toContain(
      'Auxiliary capabilities may repair the source needed to pass a milestone'
    );
    expect(complete.mock.calls[0]?.[1].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'verify-blocker' }),
        expect.objectContaining({ name: STUDIO_AGENT_COMPLETE_TOOL_NAME }),
      ])
    );
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
});
