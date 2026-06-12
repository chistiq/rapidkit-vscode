import { describe, expect, it } from 'vitest';

import { coreRuntimeCacheKey, type CoreRuntimeResolution } from '../utils/coreRuntimeResolver';
import { isModulesCatalogCacheValid } from '../core/modulesCatalogCache';

describe('modules catalog core runtime cache', () => {
  it('builds a stable cache key from runtime location and version', () => {
    const runtime: CoreRuntimeResolution = {
      workspacePath: '/tmp/ws',
      executable: '/tmp/ws/.venv/bin/rapidkit',
      version: '0.5.3',
      location: 'workspace',
    };

    expect(coreRuntimeCacheKey(runtime)).toBe('workspace:0.5.3');
  });

  it('rejects cache when core version or location changed', () => {
    expect(
      isModulesCatalogCacheValid(
        {
          schema_version: 1,
          modules: [],
          rapidkit_core_version: '0.5.0',
          rapidkit_core_location: 'global',
        },
        {
          workspacePath: '/tmp/ws',
          executable: '/tmp/ws/.venv/bin/rapidkit',
          version: '0.5.3',
          location: 'workspace',
        }
      )
    ).toBe(false);
  });

  it('accepts cache when core runtime fingerprint matches', () => {
    expect(
      isModulesCatalogCacheValid(
        {
          schema_version: 1,
          modules: [],
          rapidkit_core_version: '0.5.3',
          rapidkit_core_location: 'workspace',
        },
        {
          workspacePath: '/tmp/ws',
          executable: '/tmp/ws/.venv/bin/rapidkit',
          version: '0.5.3',
          location: 'workspace',
        }
      )
    ).toBe(true);
  });
});
