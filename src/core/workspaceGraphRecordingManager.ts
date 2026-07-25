import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS,
  WORKSPACE_GRAPH_RECORDING_SCHEMA_VERSION,
  type WorkspaceGraphRecordingFrameInput,
  type WorkspaceGraphRecordingStartInput,
  type WorkspaceGraphRecordingState,
  type WorkspaceGraphRecordingStopInput,
} from '../contracts/workspaceGraphRecording.js';

type RecordingFrameManifest = Omit<
  WorkspaceGraphRecordingFrameInput,
  'pngDataUrl' | 'sessionId'
> & {
  index: number;
  path: string;
  bytes: number;
};

type RecordingManifest = {
  schemaVersion: typeof WORKSPACE_GRAPH_RECORDING_SCHEMA_VERSION;
  sessionId: string;
  mode: WorkspaceGraphRecordingStartInput['mode'];
  status: 'recording' | 'completed' | 'error';
  workspace: { name: string };
  startedAt: string;
  completedAt?: string;
  initialRevision: string;
  frames: RecordingFrameManifest[];
  outputs: {
    manifest: string;
    frames: string;
    webm?: string;
  };
  limits: typeof DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS;
  retainedBytes: number;
  error?: string;
};

type ActiveRecording = {
  workspacePath: string;
  rootPath: string;
  framesPath: string;
  manifestPath: string;
  manifest: RecordingManifest;
  seenRevisions: Set<string>;
};

const PNG_PREFIX = 'data:image/png;base64,';
const WEBM_PATTERN = /^data:video\/webm(?:;codecs=[^;,]+)?;base64,/i;

function decodeDataUrl(
  value: string,
  prefix: string | RegExp,
  maxBytes: number,
  signature: number[]
): Buffer {
  const matches =
    typeof prefix === 'string'
      ? value.startsWith(prefix)
        ? { encoded: value.slice(prefix.length) }
        : null
      : (() => {
          const match = value.match(prefix);
          return match ? { encoded: value.slice(match[0].length) } : null;
        })();
  if (!matches?.encoded || !/^[a-z0-9+/=\s]+$/i.test(matches.encoded)) {
    throw new Error('Recording payload has an invalid data URL.');
  }
  if (matches.encoded.length > Math.ceil(maxBytes / 3) * 4 + 8) {
    throw new Error('Recording payload exceeds its encoded byte budget.');
  }
  const decoded = Buffer.from(matches.encoded, 'base64');
  if (decoded.byteLength === 0 || signature.some((value, index) => decoded[index] !== value)) {
    throw new Error('Recording payload signature does not match its declared media type.');
  }
  return decoded;
}

function validatePngFrame(
  png: Buffer,
  input: Pick<WorkspaceGraphRecordingFrameInput, 'width' | 'height'>
): void {
  const hasHeader =
    png.byteLength >= 33 &&
    png.subarray(12, 16).toString('ascii') === 'IHDR' &&
    png.readUInt32BE(16) === input.width &&
    png.readUInt32BE(20) === input.height;
  const hasEndChunk = png.indexOf(Buffer.from('IEND', 'ascii'), 24) >= 0;
  if (!hasHeader || !hasEndChunk) {
    throw new Error('PNG structure or dimensions do not match the captured frame metadata.');
  }
}

function validateChangeMetadata(input: WorkspaceGraphRecordingFrameInput): void {
  const change = input.change;
  const counts = [
    change.entitiesAdded,
    change.entitiesRemoved,
    change.entitiesChanged,
    change.relationsAdded,
    change.relationsRemoved,
    change.relationsChanged,
  ];
  if (
    (change.kind !== 'baseline' && change.kind !== 'revision') ||
    !change.title.trim() ||
    change.title.length > 240 ||
    change.revision !== input.revision ||
    counts.some((value) => !Number.isInteger(value) || value < 0) ||
    !Array.isArray(change.highlightedEntityIds) ||
    change.highlightedEntityIds.length > 50 ||
    change.highlightedEntityIds.some((value) => typeof value !== 'string' || !value.trim()) ||
    new Set(change.highlightedEntityIds).size !== change.highlightedEntityIds.length
  ) {
    throw new Error('Captured graph change metadata is invalid.');
  }
}

