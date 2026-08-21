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

  it('routes before Goal planning and removes implicit Agent-to-Goal promotion', () => {
    const provider = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/webviews/actionsWebviewProvider.ts'),
      'utf8'
    );
    const unifiedStart = provider.indexOf('private async _runUnifiedAssistantSession');
    const unifiedEnd = provider.indexOf('private async _runAutonomousStudioAgent', unifiedStart);
    const unified = provider.slice(unifiedStart, unifiedEnd);

    expect(unified.indexOf('await routeAssistantIntent')).toBeGreaterThanOrEqual(0);
    expect(unified.indexOf('await routeAssistantIntent')).toBeLessThan(
      unified.indexOf('await prepareGovernedGoalSession')
    );
    expect(unified).not.toContain('inferVerifiedGoalIntent');
    expect(unified).toContain("input.assistantMode === 'goal' && !governedGoal");
    expect(unified).toContain('resolveAssistantExecutionPolicy');
    expect(unified).toContain("persisted.cardId === 'assistant:agent:question'");
    expect(unified).toContain('executionPolicy.toolMode');
    expect(unified).toContain('executionPolicy.profile');
    expect(unified).toContain('assistantMode: mode.id');
    expect(unified).toContain('executionPolicy,');
    expect(unified).toContain("'sidebarStudioModeSuggestion'");
    expect(provider).toContain('isGovernedGoalSetupCancelledError(error)');
    expect(provider).toContain("answer: 'Goal setup cancelled.'");
  });
});
