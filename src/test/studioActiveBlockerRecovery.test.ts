import { describe, expect, it, vi } from 'vitest';

import { runStudioActiveBlockerRecovery } from '../core/studioActiveBlockerRecovery.js';
import type { StudioAgentWorkspaiToolHost } from '../core/studioAgentWorkspaiTools.js';

function host(overrides: Partial<StudioAgentWorkspaiToolHost> = {}): StudioAgentWorkspaiToolHost {
  const unavailable = vi.fn(async () => ({ ok: false, error: 'not configured' }));
  return {
    discover: unavailable,
    inspect: unavailable,
    search: unavailable,
    diagnostics: unavailable,
    inspectChanges: unavailable,
    applyPatches: unavailable,
    deleteFiles: unavailable,
    runGovernedCommand: unavailable,
    runWorkspaceCommand: unavailable,
    inspectRemediationPlan: unavailable,
    executeRemediationStep: unavailable,
    inspectDependencySecurity: unavailable,
    repairDependencySecurity: unavailable,
    upgradeDependencySecurity: unavailable,
    verify: unavailable,
    ...overrides,
  };
}

describe('Studio active blocker recovery', () => {
  it('repairs every vulnerable project before returning to canonical verification', async () => {
    const inspectDependencySecurity = vi.fn(async (input: { projectName?: string }) => ({
      ok: true,
      output: {
        target: { projectName: input.projectName },
        upgradeCandidates: [],
      },
    }));
    const repairDependencySecurity = vi.fn(async (input: { projectName?: string }) => ({
      ok: true,
      changed: true,
      output: {
        changedFiles: [`${input.projectName}/package-lock.json`],
        nextAction: 'inspect-dependency-security',
      },
    }));
    const inspectRemediationPlan = vi.fn(async () => ({
      ok: false,
      error: 'plan should not run after source changes',
    }));

    const result = await runStudioActiveBlockerRecovery({
      blockers: ['dependency: 40 dependency vulnerability(ies) reported'],
      dependencyProjectNames: ['polyglot-api', 'polyglot-app'],
      evidenceGeneration: 'doctor-v1',
      blockerSignature: 'dependency-40',
      workspacePath: '/workspace',
      host: host({
        inspectDependencySecurity,
        repairDependencySecurity,
        inspectRemediationPlan,
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      changed: true,
      output: {
        recoveryPath: 'dependency-security',
        processedProjects: ['polyglot-api', 'polyglot-app'],
        projectNames: ['polyglot-api', 'polyglot-app'],
        changedPaths: ['polyglot-api/package-lock.json', 'polyglot-app/package-lock.json'],
        unresolvedProjects: [],
        nextAction: 'workspaceIntelligenceChain',
      },
    });
    expect(inspectDependencySecurity.mock.calls.map(([input]) => input.projectName)).toEqual([
      'polyglot-api',
      'polyglot-app',
    ]);
    expect(repairDependencySecurity.mock.calls.map(([input]) => input.projectName)).toEqual([
      'polyglot-api',
      'polyglot-app',
    ]);
    expect(inspectRemediationPlan).not.toHaveBeenCalled();
  });

  it('runs the remediation-plan producer instead of looping the intelligence chain', async () => {
    const inspectRemediationPlan = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'missing plan' })
      .mockResolvedValueOnce({
        ok: true,
        output: {
          steps: [
            {
              id: 'repair-lockfile',
              order: 1,
              risk: 'guarded',
              studioState: 'ready',
              executable: true,
            },
          ],
        },
      });
    const runGovernedCommand = vi.fn(async () => ({ ok: true, changed: false }));
    const executeRemediationStep = vi.fn(async () => ({ ok: true, changed: true }));

    const result = await runStudioActiveBlockerRecovery({
      blockers: ['readiness remains blocked'],
      dependencyProjectNames: [],
      evidenceGeneration: 'readiness-v1',
      workspacePath: '/workspace',
      host: host({
        inspectRemediationPlan,
        runGovernedCommand,
        executeRemediationStep,
      }),
    });

    expect(runGovernedCommand).toHaveBeenCalledTimes(1);
    expect(runGovernedCommand).toHaveBeenCalledWith({
      commandId: 'workspaceRemediationPlan',
      workspacePath: '/workspace',
    });
    expect(executeRemediationStep).toHaveBeenCalledWith({
      stepId: 'repair-lockfile',
      workspacePath: '/workspace',
    });
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      output: {
        recoveryPath: 'contract-remediation-plan',
        nextAction: 'workspaceIntelligenceChain',
      },
    });
  });

  it('routes directly to verify when refreshed audits report every project clear', async () => {
    const inspectDependencySecurity = vi.fn(async () => ({
      ok: true,
      changed: false,
      output: { dependencyBlockerPresent: false },
    }));
    const inspectRemediationPlan = vi.fn(async () => ({ ok: false }));

    const result = await runStudioActiveBlockerRecovery({
      blockers: ['dependency vulnerabilities reported'],
      dependencyProjectNames: ['polyglot-api', 'polyglot-app'],
      evidenceGeneration: 'doctor-v2',
      workspacePath: '/workspace',
      host: host({ inspectDependencySecurity, inspectRemediationPlan }),
    });

    expect(result).toMatchObject({
      ok: true,
      changed: false,
      output: {
        processedProjects: ['polyglot-api', 'polyglot-app'],
        clearedProjects: ['polyglot-api', 'polyglot-app'],
        nextAction: 'verify-blocker',
      },
    });
    expect(inspectRemediationPlan).not.toHaveBeenCalled();
  });

  it('applies every fresh audit-authorized direct upgrade for one project', async () => {
    const inspectDependencySecurity = vi.fn(async () => ({
      ok: true,
      output: {
        upgradeCandidates: [{ packageName: 'next' }, { packageName: 'postcss' }],
      },
    }));
    const repairDependencySecurity = vi.fn(async () => ({
      ok: false,
      changed: false,
      output: {
        nextAction: 'upgrade-dependency-security',
        upgradeCandidates: [{ packageName: 'next' }, { packageName: 'postcss' }],
      },
    }));
    const upgradeDependencySecurity = vi.fn(async () => ({ ok: true, changed: true }));

    const result = await runStudioActiveBlockerRecovery({
      blockers: ['dependency vulnerabilities reported'],
      dependencyProjectNames: ['polyglot-app'],
      evidenceGeneration: 'doctor-v1',
      workspacePath: '/workspace',
      transactionId: () => 'transaction',
      host: host({
        inspectDependencySecurity,
        repairDependencySecurity,
        upgradeDependencySecurity,
      }),
    });

    expect(upgradeDependencySecurity.mock.calls.map(([input]) => input.packageName)).toEqual([
      'next',
      'postcss',
    ]);
    expect(result).toMatchObject({
      ok: true,
      changed: true,
      output: { nextAction: 'workspaceIntelligenceChain' },
    });
  });

  it('stops before provider calls when every audit candidate requires a breaking decision', async () => {
    const inspectDependencySecurity = vi.fn(async (input: { projectName?: string }) => ({
      ok: true,
      output: {
        target: {
          projectName: input.projectName,
          sourceFiles: ['package.json', 'package-lock.json'],
        },
        resolutionCandidates: [
          {
            packageName: 'next',
            currentRange: '16.2.12',
            disposition: 'downgrade-only',
            autoExecutable: false,
          },
        ],
        blockedCandidates: [
          {
            packageName: 'next',
            currentRange: '16.2.12',
            disposition: 'downgrade-only',
            autoExecutable: false,
          },
        ],
        nextAction: 'general-source-repair',
      },
    }));
    const repairDependencySecurity = vi.fn(async () => ({
      ok: false,
      changed: false,
      output: { nextAction: 'general-source-repair' },
      error: 'No safe direct upgrade exists.',
    }));

    const result = await runStudioActiveBlockerRecovery({
      blockers: ['dependency vulnerabilities reported'],
      dependencyProjectNames: ['polyglot-app'],
      evidenceGeneration: 'doctor-v3',
      workspacePath: '/workspace',
      host: host({
        inspectDependencySecurity,
        repairDependencySecurity,
        inspectRemediationPlan: vi.fn(async () => ({ ok: false })),
        runGovernedCommand: vi.fn(async () => ({ ok: false })),
      }),
    });

    expect(repairDependencySecurity).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      changed: false,
      output: {
        recoveryPath: 'dependency-security',
        nextAction: 'review-required',
        terminalReason: 'safe-fix-unavailable',
        requiresUserDecision: true,
        unresolvedProjects: ['polyglot-app'],
        dependencyDiagnostics: [
          expect.objectContaining({
            projectName: 'polyglot-app',
            sourceFiles: ['package.json', 'package-lock.json'],
            nextAction: 'general-source-repair',
          }),
        ],
      },
    });
    expect(result.error).toContain('No compatible non-breaking remediation');
  });
});
