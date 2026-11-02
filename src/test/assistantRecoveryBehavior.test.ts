import { describe, expect, it, vi } from 'vitest';
import { resolveAssistantExecutionPolicy } from '../core/assistantExecutionPolicy.js';
import type { StudioAgentPersistedSession } from '../core/studioAgentEvents.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_REPORT_TOOL_NAME,
  parseStudioAgentModelAction,
} from '../core/studioAgentModelProtocol.js';
import {
  StudioAgentSession,
  type StudioAgentModelAction,
  type StudioAgentSessionOptions,
} from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

const options: StudioAgentSessionOptions = {
  workspacePath: '/workspace',
  cardId: 'assistant:agent',
  assistantMode: 'agent',
  permissionLevel: 'autopilot',
  workspaceTrusted: true,
  requiresVerifiedCompletion: true,
};
const store = () => ({ save: vi.fn(async (_session: StudioAgentPersistedSession) => {}) });
const report: StudioAgentModelAction = {
  type: 'report',
  summary: 'The service requires a credential that is unavailable in this environment.',
  nextSteps: ['Configure the service credential, then continue the failed check.'],
};

function sequence(actions: StudioAgentModelAction[]) {
  let index = 0;
  return {
    next: vi.fn(async () => {
      const action = actions[index++];
      if (!action) throw new Error('Unexpected model turn');
      return action;
    }),
  };
}

