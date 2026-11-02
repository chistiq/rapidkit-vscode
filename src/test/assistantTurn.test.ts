import { describe, expect, it, vi } from 'vitest';
import { dispatchAssistantTurn } from '../core/assistantTurn.js';
import {
  ASSISTANT_INTENT_ROUTE_TOOL,
  type AssistantRequestIntent,
} from '../core/assistantIntentRouter.js';
import { resolveWorkspaiAssistantModeContract } from '../core/assistantModeContract.js';
import { StudioAgentSession } from '../core/studioAgentSession.js';
import {
  createStudioAgentWorkspaiToolRegistry,
  type StudioAgentWorkspaiToolHost,
} from '../core/studioAgentWorkspaiTools.js';

const completion = (intent: AssistantRequestIntent, answer = '') => ({
  type: 'tool' as const,
  toolName: ASSISTANT_INTENT_ROUTE_TOOL,
  input: {
    intent,
    confidence: 'high',
    normalizedRequest: 'Current user request',
    userResponse: answer,
    reason: 'Latest message semantics',
  },
});

describe('Assistant turn dispatch', () => {
  it('answers the reported conversation without ever starting workspace orchestration', async () => {
    const execute = vi.fn();
    const respond = vi.fn();
    const complete = vi
      .fn()
      .mockResolvedValueOnce(completion('conversation', 'Hi!'))
      .mockResolvedValueOnce(completion('conversation', 'Not much. How can I help?'))
      .mockResolvedValueOnce(
        completion('general-question', 'Workspai provides workspace intelligence.')
      );
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const task of ['hi', 'whats up?', 'tell me about workspai']) {
      await dispatchAssistantTurn({
        task,
        selectedMode: 'agent',
        hasProjectScope: true,
        history,
        complete,
        isCancelled: () => false,
        respond,
        suggest: vi.fn(),
        execute,
      });
      history.push(
        { role: 'user', content: task },
        { role: 'assistant', content: respond.mock.calls.at(-1)![0] }
      );
    }
    expect(complete).toHaveBeenCalledTimes(3);
    expect(respond.mock.calls.map(([answer]) => answer)).toEqual([
      'Hi!',
      'Not much. How can I help?',
      'Workspai provides workspace intelligence.',
    ]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('answers general questions without a selected workspace, in every selected mode', async () => {
    for (const selectedMode of ['ask', 'agent', 'plan', 'goal'] as const) {
      const execute = vi.fn();
      const respond = vi.fn();
      await dispatchAssistantTurn({
        task: 'What is Workspai?',
        selectedMode,
        hasProjectScope: false,
        complete: async () =>
          completion('general-question', 'Workspace intelligence for developers and agents.'),
        isCancelled: () => false,
        respond,
        suggest: vi.fn(),
        execute,
      });
      expect(respond).toHaveBeenCalledWith('Workspace intelligence for developers and agents.');
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it.each([false, true])(
    'answers repository questions with inspection=%s without Goal, ledger or verification',
    async (needsInspection) => {
      const inspectEvidence = vi.fn(async () => ({
        ok: true,
        output: { summary: 'NestJS project product-api.' },
      }));
      const verify = vi.fn();
      const execute = vi.fn(async (_route, policy) => {
        const mode = resolveWorkspaiAssistantModeContract(policy.toolMode);
        const registry = createStudioAgentWorkspaiToolRegistry({
          host: { inspect: inspectEvidence, verify } as unknown as StudioAgentWorkspaiToolHost,
          cardId: 'assistant:agent:evidence-answer',
          assistantMode: mode.id,
        });
        for (const name of [
          'verify-goal',
          'verify-blocker',
          'update-task-ledger',
          'run-workspace-command',
          'apply-workspace-patch',
        ]) {
          expect(registry.get(name), name).toBeUndefined();
        }
        let turn = 0;
        const session = new StudioAgentSession(
          {
            id: 'informational-agent',
            workspacePath: '/workspace',
            cardId: 'assistant:agent:evidence-answer',
            assistantMode: 'agent',
            executionPolicy: policy,
            permissionLevel: mode.permissionLevel,
            requiresVerifiedCompletion: mode.requiresVerifiedCompletion,
            workspaceTrusted: true,
          },
          {
            async next() {
              return needsInspection && turn++ === 0
                ? {
                    type: 'tool',
                    toolName: 'inspect-evidence',
                    input: { paths: ['.workspai/project.json'] },
                    reason: 'Read the relevant project identity.',
                  }
                : { type: 'complete', summary: 'product-api is a NestJS service.' };
            },
          },
          registry,
          {
            async save() {},
            async load() {
              return undefined;
            },
          }
        );
        const result = await session.run('Explain the selected project.');
        expect(result.status).toBe('completed');
        expect(result.goal).toBeUndefined();
        expect(result.governedGoal).toBeUndefined();
        expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
        expect(result.assistantMode).toBe('agent');
      });
      await dispatchAssistantTurn({
        task: 'Explain the selected project.',
        selectedMode: 'agent',
        hasProjectScope: true,
        complete: async () => completion('question'),
        isCancelled: () => false,
        respond: vi.fn(),
        suggest: vi.fn(),
        execute,
      });
      expect(execute).toHaveBeenCalledOnce();
      expect(inspectEvidence).toHaveBeenCalledTimes(needsInspection ? 1 : 0);
      expect(verify).not.toHaveBeenCalled();
    }
  );

  it('reevaluates a question after a change request while preserving engineering authority', async () => {
    const execute = vi.fn();
    const complete = vi
      .fn()
      .mockResolvedValueOnce(completion('engineering-task'))
      .mockResolvedValueOnce(completion('question'));
    for (const task of ['Fix authentication', 'Why does this function return null?']) {
      await dispatchAssistantTurn({
        task,
        selectedMode: 'agent',
        hasProjectScope: true,
        complete,
        history: [{ role: 'user', content: 'Fix authentication' }],
        isCancelled: () => false,
        respond: vi.fn(),
        suggest: vi.fn(),
        execute,
      });
    }
    expect(execute.mock.calls[0][1]).toMatchObject({
      profile: 'autonomous-change',
      toolMode: 'agent',
    });
    expect(execute.mock.calls[1][1]).toMatchObject({
      profile: 'evidence-answer',
      toolMode: 'ask',
      selectedMode: 'agent',
    });
  });

  it('does not execute or publish a late routing result after cancellation', async () => {
    const execute = vi.fn();
    const respond = vi.fn();
    await dispatchAssistantTurn({
      task: 'hi',
      selectedMode: 'agent',
      hasProjectScope: false,
      complete: async () => completion('conversation', 'Hi!'),
      isCancelled: () => true,
      respond,
      suggest: vi.fn(),
      execute,
    });
    expect(respond).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
