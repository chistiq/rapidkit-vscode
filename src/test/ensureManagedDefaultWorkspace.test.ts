import { describe, expect, it } from 'vitest';

import {
  MANAGED_DEFAULT_WORKSPACE_NAME,
  resolveManagedDefaultImportWorkspacePath,
} from '../core/workspacePaths';

describe('managed default workspace path (extension parity with npm)', () => {
  it('targets ~/rapidkit/workspaces/workspai for fresh installs', () => {
    const homeDir = '/home/test-user';
    expect(resolveManagedDefaultImportWorkspacePath(homeDir)).toBe(
      `/home/test-user/rapidkit/workspaces/${MANAGED_DEFAULT_WORKSPACE_NAME}`
    );
  });
});
