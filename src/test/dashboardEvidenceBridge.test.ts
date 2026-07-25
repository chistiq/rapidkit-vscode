import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDashboardEvidenceBundle,
  resolveCardForReportKind,
} from '../core/dashboardEvidenceBridge';

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
    const reportsDir = path.join(workspacePath, '.workspai', 'reports');
    await fs.ensureDir(reportsDir);
    for (const [fileName, payload] of Object.entries(reports)) {
      await fs.writeJSON(path.join(reportsDir, fileName), payload);
    }
    return workspacePath;
  }

  async function createWorkspaceWithRawReports(reports: Record<string, string>): Promise<string> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-evidence-'));
    tempDirs.push(workspacePath);
    const reportsDir = path.join(workspacePath, '.workspai', 'reports');
    await fs.ensureDir(reportsDir);
    for (const [fileName, payload] of Object.entries(reports)) {
      await fs.writeFile(path.join(reportsDir, fileName), payload, 'utf8');
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

  it('publishes the authoritative unified intelligence runner artifact as a dashboard card', async () => {
    const stageIds = [
      'model',
      'diff',
      'impact',
      'doctor-evidence',
      'contract-evidence',
      'analyze-evidence',
      'readiness-evidence',
      'verify',
      'context',
      'agent-sync',
      'explain',
    ];
    const workspacePath = await createWorkspaceWithReports({
      'workspace-intelligence-run-last-run.json': {
        schemaVersion: 'workspace-intelligence-run.v1',
        chainSchemaVersion: 'workspai-workspace-intelligence-chain-v1',
        generatedAt: '2026-07-19T12:00:00.000Z',
        workspacePath: '/workspace',
        baselineCreated: false,
        preflight: [
          { id: 'sync', status: 'passed', result: 'synchronized' },
          { id: 'baseline', status: 'passed', result: 'reused' },
        ],
        status: 'passed',
        exitCode: 0,
        artifactPath: '.workspai/reports/workspace-intelligence-run-last-run.json',
        stages: stageIds.map((id) => ({
          id,
          status: 'passed',
          durationMs: 1,
          artifacts: [`.workspai/reports/${id}.json`],
          exitCode: 0,
          message: `${id} passed`,
        })),
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const run = findEvidenceCard(bundle, 'workspaceIntelligenceRun');

    expect(run).toMatchObject({
      status: 'pass',
      metrics: {
        stagesPassed: 11,
        stagesBlocked: 0,
        stagesFailed: 0,
        exitCode: 0,
      },
    });
    expect(run?.artifactPath).toContain('workspace-intelligence-run-last-run.json');
    expect(run?.detailSections).toHaveLength(11);
  });

  it('rejects semantically inconsistent unified intelligence runner evidence', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-intelligence-run-last-run.json': {
        schemaVersion: 'workspace-intelligence-run.v1',
        chainSchemaVersion: 'workspai-workspace-intelligence-chain-v1',
        generatedAt: '2026-07-19T12:00:00.000Z',
        workspacePath: '/workspace',
        baselineCreated: false,
        preflight: [{ id: 'sync', status: 'passed' }],
        status: 'passed',
        exitCode: 0,
        artifactPath: '.workspai/reports/workspace-intelligence-run-last-run.json',
        stages: [{ id: 'model', status: 'blocked', message: 'model blocked' }],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const run = findEvidenceCard(bundle, 'workspaceIntelligenceRun');

    expect(run?.status).toBe('fail');
    expect(run?.blockers).toContain('Unified runner artifact violates its semantic contract.');
    expect(run?.blockers).toContain('model: model blocked');
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
    expect(pipeline?.incidentSummary).toEqual({
      title: 'Governance Gate',
      phase: 'fix',
      primaryAction: 'Fix source issue',
      verifyRequired: true,
      auditStatus: 'not-started',
    });
  });

  it('attaches Studio incident summaries to blocked handoff artifacts', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'share-bundle.json': {
        generatedAt: '2026-06-10T10:02:00.000Z',
        workspaceName: 'team-workspace',
        healthTotals: { errors: 1 },
        blockingReasons: ['share bundle includes stale doctor evidence'],
      },
      'snapshot-last-run.json': {
        generatedAt: '2026-06-10T10:03:00.000Z',
        snapshotName: 'pre-release',
        status: 'fail',
        blockingReasons: ['snapshot restore point is incomplete'],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const share = findEvidenceCard(bundle, 'share');
    const snapshot = findEvidenceCard(bundle, 'snapshot');

    expect(share?.status).toBe('warn');
    expect(share?.incidentSummary).toMatchObject({
      title: 'Share bundle',
      phase: 'fix',
      primaryAction: 'Fix source issue',
      verifyRequired: true,
    });
    expect(snapshot?.status).toBe('fail');
    expect(snapshot?.incidentSummary).toMatchObject({
      title: 'Recovery Snapshot',
      phase: 'fix',
      primaryAction: 'Fix source issue',
      verifyRequired: true,
    });
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

  it('surfaces malformed JSON artifacts as failed corrupt cards instead of missing evidence', async () => {
    const workspacePath = await createWorkspaceWithRawReports({
      'workspace-model.json': '{not-json',
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const model = findEvidenceCard(bundle, 'workspaceModel');

    expect(model?.status).toBe('fail');
    expect(model?.summary).toContain('corrupt');
    expect(model?.artifactPath).toContain('workspace-model.json');
    expect(model?.blockers?.join('\n')).toContain('Corrupt artifact');
    expect(model?.detailSections?.[0]?.body).toContain('workspace-model.json');
  });

  it('surfaces wrong-shape workspace model artifacts as incompatible instead of valid', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model.json': {
        schemaVersion: 'unexpected',
        projects: [],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const model = findEvidenceCard(bundle, 'workspaceModel');

    expect(model?.status).toBe('fail');
    expect(model?.summary).toContain('incompatible');
    expect(model?.blockers?.join('\n')).toContain('summary metadata');
    expect(model?.metrics?.corruptArtifact).toBe(1);
  });

  it('surfaces corrupt enterprise evidence artifacts as failed cards', async () => {
    const workspacePath = await createWorkspaceWithRawReports({
      'doctor-last-run.json': '{not-json',
      'pipeline-last-run.json': '{not-json',
      'analyze-last-run.json': '{not-json',
      'release-readiness-last-run.json': '{not-json',
      'workspace-impact-last-run.json': '{not-json',
      'workspace-verify-last-run.json': '{not-json',
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    for (const id of [
      'doctor',
      'pipeline',
      'analyze',
      'readiness',
      'workspaceImpact',
      'workspaceVerify',
    ]) {
      const card = findEvidenceCard(bundle, id);
      expect(card?.status, id).toBe('fail');
      expect(card?.summary, id).toContain('corrupt');
      expect(card?.metrics?.corruptArtifact, id).toBe(1);
      expect(card?.blockers?.join('\n'), id).toContain('Corrupt artifact');
      expect(card?.detailSections?.[0]?.body, id).toContain('.json');
    }
  });

  it('surfaces corrupt project doctor artifacts for selected project scope', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    const projectPath = path.join(workspacePath, 'api');
    const reportPath = path.join(
      projectPath,
      '.workspai',
      'reports',
      'doctor-project-last-run.json'
    );
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeFile(reportPath, '{not-json', 'utf8');

    const bundle = await buildDashboardEvidenceBundle({
      workspacePath,
      projectPath,
      projectName: 'api',
    });
    const projectDoctor = findEvidenceCard(bundle, 'projectDoctor');

    expect(projectDoctor?.status).toBe('fail');
    expect(projectDoctor?.scope).toBe('project');
    expect(projectDoctor?.artifactPath).toBe(reportPath);
    expect(projectDoctor?.blockers?.join('\n')).toContain('Corrupt artifact');
  });

  it('describes pending bootstrap compliance when profile exists but report is missing', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    await fs.ensureDir(path.join(workspacePath, '.workspai'));
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace.json'), {
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
    await fs.ensureDir(path.join(projectPath, '.workspai', 'reports'));
    await fs.writeJSON(
      path.join(projectPath, '.workspai', 'reports', 'doctor-project-last-run.json'),
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

  it('softens verify and agent grounding for empty scaffolded workspaces', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model.json': {
        generatedAt: '2026-06-15T10:00:00.000Z',
        summary: { projectCount: 0 },
        validation: { status: 'warning', errors: 0, warnings: 2 },
      },
      'workspace-verify-last-run.json': {
        generatedAt: '2026-06-15T10:05:00.000Z',
        summary: {
          verdict: 'blocked',
          stepsPassed: 2,
          stepsMissing: 4,
          stepsFailed: 0,
        },
        policyViolations: [{ severity: 'warning', code: 'workspace.projects.empty' }],
        blockers: ['doctor-last-run.json is stale relative to impact evidence'],
      },
      'INDEX.json': {
        generatedAt: '2026-06-15T10:04:00.000Z',
        reports: [
          { path: '.rapidkit/reports/pipeline-last-run.json', required: true, exists: false },
        ],
      },
      'agent-customization-pack.json': {
        generatedAt: '2026-06-15T10:04:00.000Z',
        preset: 'enterprise',
        outputs: [],
        blockers: ['Missing required project-scoped AGENTS.md surface'],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(findEvidenceCard(bundle, 'workspaceVerify')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'agentGrounding')?.status).toBe('warn');
  });

  it('surfaces MCP design tools on agent grounding detail sections', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'agent-customization-pack.json': {
        schemaVersion: 'rapidkit-agent-customization-pack.v1',
        generatedAt: '2026-06-15T10:04:00.000Z',
        preset: 'enterprise',
        experimental: { mcpReady: true },
        outputInventory: [{ path: 'AGENTS.md', status: 'written' }],
      },
      'workspai-mcp-design.json': {
        schemaVersion: 'rapidkit-mcp-design.v1',
        mode: 'read-mostly',
        candidateTools: [
          {
            name: 'getWorkspaceModel',
            reads: ['.rapidkit/reports/workspace-model.json'],
            mutates: false,
          },
          {
            name: 'getBlockers',
            reads: ['.rapidkit/reports/workspace-verify-last-run.json'],
            mutates: false,
          },
        ],
      },
    });
    await fs.writeFile(path.join(workspacePath, 'AGENTS.md'), '# Agents\n', 'utf8');

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const grounding = findEvidenceCard(bundle, 'agentGrounding');

    expect(grounding?.detailSections?.length).toBe(2);
    expect(grounding?.metrics?.mcpTools).toBe(2);
    expect(grounding?.detailSections?.[0]?.title).toBe('getWorkspaceModel');
  });

  it('does not fail Agent Grounding just because the workspace report index contains release blockers', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'INDEX.json': {
        generatedAt: '2026-06-15T10:04:00.000Z',
        blockers: [
          'readiness: dependency: 2 dependency vulnerability(ies) reported',
          'workspace.readiness: Release readiness evidence reports blocking failures.',
        ],
        reports: [
          { path: '.rapidkit/reports/workspace-context-agent.json', required: true, exists: true },
          { path: '.rapidkit/reports/workspace-skills-index.json', required: true, exists: true },
        ],
      },
      'agent-customization-pack.json': {
        schemaVersion: 'rapidkit-agent-customization-pack.v1',
        generatedAt: '2026-06-15T10:04:00.000Z',
        preset: 'enterprise',
        experimental: { mcpReady: true },
        outputInventory: [{ path: 'AGENTS.md', status: 'written' }],
        drift: { missingRequired: [], staleReports: [], strictViolations: [] },
      },
    });
    await fs.writeFile(path.join(workspacePath, 'AGENTS.md'), '# Agents\n', 'utf8');

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const grounding = findEvidenceCard(bundle, 'agentGrounding');

    expect(grounding?.status).toBe('pass');
    expect(grounding?.blockers ?? []).toEqual([]);
    expect(grounding?.detailSections?.[0]?.title).toBe('Workspace report blockers');
    expect(grounding?.detailSections?.[0]?.body).toContain('dependency');
  });

  it('builds Phase 4 why, trace, and explain cards from separate last-run artifacts', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model.json': {
        generatedAt: '2026-06-15T10:00:00.000Z',
        summary: { projectCount: 1 },
        projects: [{ name: 'api' }],
        validation: { status: 'pass', errors: 0, warnings: 0 },
      },
      'workspace-explain-last-run.json': {
        schemaVersion: 'workspace-explain.v1',
        generatedAt: '2026-06-15T10:04:00.000Z',
        workspacePath: '/tmp/phase4-workspace',
        target: { kind: 'release-blocked' },
        summary: 'Explain release posture',
        sections: [{ id: 'release', title: 'Release', body: 'blocked' }],
      },
      'workspace-why-last-run.json': {
        schemaVersion: 'workspace-explain.v1',
        generatedAt: '2026-06-15T10:05:00.000Z',
        workspacePath: '/tmp/phase4-workspace',
        target: { kind: 'release-blocked' },
        summary: 'Why release is blocked',
        sections: [{ id: 'why', title: 'Why', body: 'doctor failed' }],
      },
      'workspace-trace-last-run.json': {
        schemaVersion: 'workspace-explain.v1',
        generatedAt: '2026-06-15T10:06:00.000Z',
        workspacePath: '/tmp/phase4-workspace',
        target: { kind: 'trace', diffRef: '.rapidkit/reports/workspace-model-diff-last-run.json' },
        summary: 'Trace from diff baseline',
        sections: [{ id: 'blast-radius', title: 'Blast radius', body: 'api affected' }],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(findEvidenceCard(bundle, 'workspaceExplain')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'workspaceWhy')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'workspaceTrace')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'workspaceExplain')?.summary).toContain('Explain release');
    expect(findEvidenceCard(bundle, 'workspaceWhy')?.summary).toContain('Why release');
    expect(findEvidenceCard(bundle, 'workspaceTrace')?.summary).toContain('Trace from diff');
    expect(findEvidenceCard(bundle, 'workspaceWatch')?.status).toBe('pass');
  });

  it('marks Workspace Why as derived when the dedicated why artifact is missing', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model.json': {
        generatedAt: '2026-06-15T10:00:00.000Z',
        summary: { projectCount: 1 },
        projects: [{ name: 'api' }],
        validation: { status: 'pass', errors: 0, warnings: 0 },
      },
      'workspace-explain-last-run.json': {
        schemaVersion: 'workspace-explain.v1',
        generatedAt: '2026-06-15T10:04:00.000Z',
        workspacePath: '/tmp/phase4-workspace',
        target: { kind: 'release-blocked' },
        summary: 'Release blocked: blocked with 1 blocking reason(s).',
        sections: [{ id: 'release', title: 'Release', body: 'blocked' }],
        blockingReasons: [
          'workspace.readiness: Release readiness evidence is stale: generated at 2026-06-15T09:00:00.000Z, before impact 2026-06-15T10:00:00.000Z.',
        ],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const why = findEvidenceCard(bundle, 'workspaceWhy');

    expect(why?.artifactPath).toContain('workspace-explain-last-run.json');
    expect(why?.summary).toContain('Derived from Workspace Explain');
    expect(why?.metrics).toMatchObject({
      derivedArtifact: 1,
      derivedFrom: 'Workspace Explain',
      staleEvidence: 1,
    });
    expect(why?.detailSections?.[0]?.title).toBe('Artifact source');
  });

  it('surfaces incompatible explainability artifacts as failed cards', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-model.json': {
        generatedAt: '2026-06-15T10:00:00.000Z',
        summary: { projectCount: 1 },
        projects: [{ name: 'api' }],
        validation: { status: 'pass', errors: 0, warnings: 0 },
      },
      'workspace-why-last-run.json': {
        schemaVersion: 'workspace-explain.vNext',
        generatedAt: '2026-06-15T10:05:00.000Z',
        workspacePath: '/tmp/phase4-workspace',
        target: { kind: 'release-blocked' },
        summary: 'Why release is blocked',
        sections: [],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const why = findEvidenceCard(bundle, 'workspaceWhy');

    expect(why?.status).toBe('fail');
    expect(why?.summary).toContain('schema is incompatible');
    expect(why?.blockers?.[0]).toContain('Incompatible artifact');
    expect(why?.detailSections?.[0]?.title).toBe('Artifact compatibility error');
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
      path.join(workspacePath, '.workspai', 'reports', 'doctor-project-last-run.json'),
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
      path.join(workspacePath, '.workspai', 'reports', 'doctor-project-last-run.json'),
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
      path.join(workspacePath, '.workspai', 'reports', 'doctor-project-last-run.json')
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
      path.join(workspacePath, '.workspai', 'reports', 'doctor-project-last-run.json'),
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
      path.join(workspacePath, '.workspai', 'reports', 'doctor-project-last-run.json'),
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
    await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), '{}', 'utf8');
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace.json'), {
      projects: [{ name: 'api', path: 'api' }],
    });
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'toolchain.lock'), {
      node: '20',
    });
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace.contract.json'), {
      projects: [{ name: 'api', path: 'api' }],
    });
    await fs.writeFile(
      path.join(workspacePath, '.workspai', 'policies.yml'),
      'mode: warn\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(workspacePath, '.workspai', 'cache-config.yml'),
      'strategy: shared\n',
      'utf8'
    );
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      kind: 'rapidkit.workspace.registry',
      generatedAt: '2026-06-11T10:00:00.000Z',
      workspacePath,
      workspaceName: path.basename(workspacePath),
      projectCount: 1,
      authority: 'workspace.contract.json',
      contractPath: '.workspai/workspace.contract.json',
      registrySummaryPath: '.workspai/workspace-registry.v1.json',
      projects: [{ slug: 'api', relativePath: 'api' }],
      sources: {
        contract: { exists: true, projectCount: 1 },
        globalRegistry: { exists: false, projectCount: 0 },
        legacyWorkspaceJson: { exists: true, projectCount: 1 },
      },
    });
    await fs.writeJSON(
      path.join(workspacePath, '.workspai', 'reports', 'workspace-contract-verify-last-run.json'),
      {
        schemaVersion: 'workspace-contract-verify.v1',
        generatedAt: '2026-06-11T10:00:00.000Z',
        status: 'passed',
        contractPath: '.workspai/workspace.contract.json',
        projectCount: 1,
        violations: [],
        checks: [],
      }
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
    const modelSections = findEvidenceCard(bundle, 'workspaceModel')?.detailSections ?? [];
    expect(modelSections.some((section) => section.id === 'workspace-graph')).toBe(true);
    expect(findEvidenceCard(bundle, 'intelligenceSnapshot')?.status).toBe('pass');
    expect(findEvidenceCard(bundle, 'workspaceDiff')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'workspaceImpact')?.status).toBe('warn');
    expect(findEvidenceCard(bundle, 'workspaceContextAgent')?.status).toBe('pass');
  });

  it('reads canonical workspace registry summary for sync evidence', async () => {
    const workspacePath = await createWorkspaceWithReports({});
    await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), '{}', 'utf8');
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace.json'), {
      schema_version: '1.0',
      workspace_name: 'polyglot-ws',
      profile: 'polyglot',
    });
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace.contract.json'), {
      projects: [
        { slug: 'api', relativePath: 'api' },
        { slug: 'nest', relativePath: 'nest' },
      ],
    });
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'toolchain.lock'), {
      node: '20',
    });
    await fs.writeFile(
      path.join(workspacePath, '.workspai', 'policies.yml'),
      'mode: warn\n',
      'utf8'
    );
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace-registry.v1.json'), {
      schemaVersion: 'workspace-registry.v1',
      kind: 'rapidkit.workspace.registry',
      generatedAt: '2026-06-16T00:00:00.000Z',
      workspacePath,
      workspaceName: 'polyglot-ws',
      profile: 'polyglot',
      projectCount: 2,
      authority: 'workspace.contract.json',
      contractPath: '.workspai/workspace.contract.json',
      registrySummaryPath: '.workspai/workspace-registry.v1.json',
      projects: [
        { slug: 'api', relativePath: 'api' },
        { slug: 'nest', relativePath: 'nest' },
      ],
      sources: {
        contract: { exists: true, projectCount: 2, path: '.workspai/workspace.contract.json' },
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
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace.json'), {
      schema_version: '1.0',
      profile: 'polyglot',
    });
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'toolchain.lock'), { node: '20' });
    await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), '{}', 'utf8');

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
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'workspace.json'), {
      profile: 'polyglot',
      profile_requested: 'polyglot',
    });
    await fs.writeJSON(path.join(workspacePath, '.workspai', 'toolchain.lock'), {
      runtime: {
        node: { version: '20.12.0' },
        python: { version: null },
      },
    });
    await fs.writeFile(path.join(workspacePath, '.workspai-workspace'), '{}', 'utf8');

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

  it('carries concrete readiness failures into a gate-blocked workspace run card', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-run-last.json': {
        schemaVersion: 'workspace-run-v1',
        generatedAt: '2026-07-16T11:13:31.189Z',
        workspacePath: '/ws',
        latestStage: 'test',
        stages: {
          test: {
            stage: 'test',
            generatedAt: '2026-07-16T11:13:31.189Z',
            summary: { passed: 0, failed: 0, skipped: 3, selectedCount: 3, exitCode: 0 },
            projects: [],
            gates: { blocked: true, blockingGate: 'readiness' },
          },
        },
      },
      'release-readiness-last-run.json': {
        schemaVersion: 'release-readiness-v1',
        overallStatus: 'fail',
        blockingReasons: [
          'verify: Workspace contract verification failed (CLI cache)',
          'dependency: 2 dependency vulnerability(ies) reported',
        ],
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const workspaceRun = findEvidenceCard(bundle, 'workspaceRun');

    expect(workspaceRun?.status).toBe('fail');
    expect(workspaceRun?.blockers).toEqual(
      expect.arrayContaining([
        'Blocked by readiness',
        'verify: Workspace contract verification failed (CLI cache)',
        'dependency: 2 dependency vulnerability(ies) reported',
      ])
    );
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

  it('publishes proof-backed graph and live model-usage evaluation metrics', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-knowledge-graph.json': {
        schemaVersion: 'workspace-knowledge-graph.v1',
        generatedAt: '2026-07-22T10:00:00.000Z',
        quality: {
          entityCount: 42,
          relationCount: 61,
          proofCount: 73,
          entityProofCoverageRatio: 0.95,
        },
        diagnostics: [],
      },
      'workspace-intelligence-evaluation-live.json': {
        schemaVersion: 'workspace-intelligence-evaluation.v1',
        status: 'live',
        updatedAt: '2026-07-22T10:01:00.000Z',
        summary: {
          modelCalls: 4,
          toolCalls: 9,
          tokens: { observedTotal: 1280 },
          outcome: { status: 'unknown', verified: false, blockersResolved: 1 },
        },
      },
    });

    const bundle = await buildDashboardEvidenceBundle({ workspacePath });
    const graph = findEvidenceCard(bundle, 'workspaceModel');
    const evaluation = findEvidenceCard(bundle, 'workspaceIntelligenceRun');

    expect(graph).toMatchObject({
      metrics: {
        graphEntities: 42,
        graphRelations: 61,
        graphProofs: 73,
        graphProofCoverage: 0.95,
      },
    });
    expect(graph?.summary).toContain('graph 42/61/73');
    expect(evaluation).toMatchObject({
      metrics: {
        observedTokens: 1280,
        modelCalls: 4,
        toolCalls: 9,
        blockersResolved: 1,
        evaluationOutcome: 'unknown',
      },
    });
    expect(evaluation?.summary).toContain('eval live · 1280 tokens');
  });

  it('maps every multi-artifact producer back to its canonical dashboard card', async () => {
    const workspacePath = await createWorkspaceWithReports({
      'workspace-knowledge-graph.json': {
        schemaVersion: 'workspace-knowledge-graph.v1',
        generatedAt: '2026-07-25T10:00:00.000Z',
        quality: { entityCount: 1, relationCount: 0, proofCount: 1 },
        diagnostics: [],
      },
      'workspace-intelligence-evaluation-live.json': {
        schemaVersion: 'workspace-intelligence-evaluation.v1',
        status: 'live',
        updatedAt: '2026-07-25T10:01:00.000Z',
        summary: {
          modelCalls: 1,
          toolCalls: 1,
          tokens: { observedTotal: 10 },
          outcome: { status: 'unknown', verified: false, blockersResolved: 0 },
        },
      },
      'agent-customization-pack.json': {
        schemaVersion: 'rapidkit-agent-customization-pack.v1',
        generatedAt: '2026-07-25T10:02:00.000Z',
        preset: 'enterprise',
        targets: ['vscode'],
        summary: { written: 0, total: 0 },
        outputs: [],
      },
    });
    const bundle = await buildDashboardEvidenceBundle({ workspacePath });

    expect(resolveCardForReportKind(bundle, 'workspace-knowledge-graph')?.id).toBe(
      'workspaceModel'
    );
    expect(resolveCardForReportKind(bundle, 'workspace-intelligence-evaluation')?.id).toBe(
      'workspaceIntelligenceRun'
    );
    expect(resolveCardForReportKind(bundle, 'workspace-intelligence-run')?.id).toBe(
      'workspaceIntelligenceRun'
    );
    expect(resolveCardForReportKind(bundle, 'agent-customization-pack')?.id).toBe('agentGrounding');
    expect(resolveCardForReportKind(bundle, 'rapidkit-mcp-design')?.id).toBe('agentGrounding');
  });
});

function findEvidenceCard(
  bundle: Awaited<ReturnType<typeof buildDashboardEvidenceBundle>>,
  id: string
) {
  return bundle.cards.find((card) => card.id === id);
}
