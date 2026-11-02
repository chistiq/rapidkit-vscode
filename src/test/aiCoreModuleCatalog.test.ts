import { describe, expect, it } from 'vitest';
import {
  buildCatalogModuleArchitectureContract,
  buildWorkspaiPlatformContract,
  isModuleCapableKit,
  MODULE_CATEGORY_IDS,
  MODULE_CAPABLE_KIT_IDS,
} from '../core/aiCoreModuleCatalog';
import { buildKitBlueprintSection, listAllKitBlueprints } from '../core/aiKitArchitectureCatalog';

describe('aiCoreModuleCatalog', () => {
  it('defines three module-capable kits', () => {
    expect(MODULE_CAPABLE_KIT_IDS).toEqual(['fastapi.standard', 'fastapi.ddd', 'nestjs.standard']);
    expect(isModuleCapableKit('nestjs.standard')).toBe(true);
    expect(isModuleCapableKit('gofiber.standard')).toBe(false);
  });

  it('platform contract has no developer-repo or engine checkout paths', () => {
    const section = buildWorkspaiPlatformContract();
    expect(section).toContain('npx workspai');
    expect(section).toContain('never cite a fixed engine path');
    expect(section).not.toContain('core/src/');
    expect(section).not.toContain('rapidkit-npm/src/');
  });

  it('module contract is kit-specific and compact for nestjs', () => {
    const section = buildCatalogModuleArchitectureContract('nestjs.standard', ['free/cache/redis']);
    expect(section).toContain('CATALOG MODULE ARCHITECTURE — nestjs.standard');
    expect(section).toContain('src/examples/');
    expect(section).toContain('free/cache/redis');
    expect(section).not.toContain('core/src/');
    expect(MODULE_CATEGORY_IDS.length).toBe(12);
  });

  it('returns empty module contract for non-module-capable kits', () => {
    expect(buildCatalogModuleArchitectureContract('gofiber.standard')).toBe('');
  });

  it('kit registry includes governed agent runtimes without widening module support', () => {
    const kits = listAllKitBlueprints();
    expect(kits.map((kit) => kit.id)).toEqual(
      expect.arrayContaining([
        'agent.microsoft.python',
        'agent.microsoft.dotnet',
        'agent.google-adk.python',
        'agent.google-adk.typescript',
      ])
    );
    expect(kits.find((kit) => kit.id === 'agent.microsoft.python')?.stability).toBe('preview');
    expect(kits.find((kit) => kit.id === 'agent.openai.python')?.stability).toBe('stable');
    expect(kits.find((kit) => kit.id === 'agent.google-adk.python')?.stability).toBe('preview');
    expect(kits.filter((k) => k.moduleSupport)).toHaveLength(3);
  });

  it('kit blueprint section teaches project layout not engine paths', () => {
    const section = buildKitBlueprintSection('nestjs.standard');
    expect(section).toContain('ACTIVE KIT ARCHITECTURE');
    expect(section).toContain('<<<inject:module-imports>>>');
    expect(section).not.toContain('core/src/');
    expect(section).not.toContain('Owner:');
  });
});
