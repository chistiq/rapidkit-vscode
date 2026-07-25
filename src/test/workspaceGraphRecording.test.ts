import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { WorkspaceGraphProjection } from '../contracts/workspaceGraphProjection.js';
import { describeWorkspaceGraphRecordingChange } from '../../webview-ui/src/lib/workspaceGraphRecording.js';
import { WorkspaceGraphRecordingManager } from '../core/workspaceGraphRecordingManager.js';

const roots: string[] = [];
const pngFixture = Buffer.alloc(45);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngFixture);
pngFixture.write('IHDR', 12, 'ascii');
pngFixture.writeUInt32BE(1280, 16);
pngFixture.writeUInt32BE(720, 20);
pngFixture.write('IEND', 37, 'ascii');
const PNG = `data:image/png;base64,${pngFixture.toString('base64')}`;
const WEBM = `data:video/webm;base64,${Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]).toString(
  'base64'
)}`;

function projection(revision: string, entityIds: string[]): WorkspaceGraphProjection {
  return {
    schemaVersion: 'workspace-graph-projection.v1',
    sourceSchemaVersion: 'workspace-knowledge-graph.v1',
    revision,
    truncated: false,
    total: { entities: entityIds.length, relations: 0, proofs: 0 },
    entities: entityIds.map((id) => ({
      id,
      kind: id.startsWith('workspace:') ? 'workspace' : 'service',
      label: id,
      proofIds: [],
      attributes: {},
    })),
    relations: [],
    proofs: [],
    providers: [],
    quality: {},
    diagnostics: [],
  };
}

function frame(sessionId: string, revision: string, title = revision) {
  return {
    sessionId,
    revision,
    capturedAt: new Date().toISOString(),
    width: 1280,
    height: 720,
    pngDataUrl: PNG,
    change: {
      kind: 'revision' as const,
      title,
      revision,
      entitiesAdded: 1,
      entitiesRemoved: 0,
      entitiesChanged: 0,
      relationsAdded: 0,
      relationsRemoved: 0,
      relationsChanged: 0,
      highlightedEntityIds: [],
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Workspace Graph recording', () => {
  it('describes only meaningful graph revisions', () => {
    const first = projection('revision-1', ['workspace:test']);
    const second = projection('revision-2', ['workspace:test', 'service:api']);

    expect(describeWorkspaceGraphRecordingChange(null, first)).toMatchObject({
      kind: 'baseline',
      entitiesAdded: 1,
    });
    expect(describeWorkspaceGraphRecordingChange(first, first)).toBeNull();
    expect(describeWorkspaceGraphRecordingChange(first, second)).toMatchObject({
      kind: 'revision',
      previousRevision: 'revision-1',
      revision: 'revision-2',
      entitiesAdded: 1,
    });
  });

  it('serializes concurrent frames, skips duplicate revisions, and finalizes portable outputs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-graph-recording-'));
    roots.push(root);
    await fs.mkdir(path.join(root, '.workspai'));
    const manager = new WorkspaceGraphRecordingManager();
    const started = await manager.start({
      workspacePath: root,
      mode: 'change-driven',
      initialRevision: 'revision-1',
    });
    expect(started.status).toBe('recording');
    expect(started.sessionId).toBeTruthy();

    const sessionId = started.sessionId as string;
    await Promise.all([
      manager.appendFrame(frame(sessionId, 'revision-1', 'Baseline')),
      manager.appendFrame(frame(sessionId, 'revision-2', 'API added')),
    ]);
    const duplicate = await manager.appendFrame(frame(sessionId, 'revision-2'));
    expect(duplicate.frameCount).toBe(2);
    expect(duplicate.message).toContain('Duplicate revision');

    const completed = await manager.stop({ sessionId, webmDataUrl: WEBM });
    expect(completed).toMatchObject({ status: 'ready', frameCount: 2 });
    expect(completed.webmPath).toMatch(/graph-story\.webm$/);
    const manifest = JSON.parse(await fs.readFile(completed.manifestPath as string, 'utf8')) as {
      schemaVersion: string;
      status: string;
      retainedBytes: number;
      outputs: Record<string, string>;
      frames: Array<{ path: string }>;
    };
    expect(manifest).toMatchObject({
      schemaVersion: 'workspace-graph-recording.v1',
      status: 'completed',
      retainedBytes: 90,
      outputs: {
        manifest: 'recording.json',
        frames: 'frames',
        webm: 'graph-story.webm',
      },
    });
    expect(manifest.frames.map((entry: { path: string }) => entry.path)).toEqual([
      'frames/frame-0001.png',
      'frames/frame-0002.png',
    ]);
  });

  it('rejects spoofed media and keeps recordings within the configured root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-graph-recording-'));
    roots.push(root);
    const manager = new WorkspaceGraphRecordingManager();
    const started = await manager.start({
      workspacePath: root,
      mode: 'manual',
      initialRevision: 'revision-1',
    });
    const sessionId = started.sessionId as string;
    await expect(
      manager.appendFrame({
        ...frame(sessionId, 'revision-1'),
        pngDataUrl: `data:image/png;base64,${Buffer.from('not a png').toString('base64')}`,
      })
    ).rejects.toThrow('signature');
    const failed = await manager.fail(sessionId, new Error('capture rejected'));
    expect(failed.status).toBe('error');
    expect(path.relative(root, failed.outputPath as string)).toMatch(
      /^\.workspai[/\\]recordings[/\\]/
    );
  });
});
