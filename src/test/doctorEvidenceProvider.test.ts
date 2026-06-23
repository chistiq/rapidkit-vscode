import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class EventEmitter<T = unknown> {
    readonly event = vi.fn();
    fire = vi.fn((_value?: T) => undefined);
    dispose = vi.fn(() => undefined);
  }

  class TreeItem {
    label?: string;
    description?: string;
    collapsibleState?: number;

    constructor(label?: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    id: string;

    constructor(id: string) {
      this.id = id;
    }
  }

  class MarkdownString {
    value = '';

    constructor(value?: string) {
      this.value = value ?? '';
    }
  }

  return {
    EventEmitter,
    TreeItem,
    ThemeIcon,
    MarkdownString,
    workspace: {
      createFileSystemWatcher: vi.fn(() => ({
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        dispose: vi.fn(),
      })),
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
  };
});

import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import {
  DoctorEvidenceProvider,
  normalizeProjectEvidence,
} from '../ui/treeviews/doctorEvidenceProvider';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.remove(dir);
  }
  tempDirs.length = 0;
});

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `doctor-evidence-${Date.now()}-${Math.random()}`);
  tempDirs.push(dir);
  return dir;
}

describe('normalizeProjectEvidence', () => {
  it('parses frontend project probes and signals', () => {
    const project = normalizeProjectEvidence({
      name: 'catalog-api',
      path: '/tmp/catalog-api',
      framework: 'Next.js',
      projectKind: 'frontend',
      modulesHealthy: true,
      hasTests: false,
      hasCodeQuality: true,
      vulnerabilities: 2,
      issues: [],
      probes: [
        {
          id: 'test-script',
          label: 'test script surface',
          status: 'warn',
          reason: 'No test script detected for Next.js.',
        },
      ],
    });

    expect(project).toMatchObject({
      name: 'catalog-api',
      projectKind: 'frontend',
      hasTests: false,
      hasCodeQuality: true,
      vulnerabilities: 2,
    });
    expect(project?.probes?.length).toBe(1);
    expect(project?.probes?.[0].status).toBe('warn');
  });
});

