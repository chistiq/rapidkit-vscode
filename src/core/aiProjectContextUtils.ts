import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { detectRapidkitProject } from './bridge/pythonRapidkit';

const execFileAsync = promisify(execFile);

export interface ProjectScanResolution {
  scanRoot: string;
  runtime: string | null;
  engine: string | null;
  detectionConfidence: 'strong' | 'weak' | 'none';
  kitName: string | null;
}

export async function resolveProjectScanRoot(
  projectPath: string,
  detectionTimeoutMs: number
): Promise<ProjectScanResolution> {
  let scanRoot = projectPath;
  let runtime: string | null = null;
  let engine: string | null = null;
  let detectionConfidence: 'strong' | 'weak' | 'none' = 'none';
  let kitName: string | null = null;

  try {
    const detected = await detectRapidkitProject(projectPath, {
      cwd: path.dirname(projectPath),
      timeoutMs: detectionTimeoutMs,
    });
    if (detected.ok && detected.data) {
      detectionConfidence = detected.data.confidence;
      engine = typeof detected.data.engine === 'string' ? detected.data.engine : null;
      if (detected.data.projectRoot) {
        scanRoot = path.resolve(detected.data.projectRoot);
      }
    }
  } catch {
    // Ignore contract bridge failures and fall back to direct file inspection.
  }

  const projectJson = await safeReadJson<Record<string, unknown>>(
    path.join(scanRoot, '.rapidkit', 'project.json')
  );
  const contextJson = await safeReadJson<Record<string, unknown>>(
    path.join(scanRoot, '.rapidkit', 'context.json')
  );

  if (typeof projectJson?.kit_name === 'string') {
    kitName = projectJson.kit_name;
  }
  if (typeof projectJson?.runtime === 'string') {
    runtime = projectJson.runtime;
  }
  if (typeof contextJson?.engine === 'string' && !engine) {
    engine = contextJson.engine;
  }

  return {
    scanRoot,
    runtime,
    engine,
    detectionConfidence,
    kitName,
  };
}

