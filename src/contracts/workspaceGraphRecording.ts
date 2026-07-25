export const WORKSPACE_GRAPH_RECORDING_SCHEMA_VERSION = 'workspace-graph-recording.v1' as const;

export type WorkspaceGraphRecordingMode = 'manual' | 'change-driven' | 'scenario';
export type WorkspaceGraphRecordingStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'ready'
  | 'error';

export type WorkspaceGraphRecordingChange = {
  kind: 'baseline' | 'revision';
  title: string;
  revision: string;
  previousRevision?: string;
  entitiesAdded: number;
  entitiesRemoved: number;
  entitiesChanged: number;
  relationsAdded: number;
  relationsRemoved: number;
  relationsChanged: number;
  highlightedEntityIds: string[];
};

export type WorkspaceGraphRecordingFrameInput = {
  sessionId: string;
  revision: string;
  capturedAt: string;
  width: number;
  height: number;
  pngDataUrl: string;
  change: WorkspaceGraphRecordingChange;
};

export type WorkspaceGraphRecordingState = {
  schemaVersion: typeof WORKSPACE_GRAPH_RECORDING_SCHEMA_VERSION;
  status: WorkspaceGraphRecordingStatus;
  mode: WorkspaceGraphRecordingMode;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  frameCount: number;
  maxFrames: number;
  retainedBytes: number;
  maxRetainedBytes: number;
  outputPath?: string;
  manifestPath?: string;
  webmPath?: string;
  message?: string;
};

export type WorkspaceGraphRecordingStartInput = {
  workspacePath: string;
  mode: WorkspaceGraphRecordingMode;
  initialRevision: string;
};

export type WorkspaceGraphRecordingStopInput = {
  sessionId: string;
  webmDataUrl?: string;
};

export const DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS = Object.freeze({
  maxFrames: 180,
  maxFrameBytes: 6 * 1024 * 1024,
  maxRetainedBytes: 64 * 1024 * 1024,
  maxWebmBytes: 32 * 1024 * 1024,
  maxDurationMs: 10 * 60 * 1000,
  stableFrameDelayMs: 420,
});
