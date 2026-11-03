import { describe, expect, it, vi } from 'vitest';

import {
  buildCreateIntentRoutingPrompt,
  CREATE_INTENT_ROUTE_TOOL,
  parseCreateIntentRoute,
  routeCreateIntent,
} from '../core/createIntentRouter.js';

describe('Create intent router', () => {
  it('grounds the model in the Create tab and Workspai architecture before planning', () => {
    const prompt = buildCreateIntentRoutingPrompt({
      request: 'Build a billing service.',
      selectedTarget: 'project',
      workspaceName: 'commerce',
      projectName: 'storefront',
      stackFocus: 'Backend API',
    });

    expect(prompt).toContain('intent and navigation router for the Workspai Create tab');
    expect(prompt).toContain('one canonical workspace owns registered projects');
    expect(prompt).toContain('active canonical workspace explicitly selected by the user');
    expect(prompt).toContain('Never silently fall back to another or default workspace');
    expect(prompt).toContain('Arbitrary edits to existing source belong in Assistant Agent');
    expect(prompt).toContain('canonical capability contract:');
    expect(prompt).toContain('nextjs');
    expect(prompt).toContain('vscode-extension');
    expect(prompt).toContain('Selected target: project');
    expect(prompt).toContain('A creation plan is always previewed');
    expect(prompt).toContain('Never convert a greeting');
    expect(prompt).toContain('Intent routing is not solution discovery');
    expect(prompt).toContain('Never repeat a clarification');
  });

  it('allows only a high-confidence create route to reach planning', async () => {
    const complete = vi.fn(async () => ({
      type: 'tool' as const,
      toolName: CREATE_INTENT_ROUTE_TOOL,
      input: {
        intent: 'create',
        confidence: 'high',
        normalizedRequest: 'Create a NestJS billing service in the selected workspace.',
        userResponse: '',
        reason: 'The user explicitly requested a new service.',
        recommendedAction: 'none',
      },
    }));

    const route = await routeCreateIntent({
      request: 'Build a NestJS billing service.',
      selectedTarget: 'project',
      workspaceName: 'commerce',
      complete,
    });

    expect(route).toMatchObject({ intent: 'create', confidence: 'high' });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      '\u062f\u0631 \u06cc\u06a9 \u0648\u0631\u06a9 \u0627\u0633\u067e\u06cc\u0633 \u062c\u062f\u0627 \u06cc\u06a9 \u067e\u0631\u0648\u0698\u0647 \u0628\u0631\u0627\u06cc \u0648\u0628\u0633\u0627\u06cc\u062a \u0634\u062e\u0635\u06cc \u0645\u06cc\u062e\u0627\u0645',
      'project',
      'workspace',
    ],
    ['Create a personal website in a separate workspace.', 'project', 'workspace'],
    [
      '\u0628\u0647 \u0647\u0645\u06cc\u0646 \u0648\u0631\u06a9 \u0627\u0633\u067e\u06cc\u0633 \u0641\u0639\u0627\u0644 \u06cc\u06a9 \u0633\u0627\u06cc\u062a \u0634\u062e\u0635\u06cc \u0627\u0636\u0627\u0641\u0647 \u06a9\u0646',
      'workspace',
      'project',
    ],
  ] as const)(
    'lets explicit destination intent override the selector: %s',
    async (request, selectedTarget, creationTarget) => {
      const route = await routeCreateIntent({
        request,
        selectedTarget,
        workspaceName: 'focusboard-wsp',
        complete: async ({ prompt, toolSchema }) => {
          expect(prompt).toContain('Explicit user intent takes precedence over the selector');
          expect(toolSchema.required).toContain('creationTarget');
          return {
            type: 'tool',
            toolName: CREATE_INTENT_ROUTE_TOOL,
            input: {
              intent: 'create',
              confidence: 'high',
              normalizedRequest: request,
              userResponse: '',
              reason: 'Explicit destination supplied by the user.',
              recommendedAction: 'none',
              creationTarget,
            },
          };
        },
      });
      expect(route).toMatchObject({ intent: 'create', creationTarget, normalizedRequest: request });
    }
  );

  it('rejects invented destination targets without accepting mutation authority', () => {
    expect(
      parseCreateIntentRoute({
        intent: 'create',
        confidence: 'high',
        normalizedRequest: 'Create a website',
        userResponse: '',
        reason: 'Create request',
        recommendedAction: 'none',
        creationTarget: 'any-workspace',
      })
    ).toBeNull();
  });

  it('canonicalizes navigation actions instead of trusting model-selected authority', () => {
    expect(
      parseCreateIntentRoute({
        intent: 'assistant-task',
        confidence: 'high',
        normalizedRequest: 'Fix the checkout endpoint.',
        userResponse: 'Continue in Agent.',
        reason: 'Existing source must change.',
        recommendedAction: 'import-workspace',
      })
    ).toMatchObject({ recommendedAction: 'continue-in-agent' });

    expect(
      parseCreateIntentRoute({
        intent: 'conversation',
        confidence: 'high',
        normalizedRequest: 'Hello',
        userResponse: 'Hello from /Users/example/private-project.',
        reason: 'The message is social.',
        recommendedAction: 'continue-in-agent',
      })
    ).toMatchObject({
      recommendedAction: 'none',
      userResponse: 'Hello from $LOCAL_PATH',
    });
  });

  it('never turns a greeting into a default framework when the model is unavailable', async () => {
    const route = await routeCreateIntent({
      request: 'hi',
      selectedTarget: 'workspace',
      complete: async () => {
        throw new Error('Provider unavailable');
      },
    });

    expect(route).toMatchObject({ intent: 'conversation', confidence: 'high' });
    expect(route.normalizedRequest).toBe('hi');
  });

  it('replaces model echoes and identity disclaimers with product-native conversation', async () => {
    const echoed = await routeCreateIntent({
      request: 'hi baby',
      selectedTarget: 'workspace',
      complete: async () => ({
        type: 'tool',
        toolName: CREATE_INTENT_ROUTE_TOOL,
        input: {
          intent: 'conversation',
          confidence: 'high',
          normalizedRequest: 'hi baby',
          userResponse: 'hi baby',
          reason: 'Social greeting.',
          recommendedAction: 'none',
        },
      }),
    });
    const disclaimer = await routeCreateIntent({
      request: 'are you ok?',
      selectedTarget: 'workspace',
      complete: async () => ({
        type: 'tool',
        toolName: CREATE_INTENT_ROUTE_TOOL,
        input: {
          intent: 'conversation',
          confidence: 'high',
          normalizedRequest: 'are you ok?',
          userResponse: "I'm just a program, but thanks for asking!",
          reason: 'Social question.',
          recommendedAction: 'none',
        },
      }),
    });

    expect(echoed.userResponse).toBe('Hi! What would you like to build?');
    expect(disclaimer.userResponse).toBe(
      'Ready when you are. Tell me what you would like to create, adopt, or import.'
    );
  });

  it('retains useful offline creation but fails ambiguous input closed', async () => {
    const unavailable = async () => ({ type: 'text' as const, text: '' });
    const creation = await routeCreateIntent({
      request: 'Create a new Next.js application.',
      selectedTarget: 'workspace',
      complete: unavailable,
    });
    const ambiguous = await routeCreateIntent({
      request: 'Something useful for commerce',
      selectedTarget: 'workspace',
      complete: unavailable,
    });

    expect(creation).toMatchObject({ intent: 'create', confidence: 'high' });
    expect(ambiguous).toMatchObject({ intent: 'clarification', confidence: 'low' });
  });

  it('routes an existing-project source edit to Agent during offline fallback', async () => {
    const route = await routeCreateIntent({
      request: 'Fix the checkout endpoint tests.',
      selectedTarget: 'project',
      projectName: 'checkout-api',
      complete: async () => ({ type: 'text', text: '' }),
    });

    expect(route).toMatchObject({
      intent: 'assistant-task',
      recommendedAction: 'continue-in-agent',
    });
  });

  it('uses prior clarification turns to produce a self-contained route', async () => {
    const complete = vi.fn(async ({ prompt }: { prompt: string }) => {
      expect(prompt).toContain('user: Build an internal service.');
      expect(prompt).toContain('assistant: Which runtime should it use?');
      return {
        type: 'tool' as const,
        toolName: CREATE_INTENT_ROUTE_TOOL,
        input: {
          intent: 'create',
          confidence: 'high',
          normalizedRequest: 'Create an internal Go service.',
          userResponse: '',
          reason: 'The clarification supplied the missing runtime.',
          recommendedAction: 'none',
        },
      };
    });

    const route = await routeCreateIntent({
      request: 'Use Go.',
      selectedTarget: 'project',
      history: [
        { role: 'user', content: 'Build an internal service.' },
        { role: 'assistant', content: 'Which runtime should it use?' },
      ],
      complete,
    });

    expect(route.normalizedRequest).toBe('Create an internal Go service.');
  });

  it('rejects a repeated model clarification after the user delegates technical choices', async () => {
    const route = await routeCreateIntent({
      request: 'I do not know. Use your recommendation.',
      selectedTarget: 'workspace',
      history: [
        { role: 'user', content: 'Create a web app for my shop.' },
        { role: 'assistant', content: 'What stack and features do you prefer?' },
      ],
      complete: async () => ({
        type: 'tool',
        toolName: CREATE_INTENT_ROUTE_TOOL,
        input: {
          intent: 'clarification',
          confidence: 'low',
          normalizedRequest: 'The user has not selected a stack.',
          userResponse: 'What features do you need?',
          reason: 'Technical preferences are missing.',
          recommendedAction: 'plan-workspace',
        },
      }),
    });

    expect(route).toMatchObject({
      intent: 'create',
      confidence: 'high',
      recommendedAction: 'none',
      userResponse: '',
    });
    expect(route.normalizedRequest).toContain('Create a web app for my shop.');
    expect(route.normalizedRequest).toContain('recommended executable stack');
  });

  it('keeps one truly ambiguous first message in clarification without a plan action', async () => {
    const route = await routeCreateIntent({
      request: 'Something for work.',
      selectedTarget: 'workspace',
      complete: async () => ({
        type: 'tool',
        toolName: CREATE_INTENT_ROUTE_TOOL,
        input: {
          intent: 'clarification',
          confidence: 'low',
          normalizedRequest: 'Something for work.',
          userResponse: 'What would you like to create?',
          reason: 'No product outcome is specified.',
          recommendedAction: 'plan-workspace',
        },
      }),
    });

    expect(route).toMatchObject({
      intent: 'clarification',
      recommendedAction: 'none',
    });
  });

  it('never asks a second clarification when the original outcome used unfamiliar wording', async () => {
    const route = await routeCreateIntent({
      request: 'Choose the implementation details for me.',
      selectedTarget: 'workspace',
      history: [
        { role: 'user', content: 'A commerce experience for local customers.' },
        { role: 'assistant', content: 'What should the experience include?' },
      ],
      complete: async () => ({
        type: 'tool',
        toolName: CREATE_INTENT_ROUTE_TOOL,
        input: {
          intent: 'clarification',
          confidence: 'low',
          normalizedRequest: 'Implementation details are not specified.',
          userResponse: 'Which framework should be used?',
          reason: 'The stack is unknown.',
          recommendedAction: 'none',
        },
      }),
    });

    expect(route.intent).toBe('create');
    expect(route.normalizedRequest).toContain('A commerce experience for local customers.');
  });
});
