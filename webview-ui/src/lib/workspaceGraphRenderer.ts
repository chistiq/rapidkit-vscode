export type WorkspaceGraphRendererMode = 'canvas2d' | 'webgl3d' | 'list';

export type WorkspaceGraphRendererCapabilities = {
  canvas2d: boolean;
  webgl2: boolean;
  prefersReducedMotion: boolean;
};

export function detectWorkspaceGraphRendererCapabilities(): WorkspaceGraphRendererCapabilities {
  const canvas = document.createElement('canvas');
  return {
    canvas2d: Boolean(canvas.getContext('2d')),
    webgl2: Boolean(canvas.getContext('webgl2')),
    prefersReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  };
}

export function resolveWorkspaceGraphRenderer(
  requested: WorkspaceGraphRendererMode,
  capabilities: WorkspaceGraphRendererCapabilities
): WorkspaceGraphRendererMode {
  if (requested === 'webgl3d' && capabilities.webgl2) {
    return 'webgl3d';
  }
  if (requested !== 'list' && capabilities.canvas2d) {
    return 'canvas2d';
  }
  return 'list';
}
