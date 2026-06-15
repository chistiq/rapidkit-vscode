import { describe, expect, it } from 'vitest';
import { buildModuleListForPrompt, findLiveModuleBySlug } from '../core/aiLiveModuleCatalog';

describe('aiLiveModuleCatalog', () => {
  it('formats live modules grouped by category', () => {
    const section = buildModuleListForPrompt([
      {
        name: 'redis',
        display_name: 'Redis',
        version: '0.1.0',
        category: 'cache',
        description: 'Redis cache',
        slug: 'free/cache/redis',
        tags: ['cache'],
      },
      {
        name: 'auth_core',
        display_name: 'Auth Core',
        version: '0.1.1',
        category: 'auth',
        description: 'Auth primitives',
        slug: 'free/auth/core',
        tags: ['auth'],
      },
    ]);

    expect(section).toContain('LIVE MODULE CATALOG');
    expect(section).toContain('free/cache/redis v0.1.0');
    expect(section).toContain('free/auth/core v0.1.1');
    expect(section).toContain('Total: 2 module(s)');
  });

  it('falls back when live catalog is unavailable', () => {
    const section = buildModuleListForPrompt(null);
    expect(section).toContain('fallback');
    expect(section).toContain('free/essentials/settings');
    expect(section).toContain('rapidkit modules list');
  });

  it('finds module by slug case-insensitively', () => {
    const mod = findLiveModuleBySlug(
      [
        {
          name: 'x',
          display_name: 'X',
          version: '1',
          category: 'cache',
          description: '',
          slug: 'free/cache/redis',
          tags: [],
        },
      ],
      'FREE/cache/REDIS'
    );
    expect(mod?.slug).toBe('free/cache/redis');
  });
});
