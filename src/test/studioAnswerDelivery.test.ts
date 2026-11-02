import { describe, expect, it, vi } from 'vitest';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';
import { StudioAgentSession, type StudioAgentModelContext } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import { resolveAssistantExecutionPolicy } from '../core/assistantExecutionPolicy.js';
import { ANSWER_DELIVERY_TOOL, answerDeliveryEvidence } from '../core/studioAnswerDelivery.js';

const commands = Array.from({ length: 130 }, (_, index) => ({
  command: `workspace command-${index}`,
  summary: `Command ${index}`,
  argv: ['workspace', `command-${index}`],
}));
function context(): StudioAgentModelContext {
  const session = new StudioAgentSession(
    {
      workspacePath: '/workspace',
      cardId: 'assistant:question',
      assistantMode: 'agent',
      executionPolicy: resolveAssistantExecutionPolicy({
        selectedMode: 'agent',
        requestIntent: 'research',
      }),
      permissionLevel: 'default',
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
    },
    { next: async () => ({ type: 'complete', summary: 'unused' }) },
    new StudioAgentToolRegistry(),
    { save: async () => {} }
  ).snapshot();
  return {
    session,
    tools: [],
    steering: [],
    recentObservations: [0, 40, 80, 120].map((offset) => ({
      toolCallId: String(offset),
      toolName: 'inspect-cli-commands',
      input: { offset },
      result: {
        ok: true,
        output: {
          schemaVersion: 'workspai.studio-cli-catalog.v1',
          source: 'installed-runtime',
          version: '0.80.0',
          matchingCommands: 130,
          commands: commands.slice(offset, offset + 40),
        },
      },
    })),
  };
}

