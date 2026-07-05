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
      projectName: 'web',
      studioState: 'ready',
      primaryAction: 'Add test script',
      verifyCommand: 'npx rapidkit doctor project --json',
      canApply: true,
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
