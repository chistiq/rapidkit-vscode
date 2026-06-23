import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  inferWorkspacePathOpenMode,
  resolveWorkspaceAbsolutePath,
} from '../utils/workspacePathNavigationPolicy';

describe('workspacePathNavigation', () => {
  it('resolves relative paths against workspace root', () => {
    expect(resolveWorkspaceAbsolutePath('/ws', 'src/app.ts')).toBe(path.join('/ws', 'src/app.ts'));
  });

  it('rejects absolute paths outside the workspace boundary', () => {
    expect(() => resolveWorkspaceAbsolutePath('/ws', '/abs/file.ts')).toThrow(
      /outside the active workspace boundary/
    );
  });

  it('opens source files in editor mode', () => {
    expect(inferWorkspacePathOpenMode('/ws/src/auth/service.ts')).toBe('editor');
  });

  it('opens rapidkit report artifacts in the editor inside the extension', () => {
    expect(inferWorkspacePathOpenMode('/ws/.rapidkit/reports/doctor.json')).toBe('editor');
    expect(inferWorkspacePathOpenMode('/ws\\.rapidkit\\reports\\readiness.json')).toBe('editor');
  });
});
