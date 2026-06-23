import { describe, expect, it } from 'vitest';

import { buildHeuristicCreationDraft } from '../core/aiCreationHeuristic.js';

describe('buildHeuristicCreationDraft', () => {
  it('infers NestJS and auth/database modules from prompt keywords', () => {
    const draft = buildHeuristicCreationDraft(
      'NestJS REST API with JWT auth and PostgreSQL database',
      'workspace'
    );

    expect(draft.framework).toBe('nestjs');
    expect(draft.kit).toBe('nestjs.standard');
    expect(draft.profile).toBe('node-only');
    expect(draft.suggestedModules).toEqual(
      expect.arrayContaining([
        'free/essentials/settings',
        'free/auth/core',
        'free/database/db_postgres',
      ])
    );
  });

  it('respects explicit framework hint for project mode', () => {
    const draft = buildHeuristicCreationDraft('High performance gateway service', 'project', 'go');

    expect(draft.framework).toBe('go');
    expect(draft.kit).toBe('gofiber.standard');
    expect(draft.suggestedModules).toEqual([]);
  });

  it('selects fastapi.ddd kit when layered architecture is requested', () => {
    const draft = buildHeuristicCreationDraft(
      'Python clean architecture DDD billing service',
      'workspace'
    );

    expect(draft.framework).toBe('fastapi');
    expect(draft.kit).toBe('fastapi.ddd');
  });

  it('maps dotnet prompts to dotnet-only profile and kit', () => {
    const draft = buildHeuristicCreationDraft('C# ASP.NET Web API service', 'workspace');

    expect(draft.framework).toBe('dotnet');
    expect(draft.kit).toBe('dotnet.webapi.clean');
    expect(draft.profile).toBe('dotnet-only');
    expect(draft.suggestedModules).toEqual([]);
  });

  it('infers Next.js frontend kits with node-only profile', () => {
    const draft = buildHeuristicCreationDraft('Next.js marketing dashboard frontend', 'project');

    expect(draft.framework).toBe('nextjs');
    expect(draft.kit).toBe('frontend.nextjs');
    expect(draft.profile).toBe('node-only');
    expect(draft.suggestedModules).toEqual([]);
  });

  it('infers polyglot profile for full-stack workspace prompts', () => {
    const draft = buildHeuristicCreationDraft(
      'Polyglot SaaS with Next.js frontend and NestJS API services',
      'workspace'
    );

    expect(draft.profile).toBe('polyglot');
    expect(['nextjs', 'nestjs']).toContain(draft.framework);
  });

  it('infers frontend workspace defaults from stack lane when prompt is vague', () => {
    const draft = buildHeuristicCreationDraft(
      'Customer product platform',
      'workspace',
      undefined,
      'frontend'
    );

    expect(draft.framework).toBe('nextjs');
    expect(draft.profile).toBe('node-only');
    expect(draft.projectName.endsWith('-app')).toBe(true);
  });
});
