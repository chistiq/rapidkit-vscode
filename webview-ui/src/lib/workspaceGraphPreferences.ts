export type WorkspaceGraphCameraPreference = {
  yaw: number;
  pitch: number;
  zoom: number;
};

export type WorkspaceGraphPreferenceState = {
  workspaiGraphView?: {
    cameraByWorkspace?: Record<string, WorkspaceGraphCameraPreference>;
  };
};

export const DEFAULT_WORKSPACE_GRAPH_CAMERA: WorkspaceGraphCameraPreference = {
  yaw: -0.45,
  pitch: -0.28,
  zoom: 0.78,
};

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function normalizeWorkspaceGraphCamera(value: unknown): WorkspaceGraphCameraPreference {
  const camera =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    yaw: finite(camera.yaw, DEFAULT_WORKSPACE_GRAPH_CAMERA.yaw),
    pitch: Math.max(
      -1.25,
      Math.min(1.25, finite(camera.pitch, DEFAULT_WORKSPACE_GRAPH_CAMERA.pitch))
    ),
    zoom: Math.max(0.24, Math.min(2.6, finite(camera.zoom, DEFAULT_WORKSPACE_GRAPH_CAMERA.zoom))),
  };
}

export function readWorkspaceGraphCameraPreference(
  state: WorkspaceGraphPreferenceState | undefined,
  workspaceIdentity: string
): WorkspaceGraphCameraPreference {
  return normalizeWorkspaceGraphCamera(
    state?.workspaiGraphView?.cameraByWorkspace?.[workspaceIdentity]
  );
}

export function writeWorkspaceGraphCameraPreference(
  state: WorkspaceGraphPreferenceState | undefined,
  workspaceIdentity: string,
  camera: WorkspaceGraphCameraPreference
): WorkspaceGraphPreferenceState {
  return {
    ...(state ?? {}),
    workspaiGraphView: {
      ...(state?.workspaiGraphView ?? {}),
      cameraByWorkspace: {
        ...(state?.workspaiGraphView?.cameraByWorkspace ?? {}),
        [workspaceIdentity]: normalizeWorkspaceGraphCamera(camera),
      },
    },
  };
}
