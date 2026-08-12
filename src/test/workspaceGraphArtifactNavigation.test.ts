import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveWorkspaceGraphArtifactFromRegistry } from '../core/workspaceGraphArtifactNavigation.js';
import type { WorkspaceRegistrySummary } from '../core/workspaceRegistrySummary.js';

const registry = {
  schemaVersion: 'workspace-registry-summary.v1',
  kind: 'rapidkit.workspace.registry',
  generatedAt: '2026-08-11T00:00:00.000Z',
  workspacePath: '/central/workspai',
  workspaceName: 'workspai',
  projectCount: 1,
  authority: 'workspace.contract.json',
  contractPath: '.workspai/workspace.contract.json',
  registrySummaryPath: '.workspai/workspace-registry.v1.json',
  projects: [{ slug: 'deno', relativePath: '../../Reference/deno' }],
  sources: {
    contract: { exists: true, projectCount: 1 },
    globalRegistry: { exists: false, projectCount: 0 },
    legacyWorkspaceJson: { exists: false, projectCount: 0 },
  },
} as WorkspaceRegistrySummary;

describe('workspace graph artifact navigation', () => {
  it('resolves portable external proof paths against their registered project boundary', () => {
    const resolution = resolveWorkspaceGraphArtifactFromRegistry(
      '/central/workspai',
      'external/deno/cli/main.rs',
      registry
    );

    expect(resolution).toEqual({
      path: path.resolve('/central/workspai', '../../Reference/deno/cli/main.rs'),
      projectRoot: path.resolve('/central/workspai', '../../Reference/deno'),
      projectId: 'deno',
    });
  });

  it('fails closed for unknown projects and traversal attempts', () => {
    expect(
      resolveWorkspaceGraphArtifactFromRegistry(
        '/central/workspai',
        'external/unknown/src/index.ts',
        registry
      )
    ).toBeNull();
    expect(
      resolveWorkspaceGraphArtifactFromRegistry(
        '/central/workspai',
        'external/deno/../secrets.txt',
        registry
      )
    ).toBeNull();
  });
});