describe('Assistant recovery and terminal answers', () => {
  it('reserves the last research decision for an answer and retains successful help through repeated 404s', async () => {
    const registry = new StudioAgentToolRegistry();
    const help = 'workspai create, workspai list, workspai doctor';
    registry.register({
      name: 'inspect-cli-help',
      title: 'CLI help',
      description: 'Installed CLI help',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({ ok: true, output: { stdout: help } }),
    });
    const fetch = vi.fn(async () => ({ ok: false, error: 'HTTP 404 Not Found' }));
    registry.register({
      name: 'fetch-public-web',
      title: 'Fetch docs',
      description: 'Fetch a public page',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: fetch,
    });
    let decisions = 0;
    const adapter = new ContractStudioAgentModelAdapter(
      'can you send me all workspai commands?',
      async (prompt, request) => {
        decisions += 1;
        if (decisions === 1) return { toolName: 'inspect-cli-help', input: {} };
        if (decisions < 12) {
          return {
            toolName: 'fetch-public-web',
            input: { url: `https://example.test/missing-${decisions}` },
          };
        }
        expect(prompt).toContain('Final answer now');
        expect(prompt).toContain(help);
        expect(prompt).toContain('HTTP 404 Not Found');
        expect(request.tools.map((tool) => tool.name)).toEqual(['workspai-complete']);
        return {
          type: 'text',
          text: `Installed help lists: ${help}. I could not confirm the full subcommand list because the documentation returned 404.`,
        };
      }
    );
    const result = await new StudioAgentSession(
      {
        ...options,
        executionPolicy: resolveAssistantExecutionPolicy({
          selectedMode: 'agent',
          requestIntent: 'research',
        }),
        requiresVerifiedCompletion: false,
      },
      adapter,
      registry,
      store()
    ).run('can you send me all workspai commands?');
    expect(
      result.status,
      JSON.stringify(result.events.filter((event) => event.type === 'session.failed'))
    ).toBe('completed');
    expect(decisions).toBe(12);
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(
      result.events.find((event) => event.type === 'session.completed')?.data.summary
    ).toContain(help);
    expect(result.events.some((event) => event.type === 'session.failed')).toBe(false);
    expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
  });

  it('accepts installed CLI help as evidence in Ask without a web or source inspection', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect-cli-help',
      title: 'CLI help',
      description: 'CLI help',
      inputSchema: {},
      activity: 'inspect',
      risk: 'read',
      execute: async () => ({ ok: true, output: { stdout: 'create: Create a project' } }),
    });
    const result = await new StudioAgentSession(
      { ...options, assistantMode: 'ask', requiresVerifiedCompletion: false },
      sequence([
        {
          type: 'tool',
          toolName: 'inspect-cli-help',
          input: {},
          reason: 'Read installed commands',
        },
        { type: 'complete', summary: 'Installed help lists create for creating projects.' },
      ]),
      registry,
      store()
    ).run('List CLI commands');
    expect(result.status).toBe('completed');
  });

  it('keeps a partial question answer without mutation or verification warnings', async () => {
    const result = await new StudioAgentSession(
      { ...options, assistantMode: 'ask', requiresVerifiedCompletion: false },
      sequence([
        {
          type: 'report',
          summary: 'Confirmed: create. The full list is unavailable.',
          nextSteps: ['Read installed CLI help for this version.'],
        },
      ]),
      new StudioAgentToolRegistry(),
      store()
    ).run('List every command');
    const failure = result.events.find((event) => event.type === 'session.failed');
    expect(failure?.data.terminalReason).toBe('question-incomplete');
    expect(failure?.data.answer).toContain('Confirmed: create');
    expect(failure?.data.answer).not.toMatch(/verification|changes|repair/i);
  });

  it('reports an incomplete outcome without clearing durable verification obligations', async () => {
    const initial = new StudioAgentSession(
      options,
      sequence([]),
      new StudioAgentToolRegistry(),
      store()
    ).snapshot();
    initial.completionObligations = {
      schemaVersion: 'workspai.studio-completion-obligations.v1',
      latestSourceMutationSequence: 1,
      freshVerificationRequiredAfterSequence: 1,
    };
    initial.taskLedger = {
      schemaVersion: 'workspai.studio-task-ledger.v1',
      objective: 'Update the service',
      updatedAt: initial.updatedAt,
      updatedSequence: 1,
      steps: [{ id: 'check', description: 'Verify the service', status: 'blocked' }],
    };
    const saved = store();
    const session = new StudioAgentSession(
      { ...options, restoredSession: initial },
      sequence([report]),
      new StudioAgentToolRegistry(),
      saved
    );
    const result = await session.run('Continue the service update');
    expect(result.status).toBe('failed');
    expect(result.completionObligations).toEqual(initial.completionObligations);
    expect(result.taskLedger?.steps[0].status).toBe('blocked');
    expect(result.events.some((event) => event.type === 'session.completed')).toBe(false);
    const failure = result.events.find((event) => event.type === 'session.failed');
    expect(failure?.data).toMatchObject({
      terminalReason: 'incomplete-outcome',
      answer: expect.stringContaining('Configure the service credential'),
    });
    expect(saved.save.mock.calls.at(-1)?.[0].events).toContainEqual(failure);
  });

  it('returns a useful durable answer when the provider fails before its first tool call', async () => {
    const session = new StudioAgentSession(
      options,
      {
        next: async () => {
          throw new Error('AI provider unavailable: connection refused');
        },
      },
      new StudioAgentToolRegistry(),
      store()
    );
    const result = await session.run('Implement the feature');
    const failure = result.events.find((event) => event.type === 'session.failed');
    expect(result.status).toBe('failed');
    expect(failure?.data.answer).toContain('connection refused');
    expect(failure?.data.answer).toContain('No verified completion is claimed');
    expect(failure?.data.answer).toContain('resume');
  });

  it('allows a different tool after a failed capability and accepts a normal text answer to a question', async () => {
    const invokeHostTool = vi.fn(async () => ({
      ok: true,
      output: { text: 'The service listens on port 3000.' },
    }));
    const host = {
      inspect: vi.fn(async () => ({ ok: false, error: 'Source provider unavailable' })),
      listHostTools: async () => ({
        ok: true,
        output: { tools: [{ name: 'mcp.read-service', readLike: true }] },
      }),
      invokeHostTool,
    } as unknown as StudioAgentWorkspaiToolHost;
    const registry = createStudioAgentWorkspaiToolRegistry({
      host,
      cardId: 'assistant:agent',
      assistantMode: 'ask',
    });
    let turn = 0;
    const adapter = new ContractStudioAgentModelAdapter('Which port is used?', async () => {
      turn += 1;
      if (turn === 1) return { toolName: 'inspect-source', input: { paths: ['server.ts'] } };
      if (turn === 2) return { toolName: 'invoke-host-tool', input: { name: 'mcp.read-service' } };
      return { type: 'text', text: 'The service listens on port 3000.' };
    });
    const result = await new StudioAgentSession(
      {
        ...options,
        executionPolicy: resolveAssistantExecutionPolicy({
          selectedMode: 'agent',
          requestIntent: 'question',
        }),
        requiresVerifiedCompletion: false,
      },
      adapter,
      registry,
      store()
    ).run('Which port is used?');
    expect(result.status).toBe('completed');
    expect(invokeHostTool).toHaveBeenCalledOnce();
    expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
    expect(result.events.find((event) => event.type === 'session.completed')?.data.summary).toBe(
      'The service listens on port 3000.'
    );
  });

  it('can ask for missing input after a mutation without losing its verification obligations', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'apply-workspace-patch',
      title: 'Apply',
      description: 'Apply',
      inputSchema: {},
      activity: 'change',
      risk: 'safe-write',
      execute: async () => ({
        ok: true,
        changed: true,
        output: {
          changedPaths: ['service.ts'],
          transaction: {
            schemaVersion: 'workspai.workspace-repair-transaction.v1',
            transactionId: 'repair-test',
            state: 'closed',
            verification: {
              status: 'passed',
              targetStatus: 'passed',
              workspaceStatus: 'passed',
              remainingActionIds: [],
              summary: 'Passed',
            },
          },
        },
      }),
    });
    const session = new StudioAgentSession(
      options,
      sequence([
        {
          type: 'tool',
          toolName: 'apply-workspace-patch',
          input: {},
          reason: 'Update the service',
        },
        {
          type: 'input',
          question: 'Which environment credential should the integration use?',
          reason: 'The test service requires credentials.',
        },
        report,
      ]),
      registry,
      store()
    );
    session.onEvent((event) => {
      if (event.type === 'session.status' && event.data.status === 'waiting-input')
        session.steer('Credentials are not available here.');
    });
    const result = await session.run('Update the service');
    expect(result.status).toBe('failed');
    expect(result.events.some((event) => event.type === 'request.steered')).toBe(true);
    expect(result.completionObligations?.latestSourceMutationSequence).toBeDefined();
    expect(result.events.some((event) => event.type === 'session.completed')).toBe(false);
  });

  it.each(['```typescript\nconst port = 3000;\n```', '{"port":3000}'])(
    'accepts a read-only answer containing code or data: %s',
    async (text) => {
      const context = {
        session: new StudioAgentSession(
          { ...options, assistantMode: 'ask' },
          sequence([]),
          new StudioAgentToolRegistry(),
          store()
        ).snapshot(),
        tools: [],
        steering: [],
      };
      const adapter = new ContractStudioAgentModelAdapter(
        'Show the port configuration',
        async () => ({ type: 'text', text })
      );
      await expect(adapter.next(context)).resolves.toEqual({ type: 'complete', summary: text });
    }
  );

  it('retains an explanatory terminal answer when the user cancels during a provider request', async () => {
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const session = new StudioAgentSession(
      options,
      {
        next: () => {
          started();
          return new Promise(() => {});
        },
      },
      new StudioAgentToolRegistry(),
      store()
    );
    const run = session.run('Implement the feature');
    await waiting;
    session.cancel();
    const result = await run;
    expect(result.status).toBe('cancelled');
    expect(
      result.events.find((event) => event.type === 'session.cancelled')?.data.answer
    ).toContain('This request was cancelled');
  });

  it('supports native and JSON incomplete reports and rejects missing actionable next steps', async () => {
    const context = {
      session: new StudioAgentSession(
        options,
        sequence([]),
        new StudioAgentToolRegistry(),
        store()
      ).snapshot(),
      tools: [],
      steering: [],
    };
    const adapter = new ContractStudioAgentModelAdapter('Implement feature', async () => ({
      toolName: STUDIO_AGENT_REPORT_TOOL_NAME,
      input: { summary: report.summary, nextSteps: report.nextSteps },
    }));
    await expect(adapter.next(context)).resolves.toEqual(report);
    expect(
      parseStudioAgentModelAction({
        text: JSON.stringify({
          schemaVersion: 'workspai.studio-agent-model-action.v1',
          action: 'report',
          summary: 'Blocked',
          nextSteps: [],
        }),
        allowedTools: [],
      }).type
    ).toBe('message');
  });
});