describe('DoctorEvidenceProvider', () => {
  it('merges project doctor evidence when a project is selected', async () => {
    const workspacePath = makeTempDir();
    const projectPath = path.join(workspacePath, 'catalog-api');
    await fs.ensureDir(path.join(workspacePath, '.rapidkit', 'reports'));
    await fs.ensureDir(path.join(projectPath, '.rapidkit', 'reports'));

    await fs.writeJSON(path.join(workspacePath, '.rapidkit', 'reports', 'doctor-last-run.json'), {
      generatedAt: '2026-06-15T00:00:00.000Z',
      workspacePath,
      workspaceName: 'web-platform-wsp',
      healthScore: { total: 10, passed: 9, warnings: 1, errors: 0 },
      system: { python: { status: 'ok', message: 'ok' } },
      projects: [
        {
          name: 'catalog-api',
          path: projectPath,
          framework: 'Next.js',
          projectKind: 'frontend',
          issues: [],
        },
      ],
    });

    await fs.writeJSON(
      path.join(projectPath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
      {
        generatedAt: '2026-06-15T01:00:00.000Z',
        projectPath,
        projectName: 'catalog-api',
        healthScore: { total: 8, passed: 6, warnings: 2, errors: 0 },
        project: {
          name: 'catalog-api',
          path: projectPath,
          framework: 'Next.js',
          projectKind: 'frontend',
          modulesHealthy: true,
          hasTests: false,
          hasCodeQuality: true,
          vulnerabilities: 2,
          issues: [],
          probes: [
            {
              id: 'test-script',
              label: 'test script surface',
              status: 'warn',
              reason: 'Add a "test" script to package.json.',
            },
          ],
        },
        system: { python: { status: 'ok', message: 'ok' } },
      }
    );

    const provider = new DoctorEvidenceProvider(
      () => workspacePath,
      () => projectPath
    );
    const evidence = await (
      provider as unknown as {
        readEvidence: () => Promise<{
          focusProjectPath: string;
          focusHealthScore: { total: number; passed: number; warnings: number; errors: number };
          projects: Array<{
            hasTests: boolean;
            vulnerabilities: number;
            probes?: Array<{ label?: string }>;
          }>;
        }>;
      }
    ).readEvidence();

    expect(evidence).toMatchObject({
      focusProjectPath: projectPath,
      focusHealthScore: { total: 8, passed: 6, warnings: 2, errors: 0 },
    });
    expect(evidence.projects[0]).toMatchObject({
      hasTests: false,
      vulnerabilities: 2,
    });
    expect(evidence.projects[0].probes?.[0].label).toBe('test script surface');
  });

  it('renders probe checks under a project node', async () => {
    const workspacePath = makeTempDir();
    const projectPath = path.join(workspacePath, 'saas-api');
    await fs.ensureDir(path.join(projectPath, '.rapidkit', 'reports'));

    await fs.writeJSON(
      path.join(projectPath, '.rapidkit', 'reports', 'doctor-project-last-run.json'),
      {
        generatedAt: '2026-06-15T01:00:00.000Z',
        projectPath,
        healthScore: { total: 6, passed: 6, warnings: 0, errors: 0 },
        project: {
          name: 'saas-api',
          path: projectPath,
          projectKind: 'backend',
          modulesHealthy: true,
          hasTests: true,
          hasCodeQuality: true,
          issues: [],
          probes: [
            {
              id: 'migration',
              label: 'Migration/readiness surface',
              status: 'warn',
              reason: 'No migration markers detected.',
            },
            { id: 'health', label: 'Runtime health probe surface', status: 'ok' },
          ],
        },
        system: {},
      }
    );

    const provider = new DoctorEvidenceProvider(
      () => workspacePath,
      () => projectPath
    );
    const root = await provider.getChildren();
    expect(root.length).toBeGreaterThan(0);

    const projectSection = root.find((item) => item.label?.toString().startsWith('Projects'));
    expect(projectSection).toBeTruthy();

    const projects = await provider.getChildren(projectSection!);
    expect(projects[0].label?.toString()).toContain('saas-api');

    const projectChildren = await provider.getChildren(projects[0]);
    const probeSection = projectChildren.find((item) => item.label === 'Probe checks');
    expect(probeSection).toBeTruthy();

    const probes = await provider.getChildren(probeSection!);
    expect(
      probes.some((item) => item.label?.toString().includes('Migration/readiness surface'))
    ).toBe(true);
    expect(
      probes.some((item) => item.label?.toString().includes('Runtime health probe surface'))
    ).toBe(true);
  });

  it('renders a Governance Policy section with persistent blockers from workspace verify', async () => {
    const workspacePath = makeTempDir();
    const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
    await fs.ensureDir(reportsDir);

    await fs.writeJSON(path.join(reportsDir, 'doctor-last-run.json'), {
      generatedAt: '2026-06-20T00:00:00.000Z',
      workspacePath,
      workspaceName: 'web-platform-wsp',
      healthScore: { total: 10, passed: 10, warnings: 0, errors: 0 },
      system: { python: { status: 'ok', message: 'ok' } },
      projects: [],
    });

    // warn mode: error-severity violation must still surface as a persistent blocker.
    await fs.writeJSON(path.join(reportsDir, 'workspace-verify-last-run.json'), {
      schemaVersion: 'workspace-verify.v1',
      generatedAt: '2026-06-20T00:05:00.000Z',
      summary: { verdict: 'needs-attention', stepsPassed: 5, stepsMissing: 0 },
      policyMode: 'warn',
      policyViolations: [
        { source: 'model', severity: 'error', code: 'cycle', message: 'dependency cycle a→b→a' },
        { source: 'contract', severity: 'warning', code: 'naming', message: 'non-standard name' },
      ],
      blockingReasons: [],
      missingEvidence: [],
    });

    const provider = new DoctorEvidenceProvider(
      () => workspacePath,
      () => null
    );
    const root = await provider.getChildren();

    const policySection = root.find((item) => item.label?.toString() === 'Governance Policy');
    expect(policySection).toBeTruthy();
    expect(policySection!.description?.toString()).toContain('1 error(s)');
    expect(policySection!.description?.toString()).toContain('1 warning(s)');
    expect(policySection!.description?.toString()).toContain('warn');

    const violations = await provider.getChildren(policySection!);
    expect(violations.length).toBe(2);
    expect(violations[0].label?.toString()).toContain('policy.cycle');
    expect(violations[0].description?.toString()).toContain('dependency cycle');
    expect(violations.some((item) => item.label?.toString().includes('policy.naming'))).toBe(true);
  });
});
