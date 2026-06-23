import { describe, expect, it } from 'vitest';

import {
  formatWorkspaceRunEvidenceSummary,
  listWorkspaceRunStageReports,
  normalizeWorkspaceRunEvidence,
  resolveWorkspaceRunCardReport,
  resolveWorkspaceRunStageReport,
} from '../core/workspaceRunEvidence';

describe('workspaceRunEvidence', () => {
  it('normalizes legacy flat stage report', () => {
    const legacy = {
      stage: 'test',
      generatedAt: '2026-06-16T12:00:00.000Z',
      workspacePath: '/ws',
      summary: { passed: 2, failed: 0, skipped: 0, exitCode: 0 },
      projects: [],
      gates: { blocked: false },
    };

    const normalized = normalizeWorkspaceRunEvidence(legacy);
    expect(normalized?.schemaVersion).toBe('workspace-run-v1');
    expect(normalized?.latestStage).toBe('test');
    expect(resolveWorkspaceRunCardReport(legacy)?.stage).toBe('test');
  });

  it('reads stage-specific report from aggregate', () => {
    const aggregate = {
      schemaVersion: 'workspace-run-v1',
      generatedAt: '2026-06-16T12:00:00.000Z',
      workspacePath: '/ws',
      latestStage: 'build',
      stages: {
        test: {
          stage: 'test',
          summary: { passed: 1, failed: 0, skipped: 0, exitCode: 0 },
          projects: [],
          gates: { blocked: false },
        },
        build: {
          stage: 'build',
          summary: { passed: 1, failed: 0, skipped: 0, exitCode: 0 },
          projects: [],
          gates: { blocked: false },
        },
      },
    };

    expect(resolveWorkspaceRunStageReport(aggregate, 'test')?.stage).toBe('test');
    expect(resolveWorkspaceRunCardReport(aggregate)?.stage).toBe('build');
  });

  it('formats multi-stage summary for test and build', () => {
    const aggregate = {
      schemaVersion: 'workspace-run-v1',
      generatedAt: '2026-06-16T12:00:00.000Z',
      workspacePath: '/ws',
      latestStage: 'build',
      stages: {
        test: {
          stage: 'test',
          summary: { passed: 2, failed: 0, skipped: 1, exitCode: 0 },
          projects: [],
        },
        build: {
          stage: 'build',
          summary: { passed: 1, failed: 0, skipped: 0, exitCode: 0 },
          projects: [],
        },
      },
    };

    const summary = formatWorkspaceRunEvidenceSummary(aggregate);
    expect(summary).toContain('test: 2 passed');
    expect(summary).toContain('build: 1 passed');
    expect(listWorkspaceRunStageReports(aggregate).length).toBe(2);
  });
});
