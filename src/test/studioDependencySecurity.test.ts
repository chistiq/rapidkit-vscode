import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildStudioDependencyUpgradeCommand,
  buildStudioDependencySecurityCommand,
  dependencyRepairAttemptsForGeneration,
  parseStudioDependencyUpgradeCandidates,
  resolveStudioDependencySecurityTarget,
  resolveStudioDependencySecurityTargets,
} from '../core/studioDependencySecurity.js';

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-security-'));
  roots.push(root);
  const projectPath = path.join(root, 'atlas-web');
  await fs.ensureDir(path.join(root, '.workspai', 'reports'));
  await fs.ensureDir(projectPath);
  await fs.writeJson(path.join(projectPath, 'package.json'), { name: 'atlas-web' });
  await fs.writeJson(path.join(projectPath, 'package-lock.json'), { lockfileVersion: 3 });
  await fs.writeJson(path.join(root, '.workspai', 'reports', 'doctor-last-run.json'), {
    projects: [
      {
        name: 'atlas-web',
        path: projectPath,
        vulnerabilities: 2,
        probes: [
          {
            id: 'surface-security-hygiene',
            status: 'fail',
            freshness: { status: 'fresh', expiresAt: '2099-01-01T00:00:00.000Z' },
          },
        ],
      },
    ],
  });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('Studio dependency security capability', () => {
  it('reopens bounded repair attempts only after causal evidence advances', () => {
    const prior = {
      blockerSignature: 'dependency-blocker',
      evidenceGeneration: 'generation-1',
      count: 2,
    };
    expect(
      dependencyRepairAttemptsForGeneration({
        prior,
        blockerSignature: 'dependency-blocker',
        evidenceGeneration: 'generation-1',
      })
    ).toBe(2);
    expect(
      dependencyRepairAttemptsForGeneration({
        prior,
        blockerSignature: 'dependency-blocker',
        evidenceGeneration: 'generation-2',
      })
    ).toBe(0);
    expect(
      dependencyRepairAttemptsForGeneration({
        prior,
        blockerSignature: 'next-causal-blocker',
        evidenceGeneration: 'generation-1',
      })
    ).toBe(0);
  });

  it('derives an npm target only from fresh failed Doctor security evidence', async () => {
    const root = await fixture();
    const target = await resolveStudioDependencySecurityTarget({ workspacePath: root });
    expect(target).toMatchObject({
      projectName: 'atlas-web',
      vulnerabilities: 2,
      packageManager: 'npm',
      sourceFiles: ['package.json', 'package-lock.json'],
    });
    expect(buildStudioDependencySecurityCommand(target, 'inspect')).toBe('npm audit --json');
    const repair = buildStudioDependencySecurityCommand(target, 'repair');
    expect(repair).toBe('npm audit fix --audit-level=moderate');
    expect(repair).not.toContain('--force');
  });

  it('rejects arbitrary projects that are not active dependency-security blockers', async () => {
    const root = await fixture();
    await expect(
      resolveStudioDependencySecurityTarget({ workspacePath: root, projectName: 'other-app' })
    ).rejects.toThrow('No fresh dependency-security blocker');
  });

  it('enumerates every fresh vulnerable project for workspace-scoped recovery', async () => {
    const root = await fixture();
    const secondProjectPath = path.join(root, 'atlas-api');
    await fs.ensureDir(secondProjectPath);
    await fs.writeJson(path.join(secondProjectPath, 'package.json'), { name: 'atlas-api' });
    await fs.writeJson(path.join(secondProjectPath, 'pnpm-lock.yaml'), {
      lockfileVersion: '9.0',
    });
    const reportPath = path.join(root, '.workspai', 'reports', 'doctor-last-run.json');
    const report = await fs.readJson(reportPath);
    report.projects.push({
      name: 'atlas-api',
      path: secondProjectPath,
      vulnerabilities: 7,
      probes: [
        {
          id: 'surface-security-hygiene',
          status: 'fail',
          freshness: { status: 'fresh', expiresAt: '2099-01-01T00:00:00.000Z' },
        },
      ],
    });
    await fs.writeJson(reportPath, report);

    await expect(resolveStudioDependencySecurityTarget({ workspacePath: root })).rejects.toThrow(
      'Project name is required'
    );
    await expect(resolveStudioDependencySecurityTargets({ workspacePath: root })).resolves.toEqual([
      expect.objectContaining({
        projectName: 'atlas-web',
        vulnerabilities: 2,
        packageManager: 'npm',
      }),
      expect.objectContaining({
        projectName: 'atlas-api',
        vulnerabilities: 7,
        packageManager: 'pnpm',
      }),
    ]);
  });

  it('classifies audit-backed breaking downgrades as general-agent work, not an automatic latest install', async () => {
    const root = await fixture();
    const projectPath = path.join(root, 'atlas-web');
    await fs.writeJson(path.join(projectPath, 'package.json'), {
      name: 'atlas-web',
      dependencies: { next: '16.2.10', react: '19.2.4' },
    });
    const target = await resolveStudioDependencySecurityTarget({ workspacePath: root });
    const candidates = await parseStudioDependencyUpgradeCandidates({
      target,
      auditJson: JSON.stringify({
        vulnerabilities: {
          next: {
            name: 'next',
            severity: 'moderate',
            isDirect: true,
            range: '9.3.4-canary.0 - 16.3.0-canary.5',
            fixAvailable: { name: 'next', version: '9.3.3', isSemVerMajor: true },
          },
          postcss: {
            name: 'postcss',
            severity: 'moderate',
            isDirect: false,
            fixAvailable: true,
          },
        },
      }),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        packageName: 'next',
        currentRange: '16.2.10',
        auditFixVersion: '9.3.3',
        targetVersion: '9.3.3',
        disposition: 'downgrade-only',
        autoExecutable: false,
      }),
    ]);
    expect(() => buildStudioDependencyUpgradeCommand({ target, candidate: candidates[0] })).toThrow(
      'not safe for automatic execution'
    );
    expect(() =>
      buildStudioDependencyUpgradeCommand({
        target,
        candidate: { ...candidates[0], packageName: 'next; rm -rf .', autoExecutable: true },
      })
    ).toThrow('package name is invalid');
  });

  it('builds an exact transaction only for a non-breaking forward audit fix', async () => {
    const root = await fixture();
    const projectPath = path.join(root, 'atlas-web');
    await fs.writeJson(path.join(projectPath, 'package.json'), {
      name: 'atlas-web',
      dependencies: { next: '16.2.10' },
    });
    const target = await resolveStudioDependencySecurityTarget({ workspacePath: root });
    const [candidate] = await parseStudioDependencyUpgradeCandidates({
      target,
      auditJson: JSON.stringify({
        vulnerabilities: {
          next: {
            name: 'next',
            severity: 'moderate',
            isDirect: true,
            range: '<16.2.11',
            fixAvailable: { name: 'next', version: '16.2.11', isSemVerMajor: false },
          },
        },
      }),
    });

    expect(candidate).toMatchObject({
      targetVersion: '16.2.11',
      disposition: 'safe-upgrade',
      autoExecutable: true,
    });
    expect(buildStudioDependencyUpgradeCommand({ target, candidate })).toBe(
      'npm install next@16.2.11 --save-exact'
    );
  });

  it('lets the package manager resolve boolean fixes only inside a bounded semver range', async () => {
    const root = await fixture();
    const projectPath = path.join(root, 'atlas-web');
    await fs.writeJson(path.join(projectPath, 'package.json'), {
      name: 'atlas-web',
      dependencies: { '@nestjs/cli': '^11.0.0', unbounded: '*', exact: '1.0.0' },
    });
    const target = await resolveStudioDependencySecurityTarget({ workspacePath: root });
    const candidates = await parseStudioDependencyUpgradeCandidates({
      target,
      auditJson: JSON.stringify({
        vulnerabilities: {
          '@nestjs/cli': {
            name: '@nestjs/cli',
            severity: 'high',
            isDirect: true,
            fixAvailable: true,
          },
          unbounded: {
            name: 'unbounded',
            severity: 'high',
            isDirect: true,
            fixAvailable: true,
          },
          exact: {
            name: 'exact',
            severity: 'high',
            isDirect: true,
            fixAvailable: true,
          },
        },
      }),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        packageName: '@nestjs/cli',
        targetVersion: '^11.0.0',
        disposition: 'compatible-resolution',
        autoExecutable: true,
      }),
      expect.objectContaining({
        packageName: 'unbounded',
        disposition: 'no-exact-fix',
        autoExecutable: false,
      }),
      expect.objectContaining({
        packageName: 'exact',
        disposition: 'no-exact-fix',
        autoExecutable: false,
      }),
    ]);
    expect(buildStudioDependencyUpgradeCommand({ target, candidate: candidates[0] })).toBe(
      'npm install @nestjs/cli@^11.0.0 --save-exact'
    );
  });
});
