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

  it('describes pending bootstrap compliance when profile exists but report is missing', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    await fs.ensureDir(path.join(workspacePath, '.rapidkit'));
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      schema_version: '1.0',
      workspace_name: 'demo-ws',
      profile: 'polyglot',
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const bootstrap = findEvidenceCard(bundle, 'bootstrap');

    expect(bootstrap?.status).toBe('missing');
    expect(bootstrap?.metrics?.pendingBootstrap).toBe(1);
    expect(bootstrap?.summary).toContain('polyglot');
    expect(bootstrap?.summary).toContain('Run Bootstrap');
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

  it('reads autopilot evidence from last-run report when alias is absent', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'autopilot-release-last-run.json': {
        generatedAt: '2026-06-10T10:20:00.000Z',
        summary: { verdict: 'approved' },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const autopilot = findEvidenceCard(bundle, 'autopilot');

    expect(autopilot?.status).toBe('pass');
    expect(autopilot?.artifactPath).toContain('autopilot-release-last-run.json');
  });

  it('softens diff and impact for empty workspaces across profiles', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model.json': {
        generatedAt: '2026-06-15T10:00:00.000Z',
        workspace: { profile: 'polyglot' },
        summary: { projectCount: 0 },
        validation: { status: 'passed', errors: 0, warnings: 0 },
      },
      'workspace-model-diff-last-run.json': {
        generatedAt: '2026-06-15T10:02:00.000Z',
        summary: {
          changed: true,
          addedProjects: 0,
          removedProjects: 0,
          changedProjects: 0,
          gitChangedFiles: 2,
        },
        git: { untrackedFiles: 2 },
        changes: [{ type: 'git.untracked', severity: 'info' }],
      },
      'workspace-impact-last-run.json': {
        generatedAt: '2026-06-15T10:03:00.000Z',
        summary: {
          risk: 'high',
          affectedProjects: 0,
          recommendedCommands: 0,
        },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(findEvidenceCard(bundle, 'workspaceDiff')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'workspaceDiff')?.summary).toContain('no project model drift');
    expect(findEvidenceCard(bundle, 'workspaceImpact')?.status).toBe('warn');
  });

  it('downgrades workspace-only high impact to warn when projects exist but none are affected', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model-snapshot.json': {
        generatedAt: '2026-06-15T10:01:00.000Z',
        modelHash: 'abc12345',
        model: { summary: { projectCount: 1 } },
      },
      'workspace-impact-last-run.json': {
        generatedAt: '2026-06-15T10:03:00.000Z',
        summary: {
          risk: 'high',
          affectedProjects: 0,
          workspaceItems: 1169,
          recommendedCommands: 1,
        },
        workspaceImpact: [{ target: 'AGENTS.md', summary: 'git untracked after agent-sync' }],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const card = findEvidenceCard(bundle, 'workspaceImpact');

    expect(card?.status).toBe('warn');
    expect(card?.summary).toContain('1169 workspace item(s)');
  });

  it('includes frontend probe warnings in project doctor blockers', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const projectPath = path.join(workspacePath, 'catalog-api');
    await fs.ensureDir(projectPath);
    await fs.writeJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
      {
        generatedAt: '2026-06-10T10:15:00.000Z',
        schemaVersion: 'doctor-project-evidence-v1',
        evidenceType: 'project',
        workspacePath,
        projectPath,
        projectName: 'catalog-api',
        healthScore: { passed: 5, warnings: 1, errors: 0, total: 6 },
        project: {
          name: 'catalog-api',
          path: projectPath,
          projectKind: 'frontend',
          issues: [],
          vulnerabilities: 2,
          probes: [
            {
              id: 'frontend-script-test',
              label: 'test script surface',
              status: 'warn',
              reason: 'No test script detected for Next.js.',
            },
          ],
        },
      }
    );

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'catalog-api',
    });
    const projectDoctor = findEvidenceCard(bundle, 'projectDoctor');

    expect(projectDoctor?.status).toBe('warn');
    expect(projectDoctor?.blockers).toEqual(
      expect.arrayContaining([
        '2 npm security vulnerabilities reported',
        'test script surface: No test script detected for Next.js.',
      ])
    );
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

  it('ignores workspace-level project doctor evidence without project identity', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(projectPath);
    await fs.writeJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
      {
        generatedAt: '2026-06-10T10:15:00.000Z',
        healthScore: { passed: 6, warnings: 0, errors: 0, total: 6 },
      }
    );

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });

    expect(findEvidenceCard(bundle, 'projectDoctor')?.status).toBe('missing');
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
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      kind: 'rapidkit.workspace.registry',
      generatedAt: '2026-06-11T10:00:00.000Z',
      workspacePath,
      workspaceName: path.basename(workspacePath),
      projectCount: 1,
      authority: 'workspace.contract.json',
      contractPath: '.rapidkit/workspace.contract.json',
      registrySummaryPath: '.rapidkit/workspace-registry.v1.json',
      projects: [{ slug: 'api', relativePath: 'api' }],
      sources: {
        contract: { exists: true, projectCount: 1 },
        globalRegistry: { exists: false, projectCount: 0 },
        legacyWorkspaceJson: { exists: true, projectCount: 1 },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(findEvidenceCard(bundle, 'workspaceSync')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'foundation')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'contract')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'mirror')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'infra')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'policy')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'cache')?.status).toBe('pass');
  });

  it('builds workspace intelligence evidence cards from canonical npm reports', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model.json': {
        generatedAt: '2026-06-15T10:00:00.000Z',
        summary: { projectCount: 2 },
        validation: { status: 'passed', errors: 0, warnings: 0 },
      },
      'workspace-model-snapshot.json': {
        generatedAt: '2026-06-15T10:01:00.000Z',
        modelHash: 'abc12345',
        model: { summary: { projectCount: 2 } },
      },
      'workspace-model-diff-last-run.json': {
        generatedAt: '2026-06-15T10:02:00.000Z',
        summary: {
          changed: true,
          addedProjects: 1,
          removedProjects: 0,
          changedProjects: 0,
        },
        changes: [],
      },
      'workspace-impact-last-run.json': {
        generatedAt: '2026-06-15T10:03:00.000Z',
        summary: {
          risk: 'medium',
          affectedProjects: 1,
          recommendedCommands: 2,
        },
      },
      'workspace-context-agent.json': {
        generatedAt: '2026-06-15T10:04:00.000Z',
        agent: 'cursor',
        safeCommands: [{ id: 'workspace.pipeline' }, { id: 'workspace.model' }],
        validation: { status: 'passed', errors: 0, warnings: 0 },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(findEvidenceCard(bundle, 'workspaceModel')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'intelligenceSnapshot')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'workspaceDiff')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'workspaceImpact')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'workspaceContextAgent')?.status).toBe('pass');
  });

  it('reads canonical workspace registry summary for sync evidence', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}', 'utf8');
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      schema_version: '1.0',
      workspace_name: 'polyglot-ws',
      profile: 'polyglot',
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.contract.json'), {
      projects: [
        { slug: 'api', relativePath: 'api' },
        { slug: 'nest', relativePath: 'nest' },
      ],
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'toolchain.lock'), {
      node: '20',
    });
    await fs.writeFile(
      path.join(workspacePath, '.rapidkit', 'policies.yml'),
      'mode: warn\n',
      'utf8'
    );
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      kind: 'rapidkit.workspace.registry',
      generatedAt: '2026-06-16T00:00:00.000Z',
      workspacePath,
      workspaceName: 'polyglot-ws',
      profile: 'polyglot',
      projectCount: 2,
      authority: 'workspace.contract.json',
      contractPath: '.rapidkit/workspace.contract.json',
      registrySummaryPath: '.rapidkit/workspace-registry.v1.json',
      projects: [
        { slug: 'api', relativePath: 'api' },
        { slug: 'nest', relativePath: 'nest' },
      ],
      sources: {
        contract: { exists: true, projectCount: 2, path: '.rapidkit/workspace.contract.json' },
        globalRegistry: { exists: false, projectCount: 0 },
        legacyWorkspaceJson: { exists: true, projectCount: 0, path: '.rapidkit/workspace.json' },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const syncCard = findEvidenceCard(bundle, 'workspaceSync');

    expect(syncCard?.status).toBe('pass');
    expect(syncCard?.summary).toContain('2 project(s) registered in workspace contract');
    expect(syncCard?.artifactPath).toContain('workspace-registry.v1.json');
    expect(syncCard?.metrics?.authority).toBe('workspace.contract.json');
  });

  it('warns when canonical registry summary artifact is missing', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      schema_version: '1.0',
      profile: 'polyglot',
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'toolchain.lock'), { node: '20' });
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}', 'utf8');

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const syncCard = findEvidenceCard(bundle, 'workspaceSync');
    expect(syncCard?.status).toBe('warn');
    expect(syncCard?.summary).toContain('workspace-registry.v1.json');
  });

  it('builds workspace run, setup, and import readiness evidence cards', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-run-last.json': {
        generatedAt: '2026-06-16T10:00:00.000Z',
        stage: 'test',
        summary: {
          passed: 2,
          failed: 0,
          skipped: 1,
          selectedCount: 3,
          exitCode: 0,
        },
        projects: [],
        gates: { blocked: false },
      },
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'workspace.json'), {
      profile: 'polyglot',
      profile_requested: 'polyglot',
    });
    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'toolchain.lock'), {
      runtime: {
        node: { version: '20.12.0' },
        python: { version: null },
      },
    });
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}', 'utf8');

    const projectPath = path.join(workspacePath, 'api');
    await fs.ensureDir(path.join(projectPath, '.rapidkit'));
    await fs.writeJSON(path.join(projectPath, '.rapidkit', 'import-readiness.json'), {
      generatedAt: '2026-06-16T10:01:00.000Z',
      status: 'review',
      detection: { frameworkDisplayName: 'NestJS' },
      checks: [{ id: 'runtime-support', status: 'warn', message: 'Observed tier' }],
    });

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });

    expect(findEvidenceCard(bundle, 'workspaceRun')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'workspaceRun')?.summary).toContain('test');
    expect(findEvidenceCard(bundle, 'setup')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'setup')?.summary).toContain('Python unpinned');
    expect(findEvidenceCard(bundle, 'workspaceSync')?.summary).toContain('profile polyglot');
    expect(findEvidenceCard(bundle, 'workspaceSync')?.summary).toContain(
      'workspace-registry.v1.json'
    );
    expect(findEvidenceCard(bundle, 'importReadiness')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'importReadiness')?.summary).toContain('NestJS');
  });

  it('warns on legacy workspace run reports with exit code but zero targets', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-run-last.json': {
        generatedAt: '2026-06-16T10:00:00.000Z',
        stage: 'build',
        summary: {
          passed: 0,
          failed: 0,
          skipped: 0,
          selectedCount: 0,
          exitCode: 1,
        },
        projects: [],
        gates: { blocked: false },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    expect(findEvidenceCard(bundle, 'workspaceRun')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'workspaceRun')?.summary).toContain('build');
  });

  it('builds workspace run card from workspace-run-v1 aggregate with test and build stages', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-run-last.json': {
        schemaVersion: 'workspace-run-v1',
        generatedAt: '2026-06-16T11:00:00.000Z',
        workspacePath: '/ws',
        latestStage: 'build',
        stages: {
          test: {
            stage: 'test',
            generatedAt: '2026-06-16T10:00:00.000Z',
            summary: {
              passed: 2,
              failed: 0,
              skipped: 1,
              selectedCount: 3,
              exitCode: 0,
            },
            projects: [],
            gates: { blocked: false },
          },
          build: {
            stage: 'build',
            generatedAt: '2026-06-16T11:00:00.000Z',
            summary: {
              passed: 1,
              failed: 0,
              skipped: 0,
              selectedCount: 1,
              exitCode: 0,
            },
            projects: [],
            gates: { blocked: false },
          },
        },
        enterpriseControls: {
          jsonReady: true,
          evidencePath: '.rapidkit/reports/workspace-run-last.json',
        },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const workspaceRun = findEvidenceCard(bundle, 'workspaceRun');

    expect(workspaceRun?.status).toBe('warn');
    expect(workspaceRun?.summary).toContain('test: 2 passed');
    expect(workspaceRun?.summary).toContain('build: 1 passed');
    expect(workspaceRun?.metrics?.stageCount).toBe(2);
    expect(workspaceRun?.metrics?.testPassed).toBe(2);
    expect(workspaceRun?.metrics?.buildPassed).toBe(1);
  });
});

function findEvidenceCard(
  bundle: Awaited<ReturnType<typeof buildDashboardEvidenceBundle>>,
  id: string
) {
  return bundle.cards.find((card) => card.id === id);
}