export async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function safeReadText(filePath: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export async function resolvePythonVersion(
  scanRoot: string,
  inferredFramework: string | undefined,
  runtime: string | null
): Promise<string | null> {
  const isPythonProject = inferredFramework === 'fastapi' || runtime === 'python';
  if (!isPythonProject) {
    return null;
  }

  const dotPythonVersion = await safeReadText(path.join(scanRoot, '.python-version'));
  if (dotPythonVersion) {
    const fromDotFile = dotPythonVersion.trim();
    if (fromDotFile) {
      return fromDotFile;
    }
  }

  const pyproject = await safeReadText(path.join(scanRoot, 'pyproject.toml'));
  if (pyproject) {
    const fromPoetry = extractPythonConstraintFromPyproject(pyproject);
    if (fromPoetry) {
      return fromPoetry;
    }
  }

  return null;
}

export function extractPythonConstraintFromPyproject(pyproject: string): string | null {
  const depSection = pyproject.split('[tool.poetry.dependencies]')[1]?.split('[')[0] ?? '';
  const pythonInDependencies = depSection.match(/^python\s*=\s*["']([^"']+)["']/m);
  if (pythonInDependencies?.[1]) {
    return pythonInDependencies[1].trim();
  }

  const requiresPython = pyproject.match(/^requires-python\s*=\s*["']([^"']+)["']/m);
  if (requiresPython?.[1]) {
    return requiresPython[1].trim();
  }

  return null;
}

export async function readWorkspaceHealthSummary(scanRoot: string): Promise<{
  generatedAt: string | null;
  total: number;
  passed: number;
  warnings: number;
  errors: number;
} | null> {
  const evidence = await readDoctorEvidence(scanRoot);
  const score = evidence?.healthScore;
  if (!score) {
    return null;
  }

  const total = Number(score.total ?? 0);
  const passed = Number(score.passed ?? 0);
  const warnings = Number(score.warnings ?? 0);
  const errors = Number(score.errors ?? 0);

  return {
    generatedAt: typeof evidence?.generatedAt === 'string' ? evidence.generatedAt : null,
    total,
    passed,
    warnings,
    errors,
  };
}

export async function readWorkspaceVersions(scanRoot: string): Promise<{
  core: string | null;
  npm: string | null;
}> {
  const evidence = await readDoctorEvidence(scanRoot);
  const versions = evidence?.system?.versions;
  return {
    core: typeof versions?.core === 'string' ? versions.core : null,
    npm: typeof versions?.npm === 'string' ? versions.npm : null,
  };
}

async function readDoctorEvidence(scanRoot: string): Promise<{
  generatedAt?: string;
  healthScore?: {
    total?: number;
    passed?: number;
    warnings?: number;
    errors?: number;
  };
  system?: {
    versions?: {
      core?: string;
      npm?: string;
    };
  };
} | null> {
  return await safeReadJson(path.join(scanRoot, '.rapidkit', 'reports', 'doctor-last-run.json'));
}

export function normalizeKitName(
  value: string | null | undefined
):
  | 'fastapi.ddd'
  | 'fastapi.standard'
  | 'nestjs.standard'
  | 'gofiber.standard'
  | 'gogin.standard'
  | 'springboot.standard'
  | 'dotnet.webapi.clean'
  | 'unknown' {
  switch (value) {
    case 'fastapi.ddd':
      return 'fastapi.ddd';
    case 'fastapi.standard':
      return 'fastapi.standard';
    case 'nestjs.standard':
      return 'nestjs.standard';
    case 'gofiber.standard':
      return 'gofiber.standard';
    case 'gogin.standard':
      return 'gogin.standard';
    case 'springboot.standard':
      return 'springboot.standard';
    case 'dotnet.webapi.clean':
      return 'dotnet.webapi.clean';
    default:
      return 'unknown';
  }
}

export function normalizeFrameworkHint(
  framework: string | undefined,
  resolved: ProjectScanResolution
): string | undefined {
  if (framework) {
    return framework;
  }
  const normalizedKit = normalizeKitName(resolved.kitName);
  if (normalizedKit.startsWith('fastapi')) {
    return 'fastapi';
  }
  if (normalizedKit.startsWith('nestjs')) {
    return 'nestjs';
  }
  if (normalizedKit.startsWith('go')) {
    return 'go';
  }
  if (normalizedKit.startsWith('springboot')) {
    return 'springboot';
  }
  if (normalizedKit.startsWith('dotnet')) {
    return 'dotnet';
  }
  if (resolved.runtime === 'node' || resolved.engine === 'node' || resolved.engine === 'npm') {
    return 'nestjs';
  }
  if (resolved.runtime === 'java' || resolved.engine === 'java' || resolved.engine === 'mvn') {
    return 'springboot';
  }
  if (
    resolved.runtime === 'dotnet' ||
    resolved.runtime === 'csharp' ||
    resolved.engine === 'dotnet'
  ) {
    return 'dotnet';
  }
  if (resolved.runtime === 'go' || resolved.engine === 'go') {
    return 'go';
  }
  if (resolved.runtime === 'python' || resolved.engine === 'python' || resolved.engine === 'pip') {
    return 'fastapi';
  }
  return undefined;
}

export async function buildDirTree(
  projectPath: string,
  topDirs: string[],
  kit?: string
): Promise<string> {
  // Go kits use cmd/ + internal/ — not src/
  if (kit?.startsWith('gofiber') || kit?.startsWith('gogin')) {
    const lines: string[] = [];
    for (const topDir of ['cmd', 'internal', 'docs']) {
      try {
        const children = (await fs.promises.readdir(path.join(projectPath, topDir)))
          .filter((n) => !n.startsWith('.'))
          .slice(0, 8);
        if (children.length > 0) {
          lines.push(`${topDir}/`);
          for (const child of children) {
            lines.push(`  ${child}`);
          }
        }
      } catch {
        // skip missing directories
      }
    }
    return lines.join('\n');
  }

  if (topDirs.length === 0) {
    return '';
  }
  const lines: string[] = ['src/'];
  for (const dir of topDirs.slice(0, 8)) {
    lines.push(`  ${dir}/`);
    try {
      const children = (await fs.promises.readdir(path.join(projectPath, 'src', dir)))
        .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
        .slice(0, 6);
      for (const child of children) {
        lines.push(`    ${child}`);
      }
    } catch {
      // skip unreadable directories
    }
  }
  return lines.join('\n');
}

export async function readRelevantFiles(
  projectPath: string,
  kit: string
): Promise<Array<{ relPath: string; content: string }>> {
  const candidates: string[] = [];

  if (kit === 'fastapi.ddd') {
    candidates.push(
      'src/main.py',
      'src/routing/__init__.py',
      'src/app/application/interfaces.py',
      'src/app/presentation/api/dependencies/__init__.py',
      'src/app/domain/models/__init__.py'
    );
  } else if (kit.startsWith('fastapi')) {
    candidates.push(
      'src/main.py',
      'src/routing/__init__.py',
      'src/modules/free/essentials/settings/settings.py'
    );
  } else if (kit.startsWith('nestjs')) {
    candidates.push(
      'src/main.ts',
      'src/app.module.ts',
      'src/modules/index.ts',
      'src/config/configuration.ts'
    );
  } else if (kit.startsWith('gofiber') || kit.startsWith('gogin')) {
    candidates.push(
      'cmd/server/main.go',
      'internal/config/config.go',
      'internal/server/server.go',
      'internal/handlers/health.go'
    );
  } else if (kit.startsWith('springboot')) {
    candidates.push(
      'pom.xml',
      'src/main/resources/application.yml',
      'src/main/resources/application.yaml'
    );
    // Dynamically discover Java entry point files — package path varies per service name
    const javaFiles = await discoverSpringBootJavaFiles(projectPath, [
      'AppApplication.java',
      'SystemInfoController.java',
    ]);
    candidates.push(...javaFiles);
  }

  const result: Array<{ relPath: string; content: string }> = [];
  for (const relPath of candidates) {
    try {
      const raw = await fs.promises.readFile(path.join(projectPath, relPath), 'utf8');
      if (raw) {
        result.push({ relPath, content: raw.slice(0, 1800) });
      }
    } catch {
      // file missing — skip silently
    }
  }
  return result;
}

/**
 * Walk src/main/java/ and return relative paths for any files whose basename
 * matches the given target names. Used for Spring Boot where the package path
 * varies per generated service name.
 */
async function discoverSpringBootJavaFiles(
  projectPath: string,
  targets: string[]
): Promise<string[]> {
  const javaRoot = path.join(projectPath, 'src', 'main', 'java');
  const found: string[] = [];
  const remaining = new Set(targets);

  async function walk(dir: string, depth: number): Promise<void> {
    if (remaining.size === 0 || depth > 8) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (remaining.size === 0) {
        break;
      }
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), depth + 1);
      } else if (remaining.has(entry.name)) {
        found.push(path.relative(projectPath, path.join(dir, entry.name)));
        remaining.delete(entry.name);
      }
    }
  }

  await walk(javaRoot, 0);
  return found;
}

export async function getGitDiffStat(
  projectPath: string,
  gitDiffTimeoutMs: number
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD'], {
      cwd: projectPath,
      timeout: gitDiffTimeoutMs,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const output = stdout.trim().slice(0, 800);
    return output || 'No uncommitted changes detected (git diff --stat HEAD is empty).';
  } catch {
    return 'Git context unavailable (not a repository or git is not installed).';
  }
}
