import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  isPathWithinWorkspaceRoot,
  resolveBoundedWorkspaceAbsolutePath,
} from '../utils/workspacePathBoundary';

describe('workspacePathBoundary', () => {
  it('accepts paths inside the workspace root', () => {
    expect(isPathWithinWorkspaceRoot('/ws', '/ws/src/app.ts')).toBe(true);
    expect(resolveBoundedWorkspaceAbsolutePath('/ws', 'src/app.ts')).toBe(
      path.join('/ws', 'src/app.ts')
    );
  });

  it('rejects absolute paths outside the workspace boundary', () => {
    expect(() => resolveBoundedWorkspaceAbsolutePath('/ws', '/etc/passwd')).toThrow(
      /outside the active workspace boundary/
    );
  });

  it('rejects shell metacharacters in user paths', () => {
    expect(() => resolveBoundedWorkspaceAbsolutePath('/ws', 'src; rm -rf /')).toThrow(
      /unsupported characters/
    );
    expect(() => resolveBoundedWorkspaceAbsolutePath('/ws', 'src && cat /etc/passwd')).toThrow(
      /unsupported characters/
    );
  });
});
