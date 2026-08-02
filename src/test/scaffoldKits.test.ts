import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  FRONTEND_SCAFFOLD_KITS,
  isBackendScaffoldFramework,
  isFrontendScaffoldKit,
  resolveFrontendKitDefinition,
  SCAFFOLD_KIT_IDS,
} from '../core/scaffoldKits';

describe('scaffold kits', () => {
  it('includes all canonical frontend kits from the runtime command surface contract', () => {
    expect(SCAFFOLD_KIT_IDS).toEqual(
      expect.arrayContaining(FRONTEND_SCAFFOLD_KITS.map((kit) => kit.kitId))
    );
    expect(FRONTEND_SCAFFOLD_KITS).toHaveLength(11);
    expect(SCAFFOLD_KIT_IDS).toHaveLength(23);
  });

  it('resolves frontend kits by kit id and framework alias', () => {
    expect(resolveFrontendKitDefinition('frontend.nextjs')?.framework).toBe('nextjs');
    expect(resolveFrontendKitDefinition('nextjs')?.kitId).toBe('frontend.nextjs');
    expect(isFrontendScaffoldKit('frontend.astro')).toBe(true);
    expect(isFrontendScaffoldKit('fastapi.standard')).toBe(false);
  });

  it('classifies backend vs frontend scaffold frameworks', () => {
    expect(isBackendScaffoldFramework('nestjs')).toBe(true);
    expect(isBackendScaffoldFramework('nextjs')).toBe(false);
    expect(isBackendScaffoldFramework('vite-vue')).toBe(false);
    expect(isBackendScaffoldFramework('rust')).toBe(true);
    expect(isBackendScaffoldFramework('laravel')).toBe(true);
  });

  it('keeps the webview enterprise dashboard aligned with eleven frontend starters', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../webview-ui/src/lib/scaffoldFrameworks.ts'),
      'utf8'
    );
    expect(source).toContain("framework: 'vite-vue'");
    expect(source).toContain("framework: 'vite-svelte'");
    expect(source).toContain("framework: 'vite-solid'");
    expect(source).toContain("framework: 'vite-vanilla'");
    expect(FRONTEND_SCAFFOLD_KITS).toHaveLength(11);
  });
});
