import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearDoctorRemediationPlanCache,
  readDoctorRemediationPlanForStudio,
} from '../core/doctorRemediationPlanReader.js';
import type { StudioBlockerHandoff } from '../contracts/studio-blocker-handoff-contract.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-remediation-plan-'));
  roots.push(root);
  return root;
}

function handoff(overrides: Partial<StudioBlockerHandoff> = {}): StudioBlockerHandoff {
  return {
    schemaVersion: 'rapidkit-studio-blocker-handoff-v1',
    cardId: 'project-doctor',
    cardLabel: 'Project Doctor',
    cardStatus: 'warn',
    blockers: ['test script surface: No test script detected for Next.js.'],
    artifactPath: '.rapidkit/reports/doctor-last-run.json',
    sourceCommand: 'doctor project',
    scope: 'project',
    blockerSignature: '1234567890abcdef',
    workspacePath: '/workspace',
    projectPath: '/workspace/apps/web',
    verifyCommand: 'npx rapidkit doctor project --json',
    ...overrides,
  };
}

async function writeWorkspacePlan(
  workspacePath: string,
  generatedAt = new Date(Date.now() + 60_000).toISOString()
): Promise<void> {
  await fs.outputJSON(
    path.join(workspacePath, '.rapidkit', 'reports', 'doctor-remediation-plan-last-run.json'),
    {
      schemaVersion: 'doctor-remediation-plan-v2',
      generatedAt,
      policyProfile: 'enterprise-strict',
      totalSteps: 2,
      executableSteps: 1,
      risk: { safe: 1, guarded: 1, invasive: 0 },
      steps: [
        {
          id: 'web:test-script',
          phase: 'project-surface',
          order: 10,
          projectName: 'web',
          projectPath: '/external/products/web',
          originalCommand: 'npx rapidkit doctor project --fix --json',
          kind: 'package-script',
          risk: 'guarded',
          executable: true,
          studioStatus: { state: 'ready', reason: 'Can add a deterministic test script.' },
          repairIntent: {
            primaryActionLabel: 'Add test script',
            requiresApproval: true,
            confidence: 'high',
          },
          preview: {
            title: 'Add project test script',
            summary: 'Creates a package.json test surface for the project.',
          },
          diffPreview: { summary: 'package.json script update' },
          files: ['package.json'],
          operation: {
            type: 'package-json-script',
            path: 'package.json',
            scriptName: 'test',
            scriptValue: 'vitest run',
          },
          transaction: {
            schemaVersion: 'workspai.doctor-dependency-repair-transaction.v1',
            kind: 'dependency-materialization',
            state: 'planned',
            projectPath: '/external/products/web',
            ecosystem: 'npm',
            requiredStages: ['reconcile', 'test', 'build'],
          },
          strategy: [
            {
              id: 'verify-project',
              kind: 'verify',
              description: 'Verify the project Doctor evidence.',
              risk: 'safe',
              invocation: {
                cwd: '/external/products/web',
                executable: 'npx',
                args: ['--no-install', 'workspai', 'doctor', 'project', '--json'],
              },
              continueWhen: 'previous-passed',
            },
          ],
          verifyCommand: 'npx rapidkit doctor project --json',
          refreshCommands: ['npx rapidkit doctor workspace --json'],
        },
        {
          id: 'api:env-example',
          phase: 'project-surface',
          order: 20,
          projectName: 'api',
          projectPath: '/external/products/api',
          originalCommand: '',
          kind: 'env-example',
          risk: 'safe',
          executable: false,
          studioStatus: { state: 'guidance-only', reason: 'Manual review only.' },
          repairIntent: { primaryAction: 'Review env example', requiresApproval: false },
          preview: { title: 'Review env example', summary: 'No edit required.' },
          files: ['.env.example'],
          refreshCommands: [],
        },
      ],
    }
  );
}

