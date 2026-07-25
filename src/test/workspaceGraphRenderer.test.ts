import { describe, expect, it } from 'vitest';

import { resolveWorkspaceGraphRenderer } from '../../webview-ui/src/lib/workspaceGraphRenderer.js';

describe('Workspace Graph renderer contract', () => {
  it('activates interactive 3D whenever WebGL2 is available', () => {
    expect(
      resolveWorkspaceGraphRenderer('webgl3d', {
        canvas2d: true,
        webgl2: true,
        prefersReducedMotion: false,
      })
    ).toBe('webgl3d');
  });

  it('falls back safely from 3D to the 2D evidence view', () => {
    expect(
      resolveWorkspaceGraphRenderer('webgl3d', {
        canvas2d: true,
        webgl2: true,
        prefersReducedMotion: true,
      })
    ).toBe('webgl3d');
    expect(
      resolveWorkspaceGraphRenderer('webgl3d', {
        canvas2d: true,
        webgl2: false,
        prefersReducedMotion: false,
      })
    ).toBe('canvas2d');
  });

  it('preserves a no-GPU list fallback', () => {
    expect(
      resolveWorkspaceGraphRenderer('canvas2d', {
        canvas2d: false,
        webgl2: false,
        prefersReducedMotion: false,
      })
    ).toBe('list');
  });
});
