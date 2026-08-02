import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import { runWorkspaceHygieneProbes } from '../core/workspaceHygieneProbes';

// workspaceHygieneProbes calls git via exec — we test real fs layout but mock git
import { vi } from 'vitest';

vi.mock('../utils/exec', () => ({
  run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

// Re-import after mock so the module sees the mock
import { run } from '../utils/exec';

describe('workspaceHygieneProbes', () => {
  let workspacePath: string;

  beforeEach(async () => {
    workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-hygiene-'));
  });

  afterEach(async () => {
    await fs.remove(workspacePath).catch(() => undefined);
  });

  describe('duplicate-dependencies probe', () => {
    it('passes when no projects have duplicate deps', async () => {
      const projectDir = path.join(workspacePath, 'my-api');
      await fs.ensureDir(projectDir);
      await fs.writeJSON(path.join(projectDir, 'package.json'), {
        name: 'my-api',
        dependencies: { express: '^4.18.2' },
        devDependencies: { jest: '^29.0.0' },
      });

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'duplicate-dependencies')!;
      expect(probe.status).toBe('pass');
      expect(probe.findings).toHaveLength(0);
    });

    it('warns when a package appears in both dependencies and devDependencies', async () => {
      const projectDir = path.join(workspacePath, 'my-nest-prj');
      await fs.ensureDir(projectDir);
      await fs.writeJSON(path.join(projectDir, 'package.json'), {
        name: 'my-nest-prj',
        dependencies: {
          '@nestjs/core': '^10.0.0',
          '@nestjs/cli': '10.0.0',
        },
        devDependencies: {
          '@nestjs/cli': '^11.0.14',
          typescript: '^5.0.0',
        },
      });

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'duplicate-dependencies')!;
      expect(probe.status).toBe('warn');
      expect(probe.findings.some((f) => f.includes('@nestjs/cli'))).toBe(true);
      expect(probe.findings.some((f) => f.includes('version conflict'))).toBe(true);
      expect(probe.suggestions.length).toBeGreaterThan(0);
    });

    it('flags version conflicts in findings detail', async () => {
      const projectDir = path.join(workspacePath, 'conflict-prj');
      await fs.ensureDir(projectDir);
      await fs.writeJSON(path.join(projectDir, 'package.json'), {
        name: 'conflict-prj',
        dependencies: { lodash: '4.17.20' },
        devDependencies: { lodash: '^4.17.21' },
      });

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'duplicate-dependencies')!;
      expect(probe.status).toBe('warn');
      const finding = probe.findings.find((f) => f.includes('lodash'))!;
      expect(finding).toContain('version conflict');
      expect(finding).toContain('prod="4.17.20"');
      expect(finding).toContain('dev="^4.17.21"');
    });

    it('skips directories without package.json silently', async () => {
      await fs.ensureDir(path.join(workspacePath, 'pure-python-svc'));
      await fs.writeFile(
        path.join(workspacePath, 'pure-python-svc', 'pyproject.toml'),
        '[tool.poetry]\nname = "svc"\n',
        'utf8'
      );

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'duplicate-dependencies')!;
      expect(probe.status).toBe('pass');
    });
  });

  describe('source-control-hygiene probe', () => {
    it('passes when git status reports no untracked or modified files', async () => {
      vi.mocked(run).mockImplementation(async (_cmd, args) => {
        if (args[0] === 'rev-parse') {
          return { stdout: workspacePath, stderr: '', exitCode: 0 } as any;
        }
        // git status --short → empty output
        return { stdout: '', stderr: '', exitCode: 0 } as any;
      });

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'source-control-hygiene')!;
      expect(probe.status).toBe('pass');
      expect(probe.findings).toHaveLength(0);
    });

    it('warns when project directories are untracked', async () => {
      vi.mocked(run).mockImplementation(async (_cmd, args) => {
        if (args[0] === 'rev-parse') {
          return { stdout: workspacePath, stderr: '', exitCode: 0 } as any;
        }
        if (args[0] === 'status') {
          return {
            stdout: '?? my-nest-prj/\nM  .rapidkit-workspace\n',
            stderr: '',
            exitCode: 0,
          } as any;
        }
        return { stdout: '', stderr: '', exitCode: 0 } as any;
      });

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'source-control-hygiene')!;
      expect(probe.status).toBe('warn');
      expect(probe.findings.some((f) => f.includes('untracked'))).toBe(true);
      expect(probe.suggestions.length).toBeGreaterThan(0);
    });

    it('warns when workspace is not in a git repository', async () => {
      vi.mocked(run).mockImplementation(async (_cmd, args) => {
        if (args[0] === 'rev-parse') {
          return { stdout: '', stderr: 'not a git repo', exitCode: 128 } as any;
        }
        return { stdout: '', stderr: '', exitCode: 0 } as any;
      });

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'source-control-hygiene')!;
      expect(probe.status).toBe('warn');
      expect(probe.findings.some((f) => f.includes('git repository'))).toBe(true);
    });
  });

  describe('readme-framework-alignment probe', () => {
    it('passes when no README.md is present', async () => {
      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'readme-framework-alignment')!;
      expect(probe.status).toBe('pass');
      expect(probe.findings).toHaveLength(0);
    });

    it('passes when README.md framework matches the detected project framework', async () => {
      // NestJS project
      const projectDir = path.join(workspacePath, 'my-nest-prj');
      await fs.ensureDir(projectDir);
      await fs.writeJSON(path.join(projectDir, 'package.json'), {
        name: 'my-nest-prj',
        dependencies: { '@nestjs/core': '^10.0.0' },
        devDependencies: {},
      });
      // README references NestJS
      await fs.writeFile(
        path.join(workspacePath, 'README.md'),
        '# My Workspace\n\nThis workspace uses NestJS for the backend.\n\n```\nnpx nest start\n```\n',
        'utf8'
      );

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'readme-framework-alignment')!;
      expect(probe.status).toBe('pass');
    });

    it('uses canonical project metadata when no runtime manifest is available', async () => {
      const projectDir = path.join(workspacePath, 'canonical-api');
      await fs.ensureDir(path.join(projectDir, '.workspai'));
      await fs.writeJSON(path.join(projectDir, '.workspai', 'project.json'), {
        framework: 'nestjs',
      });
      await fs.writeFile(
        path.join(workspacePath, 'README.md'),
        '# Canonical API\n\nRun this NestJS service with `nest start`.\n',
        'utf8'
      );

      const report = await runWorkspaceHygieneProbes(workspacePath);
      expect(
        report.probes.find((probe) => probe.probeId === 'readme-framework-alignment')?.status
      ).toBe('pass');
    });

    it('warns when README.md references FastAPI but the project uses NestJS', async () => {
      // NestJS project
      const projectDir = path.join(workspacePath, 'my-nest-prj');
      await fs.ensureDir(projectDir);
      await fs.writeJSON(path.join(projectDir, 'package.json'), {
        name: 'my-nest-prj',
        dependencies: { '@nestjs/core': '^10.0.0' },
        devDependencies: {},
      });
      // README incorrectly references FastAPI
      await fs.writeFile(
        path.join(workspacePath, 'README.md'),
        '# My Workspace\n\nRun with: `uvicorn src.main:app --reload`\n',
        'utf8'
      );

      const report = await runWorkspaceHygieneProbes(workspacePath);
      const probe = report.probes.find((p) => p.probeId === 'readme-framework-alignment')!;
      expect(probe.status).toBe('warn');
      expect(probe.findings.some((f) => f.includes('fastapi') && f.includes('nestjs'))).toBe(true);
      expect(probe.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('aggregate overallStatus', () => {
    it('is pass when all probes pass', async () => {
      vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);

      const report = await runWorkspaceHygieneProbes(workspacePath);
      expect(report.overallStatus).toBe('pass');
    });

    it('is warn when any probe is warn', async () => {
      // SCM probe returns non-repo warning
      vi.mocked(run).mockImplementation(async (_cmd, args) => {
        if (args[0] === 'rev-parse') {
          return { stdout: '', stderr: 'not a git repo', exitCode: 128 } as any;
        }
        return { stdout: '', stderr: '', exitCode: 0 } as any;
      });

      const report = await runWorkspaceHygieneProbes(workspacePath);
      expect(report.overallStatus).toBe('warn');
    });

    it('includes generatedAt ISO timestamp', async () => {
      vi.mocked(run).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any);
      const before = Date.now();
      const report = await runWorkspaceHygieneProbes(workspacePath);
      const after = Date.now();

      const ts = new Date(report.generatedAt).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });
});
