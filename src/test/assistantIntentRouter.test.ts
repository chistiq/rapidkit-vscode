import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  ASSISTANT_INTENT_ROUTE_TOOL,
  buildAssistantIntentRoutingPrompt,
  parseAssistantIntentRoute,
  routeAssistantIntent,
} from '../core/assistantIntentRouter.js';

describe('Assistant intent router', () => {
  it('retains distinct requested outcomes without requiring an execution plan or another routing call', async () => {
    const complete = vi.fn(async () => ({
      type: 'tool' as const,
      toolName: ASSISTANT_INTENT_ROUTE_TOOL,
      input: {
        intent: 'engineering-task',
        confidence: 'high',
        normalizedRequest: 'Fix setup and lint',
        userResponse: '',
        reason: 'Two failures',
        outcomes: ['Fix setup tool failures', 'Fix lint error', 'Fix lint error', '', null],
      },
    }));
    const route = await routeAssistantIntent({
      task: 'Fix setup and lint',
      selectedMode: 'agent',
      hasProjectScope: true,
      complete,
    });
    expect(route.outcomes).toEqual(['Fix setup tool failures', 'Fix lint error']);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(
      parseAssistantIntentRoute({ ...route, intent: 'conversation', outcomes: ['invented task'] })
        ?.outcomes
    ).toBeUndefined();
  });

  it('keeps the final failure of long logs in routing while explicitly bounding an oversized request', () => {
    for (const length of [6_000, 60_000]) {
      const prompt = buildAssistantIntentRoutingPrompt({
        task: `Fix setup\n${'log '.repeat(length)}\nFINAL FAILURE: tool invocation failed`,
        selectedMode: 'agent',
        hasProjectScope: true,
      });
      expect(prompt).toContain('Fix setup');
      expect(prompt).toContain('FINAL FAILURE: tool invocation failed');
      expect(prompt.length).toBeLessThan(50_000);
    }
  });
  it('retains independent-workspace intent as structured policy input', () => {
    expect(
      parseAssistantIntentRoute({
        intent: 'engineering-task',
        confidence: 'high',
        normalizedRequest: 'Create a workspace and shop projects',
        userResponse: '',
        reason: 'Explicit new workspace',
        workspaceIntent: 'create-new',
      })
    ).toMatchObject({ workspaceIntent: 'create-new' });
  });
  it('forces a tool-free semantic decision before orchestration', () => {
    const prompt = buildAssistantIntentRoutingPrompt({
      task: 'hi',
      selectedMode: 'goal',
      hasProjectScope: false,
    });

    expect(prompt).toContain('before any workspace tool, Goal command, scope selector');
    expect(prompt).toContain('A greeting such as "hi" is conversation, never a Goal.');
    expect(prompt).toContain('either a clear engineering-task or a durable goal');
    expect(prompt).toContain('Mode selection is authoritative');
  });

  it('returns a conversational model response without starting a session', async () => {
    const complete = vi.fn(async () => ({
      type: 'tool' as const,
      toolName: ASSISTANT_INTENT_ROUTE_TOOL,
      input: {
        intent: 'conversation',
        confidence: 'high',
        normalizedRequest: 'Say hello.',
        userResponse: 'Hi! What would you like to build or investigate?',
        reason: 'The message is a greeting.',
      },
    }));

    const route = await routeAssistantIntent({
      task: 'hi',
      selectedMode: 'agent',
      hasProjectScope: false,
      complete,
    });

    expect(route.intent).toBe('conversation');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('keeps a goal-like request in Agent mode as an Agent task', async () => {
    const route = await routeAssistantIntent({
      task: 'Raise test coverage to 85%.',
      selectedMode: 'agent',
      hasProjectScope: true,
      complete: async () => ({
        type: 'tool',
        toolName: ASSISTANT_INTENT_ROUTE_TOOL,
        input: {
          intent: 'goal',
          confidence: 'high',
          normalizedRequest: 'Raise test coverage to 85%.',
          userResponse: '',
          reason: 'The request describes a durable measurable outcome.',
        },
      }),
    });

    expect(route.intent).toBe('goal');
  });

  it('does not start Goal planning for a question while Goal mode is selected', () => {
    const route = parseAssistantIntentRoute({
      intent: 'question',
      confidence: 'high',
      normalizedRequest: 'Explain the current coverage.',
      userResponse:
        'Goal mode tracks durable outcomes. Switch to Ask, or describe the target outcome.',
      reason: 'The user asked for information, not a durable outcome.',
    });

    expect(route).not.toBeNull();
  });

  it('accepts structured JSON from text-only routing transports without printing control JSON', async () => {
    const result = await routeAssistantIntent({
      task: 'Search the web for the CLI command',
      selectedMode: 'agent',
      hasProjectScope: false,
      complete: async () => ({
        type: 'text',
        text: JSON.stringify({
          intent: 'research',
          confidence: 'high',
          normalizedRequest: 'Find the Workspai CLI create command.',
          userResponse: '',
          reason: 'Documentation lookup.',
        }),
      }),
    });
    expect(result).toMatchObject({ intent: 'research', userResponse: '' });
  });
  it('does not present an unstructured routing refusal as proof that search capabilities are unavailable', async () => {
    const result = await routeAssistantIntent({
      task: 'Search the internet',
      selectedMode: 'agent',
      hasProjectScope: false,
      complete: async () => ({ type: 'text', text: 'I do not have live web access.' }),
    });
    expect(result.intent).toBe('clarification');
    expect(result.userResponse).toContain('did not return a usable request route');
    expect(result.userResponse).not.toContain('do not have live web access');
  });

  it('fails closed when a provider ignores the structured routing contract', async () => {
    const route = await routeAssistantIntent({
      task: 'Do something useful.',
      selectedMode: 'goal',
      hasProjectScope: false,
      complete: async () => ({ type: 'text', text: '' }),
    });

    expect(route).toMatchObject({ intent: 'clarification', confidence: 'low' });
    expect(route.userResponse).toContain('durable engineering outcome');
  });

  it('rejects malformed or unbounded model routes', () => {
    expect(
      parseAssistantIntentRoute({
        intent: 'goal',
        confidence: 'high',
        normalizedRequest: '',
        userResponse: '',
        reason: 'Missing normalized request.',
      })
    ).toBeNull();
  });

  it('routes each turn before scope resolution and exposes only the turn-specific capability set', () => {
    const provider = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/webviews/actionsWebviewProvider.ts'),
      'utf8'
    );
    const start = provider.indexOf('private async _runInlineStudioQuery');
    const end = provider.indexOf('private async _reconcileSidebarStudioSessions', start);
    const query = provider.slice(start, end);
    expect(query.indexOf('await dispatchAssistantTurn')).toBeLessThan(
      query.indexOf('await resolveSidebarChatContext')
    );
    expect(query).not.toContain('?? this._activeBlockerHandoff');
    const unifiedStart = provider.indexOf('private async _runUnifiedAssistantSession');
    const unifiedEnd = provider.indexOf('private async _runAutonomousStudioAgent', unifiedStart);
    const unified = provider.slice(unifiedStart, unifiedEnd);
    expect(unified).toContain('input.intentRoute.continuesPreviousTask === true');
    expect(unified).toContain('mode.canMutateWorkspace && !nativeAgent && !governedGoal');
    expect(unified).toContain('new StudioProofCarryingChangeSession');
    expect(unified).toContain('proofCarryingChange.verifyIfStarted(true)');
    expect(unified).toContain('assistantMode: mode.id');
    expect(unified).toContain('requiresVerifiedCompletion: mode.requiresVerifiedCompletion');
    expect(unified).toContain('executionPolicy,');
  });
});
