import { describe, expect, it } from 'vitest';
import { buildStudioWorkspaiArchitecture } from '../core/studioCliKnowledge.js';
import { buildStudioCliCatalog } from '../core/studioCliKnowledge.js';

describe('CLI workspace and project scope reference', () => {
  it('keeps all six actual create categories and their executable kits discoverable', () => {
    const reference = buildStudioWorkspaiArchitecture();
    expect(JSON.stringify(reference).length).toBeLessThan(24000);
    expect(reference.categories.map((category) => category.category).sort()).toEqual([
      'agent',
      'backend',
      'desktop',
      'extension',
      'frontend',
      'gateway',
    ]);
    expect(reference.categories.flatMap((category) => category.kitIds).sort()).toEqual(
      reference.kits.map((kit) => kit.id).sort()
    );
  });
  it('maps each onboarding intent to a CLI-authored command family instead of conflating project and workspace imports', () => {
    const routes = buildStudioWorkspaiArchitecture().scopeModel.onboarding;
    expect(
      routes.filter((route) => route.resource === 'project').map((route) => route.materialization)
    ).toEqual(['none', 'copy', 'clone']);
    expect(
      routes
        .filter((route) => route.resource === 'workspace')
        .map((route) => [route.command.join(' '), route.registration])
    ).toEqual([
      ['workspace connect', true],
      ['workspace import', true],
      ['workspace hydrate', false],
    ]);
    for (const route of routes) {
      const command = route.command.join(' ');
      const catalog = buildStudioCliCatalog({ query: command, includeDetails: true, limit: 40 });
      expect(catalog.commands.some((entry) => entry.command === command)).toBe(true);
    }
  });
  it('keeps workspace/project command families aligned with the CLI-authored catalog', () => {
    for (const entry of buildStudioWorkspaiArchitecture().scopeModel.commandsByScope) {
      const end = entry.argv.findIndex((token) => token.startsWith('<') || token.startsWith('--'));
      const command = entry.argv.slice(0, end < 0 ? undefined : end).join(' ');
      let offset: number | null = 0;
      const families: string[] = [];
      while (offset !== null) {
        const page = buildStudioCliCatalog({ query: entry.argv[0], limit: 40, offset });
        families.push(...page.commands.map((candidate) => candidate.command));
        offset = page.nextOffset;
      }
      expect(
        families.some((family) => command === family || command.startsWith(`${family} `))
      ).toBe(true);
    }
  });
});
