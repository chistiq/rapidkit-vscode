import { describe, expect, it } from 'vitest';
import {
  parseStudioImplementationPlan,
  renderStudioImplementationPlan,
} from '../core/studioImplementationPlan.js';
import { StudioAgentSession, type StudioAgentModelAction } from '../core/studioAgentSession.js';
import { StudioAgentToolRegistry } from '../core/studioAgentToolRegistry.js';
import {
  ContractStudioAgentModelAdapter,
  STUDIO_AGENT_COMPLETE_TOOL_NAME,
} from '../core/studioAgentModelProtocol.js';

const plan = {
  scope: {
    heading: '\u0645\u062d\u062f\u0648\u062f\u0647',
    body: '\u0627\u0641\u0632\u0648\u062f\u0646 \u062a\u0633\u062a',
  },
  evidence: { heading: '\u0634\u0648\u0627\u0647\u062f', body: '`src/app.ts`' },
  steps: {
    heading: '\u0645\u0631\u0627\u062d\u0644',
    body: '1. \u062a\u063a\u06cc\u06cc\u0631 \u0641\u0627\u06cc\u0644',
  },
  verification: { heading: '\u0628\u0631\u0631\u0633\u06cc', body: '`npm test`' },
  rollback: {
    heading: '\u0628\u0627\u0632\u06af\u0631\u062f\u0627\u0646\u06cc',
    body: '\u0628\u0627\u0632\u06af\u0631\u062f\u0627\u0646\u06cc \u062a\u0631\u0627\u06a9\u0646\u0634',
  },
  assumptions: {
    heading: '\u0641\u0631\u0636\u200c\u0647\u0627',
    body: '\u0648\u0627\u0628\u0633\u062a\u06af\u06cc\u200c\u0647\u0627 \u0646\u0635\u0628 \u0634\u062f\u0647\u200c\u0627\u0646\u062f',
  },
};

describe('Language-independent implementation plans', () => {
  it('renders Persian headings from validated data and rejects missing or oversized sections', () => {
    expect(parseStudioImplementationPlan(plan)).toEqual(plan);
    expect(renderStudioImplementationPlan(plan)).toContain(`## ${plan.scope.heading}`);
    expect(parseStudioImplementationPlan({ ...plan, rollback: undefined })).toBeUndefined();
    expect(
      parseStudioImplementationPlan({ ...plan, steps: { heading: 'Steps', body: ' ' } })
    ).toBeUndefined();
    expect(
      parseStudioImplementationPlan({
        ...plan,
        steps: { heading: 'Steps', body: 'x'.repeat(12001) },
      })
    ).toBeUndefined();
  });
  it('requires data in the model schema and preserves all localized sections', async () => {
    const session = new StudioAgentSession(
      { workspacePath: '/workspace', cardId: 'assistant:plan', assistantMode: 'plan' },
      { next: async () => ({ type: 'message', text: '' }) },
      new StudioAgentToolRegistry(),
      { save: async () => {} }
    ).snapshot();
    const adapter = new ContractStudioAgentModelAdapter('Plan tests', async (_prompt, request) => {
      const completion = request.tools.find(
        (tool) => tool.name === STUDIO_AGENT_COMPLETE_TOOL_NAME
      )!;
      expect(completion.inputSchema.required).toContain('plan');
      return {
        toolName: STUDIO_AGENT_COMPLETE_TOOL_NAME,
        input: { summary: 'Plan follows.', plan },
      };
    });
    const action = await adapter.next({ session, tools: [], steering: [] });
    expect(action).toMatchObject({
      type: 'complete',
      plan,
      summary: renderStudioImplementationPlan(plan),
    });
  });
  it('rejects English-keyword prose but completes a grounded Persian plan without mutation', async () => {
    const registry = new StudioAgentToolRegistry();
    registry.register({
      name: 'inspect',
      title: 'Inspect',
      risk: 'read',
      activity: 'inspect',
      execute: async () => ({ ok: true }),
    });
    const actions: StudioAgentModelAction[] = [
      { type: 'tool', toolName: 'inspect', input: {}, reason: 'Ground the plan' },
      { type: 'complete', summary: 'Scope\nEvidence\nSteps\nVerification\nRollback\nAssumptions' },
      { type: 'complete', summary: 'Plan follows.', plan },
    ];
    const session = new StudioAgentSession(
      {
        workspacePath: '/workspace',
        cardId: 'assistant:plan',
        assistantMode: 'plan',
        permissionLevel: 'default',
        workspaceTrusted: true,
        requiresVerifiedCompletion: false,
      },
      { next: async () => actions.shift()! },
      registry,
      { save: async () => {} }
    );
    const result = await session.run('Plan tests');
    expect(result.status).toBe('completed');
    expect(
      result.events.some(
        (event) =>
          event.type === 'model.checkpoint' &&
          String(event.data.summary).includes('structured plan')
      )
    ).toBe(true);
    expect(result.events.find((event) => event.type === 'session.completed')?.data).toMatchObject({
      plan,
      summary: renderStudioImplementationPlan(plan),
    });
    expect(result.events.some((event) => event.type === 'verify.completed')).toBe(false);
  });
});
