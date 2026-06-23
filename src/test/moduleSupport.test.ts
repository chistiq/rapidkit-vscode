import { describe, expect, it } from 'vitest';

import {
  MODULE_CAPABLE_PROJECT_TYPES,
  MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES,
  MODULE_UNSUPPORTED_PROJECT_TYPES,
  isExplicitlyUnsupportedModuleProjectType,
  isModuleInstallSupported,
  isUnsupportedModuleProjectType,
} from '@/lib/moduleSupport';

describe('moduleSupport contract', () => {
  it('allows modules only for FastAPI and NestJS', () => {
    expect(MODULE_CAPABLE_PROJECT_TYPES).toEqual(['fastapi', 'nestjs']);
    expect(isModuleInstallSupported('fastapi', true)).toBe(true);
    expect(isModuleInstallSupported('nestjs', true)).toBe(true);
    expect(isModuleInstallSupported('go', true)).toBe(false);
    expect(isModuleInstallSupported('nextjs', true)).toBe(false);
  });

  it('lists frontend scaffolds as explicitly module-unsupported', () => {
    expect(MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES).toContain('nextjs');
    expect(MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES).toContain('sveltekit');
    expect(MODULE_UNSUPPORTED_PROJECT_TYPES).toContain('dotnet');
    expect(MODULE_UNSUPPORTED_PROJECT_TYPES).toContain('vite-react');
    expect(isExplicitlyUnsupportedModuleProjectType('angular')).toBe(true);
    expect(isUnsupportedModuleProjectType('remix')).toBe(true);
  });
});