describe('doctorRemediationPlanReader', () => {
  afterEach(async () => {
    clearDoctorRemediationPlanCache();
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
  });

  it('reads the workspace remediation plan and scopes steps to an adopted project', async () => {
    const workspacePath = makeRoot();
    await writeWorkspacePlan(workspacePath, new Date(Date.now() + 60_000).toISOString());
    const artifactPath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
    await fs.outputJSON(artifactPath, { generatedAt: new Date().toISOString() });

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: handoff({
        workspacePath,
        projectPath: '/external/products/web',
      }),
    });

    expect(plan?.schemaVersion).toBe('doctor-remediation-plan-v2');
    expect(plan?.scope).toBe('project');
    expect(plan?.freshness.verdict).toBe('fresh');
    expect(plan?.visibleSteps).toHaveLength(1);
    expect(plan?.visibleSteps[0]).toMatchObject({
      id: 'web:test-script',
      actionId: 'doctor.web:test-script',
      projectName: 'web',
      studioState: 'ready',
      primaryAction: 'Add test script',
      verifyCommand: 'npx rapidkit doctor project --json',
      canApply: true,
      transaction: expect.objectContaining({
        kind: 'dependency-materialization',
        requiredStages: ['reconcile', 'test', 'build'],
      }),
      strategy: [
        expect.objectContaining({
          id: 'verify-project',
          kind: 'verify',
          invocation: expect.objectContaining({ executable: 'npx' }),
        }),
      ],
    });
  });

  it('marks remediation plans stale when the blocker artifact is newer', async () => {
    const workspacePath = makeRoot();
    await writeWorkspacePlan(workspacePath, '2026-06-30T00:00:00.000Z');
    const artifactPath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
    await fs.outputJSON(artifactPath, { generatedAt: '2026-06-30T00:02:00.000Z' });
    const artifactDate = new Date('2026-06-30T00:02:00.000Z');
    await fs.utimes(artifactPath, artifactDate, artifactDate);

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: handoff({
        workspacePath,
        projectPath: '/external/products/web',
      }),
    });

    expect(plan?.freshness).toMatchObject({
      verdict: 'stale',
      reason: 'Blocker artifact is newer than the remediation plan. Refresh source evidence first.',
      comparedArtifactPath: artifactPath,
    });
  });

  it('uses upstream Doctor repairs for aggregate Agent Grounding blockers', async () => {
    const workspacePath = makeRoot();
    await writeWorkspacePlan(workspacePath, new Date(Date.now() + 60_000).toISOString());
    const artifactPath = path.join(
      workspacePath,
      '.rapidkit',
      'reports',
      'agent-customization-pack.json'
    );
    await fs.outputJSON(artifactPath, { generatedAt: new Date().toISOString() });

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: handoff({
        workspacePath,
        cardId: 'agentGrounding',
        cardLabel: 'Agent Customization Pack',
        artifactPath: '.rapidkit/reports/agent-customization-pack.json',
        sourceCommand: 'npx workspai workspace agent-sync --write --json',
        verifyCommand: 'npx workspai workspace agent-sync --write --json',
        scope: 'workspace',
        projectPath: undefined,
        blockers: [
          'readiness warn: doctor found project issues',
          'compass-api: Virtual environment not created',
        ],
      }),
    });

    expect(plan?.policyProfile).toBe('enterprise-strict');
    expect(plan?.visibleSteps.map((step) => step.id)).toEqual([
      'web:test-script',
      'api:env-example',
    ]);
  });

  it('routes aggregate Readiness vulnerability blockers to project-owned Doctor repairs', async () => {
    const workspacePath = makeRoot();
    const projectPath = path.join(workspacePath, 'apps', 'web');
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    await fs.outputJSON(path.join(reportsPath, 'release-readiness-last-run.json'), {
      generatedAt: new Date().toISOString(),
      blockers: ['dependency: 2 dependency vulnerability(ies) reported'],
    });
    await fs.outputJSON(path.join(reportsPath, 'doctor-remediation-plan-last-run.json'), {
      schemaVersion: 'doctor-remediation-plan-v2',
      generatedAt: new Date(Date.now() + 60_000).toISOString(),
      policyProfile: 'enterprise-strict',
      totalSteps: 1,
      executableSteps: 1,
      risk: { safe: 0, guarded: 1, invasive: 0 },
      steps: [
        {
          id: 'web:surface-security-hygiene.command',
          phase: 'dependency-repair',
          order: 10,
          projectName: 'web',
          projectPath,
          originalCommand: `cd "${projectPath}" && npm audit fix --audit-level=moderate`,
          kind: 'shell',
          risk: 'guarded',
          executable: true,
          studioStatus: {
            state: 'review-required',
            reason: 'Apply npm-authored non-breaking vulnerability fixes.',
          },
          repairIntent: {
            primaryActionLabel: 'Apply non-breaking npm vulnerability fixes',
            requiresApproval: true,
            confidence: 'high',
          },
          preview: {
            title: 'Apply non-breaking npm vulnerability fixes',
            summary: 'Updates the project lockfile without --force.',
          },
          diffPreview: { summary: 'Review npm lockfile changes after execution.' },
          files: ['package.json', 'package-lock.json'],
          transaction: {
            schemaVersion: 'workspai.doctor-dependency-repair-transaction.v1',
            kind: 'dependency-security',
            state: 'planned',
            projectPath,
            ecosystem: 'npm',
            requiredStages: ['reconcile', 'audit', 'test', 'build'],
            completion: {
              manifestLockConsistent: true,
              auditClean: true,
              declaredTestsPass: true,
              declaredBuildPass: true,
              canonicalVerificationRequired: true,
            },
          },
          verifyCommand: 'npx workspai doctor workspace --json',
          refreshCommands: ['npx workspai readiness --strict --json'],
        },
      ],
    });
    await fs.outputJSON(path.join(reportsPath, 'artifact-remediation-plan-last-run.json'), {
      schemaVersion: 'artifact-remediation-plan-v1',
      generatedAt: new Date(Date.now() + 60_000).toISOString(),
      actions: [
        {
          id: 'readiness.refresh.1',
          artifactKind: 'readiness',
          cardId: 'readiness',
          title: 'Refresh release readiness',
          order: 1,
          phase: 'release-readiness',
          scope: 'workspace',
          status: 'ready',
          mode: 'run-command',
          risk: 'guarded',
          requiresApproval: true,
          blocker: 'dependency: 2 dependency vulnerability(ies) reported',
          summary: 'Refresh evidence.',
          command: 'npx workspai readiness --strict --json',
          verifyCommand: 'npx workspai readiness --strict --json',
          cwd: 'workspace',
          files: [],
          notes: [],
        },
      ],
    });

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: handoff({
        workspacePath,
        cardId: 'readiness',
        cardLabel: 'Readiness',
        artifactPath: '.workspai/reports/release-readiness-last-run.json',
        sourceCommand: 'readiness',
        verifyCommand: 'npx workspai readiness --strict --json',
        scope: 'workspace',
        projectPath: undefined,
        blockers: ['dependency: 2 dependency vulnerability(ies) reported'],
      }),
    });

    expect(plan?.sourcePath).toContain('doctor-remediation-plan-last-run.json');
    expect(plan?.visibleSteps).toHaveLength(1);
    expect(plan?.visibleSteps[0]).toMatchObject({
      id: 'web:surface-security-hygiene.command',
      projectPath,
      executable: true,
      primaryAction: 'Apply non-breaking npm vulnerability fixes',
      transaction: {
        schemaVersion: 'workspai.doctor-dependency-repair-transaction.v1',
        kind: 'dependency-security',
        state: 'planned',
        projectPath,
        ecosystem: 'npm',
        requiredStages: ['reconcile', 'audit', 'test', 'build'],
      },
    });
    expect(plan?.visibleSteps[0]?.originalCommand).toContain('npm audit fix');
    expect(plan?.visibleSteps[0]?.originalCommand).not.toContain('--force');
  });

  it('consumes project-scoped Doctor actions from the canonical artifact remediation plan', async () => {
    const workspacePath = makeRoot();
    const projectPath = path.join(workspacePath, 'api');
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    await fs.outputJSON(path.join(reportsPath, 'doctor-last-run.json'), {
      generatedAt: new Date().toISOString(),
    });
    await fs.outputJSON(path.join(reportsPath, 'artifact-remediation-plan-last-run.json'), {
      schemaVersion: 'artifact-remediation-plan-v1',
      generatedAt: new Date(Date.now() + 60_000).toISOString(),
      actions: [
        {
          id: 'doctor.api-security',
          artifactKind: 'doctor-workspace',
          cardId: 'doctor',
          title: 'Repair api dependencies',
          order: 1,
          phase: 'dependency-baseline',
          scope: 'project',
          projectName: 'api',
          projectPath: 'api',
          findingId: 'surface-security-hygiene',
          findingStatus: 'blocking',
          causalKey: 'doctor|api|surface-security-hygiene',
          sourceStepId: 'api-security',
          dependsOn: [],
          status: 'ready',
          mode: 'run-command',
          risk: 'guarded',
          requiresApproval: true,
          blocker: 'api: 4 dependency vulnerabilities reported',
          summary: 'Apply compatible fixes and reconcile the dependency tree.',
          command: 'npm audit fix --audit-level=moderate',
          verifyCommand: 'npx workspai doctor project --json',
          cwd: 'project',
          files: ['package.json', 'package-lock.json'],
          transaction: {
            schemaVersion: 'workspai.doctor-dependency-repair-transaction.v1',
            kind: 'dependency-security',
            state: 'planned',
            projectPath,
            ecosystem: 'npm',
            requiredStages: ['reconcile', 'audit', 'test', 'build'],
            completion: {
              manifestLockConsistent: true,
              auditClean: true,
              declaredTestsPass: true,
              declaredBuildPass: true,
              canonicalVerificationRequired: true,
            },
          },
          rollback: { available: true, strategy: 'manual' },
          notes: ['Source Doctor step: api-security'],
        },
      ],
    });

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: handoff({
        workspacePath,
        cardId: 'doctor',
        cardLabel: 'Workspace Doctor',
        scope: 'workspace',
        projectPath: undefined,
        artifactPath: '.workspai/reports/doctor-last-run.json',
        blockers: ['api: 4 dependency vulnerabilities reported'],
      }),
    });

    expect(plan?.policyProfile).toBe('artifact-remediation-plan-v1');
    expect(plan?.scope).toBe('workspace');
    expect(plan?.visibleSteps).toEqual([
      expect.objectContaining({
        id: 'doctor.api-security',
        actionId: 'doctor.api-security',
        issueId: 'surface-security-hygiene',
        findingStatus: 'blocking',
        projectName: 'api',
        projectPath,
        transaction: expect.objectContaining({
          requiredStages: ['reconcile', 'audit', 'test', 'build'],
        }),
      }),
    ]);
  });

  it('keeps upstream dependencies when an aggregate Pipeline blocker is focused', async () => {
    const workspacePath = makeRoot();
    const reportsPath = path.join(workspacePath, '.workspai', 'reports');
    await fs.outputJSON(path.join(reportsPath, 'pipeline-last-run.json'), {
      generatedAt: new Date().toISOString(),
    });
    const action = (input: {
      id: string;
      cardId: string;
      artifactKind: string;
      order: number;
      blocker: string;
      command: string;
      dependsOn?: string[];
    }) => ({
      ...input,
      title: input.id,
      phase: 'repair',
      scope: 'workspace',
      status: 'ready',
      mode: 'run-command',
      risk: 'safe',
      requiresApproval: true,
      summary: input.blocker,
      verifyCommand: input.command,
      cwd: 'workspace',
      files: [],
      operation: { type: 'run-command', command: input.command, cwd: 'workspace' },
      rollback: { available: false, strategy: 'none' },
      notes: [],
    });
    await fs.outputJSON(path.join(reportsPath, 'artifact-remediation-plan-last-run.json'), {
      schemaVersion: 'artifact-remediation-plan-v1',
      generatedAt: new Date(Date.now() + 60_000).toISOString(),
      actions: [
        action({
          id: 'readiness.toolchain.node.setup',
          cardId: 'readiness',
          artifactKind: 'readiness',
          order: 1,
          blocker: 'Node is not pinned.',
          command: 'npx workspai setup node --json',
        }),
        action({
          id: 'readiness.toolchain.node.bootstrap',
          cardId: 'readiness',
          artifactKind: 'readiness',
          order: 2,
          blocker: 'Node foundation is stale.',
          command: 'npx workspai bootstrap --ci --json',
          dependsOn: ['readiness.toolchain.node.setup'],
        }),
        action({
          id: 'pipeline.refresh.3',
          cardId: 'pipeline',
          artifactKind: 'pipeline',
          order: 3,
          blocker: 'doctor workspace gate failed',
          command: 'npx workspai pipeline --json --strict',
          dependsOn: ['readiness.toolchain.node.setup', 'readiness.toolchain.node.bootstrap'],
        }),
      ],
    });

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      maxSteps: 8,
      handoff: handoff({
        workspacePath,
        cardId: 'pipeline',
        cardLabel: 'Governance Gate',
        artifactPath: '.workspai/reports/pipeline-last-run.json',
        sourceCommand: 'npx workspai pipeline --json --strict',
        verifyCommand: 'npx workspai pipeline --json --strict',
        scope: 'workspace',
        projectPath: undefined,
        blockers: ['doctor workspace gate failed'],
      }),
    });

    expect(plan?.visibleSteps.map((step) => step.id)).toEqual([
      'readiness.toolchain.node.setup',
      'readiness.toolchain.node.bootstrap',
      'pipeline.refresh.3',
    ]);
    expect(plan?.visibleSteps[2]?.dependsOn).toEqual([
      'readiness.toolchain.node.setup',
      'readiness.toolchain.node.bootstrap',
    ]);
  });

  it('keeps Agent Grounding remediation focused on the named stale artifact', async () => {
    const workspacePath = makeRoot();
    const reportsPath = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.outputJSON(path.join(reportsPath, 'agent-customization-pack.json'), {
      generatedAt: new Date().toISOString(),
    });
    await fs.outputJSON(path.join(reportsPath, 'artifact-remediation-plan-last-run.json'), {
      schemaVersion: 'artifact-remediation-plan-v1',
      generatedAt: new Date(Date.now() + 60_000).toISOString(),
      actions: [
        {
          id: 'agent-grounding:dependencies',
          artifactKind: 'agent-customization-pack',
          cardId: 'agentGrounding',
          title: 'Synchronize dependencies',
          order: 10,
          scope: 'workspace',
          status: 'review-required',
          mode: 'run-command',
          risk: 'guarded',
          requiresApproval: true,
          blocker: 'Dependency baseline missing',
          summary: 'Install Java and Poetry dependency baselines.',
          command: 'npm install',
          cwd: 'workspace',
          files: [],
          operation: { type: 'run-command', command: 'npm install', cwd: 'workspace' },
          rollback: { available: false, strategy: 'none' },
          notes: [],
        },
        {
          id: 'agent-grounding:history',
          artifactKind: 'agent-customization-pack',
          cardId: 'agentGrounding',
          title: 'Refresh workspace intelligence history',
          order: 20,
          scope: 'workspace',
          status: 'review-required',
          mode: 'run-command',
          risk: 'safe',
          requiresApproval: true,
          blocker: 'Stale report: .workspai/reports/workspace-intelligence-history.json',
          summary: 'Regenerate workspace-intelligence-history.json from governed evidence.',
          command: 'npx workspai workspace intelligence run --json',
          cwd: 'workspace',
          files: ['.workspai/reports/workspace-intelligence-history.json'],
          operation: {
            type: 'run-command',
            command: 'npx workspai workspace intelligence run --json',
            cwd: 'workspace',
          },
          rollback: { available: false, strategy: 'none' },
          notes: [],
        },
      ],
    });

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: handoff({
        workspacePath,
        cardId: 'agentGrounding',
        cardLabel: 'Agent Customization Pack',
        artifactPath: '.workspai/reports/agent-customization-pack.json',
        scope: 'workspace',
        projectPath: undefined,
        blockers: ['Stale report: .workspai/reports/workspace-intelligence-history.json'],
      }),
    });

    expect(plan?.policyProfile).toBe('artifact-remediation-plan-v1');
    expect(plan?.visibleSteps.map((step) => step.id)).toEqual(['agent-grounding:history']);
  });

  it('falls back to npm artifact remediation plans for non-doctor evidence cards', async () => {
    const workspacePath = makeRoot();
    await writeWorkspacePlan(workspacePath, new Date(Date.now() + 60_000).toISOString());
    const reportPath = path.join(
      workspacePath,
      '.rapidkit',
      'reports',
      'release-readiness-last-run.json'
    );
    await fs.outputJSON(reportPath, { generatedAt: new Date().toISOString() });
    await fs.outputJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'artifact-remediation-plan-last-run.json'),
      {
        schemaVersion: 'artifact-remediation-plan-v1',
        generatedAt: new Date(Date.now() + 60_000).toISOString(),
        workspace: { name: 'commerce-wsp', path: workspacePath },
        source: {
          command: 'workspace remediation-plan',
          reportsDir: path.join(workspacePath, '.rapidkit', 'reports'),
          includeAbsolutePaths: false,
          ciMode: true,
        },
        summary: {
          artifactsScanned: 4,
          cardsCovered: 1,
          totalActions: 3,
          executableActions: 3,
          risk: { safe: 2, guarded: 1, invasive: 0 },
        },
        actions: [
          {
            id: 'readiness:run',
            artifactKind: 'release-readiness',
            cardId: 'readiness',
            title: 'Refresh readiness evidence',
            order: 10,
            phase: 'refresh-evidence',
            scope: 'workspace',
            status: 'review-required',
            mode: 'run-command',
            risk: 'guarded',
            requiresApproval: true,
            blocker: '1 blocking gate(s)',
            summary: 'Run readiness after Doctor fixes so the gate receives fresh evidence.',
            command: 'npx rapidkit readiness --json',
            verifyCommand: 'npx rapidkit readiness --json',
            cwd: 'workspace',
            files: [],
            operation: {
              type: 'run-command',
              command: 'npx rapidkit readiness --json',
              cwd: 'workspace',
            },
            rollback: { available: false, strategy: 'none' },
            notes: ['Command is npm-authored and guarded.'],
          },
          {
            id: 'readiness:config',
            artifactKind: 'release-readiness',
            cardId: 'readiness',
            title: 'Create readiness marker',
            order: 20,
            phase: 'fix',
            scope: 'workspace',
            status: 'ready',
            mode: 'edit-file',
            risk: 'safe',
            requiresApproval: true,
            blocker: 'missing readiness marker',
            summary: 'Create a minimal readiness marker without overwriting existing files.',
            verifyCommand: 'npx rapidkit readiness --json',
            cwd: 'workspace',
            files: ['.rapidkit/release-readiness.json'],
            operation: {
              type: 'file-create',
              path: '.rapidkit/release-readiness.json',
              content: '{\n  "status": "ready"\n}\n',
              overwrite: false,
            },
            rollback: { available: true, strategy: 'manual' },
            notes: ['Safe file create.'],
          },
          {
            id: 'readiness:test-script',
            artifactKind: 'release-readiness',
            cardId: 'readiness',
            title: 'Define release test script',
            order: 30,
            phase: 'fix',
            scope: 'workspace',
            status: 'ready',
            mode: 'edit-file',
            risk: 'safe',
            requiresApproval: true,
            blocker: 'missing test command',
            summary: 'Ensure package.json exposes the release test command.',
            verifyCommand: 'npx rapidkit readiness --json',
            cwd: 'workspace',
            files: ['package.json'],
            operation: {
              type: 'package-json-script',
              path: 'package.json',
              scriptName: 'test',
              scriptValue: 'vitest run',
            },
            rollback: { available: true, strategy: 'manual' },
            notes: ['Safe package script update.'],
          },
        ],
      }
    );

    const plan = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: handoff({
        workspacePath,
        cardId: 'readiness',
        cardLabel: 'Readiness',
        artifactPath: '.rapidkit/reports/release-readiness-last-run.json',
        sourceCommand: 'npx rapidkit readiness --json',
        verifyCommand: 'npx rapidkit readiness --json',
        scope: 'workspace',
        projectPath: undefined,
        blockers: ['verify: Workspace contract verification failed (CLI cache)'],
      }),
      maxSteps: 4,
    });

    expect(plan).toMatchObject({
      schemaVersion: 'doctor-remediation-plan-v2',
      policyProfile: 'artifact-remediation-plan-v1',
      scope: 'workspace',
      totalSteps: 3,
      executableSteps: 3,
      freshness: { verdict: 'fresh' },
    });
    expect(plan?.visibleSteps).toHaveLength(3);
    expect(plan?.visibleSteps[0]).toMatchObject({
      id: 'readiness:run',
      originalCommand: 'npx rapidkit readiness --json',
      canApply: false,
      executable: true,
    });
    expect(plan?.visibleSteps[1]).toMatchObject({
      id: 'readiness:config',
      primaryAction: 'Create readiness marker',
      canApply: true,
      files: ['.rapidkit/release-readiness.json'],
    });
    expect(plan?.visibleSteps[2]).toMatchObject({
      id: 'readiness:test-script',
      primaryAction: 'Define release test script',
      canApply: true,
      files: ['package.json'],
      operation: {
        type: 'package-json-script',
        path: 'package.json',
        scriptName: 'test',
        scriptValue: 'vitest run',
      },
      diffSummary: 'Set package script "test" in package.json.',
    });
  });

  it('caches repeated plan reads by workspace, card, blocker signature, and max step count', async () => {
    const workspacePath = makeRoot();
    await writeWorkspacePlan(workspacePath, new Date(Date.now() + 60_000).toISOString());
    const artifactPath = path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json');
    await fs.outputJSON(artifactPath, { generatedAt: new Date().toISOString() });
    const readJsonSpy = vi.spyOn(fs, 'readJSON');
    const blockerHandoff = handoff({
      workspacePath,
      projectPath: '/external/products/web',
      blockerSignature: 'same-blocker',
    });

    const first = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: blockerHandoff,
      maxSteps: 4,
    });
    const second = await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: blockerHandoff,
      maxSteps: 4,
    });

    expect(second).toBe(first);
    expect(readJsonSpy).toHaveBeenCalledTimes(1);

    await readDoctorRemediationPlanForStudio({
      workspacePath,
      handoff: { ...blockerHandoff, blockerSignature: 'new-blocker' },
      maxSteps: 4,
    });

    expect(readJsonSpy).toHaveBeenCalledTimes(2);
  });

  it('ignores unsupported or missing remediation plan artifacts', async () => {
    const workspacePath = makeRoot();
    await fs.outputJSON(
      path.join(workspacePath, '.rapidkit', 'reports', 'doctor-remediation-plan-last-run.json'),
      { schemaVersion: 'unknown' }
    );

    await expect(
      readDoctorRemediationPlanForStudio({
        workspacePath,
        handoff: handoff({ workspacePath }),
      })
    ).resolves.toBeNull();
  });
});
