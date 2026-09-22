import { describe, expect, it } from 'vitest';

import {
  defaultKitForFramework,
  inferFrameworkFromCreationPrompt,
  inferExplicitCreationFrameworks,
  inferStackIntentFromPrompt,
  inferPolyglotCompanionProject,
  inferWorkspaceProfileFromCreationPrompt,
  projectNameSuffixForFramework,
} from '../core/creationStackIntent';

describe('creationStackIntent', () => {
  it('detects frontend stack intent from generic UI language', () => {
    expect(inferStackIntentFromPrompt('customer dashboard and admin console')).toBe('frontend');
    expect(inferFrameworkFromCreationPrompt('customer dashboard and admin console')).toBe('nextjs');
  });

  it('detects polyglot intent when frontend and backend are both mentioned', () => {
    const prompt = 'full-stack saas with next.js frontend and nestjs api';
    expect(inferStackIntentFromPrompt(prompt)).toBe('polyglot');
    expect(inferWorkspaceProfileFromCreationPrompt('nextjs', prompt, undefined, 'nestjs')).toBe(
      'node-only'
    );
  });

  it('maps explicit stack lanes to sensible defaults', () => {
    expect(inferFrameworkFromCreationPrompt('product platform', undefined, 'frontend')).toBe(
      'nextjs'
    );
    expect(inferFrameworkFromCreationPrompt('product platform', undefined, 'backend')).toBe(
      'nestjs'
    );
    expect(inferFrameworkFromCreationPrompt('repository maintainer', undefined, 'agent')).toBe(
      'microsoft-agent-framework'
    );
    expect(
      inferWorkspaceProfileFromCreationPrompt(
        'nestjs',
        'regulated enterprise workspace',
        'enterprise'
      )
    ).toBe('enterprise');
  });

  it('infers polyglot companion projects for full-stack prompts', () => {
    const prompt = 'Polyglot workspace: Next.js frontend + NestJS API with shared governance';
    const promptLower = prompt.toLowerCase();
    expect(inferStackIntentFromPrompt(promptLower)).toBe('polyglot');
    expect(inferWorkspaceProfileFromCreationPrompt('nextjs', promptLower)).toBe('polyglot');
    const primary = inferFrameworkFromCreationPrompt(promptLower, undefined, 'polyglot');
    const companion = inferPolyglotCompanionProject(prompt, primary, 'polyglot');
    expect(['nextjs', 'nestjs']).toContain(primary);
    expect(companion?.framework).toBe(primary === 'nextjs' ? 'nestjs' : 'nextjs');
    expect(companion?.projectName).toMatch(/-(app|api)$/);
  });

  it('distinguishes explicit frameworks from generic frontend and API signals', () => {
    expect(
      inferExplicitCreationFrameworks(
        'Polyglot workspace: Next.js frontend + NestJS API with shared governance'
      )
    ).toEqual(expect.arrayContaining(['nextjs', 'nestjs']));
    expect(inferExplicitCreationFrameworks('frontend connected to an API')).toEqual([]);
  });

  it('prefers polyglot over governance-only enterprise cues when both stacks are mentioned', () => {
    const prompt = 'governance portal with next.js frontend and nestjs api';
    expect(inferStackIntentFromPrompt(prompt.toLowerCase())).toBe('polyglot');
    expect(
      inferWorkspaceProfileFromCreationPrompt('nextjs', prompt.toLowerCase(), undefined, 'nestjs')
    ).toBe('node-only');
  });

  it('uses polyglot only when full-stack projects cross runtime families', () => {
    const prompt = 'Build a full-stack shop with an API and frontend';
    expect(
      inferWorkspaceProfileFromCreationPrompt('nextjs', prompt.toLowerCase(), undefined, 'fastapi')
    ).toBe('polyglot');
    expect(
      inferWorkspaceProfileFromCreationPrompt('nextjs', prompt.toLowerCase(), undefined, 'nestjs')
    ).toBe('node-only');
  });

  it('defaults delegated full-stack backend selection to the host Node runtime', () => {
    const companion = inferPolyglotCompanionProject(
      'Build a full-stack shop with an API and frontend',
      'nextjs'
    );
    expect(companion?.framework).toBe('nestjs');
  });

  it('does not force ambiguous product-domain prompts into full-stack', () => {
    const prompt = 'Build a workspace for a clothing store';
    const promptLower = prompt.toLowerCase();
    expect(inferStackIntentFromPrompt(promptLower)).toBeUndefined();
    expect(inferPolyglotCompanionProject(prompt, 'fastapi')).toBeUndefined();
  });

  it('detects explicit full-stack intent and supplies stable companion defaults', () => {
    const prompt = 'Build a full-stack clothing store with an API connected to a frontend';
    const promptLower = prompt.toLowerCase();
    expect(inferStackIntentFromPrompt(promptLower)).toBe('polyglot');
    const companion = inferPolyglotCompanionProject(prompt, 'fastapi');
    expect(companion?.framework).toBe('nextjs');
    expect(companion?.kit).toBe('frontend.nextjs');
  });

  it('uses frontend app suffix and backend api suffix', () => {
    expect(projectNameSuffixForFramework('nextjs')).toBe('app');
    expect(projectNameSuffixForFramework('nestjs')).toBe('api');
    expect(projectNameSuffixForFramework('springboot')).toBe('service');
    expect(projectNameSuffixForFramework('microsoft-agent-framework')).toBe('app');
  });

  it('selects governed Microsoft Agent Framework kits and exact runtime profiles', () => {
    const prompt = 'Create an AI agent with Microsoft Agent Framework and C#';
    expect(inferFrameworkFromCreationPrompt(prompt.toLowerCase())).toBe(
      'microsoft-agent-framework'
    );
    expect(inferStackIntentFromPrompt(prompt.toLowerCase())).toBe('agent');
    expect(defaultKitForFramework('microsoft-agent-framework', prompt.toLowerCase())).toBe(
      'agent.microsoft.dotnet'
    );
    expect(defaultKitForFramework('openai-agents', 'typescript agent')).toBe(
      'agent.openai.typescript'
    );
    expect(defaultKitForFramework('openrouter', 'python gateway')).toBe(
      'gateway.openrouter.python'
    );
    expect(
      inferWorkspaceProfileFromCreationPrompt(
        'microsoft-agent-framework',
        prompt.toLowerCase(),
        undefined,
        undefined,
        'agent.microsoft.dotnet'
      )
    ).toBe('dotnet-only');
    expect(
      inferWorkspaceProfileFromCreationPrompt(
        'microsoft-agent-framework',
        'create an ai agent in python',
        undefined,
        undefined,
        'agent.microsoft.python'
      )
    ).toBe('python-only');
  });
});
