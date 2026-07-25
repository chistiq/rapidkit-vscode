import type { GraphLayoutPoint } from './workspaceGraphLayout';
import type { WorkspaceGraphCameraPreference } from './workspaceGraphPreferences';

export function projectWorkspaceGraphPoint3d(
  point: GraphLayoutPoint,
  layout: { width: number; height: number },
  size: { width: number; height: number },
  camera: WorkspaceGraphCameraPreference
): { clip: [number, number, number]; screen: [number, number] } {
  const sourceX = point.x - layout.width / 2;
  const sourceY = point.y - layout.height / 2;
  const cosineYaw = Math.cos(camera.yaw);
  const sineYaw = Math.sin(camera.yaw);
  const rotatedX = sourceX * cosineYaw - point.z * sineYaw;
  const yawDepth = sourceX * sineYaw + point.z * cosineYaw;
  const cosinePitch = Math.cos(camera.pitch);
  const sinePitch = Math.sin(camera.pitch);
  const rotatedY = sourceY * cosinePitch - yawDepth * sinePitch;
  const depth = sourceY * sinePitch + yawDepth * cosinePitch;
  const perspective = 900 / Math.max(280, 900 + depth);
  const screenX = size.width / 2 + rotatedX * perspective * camera.zoom;
  const screenY = size.height / 2 + rotatedY * perspective * camera.zoom;
  return {
    clip: [
      (screenX / size.width) * 2 - 1,
      1 - (screenY / size.height) * 2,
      Math.max(-0.95, Math.min(0.95, depth / 1_200)),
    ],
    screen: [screenX, screenY],
  };
}
