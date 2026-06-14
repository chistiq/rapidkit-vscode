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
      'pipeline-last-run.json': {
        generatedAt: '2026-06-10T10:02:00.000Z',
        schemaVersion: 'rapidkit-pipeline-v1',
        summary: {
          verdict: 'ready',
          exitCode: 0,
          stagesPassed: 5,
          stagesWarn: 0,
          stagesFailed: 0,
        },
        stages: [],
        blockingReasons: [],
        artifacts: { reportPath: '.rapidkit/reports/pipeline-last-run.json' },
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
    const pipeline = bundle.cards.find((card) => card.id === 'pipeline');
    const analyze = bundle.cards.find((card) => card.id === 'analyze');
    const readiness = bundle.cards.find((card) => card.id === 'readiness');

    expect(doctor?.status).toBe('warn');
    expect(pipeline?.status).toBe('pass');
    expect(analyze?.status).toBe('pass');
    expect(readiness?.status).toBe('pass');
  });

  it('maps blocked pipeline verdicts to fail evidence status', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'pipeline-last-run.json': {
        generatedAt: '2026-06-10T10:02:00.000Z',
        summary: {
          verdict: 'blocked',
          stagesPassed: 2,
          stagesWarn: 0,
          stagesFailed: 2,
        },
        blockingReasons: ['readiness gate failed'],
        stages: [],
        artifacts: { reportPath: '.rapidkit/reports/pipeline-last-run.json' },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const pipeline = findEvidenceCard(bundle, 'pipeline');

    expect(pipeline?.status).toBe('fail');
    expect(pipeline?.blockers?.[0]).toContain('readiness gate failed');
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

  it('reads workspace-level project doctor evidence for the selected project', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(projectPath);
    await fs.writeJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
      {
        generatedAt: '2026-06-10T10:15:00.000Z',
        schemaVersion: 'doctor-project-evidence-v1',
        evidenceType: 'project',
        workspacePath,
        projectPath,
        projectName: 'api',
        healthScore: { passed: 6, warnings: 0, errors: 0, total: 6 },
        project: { name: 'api', path: projectPath, issues: [] },
      }
    );

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });
    const projectDoctor = findEvidenceCard(bundle, 'projectDoctor');

    expect(projectDoctor?.status).toBe('pass');
    expect(projectDoctor?.artifactPath).toBe(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-project-last-run.json')
    );
  });

  it('reads legacy project-root doctor evidence for the selected project', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(path.join(projectPath, '.rapidkit', 'reports'));
    await fs.writeJSON(path.join(projectPath, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      generatedAt: '2026-06-10T10:15:00.000Z',
      healthScore: { passed: 8, warnings: 1, errors: 0, total: 9 },
      projects: [{ name: 'api', path: projectPath, issues: ['Pin runtime version'] }],
    });

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });
    const projectDoctor = findEvidenceCard(bundle, 'projectDoctor');

    expect(projectDoctor?.status).toBe('warn');
    expect(projectDoctor?.artifactPath).toBe(
      path.join(projectPath, '.rapidkit', 'reports', 'doctor-last-run.json')
    );
    expect(projectDoctor?.blockers?.[0]).toContain('runtime');
  });

  it('discovers timestamped project doctor evidence when exact filenames are absent', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(path.join(projectPath, '.rapidkit', 'reports'));
    const artifactPath = path.join(
      projectPath,
      '.rapidkit',
      'reports',
      'project-doctor-20260614-120000.json'
    );
    await fs.writeJSON(artifactPath, {
      generatedAt: '2026-06-14T12:00:00.000Z',
      projectPath,
      projectName: 'api',
      healthScore: { passed: 7, warnings: 0, errors: 0, total: 7 },
      projects: [{ name: 'api', path: projectPath, issues: [] }],
    });

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });
    const projectDoctor = findEvidenceCard(bundle, 'projectDoctor');

    expect(projectDoctor?.status).toBe('pass');
    expect(projectDoctor?.artifactPath).toBe(artifactPath);
  });

  it('ignores workspace-level project doctor evidence for a different project', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const projectPath = path.join(workspacePath, 'api');
    const otherProjectPath = path.join(workspacePath, 'worker');
    await fs.ensureDir(projectPath);
    await fs.writeJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
      {
        generatedAt: '2026-06-10T10:15:00.000Z',
        schemaVersion: 'doctor-project-evidence-v1',
        evidenceType: 'project',
        workspacePath,
        projectPath: otherProjectPath,
        projectName: 'worker',
        healthScore: { passed: 6, warnings: 0, errors: 0, total: 6 },
        project: { name: 'worker', path: otherProjectPath, issues: [] },
      }
    );

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });

    expect(findEvidenceCard(bundle, 'projectDoctor')?.status).toBe('missing');
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
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}', 'utf8');
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      projects: [{ name: 'api', path: 'api' }],
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'toolchain.lock'), {
      node: '20',
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.contract.json'), {
      projects: [{ name: 'api', path: 'api' }],
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

    expect(findEvidenceCard(bundle, 'workspaceSync')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'foundation')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'contract')?.status).toBe('pass');
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
