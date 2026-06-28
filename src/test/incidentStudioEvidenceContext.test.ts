import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
  },
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

vi.mock('../core/incidentStudioArchitectureGrounding', () => ({
  buildIncidentStudioArchitecturePromptSection: vi.fn(async () => 'ARCHITECTURE GROUNDING (test)'),
}));

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  buildIncidentStudioEvidenceContext,
  buildIncidentStudioEvidencePrompt,
  renderIncidentStudioEvidencePrompt,
} from '../core/incidentStudioEvidenceContext';
import { normalizeAIActionContract, validateAIActionContract } from '../core/aiActionContract';
import { recordAIActionContract, recordAIActionExecution } from '../core/aiActionRegistry';
import { AnalyzeReport } from '../ui/panels/incidentStudioAnalyze';

describe('incidentStudioEvidenceContext', () => {
  let workspacePath = '';

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-evidence-context-'));
  });

  afterEach(async () => {
    await fs.rm(workspacePath, { recursive: true, force: true });
  });

  it('summarizes analyze report and redacts sensitive evidence', async () => {
    const report: AnalyzeReport = {
      schemaVersion: 'test',
      generatedAt: '2026-06-11T00:00:00.000Z',
      workspacePath,
      summary: {
        score: 72,
        verdict: 'needs-attention',
        projectCount: 2,
        runtimeCount: 2,
        findings: {
          fail: 1,
          warn: 1,
          info: 0,
        },
      },
      findings: [
        {
          id: 'secret-finding',
          severity: 'fail',
          target: 'src/config.ts',
          title: 'Leaked token Bearer abc.def.ghi',
          detail: 'ignored',
          remediation: 'Replace api_key=sk-secret-value before release',
        },
      ],
      enterpriseControls: {
        jsonReady: true,
        ciGateCommand: 'make verify TOKEN=sk-secret-value',
        releaseGateCommand: 'make release-gate',
      },
    };

    const context = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: report,
      gitDiffTimeoutMs: 10,
    });
    const prompt = renderIncidentStudioEvidencePrompt(context);

    expect(context.analyzeReport.available).toBe(true);
    expect(context.analyzeReport.score).toBe(72);
    expect(prompt).toContain('[redacted]');
    expect(prompt).not.toContain('sk-secret-value');
    expect(prompt).not.toContain('abc.def.ghi');
  });

  it('includes persisted AI action history', async () => {
    const contract = normalizeAIActionContract({
      actionType: 'verify',
      summary: 'Verify release gate',
      affectedFiles: ['package.json'],
      verificationCommands: ['npm test'],
      rollbackPlan: [],
      confidence: 0.88,
      requiresApproval: true,
    })!;
    const validation = validateAIActionContract(contract, {
      workspacePath,
      strict: true,
    });
    const entry = await recordAIActionContract(workspacePath, {
      contract,
      validation,
      provider: 'test',
    });
    await recordAIActionExecution(workspacePath, entry.id, {
      operation: 'verify',
      ok: true,
      summary: 'verify completed successfully.',
      evidencePath: null,
    });

    const context = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: null,
      gitDiffTimeoutMs: 10,
    });

    expect(context.aiActions.total).toBe(1);
    expect(context.aiActions.latest[0]).toMatchObject({
      summary: 'Verify release gate',
      lastExecution: 'verify:pass',
    });
    expect(context.workspaceIntelligence.agentContext.available).toBe(false);
    expect(context.workspaceIntelligence.impact.available).toBe(false);
    expect(context.workspaceIntelligence.verify.available).toBe(false);
    expect(context.workspaceIntelligence.model.available).toBe(false);
  });

  it('includes workspace intelligence artifacts when present', async () => {
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.writeFile(
      path.join(reportsDir, 'workspace-context-agent.json'),
      JSON.stringify({
        schemaVersion: 'workspace-context.v1',
        generatedAt: '2026-06-11T00:00:00.000Z',
        agent: 'cursor',
        workspaceSummary: 'Polyglot workspace',
        safeCommands: [{ display: 'rapidkit workspace verify --json' }],
        validation: { status: 'passed' },
      })
    );
    await fs.writeFile(
      path.join(reportsDir, 'workspace-impact-last-run.json'),
      JSON.stringify({
        schemaVersion: 'workspace-impact.v1',
        generatedAt: '2026-06-11T00:00:00.000Z',
        summary: { risk: 'medium', affectedProjects: 1, workspaceItems: 0, recommendedCommands: 2 },
        agentBrief: { headline: 'Workspace impact risk: medium.' },
        affectedProjects: [
          {
            title: 'Project impact: web',
            summary: 'Frontend project changed',
            risk: 'medium',
            project: { name: 'web' },
          },
        ],
      })
    );
    await fs.writeFile(
      path.join(reportsDir, 'workspace-impact-workspace-only.json'),
      JSON.stringify({
        schemaVersion: 'workspace-impact.v1',
        generatedAt: '2026-06-11T00:00:00.000Z',
        summary: { risk: 'high', affectedProjects: 0, workspaceItems: 2, recommendedCommands: 1 },
        workspaceImpact: [
          {
            target: 'git:AGENTS.md',
            summary: 'Git untracked file affects workspace: AGENTS.md',
            risk: 'low',
          },
        ],
        agentBrief: {
          headline: 'Workspace impact risk: high.',
          bullets: ['Affected projects: none.', 'Workspace-level items: 2.'],
        },
      })
    );

    const context = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: null,
      gitDiffTimeoutMs: 10,
    });
    const prompt = renderIncidentStudioEvidencePrompt(context);

    expect(context.workspaceIntelligence.agentContext).toMatchObject({
      available: true,
      agent: 'cursor',
      safeCommands: 1,
    });
    expect(context.workspaceIntelligence.impact).toMatchObject({
      available: true,
      risk: 'medium',
      affectedProjects: 1,
    });
    expect(prompt).toContain('WORKSPACE INTELLIGENCE');
    expect(prompt).toContain('WORKSPACE IMPACT');

    await fs.copyFile(
      path.join(reportsDir, 'workspace-impact-workspace-only.json'),
      path.join(reportsDir, 'workspace-impact-last-run.json')
    );
    const workspaceOnlyContext = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: null,
      gitDiffTimeoutMs: 10,
    });
    const workspaceOnlyPrompt = renderIncidentStudioEvidencePrompt(workspaceOnlyContext);

    expect(
      workspaceOnlyContext.workspaceIntelligence.impact.topWorkspaceImpact.length
    ).toBeGreaterThan(0);
    expect(workspaceOnlyPrompt).toContain('git:AGENTS.md');
    expect(workspaceOnlyPrompt).toContain('Workspace-level impact samples');
  });

  it('includes workspace verify and model artifacts when present', async () => {
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.writeFile(
      path.join(reportsDir, 'workspace-model.json'),
      JSON.stringify({
        schemaVersion: 'workspace-model.v1',
        generatedAt: '2026-06-11T00:00:00.000Z',
        workspace: { name: 'workspace', type: 'polyglot' },
        identity: { workspaceType: 'polyglot', runtimeFamilies: ['node', 'python'] },
        summary: { projectCount: 2, frameworks: ['nestjs', 'fastapi'] },
        projects: [
          {
            name: 'api',
            path: 'api',
            kind: 'backend',
            runtime: 'node',
            framework: 'nestjs',
            kit: 'nestjs.standard',
            commands: { fleetStages: ['test', 'build'] },
          },
        ],
        validation: { status: 'passed', errors: 0, warnings: 0 },
      })
    );
    await fs.writeFile(
      path.join(reportsDir, 'workspace-verify-last-run.json'),
      JSON.stringify({
        schemaVersion: 'workspace-verify.v1',
        generatedAt: '2026-06-11T00:00:00.000Z',
        summary: {
          verdict: 'needs-attention',
          exitCode: 2,
          stepsPassed: 3,
          stepsMissing: 1,
        },
        blockingReasons: ['Required analyze report missing'],
        steps: [
          {
            id: 'impact.plan',
            status: 'pass',
            required: true,
            message: 'Impact verification plan evaluated',
          },
          {
            id: 'analyze.report',
            status: 'missing',
            required: true,
            message: 'Analyze report not found',
          },
        ],
      })
    );

    const context = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: null,
      gitDiffTimeoutMs: 10,
    });
    const prompt = await buildIncidentStudioEvidencePrompt({
      workspacePath,
      workspaceName: 'workspace',
      analyzeReport: null,
      gitDiffTimeoutMs: 10,
    });

    expect(context.workspaceIntelligence.model).toMatchObject({
      available: true,
      projectCount: 2,
      validationStatus: 'passed',
      workspaceType: 'polyglot',
    });
    expect(context.workspaceIntelligence.verify).toMatchObject({
      available: true,
      verdict: 'needs-attention',
      exitCode: 2,
      stepsPassed: 3,
      stepsMissing: 1,
    });
    expect(prompt).toContain('WORKSPACE VERIFY');
    expect(prompt).toContain('WORKSPACE MODEL');
    expect(prompt).toContain('Required analyze report missing');
  });

  it('includes project-scoped doctor snapshot when provided', async () => {
    const context = await buildIncidentStudioEvidenceContext({
      workspacePath,
      workspaceName: 'workspace',
      projectPath: path.join(workspacePath, 'atlas-api'),
      projectName: 'atlas-api',
      analyzeReport: null,
      gitDiffTimeoutMs: 10,
      doctorSnapshot: {
        generatedAt: '2026-06-10T00:00:00.000Z',
        health: { total: 10, passed: 8, warnings: 1, errors: 1, percent: 80 },
        fixCommands: ['npx rapidkit doctor project --json'],
        projects: [
          {
            name: 'atlas-api',
            path: path.join(workspacePath, 'atlas-api'),
            framework: 'fastapi.standard',
            issues: 2,
          },
        ],
      },
    });

    expect(context.doctor).toMatchObject({
      available: true,
      projectScoped: true,
      selectedProject: {
        name: 'atlas-api',
        framework: 'fastapi.standard',
        issues: 2,
      },
    });
    expect(renderIncidentStudioEvidencePrompt(context)).toContain('"doctor"');
  });
});
