import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildDashboardEvidenceBundle } from '../core/dashboardEvidenceBridge';

describe('dashboardEvidenceBridge', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  async function createWorkspaceWithReports(
    reports: Record<string, Record<string, unknown>>
  ): Promise<string> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-evidence-'));
    tempDirs.push(workspacePath);
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);
    for (const [fileName, payload] of Object.entries(reports)) {
      await fs.writeJSON(path.join(reportsDir, fileName), payload);
    }
    return workspacePath;
  }

  it('builds doctor and analyze cards from report artifacts', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'doctor-last-run.json': {
        generatedAt: '2026-06-10T10:00:00.000Z',
        healthScore: { passed: 8, warnings: 1, errors: 0, total: 9 },
      },
      'analyze-last-run.json': {
        generatedAt: '2026-06-10T10:05:00.000Z',
        summary: {
          score: 92,
          verdict: 'pass',
          findings: { fail: 0, warn: 1 },
        },
      },
      'release-readiness-last-run.json': {
        generatedAt: '2026-06-10T10:10:00.000Z',
        overallStatus: 'pass',
        blockingReasons: [],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const doctor = bundle.cards.find((card) => card.id === 'doctor');
    const analyze = bundle.cards.find((card) => card.id === 'analyze');
    const readiness = bundle.cards.find((card) => card.id === 'readiness');

    expect(doctor?.status).toBe('warn');
    expect(analyze?.status).toBe('pass');
    expect(readiness?.status).toBe('pass');
  });

  it('returns missing cards when workspace has no reports', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(bundle.cards.some((card) => card.id === 'doctor' && card.status === 'missing')).toBe(
      true
    );
    expect(bundle.cards.some((card) => card.id === 'analyze' && card.status === 'missing')).toBe(
      true
    );
  });

  it('includes autopilot and project doctor cards when evidence exists', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'autopilot-release.json': {
        generatedAt: '2026-06-10T10:20:00.000Z',
        overallStatus: 'pass',
      },
    });
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(path.join(projectPath, '.rapidkit', 'reports'));
    await fs.writeJSON(
      path.join(projectPath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
      {
        generatedAt: '2026-06-10T10:15:00.000Z',
        healthScore: { passed: 5, warnings: 0, errors: 1, total: 6 },
        projects: [{ name: 'api', path: projectPath, issues: ['Missing dependency lockfile'] }],
      }
    );

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });

    expect(findEvidenceCard(bundle, 'autopilot')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'projectDoctor')?.status).toBe('fail');
    expect(findEvidenceCard(bundle, 'projectDoctor')?.blockers?.[0]).toContain('lockfile');
  });

  it('builds mirror, infra, policy, and cache governance cards', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'mirror-ops.latest.json': {
        timestamp: '2026-06-11T10:00:00.000Z',
        result: 'ok',
        mirror: { configExists: true, artifactsCount: 2 },
      },
      'infra-plan.json': {
        generatedAt: '2026-06-11T10:05:00.000Z',
        services: [{ name: 'postgres' }, { name: 'redis' }],
      },
    });
    await fs.writeFile(
      path.join(workspacePath, '.rapidkit', 'policies.yml'),
      'mode: warn\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(workspacePath, '.rapidkit', 'cache-config.yml'),
      'strategy: shared\n',
      'utf8'
    );

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(findEvidenceCard(bundle, 'mirror')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'infra')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'policy')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'cache')?.status).toBe('pass');
  });
});

function findEvidenceCard(
  bundle: Awaited<ReturnType<typeof buildDashboardEvidenceBundle>>,
  id: string
) {
  return bundle.cards.find((card) => card.id === id);
}
