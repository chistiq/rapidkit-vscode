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
});
