import type { WorkspaceGraphProjection } from '@workspai-contracts/workspaceGraphProjection';
import type {
  WorkspaceGraphRecordingChange,
  WorkspaceGraphRecordingFrameInput,
} from '@workspai-contracts/workspaceGraphRecording';

type CapturedGraphFrame = Omit<
  WorkspaceGraphRecordingFrameInput,
  'sessionId' | 'revision' | 'capturedAt' | 'change'
>;

function mapById<T extends { id: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function changedCount<T extends { id: string }>(previous: T[], current: T[]): number {
  const previousById = mapById(previous);
  let changed = 0;
  for (const value of current) {
    const oldValue = previousById.get(value.id);
    if (oldValue && JSON.stringify(oldValue) !== JSON.stringify(value)) {
      changed += 1;
    }
  }
  return changed;
}

export function describeWorkspaceGraphRecordingChange(
  previous: WorkspaceGraphProjection | null,
  current: WorkspaceGraphProjection
): WorkspaceGraphRecordingChange | null {
  if (previous?.revision === current.revision) {
    return null;
  }
  if (!previous) {
    return {
      kind: 'baseline',
      title: `Baseline · ${current.total.entities} entities`,
      revision: current.revision,
      entitiesAdded: current.entities.length,
      entitiesRemoved: 0,
      entitiesChanged: 0,
      relationsAdded: current.relations.length,
      relationsRemoved: 0,
      relationsChanged: 0,
      highlightedEntityIds: current.highlightedEntityIds?.slice(0, 50) ?? [],
    };
  }
  const previousEntities = mapById(previous.entities);
  const currentEntities = mapById(current.entities);
  const previousRelations = mapById(previous.relations);
  const currentRelations = mapById(current.relations);
  const entitiesAdded = current.entities.filter((value) => !previousEntities.has(value.id)).length;
  const entitiesRemoved = previous.entities.filter(
    (value) => !currentEntities.has(value.id)
  ).length;
  const entitiesChanged = changedCount(previous.entities, current.entities);
  const relationsAdded = current.relations.filter(
    (value) => !previousRelations.has(value.id)
  ).length;
  const relationsRemoved = previous.relations.filter(
    (value) => !currentRelations.has(value.id)
  ).length;
  const relationsChanged = changedCount(previous.relations, current.relations);
  const totalChanges =
    entitiesAdded +
    entitiesRemoved +
    entitiesChanged +
    relationsAdded +
    relationsRemoved +
    relationsChanged;
  if (totalChanges === 0 && previous.revision === current.revision) {
    return null;
  }
  const fragments = [
    entitiesAdded ? `${entitiesAdded} added` : '',
    entitiesChanged ? `${entitiesChanged} changed` : '',
    entitiesRemoved ? `${entitiesRemoved} removed` : '',
    relationsAdded + relationsChanged + relationsRemoved
      ? `${relationsAdded + relationsChanged + relationsRemoved} relationship updates`
      : '',
  ].filter(Boolean);
  return {
    kind: 'revision',
    title: fragments.join(' · ') || 'Graph revision updated',
    revision: current.revision,
    previousRevision: previous.revision,
    entitiesAdded,
    entitiesRemoved,
    entitiesChanged,
    relationsAdded,
    relationsRemoved,
    relationsChanged,
    highlightedEntityIds: current.highlightedEntityIds?.slice(0, 50) ?? [],
  };
}

export async function captureWorkspaceGraphSurface(
  root: HTMLElement,
  output = { width: 1280, height: 720 }
): Promise<CapturedGraphFrame> {
  const sourceCanvases = Array.from(root.querySelectorAll('canvas')).filter(
    (canvas): canvas is HTMLCanvasElement =>
      canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0
  );
  if (!sourceCanvases.length) {
    throw new Error('The graph renderer has not produced a capturable frame yet.');
  }
  const target = document.createElement('canvas');
  target.width = output.width;
  target.height = output.height;
  const context = target.getContext('2d');
  if (!context) {
    throw new Error('Canvas capture is unavailable in this Webview.');
  }
  const background =
    getComputedStyle(root).backgroundColor || getComputedStyle(document.body).backgroundColor;
  context.fillStyle = background && background !== 'rgba(0, 0, 0, 0)' ? background : '#020617';
  context.fillRect(0, 0, output.width, output.height);

  const primary = sourceCanvases[0];
  const sourceRatio = primary.width / primary.height;
  const targetRatio = output.width / output.height;
  const drawWidth = sourceRatio > targetRatio ? output.width : output.height * sourceRatio;
  const drawHeight = sourceRatio > targetRatio ? output.width / sourceRatio : output.height;
  const offsetX = (output.width - drawWidth) / 2;
  const offsetY = (output.height - drawHeight) / 2;
  for (const canvas of sourceCanvases) {
    context.drawImage(canvas, offsetX, offsetY, drawWidth, drawHeight);
  }
  return {
    width: output.width,
    height: output.height,
    pngDataUrl: target.toDataURL('image/png'),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not encode recording.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export class WorkspaceGraphWebmRecorder {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly stream: MediaStream;
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private stopped = false;

  private constructor(input: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    stream: MediaStream;
    recorder: MediaRecorder;
  }) {
    this.canvas = input.canvas;
    this.context = input.context;
    this.stream = input.stream;
    this.recorder = input.recorder;
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.start(1000);
  }

  static create(width = 1280, height = 720): WorkspaceGraphWebmRecorder | null {
    if (
      typeof MediaRecorder === 'undefined' ||
      typeof HTMLCanvasElement === 'undefined' ||
      typeof HTMLCanvasElement.prototype.captureStream !== 'function'
    ) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const stream = canvas.captureStream(2);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
      (value) => MediaRecorder.isTypeSupported(value)
    );
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      return new WorkspaceGraphWebmRecorder({ canvas, context, stream, recorder });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
  }

  async addFrame(pngDataUrl: string): Promise<void> {
    if (this.stopped) {
      return;
    }
    const image = new Image();
    image.src = pngDataUrl;
    await image.decode();
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
    const track = this.stream.getVideoTracks()[0] as MediaStreamTrack & {
      requestFrame?: () => void;
    };
    track?.requestFrame?.();
  }

  async stop(): Promise<string | undefined> {
    if (this.stopped) {
      return undefined;
    }
    this.stopped = true;
    const completed = new Promise<void>((resolve) => {
      this.recorder.onstop = () => resolve();
    });
    this.recorder.requestData();
    this.recorder.stop();
    await completed;
    this.stream.getTracks().forEach((track) => track.stop());
    if (!this.chunks.length) {
      return undefined;
    }
    return blobToDataUrl(new Blob(this.chunks, { type: this.recorder.mimeType || 'video/webm' }));
  }
}