function publicState(
  active: ActiveRecording,
  status: WorkspaceGraphRecordingState['status'],
  input?: {
    completedAt?: string;
    webmPath?: string;
    message?: string;
  }
): WorkspaceGraphRecordingState {
  return {
    schemaVersion: WORKSPACE_GRAPH_RECORDING_SCHEMA_VERSION,
    status,
    mode: active.manifest.mode,
    sessionId: active.manifest.sessionId,
    startedAt: active.manifest.startedAt,
    completedAt: input?.completedAt,
    frameCount: active.manifest.frames.length,
    maxFrames: DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxFrames,
    retainedBytes: active.manifest.retainedBytes,
    maxRetainedBytes: DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxRetainedBytes,
    outputPath: active.rootPath,
    manifestPath: active.manifestPath,
    webmPath: input?.webmPath,
    message: input?.message,
  };
}

async function assertSafeRecordingParent(
  workspacePath: string,
  recordingRoot: string
): Promise<void> {
  const resolvedWorkspace = path.resolve(workspacePath);
  const resolvedRoot = path.resolve(recordingRoot);
  if (
    resolvedRoot !== path.join(resolvedWorkspace, '.workspai', 'recordings') ||
    !resolvedRoot.startsWith(`${resolvedWorkspace}${path.sep}`)
  ) {
    throw new Error('Graph recordings must stay inside .workspai/recordings.');
  }
  const workspaceStat = await fs.stat(resolvedWorkspace);
  if (!workspaceStat.isDirectory()) {
    throw new Error('The selected workspace path is not a directory.');
  }
  for (const candidate of [
    path.join(resolvedWorkspace, '.workspai'),
    path.join(resolvedWorkspace, '.workspai', 'recordings'),
  ]) {
    try {
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) {
        throw new Error(`Recording path cannot use a symbolic link: ${candidate}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

async function writeManifest(active: ActiveRecording): Promise<void> {
  const tempPath = `${active.manifestPath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(active.manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  await fs.rename(tempPath, active.manifestPath);
}

export class WorkspaceGraphRecordingManager {
  private active: ActiveRecording | null = null;
  private lastCompletedPath: string | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  snapshot(): WorkspaceGraphRecordingState | null {
    return this.active ? publicState(this.active, 'recording') : null;
  }

  latestOutputPath(): string | null {
    return this.active?.rootPath ?? this.lastCompletedPath;
  }

  start(input: WorkspaceGraphRecordingStartInput): Promise<WorkspaceGraphRecordingState> {
    return this.serial(() => this.startUnlocked(input));
  }

  private async startUnlocked(
    input: WorkspaceGraphRecordingStartInput
  ): Promise<WorkspaceGraphRecordingState> {
    if (this.active) {
      throw new Error('A Workspace Graph recording is already active.');
    }
    const workspacePath = path.resolve(input.workspacePath);
    const recordingRoot = path.join(workspacePath, '.workspai', 'recordings');
    await assertSafeRecordingParent(workspacePath, recordingRoot);
    const startedAt = new Date().toISOString();
    const sessionId = `${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const rootPath = path.join(recordingRoot, sessionId);
    const framesPath = path.join(rootPath, 'frames');
    const manifestPath = path.join(rootPath, 'recording.json');
    await fs.mkdir(framesPath, { recursive: true });
    const active: ActiveRecording = {
      workspacePath,
      rootPath,
      framesPath,
      manifestPath,
      seenRevisions: new Set(),
      manifest: {
        schemaVersion: WORKSPACE_GRAPH_RECORDING_SCHEMA_VERSION,
        sessionId,
        mode: input.mode,
        status: 'recording',
        workspace: { name: path.basename(workspacePath) },
        startedAt,
        initialRevision: input.initialRevision,
        frames: [],
        outputs: {
          manifest: 'recording.json',
          frames: 'frames',
        },
        limits: DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS,
        retainedBytes: 0,
      },
    };
    await writeManifest(active);
    this.active = active;
    return publicState(active, 'recording', {
      message: 'Recording meaningful graph revisions.',
    });
  }

  appendFrame(input: WorkspaceGraphRecordingFrameInput): Promise<WorkspaceGraphRecordingState> {
    return this.serial(() => this.appendFrameUnlocked(input));
  }

  private async appendFrameUnlocked(
    input: WorkspaceGraphRecordingFrameInput
  ): Promise<WorkspaceGraphRecordingState> {
    const active = this.requireActive(input.sessionId);
    const elapsed = Date.now() - Date.parse(active.manifest.startedAt);
    if (elapsed > DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxDurationMs) {
      throw new Error('Workspace Graph recording reached its duration budget.');
    }
    if (active.manifest.frames.length >= DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxFrames) {
      throw new Error('Workspace Graph recording reached its frame budget.');
    }
    if (active.seenRevisions.has(input.revision)) {
      return publicState(active, 'recording', {
        message: 'Duplicate revision skipped.',
      });
    }
    if (
      !Number.isInteger(input.width) ||
      !Number.isInteger(input.height) ||
      input.width < 320 ||
      input.width > 4096 ||
      input.height < 180 ||
      input.height > 2160 ||
      !Number.isFinite(Date.parse(input.capturedAt))
    ) {
      throw new Error('Captured graph frame metadata is invalid.');
    }
    validateChangeMetadata(input);
    const png = decodeDataUrl(
      input.pngDataUrl,
      PNG_PREFIX,
      DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxFrameBytes,
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    );
    validatePngFrame(png, input);
    if (png.byteLength > DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxFrameBytes) {
      throw new Error('Captured graph frame exceeds the per-frame byte budget.');
    }
    if (
      active.manifest.retainedBytes + png.byteLength >
      DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxRetainedBytes
    ) {
      throw new Error('Workspace Graph recording reached its retained-byte budget.');
    }
    const index = active.manifest.frames.length + 1;
    const fileName = `frame-${String(index).padStart(4, '0')}.png`;
    const framePath = path.join(active.framesPath, fileName);
    await fs.writeFile(framePath, png, { flag: 'wx' });
    active.manifest.frames.push({
      index,
      path: path.posix.join('frames', fileName),
      revision: input.revision,
      capturedAt: input.capturedAt,
      width: input.width,
      height: input.height,
      bytes: png.byteLength,
      change: input.change,
    });
    active.manifest.retainedBytes += png.byteLength;
    active.seenRevisions.add(input.revision);
    await writeManifest(active);
    return publicState(active, 'recording', {
      message: `Captured ${input.change.title}.`,
    });
  }

  stop(input: WorkspaceGraphRecordingStopInput): Promise<WorkspaceGraphRecordingState> {
    return this.serial(() => this.stopUnlocked(input));
  }

  private async stopUnlocked(
    input: WorkspaceGraphRecordingStopInput
  ): Promise<WorkspaceGraphRecordingState> {
    const active = this.requireActive(input.sessionId);
    let webmPath: string | undefined;
    if (input.webmDataUrl) {
      const webm = decodeDataUrl(
        input.webmDataUrl,
        WEBM_PATTERN,
        DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxWebmBytes,
        [0x1a, 0x45, 0xdf, 0xa3]
      );
      if (webm.byteLength > DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxWebmBytes) {
        throw new Error('Workspace Graph WebM exceeds the output byte budget.');
      }
      webmPath = path.join(active.rootPath, 'graph-story.webm');
      await fs.writeFile(webmPath, webm, { flag: 'wx' });
      active.manifest.outputs.webm = 'graph-story.webm';
    }
    const completedAt = new Date().toISOString();
    active.manifest.status = 'completed';
    active.manifest.completedAt = completedAt;
    await writeManifest(active);
    const state = publicState(active, 'ready', {
      completedAt,
      webmPath,
      message: active.manifest.frames.length
        ? `Graph story ready with ${active.manifest.frames.length} meaningful revision(s).`
        : 'Recording completed without a meaningful graph revision.',
    });
    this.lastCompletedPath = active.rootPath;
    this.active = null;
    return state;
  }

  fail(sessionId: string, error: unknown): Promise<WorkspaceGraphRecordingState> {
    return this.serial(() => this.failUnlocked(sessionId, error));
  }

  abort(message: string): Promise<WorkspaceGraphRecordingState | null> {
    return this.serial(async () =>
      this.active ? this.failUnlocked(this.active.manifest.sessionId, new Error(message)) : null
    );
  }

  private async failUnlocked(
    sessionId: string,
    error: unknown
  ): Promise<WorkspaceGraphRecordingState> {
    const active = this.requireActive(sessionId);
    const message = error instanceof Error ? error.message : String(error);
    active.manifest.status = 'error';
    active.manifest.error = message;
    active.manifest.completedAt = new Date().toISOString();
    await writeManifest(active).catch(() => undefined);
    const state = publicState(active, 'error', { message });
    this.active = null;
    return state;
  }

  private requireActive(sessionId: string): ActiveRecording {
    if (!this.active || this.active.manifest.sessionId !== sessionId) {
      throw new Error('Workspace Graph recording session is not active.');
    }
    return this.active;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
