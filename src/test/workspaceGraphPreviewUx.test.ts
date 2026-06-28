import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const componentPath = path.join(
  repoRoot,
  'webview-ui',
  'src',
  'components',
  'WorkspaceGraphPreview.tsx'
);
const stylesPath = path.join(repoRoot, 'webview-ui', 'src', 'styles', 'workspai-primitives.css');

describe('workspace graph preview UX contract', () => {
  it('replaces zero-edge circle graphs with diagnostic guidance and node inventory', () => {
    const source = fs.readFileSync(componentPath, 'utf8');

    expect(source).toContain('workspace-graph-preview--edge-empty');
    expect(source).toContain('No dependency edges discovered');
    expect(source).toContain('blast-radius, ownership, or verify-order');
    expect(source).toContain('Run graph explain');
    expect(source).toContain('workspace contract graph');
    expect(source).toContain('graph overrides');
    expect(source).toContain('workspace-graph-preview__node-chip');
    expect(source).toContain('diagnostics[0]?.message');
    expect(source).toContain('diagnostics[0]?.recommendation');
  });

  it('keeps connected graphs evidence-aware instead of showing unlabeled circles only', () => {
    const source = fs.readFileSync(componentPath, 'utf8');

    expect(source).toContain('graphDensityLabel');
    expect(source).toContain('workspace-graph-preview__edge-label');
    expect(source).toContain('workspace-graph-preview__insights');
    expect(source).toContain('edge.confidence');
    expect(source).toContain('edge.source');
    expect(source).toContain('edgeCoverageRatio');
    expect(source).toContain('evidenceCoverageRatio');
    expect(source).toContain('authoritativeEdges');
    expect(source).toContain('lowConfidenceEdges');
    expect(source).toContain('hotspotCount');
  });

  it('surfaces npm operational weight and graph diagnostics in the preview', () => {
    const source = fs.readFileSync(componentPath, 'utf8');

    expect(source).toContain('topOperationalNodes');
    expect(source).toContain('operationalProfile?.weight');
    expect(source).toContain('operationalProfile?.score');
    expect(source).toContain('verificationPriority');
    expect(source).toContain('workspace-graph-preview__diagnostic-list');
    expect(source).toContain('workspace-graph-preview__operational');
  });

  it('ships stable styling for diagnostic and insight states', () => {
    const styles = fs.readFileSync(stylesPath, 'utf8');

    expect(styles).toContain('.workspace-graph-preview--edge-empty');
    expect(styles).toContain('.workspace-graph-preview__diagnostic');
    expect(styles).toContain('.workspace-graph-preview__node-chip');
    expect(styles).toContain('.workspace-graph-preview__edge-label');
    expect(styles).toContain('.workspace-graph-preview__insights');
    expect(styles).toContain('.workspace-graph-preview__diagnostic-list');
    expect(styles).toContain('.workspace-graph-preview__diagnostic-pill');
    expect(styles).toContain('.workspace-graph-preview__operational');
  });
});
