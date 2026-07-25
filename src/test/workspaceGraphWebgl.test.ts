import { describe, expect, it } from 'vitest';

import { projectWorkspaceGraphPoint3d } from '../../webview-ui/src/lib/workspaceGraph3d.js';

describe('Workspace Graph WebGL projection', () => {
  it('projects deterministic finite screen and clip coordinates', () => {
    const input = {
      id: 'service:api',
      x: 760,
      y: 320,
      z: 140,
    };
    const first = projectWorkspaceGraphPoint3d(
      input,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: -0.45, pitch: -0.28, zoom: 0.78 }
    );
    const second = projectWorkspaceGraphPoint3d(
      input,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: -0.45, pitch: -0.28, zoom: 0.78 }
    );

    expect(first).toEqual(second);
    expect([...first.clip, ...first.screen].every(Number.isFinite)).toBe(true);
    expect(first.clip[2]).toBeGreaterThanOrEqual(-0.95);
    expect(first.clip[2]).toBeLessThanOrEqual(0.95);
  });

  it('moves the projected point when the camera orbits', () => {
    const point = { id: 'service:api', x: 760, y: 320, z: 140 };
    const base = projectWorkspaceGraphPoint3d(
      point,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: 0, pitch: 0, zoom: 1 }
    );
    const orbited = projectWorkspaceGraphPoint3d(
      point,
      { width: 1200, height: 800 },
      { width: 900, height: 600 },
      { yaw: 0.8, pitch: 0.35, zoom: 1 }
    );
    expect(orbited.screen).not.toEqual(base.screen);
  });
});
