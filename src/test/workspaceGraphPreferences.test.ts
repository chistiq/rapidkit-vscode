import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WORKSPACE_GRAPH_CAMERA,
  normalizeWorkspaceGraphCamera,
  readWorkspaceGraphCameraPreference,
  writeWorkspaceGraphCameraPreference,
} from '../../webview-ui/src/lib/workspaceGraphPreferences.js';

describe('Workspace Graph view preferences', () => {
  it('keeps camera state scoped by workspace identity', () => {
    const state = writeWorkspaceGraphCameraPreference(undefined, 'workspace:a', {
      yaw: 1,
      pitch: 0.4,
      zoom: 1.5,
    });
    const next = writeWorkspaceGraphCameraPreference(state, 'workspace:b', {
      yaw: -1,
      pitch: -0.2,
      zoom: 0.6,
    });
    expect(readWorkspaceGraphCameraPreference(next, 'workspace:a')).toEqual({
      yaw: 1,
      pitch: 0.4,
      zoom: 1.5,
    });
    expect(readWorkspaceGraphCameraPreference(next, 'workspace:b')).toEqual({
      yaw: -1,
      pitch: -0.2,
      zoom: 0.6,
    });
  });

  it('normalizes invalid or unsafe camera ranges', () => {
    expect(normalizeWorkspaceGraphCamera({ yaw: Number.NaN, pitch: 99, zoom: 0 })).toEqual({
      yaw: DEFAULT_WORKSPACE_GRAPH_CAMERA.yaw,
      pitch: 1.25,
      zoom: 0.24,
    });
  });
});
