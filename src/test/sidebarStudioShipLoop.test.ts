import { describe, expect, it } from 'vitest';

import {
  buildSidebarPatchRollbackHint,
  collectAppliedPatchPaths,
} from '../core/sidebarStudioRollbackHint.js';

describe('sidebarStudioRollbackHint', () => {
  it('builds a git checkout rollback command for applied patch paths', () => {
    expect(buildSidebarPatchRollbackHint(['src/foo.ts', 'src/bar.ts'])).toBe(
      'git checkout -- "src/foo.ts" "src/bar.ts"'
    );
  });

  it('collects applied debug-patch paths only', () => {
    expect(
      collectAppliedPatchPaths([
        { path: 'src/a.ts', action: 'apply-debug-patch', outcome: 'applied' },
        { path: '.rapidkit/reports/x.json', action: 'doctor-fix', outcome: 'applied' },
        { path: 'src/b.ts', action: 'apply-debug-patch', outcome: 'failed' },
      ])
    ).toEqual(['src/a.ts']);
  });
});
