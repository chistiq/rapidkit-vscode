import { describe, expect, it } from 'vitest';

import { filterDoctorSummaryForProjectScope } from '../ui/panels/incidentStudioTelemetry';

describe('filterDoctorSummaryForProjectScope', () => {
  it('returns unchanged summary when no project path is provided', () => {
    const summary = { projectCount: 2, health: { percent: 80 } };
    expect(filterDoctorSummaryForProjectScope(summary, undefined)).toBe(summary);
  });

  it('filters doctor projects and recomputes health for project scope', () => {
    const filtered = filterDoctorSummaryForProjectScope(
      {
        projectCount: 2,
        projectsWithIssues: 1,
        issueCount: 3,
        health: { passed: 8, warnings: 1, errors: 1, total: 10, percent: 80 },
        projects: [
          {
            name: 'api',
            path: '/ws/projects/api',
            issues: 2,
            probes: [{ status: 'pass' }, { status: 'fail', severity: 'error' }],
          },
          {
            name: 'web',
            path: '/ws/projects/web',
            issues: 1,
            probes: [{ status: 'pass' }],
          },
        ],
      },
      '/ws/projects/api'
    ) as Record<string, unknown>;

    expect(filtered.projectCount).toBe(1);
    expect(Array.isArray(filtered.projects)).toBe(true);
    expect((filtered.projects as Array<{ name: string }>)[0]?.name).toBe('api');
    expect((filtered.health as { passed: number; errors: number }).passed).toBe(1);
    expect((filtered.health as { passed: number; errors: number }).errors).toBe(1);
    expect((filtered.scopeProvenance as { dominantScope: string }).dominantScope).toBe('project');
  });
});
