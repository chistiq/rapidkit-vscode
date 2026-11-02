import { describe, expect, it } from 'vitest';

import {
  buildAssistantPlanAgentHandoff,
  parseAssistantExecutionPolicy,
  resolveAssistantExecutionPolicy,
} from '../core/assistantExecutionPolicy.js';

describe('Assistant execution policy', () => {
  it.each([
    ['agent', 'question', 'evidence-answer', 'ask'],
    ['agent', 'engineering-task', 'autonomous-change', 'agent'],
    ['agent', 'goal', 'autonomous-change', 'agent'],
    ['ask', 'question', 'evidence-answer', 'ask'],
    ['plan', 'engineering-task', 'implementation-plan', 'plan'],
    ['goal', 'engineering-task', 'governed-goal', 'goal'],
    ['goal', 'goal', 'governed-goal', 'goal'],
    ['goal', 'question', 'evidence-answer', 'ask'],
  ] as const)(
    'maps %s + %s to %s with %s tools',
    (selectedMode, requestIntent, profile, toolMode) => {
      expect(resolveAssistantExecutionPolicy({ selectedMode, requestIntent })).toMatchObject({
        selectedMode,
        requestIntent,
        profile,
        toolMode,
      });
    }
  );

  it('never escalates Ask into write access without a suggestion', () => {
    const policy = resolveAssistantExecutionPolicy({
      selectedMode: 'ask',
      requestIntent: 'engineering-task',
    });

    expect(policy).toMatchObject({
      profile: 'direct-response',
      toolMode: 'ask',
      suggestion: { mode: 'agent', label: 'Continue in Agent' },
    });
  });

  it('treats any clear engineering task in explicit Goal mode as a governed Goal', () => {
    expect(
      resolveAssistantExecutionPolicy({ selectedMode: 'goal', requestIntent: 'engineering-task' })
    ).toMatchObject({ profile: 'governed-goal', toolMode: 'goal' });
  });

  it('keeps Plan read-only and offers an explicit transition after planning', () => {
    expect(
      resolveAssistantExecutionPolicy({ selectedMode: 'plan', requestIntent: 'engineering-task' })
    ).toMatchObject({
      profile: 'implementation-plan',
      toolMode: 'plan',
      suggestion: { mode: 'agent', label: 'Run with Agent' },
    });
  });

  it('keeps casual messages outside every execution loop', () => {
    for (const selectedMode of ['agent', 'ask', 'plan', 'goal'] as const) {
      expect(
        resolveAssistantExecutionPolicy({ selectedMode, requestIntent: 'conversation' }).profile
      ).toBe('direct-response');
    }
  });

  it('fails closed before tools when a mutating intent is not high confidence', () => {
    const policy = resolveAssistantExecutionPolicy({
      selectedMode: 'agent',
      requestIntent: 'engineering-task',
      routeConfidence: 'medium',
    });
    expect(policy).toMatchObject({
      profile: 'direct-response',
      toolMode: 'agent',
      routeConfidence: 'medium',
    });
    expect(policy.suggestion).toBeUndefined();
  });

  it('rejects a legacy Agent question policy that exposes mutation tools', () => {
    expect(
      parseAssistantExecutionPolicy(
        {
          schemaVersion: 'workspai.assistant-execution-policy.v1',
          selectedMode: 'agent',
          requestIntent: 'question',
          routeConfidence: 'high',
          profile: 'evidence-answer',
          toolMode: 'agent',
        },
        'agent'
      )
    ).toBeNull();
  });

  it('carries a completed Plan into the explicit Agent transition without granting authority', () => {
    const handoff = buildAssistantPlanAgentHandoff({
      request: 'Add caching to the API',
      plan: '## Scope\nAPI only\n\n## Verification\nRun API tests',
    });

    expect(handoff).toContain('user-approved Workspai Plan');
    expect(handoff).toContain('Add caching to the API');
    expect(handoff).toContain('Run API tests');
    expect(handoff).toContain('re-inspect relevant evidence and source before mutation');
  });
});
