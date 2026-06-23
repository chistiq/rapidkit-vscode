import { describe, expect, it } from 'vitest';

import {
  formatWorkspaceRegistrySyncSummary,
  WORKSPACE_REGISTRY_SUMMARY_SCHEMA_VERSION,
} from '../core/workspaceRegistrySummary';

describe('workspaceRegistrySummary', () => {
  it('formats contract-backed registry summaries', () => {
    const summary = {
      schemaVersion: WORKSPACE_REGISTRY_SUMMARY_SCHEMA_VERSION,
      kind: 'rapidkit.workspace.registry' as const,
      generatedAt: '2026-06-16T00:00:00.000Z',
      workspacePath: '/tmp/ws',
      workspaceName: 'ws',
      profile: 'polyglot',
      projectCount: 2,
      authority: 'workspace.contract.json' as const,
      contractPath: '.rapidkit/workspace.contract.json',
      registrySummaryPath: '.rapidkit/workspace-registry.v1.json',
      projects: [],
      sources: {
        contract: { exists: true, projectCount: 2 },
        globalRegistry: { exists: false, projectCount: 0 },
        legacyWorkspaceJson: { exists: true, projectCount: 0 },
      },
    };

    expect(formatWorkspaceRegistrySyncSummary(summary, ' · profile polyglot')).toBe(
      '2 project(s) registered in workspace contract · profile polyglot.'
    );
  });
});
