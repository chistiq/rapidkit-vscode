import { describe, expect, it } from 'vitest';

import { buildWorkspaceArchitectureBlock } from '../ui/panels/welcomePanelStructuredPromptBlocks';
import type { DoctorEvidenceSnapshot } from '../ui/panels/incidentStudioDoctorEvidence';

describe('welcomePanelStructuredPromptBlocks', () => {
  it('builds a no-evidence architecture block with safe guidance', () => {
    const block = buildWorkspaceArchitectureBlock(undefined, '/tmp/ws');

    expect(block).toContain('WORKSPACE ARCHITECTURE (from doctor evidence):');
    expect(block).toContain('$WORKSPACE');
    expect(block).not.toContain('/tmp/ws');
    expect(block).toContain('doctor-last-run.json');
  });

  it('summarizes healthy multi-project workspace evidence', () => {
    const snapshot: DoctorEvidenceSnapshot = {
      workspaceName: 'demo-ws',
      projectCount: 2,
      projectsWithIssues: 0,
      issueCount: 0,
      health: { total: 20, percent: 95, passed: 20, warnings: 0, errors: 0 },
      frameworks: [],
      projects: [
        {
          name: 'api',
          path: '/tmp/ws/api',
          framework: 'fastapi',
          issues: 0,
          depsInstalled: true,
          kit: 'fastapi.standard',
        },
        {
          name: 'web',
          path: '/tmp/ws/web',
          framework: 'react',
          issues: 0,
          depsInstalled: true,
          projectKind: 'frontend',
          modulesHealthy: true,
        },
      ],
      fixCommands: [],
    };

    const block = buildWorkspaceArchitectureBlock(snapshot, '/tmp/ws');

    expect(block).toContain('Health: 95%');
    expect(block).toContain('api (fastapi)');
    expect(block).toContain('web (react)');
    expect(block).toContain('Workspace baseline is healthy');
    expect(block).toContain('healthy frontend source tree');
  });
});