describe('Answer delivery review', () => {
  it('preserves versioned architecture and knowledge references for final delivery', () => {
    const ctx = context();
    ctx.recentObservations = [
      {
        toolName: 'inspect-cli-commands',
        toolCallId: 'architecture',
        input: { topic: 'architecture' },
        result: {
          ok: true,
          output: {
            schemaVersion: 'workspai.studio-architecture.v1',
            source: 'bundled-create-contract',
            version: '0.80.0',
            scopeModel: { locations: { managed: '~/.workspai/workspaces/<name>' } },
          },
        },
      },
    ];
    expect(answerDeliveryEvidence(ctx).observations).toEqual([
      expect.objectContaining({
        tool: 'inspect-cli-commands',
        ok: true,
        output: expect.objectContaining({
          source: 'bundled-create-contract',
          scopeModel: { locations: { managed: '~/.workspai/workspaces/<name>' } },
        }),
      }),
    ]);
    expect(answerDeliveryEvidence(ctx).catalogs).toEqual([]);
  });
  it('replaces the reported Persian promise with the actual complete list, without another tool loop', async () => {
    const complete = vi.fn(async (prompt, request) => {
      if (request.tools[0].name !== ANSWER_DELIVERY_TOOL)
        return {
          toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
          input: {
            summary:
              '\u0641\u0647\u0631\u0633\u062a \u06a9\u0627\u0645\u0644 \u06f1\u06f3\u06f0 \u062f\u0633\u062a\u0648\u0631 \u062f\u0631 \u067e\u06cc\u0627\u0645 \u0646\u0647\u0627\u06cc\u06cc \u0627\u0631\u0627\u0626\u0647 \u0645\u06cc\u200c\u0634\u0648\u062f.',
          },
        };
      expect(prompt).toContain(
        '\u0644\u06cc\u0633\u062a \u06a9\u0627\u0645\u0644 \u062f\u0633\u062a\u0648\u0631\u0627\u062a\u0634\u0648 \u0628\u0631\u0627\u0645 \u0628\u0641\u0631\u0633\u062a'
      );
      expect(prompt).toContain('No more tools or later final message');
      for (const { command } of commands) expect(prompt).toContain(`workspai ${command}`);
      return {
        toolName: ANSWER_DELIVERY_TOOL,
        input: {
          answer: commands.map(({ command }) => `- workspai ${command}`).join('\n'),
          delivered: true,
          missing: [],
          catalogCoverage: 'all',
        },
      };
    });
    const adapter = new ContractStudioAgentModelAdapter(
      '\u0644\u06cc\u0633\u062a \u06a9\u0627\u0645\u0644 \u062f\u0633\u062a\u0648\u0631\u0627\u062a\u0634\u0648 \u0628\u0631\u0627\u0645 \u0628\u0641\u0631\u0633\u062a',
      complete
    ).enableAnswerDeliveryReview();
    const action = await adapter.next(context());
    expect(action.type).toBe('complete');
    expect(action.type === 'complete' && action.summary.split('\n')).toHaveLength(130);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('also repairs an incomplete-outcome answer that bypassed completion while a full catalog was available', async () => {
    const adapter = new ContractStudioAgentModelAdapter(
      'Send all commands',
      async (_prompt, request) =>
        request.tools[0].name === ANSWER_DELIVERY_TOOL
          ? {
              toolName: ANSWER_DELIVERY_TOOL,
              input: {
                answer: 'The catalog was truncated; obtain it yourself.',
                delivered: false,
                missing: ['Full list'],
                catalogCoverage: 'all',
              },
            }
          : {
              toolName: 'workspai-report-outcome',
              input: {
                summary: 'I cannot reconstruct all commands.',
                nextSteps: ['Read the catalog again.'],
              },
            }
    ).enableAnswerDeliveryReview();
    const action = await adapter.next(context());
    expect(action.type).toBe('complete');
    if (action.type !== 'complete') throw new Error('Expected the available command inventory');
    for (const { command } of commands) expect(action.summary).toContain(`workspai ${command}`);
  });

  it('renders the observed command inventory if even the editor claims delivery without including it', async () => {
    const adapter = new ContractStudioAgentModelAdapter(
      'Send all commands',
      async (_prompt, request) =>
        request.tools[0].name === ANSWER_DELIVERY_TOOL
          ? {
              toolName: ANSWER_DELIVERY_TOOL,
              input: {
                answer: 'The full list will be in the final message.',
                delivered: true,
                missing: [],
                catalogCoverage: 'all',
              },
            }
          : {
              toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
              input: { summary: 'All 130 commands are available.' },
            }
    ).enableAnswerDeliveryReview();
    const action = await adapter.next(context());
    expect(action.type).toBe('complete');
    if (action.type !== 'complete') throw new Error('Expected the known inventory');
    for (const { command } of commands) expect(action.summary).toContain(`workspai ${command}`);
    expect(action.summary).not.toContain('will be');
  });

  it('retains confirmed entries and reports an incomplete outcome if the answer editor is unavailable', async () => {
    const adapter = new ContractStudioAgentModelAdapter(
      'Send the commands',
      async (_prompt, request) => {
        if (request.tools[0].name === ANSWER_DELIVERY_TOOL) throw new Error('Provider unavailable');
        return {
          toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
          input: { summary: 'The list will follow.' },
        };
      }
    ).enableAnswerDeliveryReview();
    const result = await adapter.next(context());
    expect(result.type).toBe('report');
    if (result.type !== 'report') throw new Error('Expected an honest partial result');
    expect(result.summary).toContain('130 of 130');
    for (const { command } of commands) expect(result.summary).toContain(`workspai ${command}`);
    expect(result.summary).not.toContain('The list will follow');
  });

  it('keeps earlier command pages after transient observations roll off and deduplicates re-reads', () => {
    const input = context();
    input.session.events = [
      {
        schemaVersion: 'workspai.studio-agent-event.v1',
        id: 'start',
        sessionId: input.session.id,
        sequence: 1,
        timestamp: new Date().toISOString(),
        type: 'request.started',
        requestId: 'current',
        data: {},
      },
      ...input.recentObservations!.map((observation, index) => ({
        schemaVersion: 'workspai.studio-agent-event.v1' as const,
        id: `tool-${index}`,
        sessionId: input.session.id,
        sequence: index + 2,
        timestamp: new Date().toISOString(),
        type: 'tool.completed' as const,
        requestId: 'current',
        data: { toolName: observation.toolName, output: observation.result.output },
      })),
    ];
    input.recentObservations = input.recentObservations!.slice(-1);
    expect(answerDeliveryEvidence(input).catalogs[0].observedCount).toBe(130);
  });

  it('does not add answer review to coding loops', async () => {
    const input = context();
    input.session.executionPolicy = resolveAssistantExecutionPolicy({
      selectedMode: 'agent',
      requestIntent: 'engineering-task',
    });
    const complete = vi.fn(async () => ({
      toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
      input: { summary: 'Implemented and tested.' },
    }));
    const adapter = new ContractStudioAgentModelAdapter(
      'Fix the service',
      complete
    ).enableAnswerDeliveryReview();
    expect((await adapter.next(input)).type).toBe('complete');
    expect(complete).toHaveBeenCalledOnce();
  });
});
