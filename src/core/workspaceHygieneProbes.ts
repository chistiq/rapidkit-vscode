/**
 * Workspace Hygiene Probes
 *
 * Lightweight, in-process checks that surface common workspace quality issues
 * without requiring Workspai CLI. These complement the CLI's doctor output
 * and fill the gaps identified in the workspace analysis:
 *
 *  - Duplicate-dependency probe: detects packages listed in both `dependencies`
 *    AND `devDependencies` in a project's package.json.
 *
 *  - Source-control hygiene probe: detects workspace files that are entirely
 *    untracked in git (projects, config blobs, policy files).
 *
 *  - README framework-alignment probe: detects when the workspace root README
 *    references a different backend framework than what the project actually uses.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { run } from '../utils/exec';

// ── Public types ──────────────────────────────────────────────────────────────

export type HygieneProbeStatus = 'pass' | 'warn' | 'fail';

export interface HygieneProbeResult {
  probeId: string;
  label: string;
  status: HygieneProbeStatus;
  findings: string[];
  suggestions: string[];
}

export interface WorkspaceHygieneReport {
  generatedAt: string;
  workspacePath: string;
  probes: HygieneProbeResult[];
  overallStatus: HygieneProbeStatus;
}

// ── Duplicate-dependency probe ────────────────────────────────────────────────

async function probeDuplicateDependencies(workspacePath: string): Promise<HygieneProbeResult> {
  const probeId = 'duplicate-dependencies';
  const label = 'Duplicate Dependencies';
  const findings: string[] = [];
  const suggestions: string[] = [];

  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      const pkgPath = path.join(workspacePath, entry.name, 'package.json');
      if (!(await fs.pathExists(pkgPath))) {
        continue;
      }

      let pkg: Record<string, unknown>;
      try {
        pkg = await fs.readJSON(pkgPath);
      } catch {
        continue;
      }

      const deps = pkg['dependencies'];
      const devDeps = pkg['devDependencies'];

      if (!deps || typeof deps !== 'object' || !devDeps || typeof devDeps !== 'object') {
        continue;
      }

      const depsMap = deps as Record<string, string>;
      const devDepsMap = devDeps as Record<string, string>;

      for (const pkgName of Object.keys(depsMap)) {
        if (Object.prototype.hasOwnProperty.call(devDepsMap, pkgName)) {
          const prodVersion = depsMap[pkgName];
          const devVersion = devDepsMap[pkgName];
          const versionNote =
            prodVersion !== devVersion
              ? ` (version conflict: prod="${prodVersion}" dev="${devVersion}")`
              : ` (same version: "${prodVersion}")`;
          findings.push(
            `${entry.name}/package.json: "${pkgName}" in both dependencies and devDependencies${versionNote}`
          );
          suggestions.push(
            `Remove "${pkgName}" from dependencies in ${entry.name}/package.json — keep it only in devDependencies.`
          );
        }
      }
    }
  } catch {
    // Non-fatal — return pass with empty findings
  }

  return {
    probeId,
    label,
    status: findings.length > 0 ? 'warn' : 'pass',
    findings,
    suggestions,
  };
}

// ── Source-control hygiene probe ──────────────────────────────────────────────

async function probeSourceControlHygiene(workspacePath: string): Promise<HygieneProbeResult> {
  const probeId = 'source-control-hygiene';
  const label = 'Source Control Hygiene';
  const findings: string[] = [];
  const suggestions: string[] = [];

  try {
    const gitCheck = await run('git', ['rev-parse', '--show-toplevel'], {
      cwd: workspacePath,
      timeout: 5000,
      reject: false,
    });

    if (gitCheck.exitCode !== 0) {
      return {
        probeId,
        label,
        status: 'warn',
        findings: ['Workspace is not inside a git repository.'],
        suggestions: [
          'Initialize a git repository: git init && git add -A && git commit -m "Initial commit"',
        ],
      };
    }

    const statusResult = await run('git', ['status', '--short'], {
      cwd: workspacePath,
      timeout: 8000,
      reject: false,
    });

    if (statusResult.exitCode !== 0) {
      return { probeId, label, status: 'pass', findings: [], suggestions: [] };
    }

    const lines = statusResult.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    const untrackedDirs: string[] = [];
    const modifiedTracked: string[] = [];

    for (const line of lines) {
      const xy = line.slice(0, 2);
      const filePart = line.slice(3);

      if (xy.startsWith('??')) {
        untrackedDirs.push(filePart);
      } else if (xy.includes('M')) {
        modifiedTracked.push(filePart);
      }
    }

    if (untrackedDirs.length > 0) {
      findings.push(
        `${untrackedDirs.length} untracked path(s) detected: ${untrackedDirs.slice(0, 5).join(', ')}${untrackedDirs.length > 5 ? ', …' : ''}`
      );
      suggestions.push(
        'Stage and commit workspace files: git add -A && git commit -m "chore: add workspace files"'
      );
    }

    if (modifiedTracked.length > 0) {
      findings.push(
        `${modifiedTracked.length} tracked file(s) with uncommitted changes: ${modifiedTracked.slice(0, 5).join(', ')}${modifiedTracked.length > 5 ? ', …' : ''}`
      );
      suggestions.push('Commit tracked modifications to preserve workspace state.');
    }
  } catch {
    // Non-fatal
  }

  const status =
    findings.length === 0
      ? 'pass'
      : findings.some((f) => f.includes('untracked'))
        ? 'warn'
        : 'warn';

  return { probeId, label, status, findings, suggestions };
}

// ── README framework-alignment probe ─────────────────────────────────────────

const FRAMEWORK_TOKENS: Record<string, string[]> = {
  fastapi: ['fastapi', 'uvicorn', 'from fastapi'],
  flask: ['flask', 'from flask'],
  django: ['django', 'manage.py'],
  nestjs: ['nestjs', '@nestjs', 'nest new', 'nest start'],
  express: ['express', 'app.listen', 'app.get'],
  nextjs: ['next.js', 'next build', 'next start'],
  spring: ['spring boot', 'springboot', 'mvn spring-boot'],
};

function detectFrameworkFromReadme(content: string): string | null {
  const lower = content.toLowerCase();
  for (const [framework, tokens] of Object.entries(FRAMEWORK_TOKENS)) {
    if (tokens.some((token) => lower.includes(token))) {
      return framework;
    }
  }
  return null;
}

async function detectProjectFramework(workspacePath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(workspacePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const projectPath = path.join(workspacePath, entry.name);

      // Check canonical Workspai context, then legacy RapidKit metadata.
      for (const metaFile of ['context.json', 'project.json']) {
        for (const metadataDir of ['.workspai', '.rapidkit']) {
          const metaPath = path.join(projectPath, metadataDir, metaFile);
          if (await fs.pathExists(metaPath)) {
            const meta = await fs.readJSON(metaPath).catch(() => null);
            const kitType = (meta?.kit_type ||
              meta?.projectType ||
              meta?.framework ||
              '') as string;
            if (kitType) {
              const lower = kitType.toLowerCase();
              for (const framework of Object.keys(FRAMEWORK_TOKENS)) {
                if (lower.includes(framework)) {
                  return framework;
                }
              }
            }
          }
        }
      }

      // Check package.json
      const pkgPath = path.join(projectPath, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJSON(pkgPath).catch(() => null);
        const allDeps = {
          ...(pkg?.dependencies ?? {}),
          ...(pkg?.devDependencies ?? {}),
        } as Record<string, string>;
        if (allDeps['@nestjs/core']) {
          return 'nestjs';
        }
        if (allDeps['express']) {
          return 'express';
        }
        if (allDeps['next']) {
          return 'nextjs';
        }
      }

      // Check pyproject.toml
      if (await fs.pathExists(path.join(projectPath, 'pyproject.toml'))) {
        const content = await fs
          .readFile(path.join(projectPath, 'pyproject.toml'), 'utf8')
          .catch(() => '');
        if (content.includes('fastapi')) {
          return 'fastapi';
        }
        if (content.includes('flask')) {
          return 'flask';
        }
        if (content.includes('django')) {
          return 'django';
        }
        return 'python';
      }
    }
  } catch {
    // Non-fatal
  }
  return null;
}

async function probeReadmeFrameworkAlignment(workspacePath: string): Promise<HygieneProbeResult> {
  const probeId = 'readme-framework-alignment';
  const label = 'README Framework Alignment';
  const findings: string[] = [];
  const suggestions: string[] = [];

  try {
    const readmePath = path.join(workspacePath, 'README.md');
    if (!(await fs.pathExists(readmePath))) {
      return { probeId, label, status: 'pass', findings: [], suggestions: [] };
    }

    const readmeContent = await fs.readFile(readmePath, 'utf8');
    const readmeFramework = detectFrameworkFromReadme(readmeContent);
    const projectFramework = await detectProjectFramework(workspacePath);

    if (!readmeFramework || !projectFramework) {
      // Cannot determine alignment — skip
      return { probeId, label, status: 'pass', findings: [], suggestions: [] };
    }

    if (readmeFramework !== projectFramework) {
      findings.push(
        `README.md references "${readmeFramework}" but the project uses "${projectFramework}".`
      );
      suggestions.push(
        `Update README.md to document "${projectFramework}" setup, commands, and architecture.`
      );
    }
  } catch {
    // Non-fatal
  }

  return {
    probeId,
    label,
    status: findings.length > 0 ? 'warn' : 'pass',
    findings,
    suggestions,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all workspace hygiene probes and return an aggregate report.
 * This function never throws — individual probe failures are caught and
 * represented as `pass` with no findings.
 */
export async function runWorkspaceHygieneProbes(
  workspacePath: string
): Promise<WorkspaceHygieneReport> {
  const [dupDeps, scmHygiene, readmeAlignment] = await Promise.all([
    probeDuplicateDependencies(workspacePath),
    probeSourceControlHygiene(workspacePath),
    probeReadmeFrameworkAlignment(workspacePath),
  ]);

  const probes = [dupDeps, scmHygiene, readmeAlignment];
  const overallStatus: HygieneProbeStatus = probes.some((p) => p.status === 'fail')
    ? 'fail'
    : probes.some((p) => p.status === 'warn')
      ? 'warn'
      : 'pass';

  return {
    generatedAt: new Date().toISOString(),
    workspacePath,
    probes,
    overallStatus,
  };
}
