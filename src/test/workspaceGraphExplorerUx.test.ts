import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');

describe('Workspace Graph dashboard UX', () => {
  it('exposes a dedicated accessible graph tab', () => {
    const sections = fs.readFileSync(
      path.join(root, 'webview-ui/src/lib/dashboardSections.ts'),
      'utf8'
    );
    const nav = fs.readFileSync(
      path.join(root, 'webview-ui/src/components/DashboardSubNav.tsx'),
      'utf8'
    );
    expect(sections).toContain("id: 'graph'");
    expect(sections).toContain("label: 'Graph'");
    expect(nav).toContain('graph: Network');
  });

  it('uses canonical projection evidence and offers bounded modes, proof inspection, and exports', () => {
    const source = fs.readFileSync(
      path.join(root, 'webview-ui/src/components/WorkspaceGraphExplorer.tsx'),
      'utf8'
    );
    expect(source).toContain('findWorkspaceGraphProjection');
    expect(source).toContain("type GraphMode = 'explore' | 'architecture'");
    expect(source).toContain('Proof paths');
    expect(source).toContain('Bounded view');
    expect(source).toContain("onExport('jsonld')");
    expect(source).toContain('WorkspaceGraphCanvas');
    expect(source).toContain('WorkspaceGraphWebgl');
    expect(source).toContain('resolveWorkspaceGraphRenderer');
    expect(source).toContain('data-renderer={renderer}');
    expect(source).toContain('burst updates merged');
    expect(source).toContain('Memory {formatMemory');
    expect(source).toContain('Isolate neighborhood');
    expect(source).toContain("setQuery('')");
    expect(source).toContain("setKind('all')");
    expect(source).toContain("setProject('all')");
    expect(source).toContain('Project cluster');
    expect(source).toContain('Present');
    expect(source).toContain('Record');
    expect(source).toContain('captureWorkspaceGraphSurface');
    expect(source).toContain('describeWorkspaceGraphRecordingChange');
    expect(source).toContain('WorkspaceGraphWebmRecorder');
    expect(source).toContain('stableFrameDelayMs');
    expect(source).not.toContain('readFile');
    expect(source).not.toContain('child_process');
  });

  it('keeps recording artifacts host-owned and bounded by a public contract', () => {
    const manager = fs.readFileSync(
      path.join(root, 'src/core/workspaceGraphRecordingManager.ts'),
      'utf8'
    );
    const contract = fs.readFileSync(
      path.join(root, 'src/contracts/workspaceGraphRecording.ts'),
      'utf8'
    );
    expect(manager).toContain("'.workspai', 'recordings'");
    expect(manager).toContain('assertSafeRecordingParent');
    expect(manager).toContain('writeManifest');
    expect(manager).toContain('Duplicate revision skipped');
    expect(manager).toContain('private serial');
    expect(contract).toContain('maxFrames: 180');
    expect(contract).toContain('maxDurationMs: 10 * 60 * 1000');
  });

  it('ships graph layout as a dedicated worker instead of blocking React', () => {
    const build = fs.readFileSync(path.join(root, 'webview-ui/esbuild.js'), 'utf8');
    const worker = fs.readFileSync(
      path.join(root, 'webview-ui/src/workers/workspaceGraphLayout.worker.ts'),
      'utf8'
    );
    expect(build).toContain("graphWorker: 'src/workers/workspaceGraphLayout.worker.ts'");
    expect(worker).toContain('layoutWorkspaceGraph');
    const loader = fs.readFileSync(
      path.join(root, 'webview-ui/src/lib/workspaceGraphWorker.ts'),
      'utf8'
    );
    expect(loader).toContain('fetchSource');
    expect(loader).toContain('createObjectURL');
    expect(loader).toContain('revokeObjectURL');
  });

  it('keeps 3D behind a capability-gated renderer contract', () => {
    const renderer = fs.readFileSync(
      path.join(root, 'webview-ui/src/lib/workspaceGraphRenderer.ts'),
      'utf8'
    );
    expect(renderer).toContain("'webgl3d'");
    expect(renderer).toContain('capabilities.webgl2');
    expect(renderer).toContain('prefersReducedMotion');
    expect(renderer).toContain("return 'canvas2d'");
  });

  it('ships an optional context-loss-safe WebGL2 renderer over the same projection', () => {
    const source = fs.readFileSync(
      path.join(root, 'webview-ui/src/components/WorkspaceGraphWebgl.tsx'),
      'utf8'
    );
    expect(source).toContain("getContext('webgl2'");
    expect(source).toContain('webglcontextlost');
    expect(source).toContain('onFallback');
    expect(source).toContain('createWorkspaceGraphWorker');
    expect(source).not.toContain('workspace-knowledge-graph.json');
  });
});
