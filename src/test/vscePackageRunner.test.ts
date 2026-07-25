import { describe, expect, it } from 'vitest';

import {
  buildVSCEEnvironment,
  resolvePinnedPackageManagerBin,
} from '../../scripts/vsce-package-runner.mjs';

describe('VSCE package runner', () => {
  it('exposes the pinned npm lifecycle binary to VSCE prepublish', () => {
    const env = {
      npm_execpath: '/corepack/npm/10.8.2/bin/npm-cli.js',
      PATH: '/usr/bin',
    };
    expect(resolvePinnedPackageManagerBin(env)).toBe('/corepack/npm/10.8.2/bin');
    expect(buildVSCEEnvironment(env, ':').PATH).toBe('/corepack/npm/10.8.2/bin:/usr/bin');
  });

  it('fails clearly when packaging bypasses the pinned package-manager lifecycle', () => {
    expect(() => resolvePinnedPackageManagerBin({ PATH: '/usr/bin' })).toThrow('corepack npm run');
  });
});
