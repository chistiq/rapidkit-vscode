import { describe, expect, it, vi } from 'vitest';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_REPORT_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';
import { StudioAgentSession, type StudioAgentModelContext } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';

function snapshot() {
  return new StudioAgentSession(
    {
      workspacePath: '/workspace',
      cardId: 'assistant:agent',
      assistantMode: 'agent',
      executionAuthority: 'workspace',
      permissionLevel: 'default',
      workspaceTrusted: true,
      requiresVerifiedCompletion: false,
    },
    { next: async () => ({ type: 'complete', summary: 'unused' }) },
    new StudioAgentToolRegistry(),
    { save: async () => {} }
  ).snapshot();
}

describe('Ordinary Agent execution recovery', () => {
  it('keeps previous tool results without replaying a full control prompt after every tool call', async () => {
    let turn = 0;
    const adapter = new ContractStudioAgentModelAdapter(
      'Create a sample project using the delegated defaults',
      async (_prompt, request) => {
        const olderUserMessages = request.messages
          .slice(0, -1)
          .filter((message) => 'content' in message && message.role === 'user');
        for (const message of olderUserMessages)
          if ('content' in message)
            expect(message.content).not.toContain('You are Workspai Assistant operating');
        const toolResults = request.messages.filter((message) => 'toolResult' in message);
        for (const message of toolResults)
          if ('toolResult' in message) {
            expect(message.toolResult.content).not.toContain('recentObservations');
            expect(message.toolResult.content).toContain('retained-source-proof');
          }
        return {
          callId: `read-${turn++}`,
          toolName: 'inspect-source',
          input: { paths: ['AGENTS.md'] },
        };
      }
    );
    const context: StudioAgentModelContext = {
      session: snapshot(),
      tools: [],
      steering: [],
      latestObservation: {
        ok: true,
        output: [{ path: 'AGENTS.md', content: 'retained-source-proof' }],
      },
    };
    for (let index = 0; index < 6; index++) await adapter.next(context);
    expect(turn).toBe(6);
  });

  it('uses the reserved final call for concrete findings rather than ending a budget-limited task with only controller text', async () => {
    let calls = 0;
    const completion = vi.fn(async (_prompt, request) => {
      if (calls++ === 0)
        return {
          toolName: 'inspect-source',
          input: { paths: ['AGENTS.md'] },
          resolution: {
            provider: 'fixture',
            modelId: 'fixture',
            fallback: false,
            attempts: 1,
            inputTokens: 1_000_001,
            outputTokens: 1,
            tokenUsageSource: 'estimated' as const,
          },
        };
      expect(request.tools.map((tool) => tool.name)).toEqual([STUDIO_AGENT_REPORT_TOOL_NAME]);
      expect(request.messages).toHaveLength(1);
      return {
        toolName: STUDIO_AGENT_REPORT_TOOL_NAME,
        input: {
          summary:
            'No project was created. I inspected the repository rules but did not run the scaffolding command.',
          nextSteps: [
            'Read the supported create syntax and scaffold a sample in an unused directory.',
          ],
        },
      };
    });
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-source',
      title: 'Read rules',
      description: 'Read rules',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({
        ok: true,
        output: [{ path: 'AGENTS.md', content: 'Repository rules' }],
      }),
    });
    const session = new StudioAgentSession(
      {
        workspacePath: '/workspace',
        cardId: 'assistant:agent',
        assistantMode: 'agent',
        executionAuthority: 'workspace',
        permissionLevel: 'default',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      new ContractStudioAgentModelAdapter('Create a sample project', completion),
      registry,
      { save: async () => {} }
    );
    const result = await session.run('Create a sample project');
    expect(result.status).toBe('failed');
    expect(completion).toHaveBeenCalledTimes(2);
    const failure = result.events.find((event) => event.type === 'session.failed');
    expect(failure?.data.terminalReason).toBe('incomplete-outcome');
    expect(failure?.data.answer).toContain('No project was created.');
    expect(failure?.data.answer).toContain('scaffold a sample in an unused directory');
    expect(result.events.some((event) => event.type === 'session.completed')).toBe(false);
  });
});
