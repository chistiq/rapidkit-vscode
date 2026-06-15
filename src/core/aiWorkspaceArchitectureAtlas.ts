import * as fs from 'fs';
import * as path from 'path';
import type { AIModalContext, ScannedProjectContext } from './aiService';
import type { AnalyzeEvidenceSlice, AnalyzeProjectEvidenceSlice } from './aiArchitectureGrounding';
import {
  buildPlatformTeachingIndex,
  resolveActiveKitId,
  resolveKitId,
} from './aiKitArchitectureCatalog';

export type ProjectArchitectureFingerprint = {
  name: string;
  path: string;
  relativePath?: string;
  kit: string;
  runtime: string;
  framework: string;
  moduleSupport: boolean;
  installedModuleCount: number;
  installedModuleSlugs: string[];
  entryPoints: string[];
  hasRapidKitMarker: boolean;
  hasExamplesDir: boolean;
  hasDomainLayer: boolean;
  hasDockerfile: boolean;
  hasTests: boolean;
  source: 'analyze' | 'disk' | 'merged';
};

export type WorkspaceArchitectureAtlas = {
  workspacePath: string;
  projectCount: number;
  isPolyglot: boolean;
  runtimeFamilies: string[];
  kitIds: string[];
  projects: ProjectArchitectureFingerprint[];
  crossProjectModules: Array<{ slug: string; projects: string[] }>;
  activeProjectPath?: string;
};

const MAX_PROJECTS_SCANNED = 10;
const MAX_MODULE_SLUGS_PER_PROJECT = 12;

function pathExists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate);
  } catch {
    return false;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function detectEntryPoints(projectPath: string, kit: string): string[] {
  const candidates = [
    { rel: 'src/main.ts', kits: ['nestjs'] },
    { rel: 'src/main.py', kits: ['fastapi'] },
    { rel: 'src/app/main.py', kits: ['fastapi'] },
    { rel: 'cmd/server/main.go', kits: ['go', 'gofiber', 'gogin'] },
    { rel: 'main.go', kits: ['go', 'gofiber', 'gogin'] },
    { rel: 'pom.xml', kits: ['springboot'] },
    { rel: 'build.gradle', kits: ['springboot'] },
    { rel: 'build.gradle.kts', kits: ['springboot'] },
  ];

  const family = kit.startsWith('nestjs')
    ? 'nestjs'
    : kit.startsWith('fastapi')
      ? 'fastapi'
      : kit.startsWith('go')
        ? 'go'
        : kit.startsWith('springboot')
          ? 'springboot'
          : kit.startsWith('dotnet')
            ? 'dotnet'
            : 'unknown';

  const found: string[] = [];
  for (const candidate of candidates) {
    if (candidate.kits.includes(family) && pathExists(path.join(projectPath, candidate.rel))) {
      found.push(candidate.rel);
    }
  }

  if (family === 'dotnet') {
    try {
      const srcDir = path.join(projectPath, 'src');
      if (pathExists(srcDir)) {
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name.endsWith('.Api')) {
            const programCs = path.join(srcDir, entry.name, 'Program.cs');
            if (pathExists(programCs)) {
              found.push(`src/${entry.name}/Program.cs`);
            }
          }
        }
      }
    } catch {
      // ignore unreadable src
    }
  }

  return found.slice(0, 4);
}

function readInstalledModules(projectPath: string): { count: number; slugs: string[] } {
  const registryPaths = [
    path.join(projectPath, 'registry.json'),
    path.join(projectPath, '.rapidkit', 'registry.json'),
  ];

  for (const registryPath of registryPaths) {
    const parsed = readJsonFile<{ installed_modules?: Array<{ slug?: string }> }>(registryPath);
    if (!parsed) {
      continue;
    }
    const slugs = (parsed.installed_modules ?? [])
      .map((mod) => (typeof mod.slug === 'string' ? mod.slug.trim().toLowerCase() : ''))
      .filter(Boolean)
      .slice(0, MAX_MODULE_SLUGS_PER_PROJECT);
    return { count: slugs.length, slugs };
  }

  return { count: 0, slugs: [] };
}

function deriveRuntimeFromKit(kit: string): { runtime: string; framework: string } {
  const resolved = resolveKitId(kit);
  if (resolved?.startsWith('fastapi')) {
    return { runtime: 'python', framework: 'fastapi' };
  }
  if (resolved?.startsWith('nestjs')) {
    return { runtime: 'node', framework: 'nestjs' };
  }
  if (resolved === 'gofiber.standard') {
    return { runtime: 'go', framework: 'gofiber' };
  }
  if (resolved === 'gogin.standard') {
    return { runtime: 'go', framework: 'gogin' };
  }
  if (resolved === 'springboot.standard') {
    return { runtime: 'java', framework: 'springboot' };
  }
  if (resolved === 'dotnet.webapi.clean') {
    return { runtime: 'dotnet', framework: 'dotnet' };
  }
  return { runtime: 'unknown', framework: kit || 'unknown' };
}

export function scanProjectArchitectureFingerprint(
  projectPath: string,
  analyzeSlice?: AnalyzeProjectEvidenceSlice | null
): ProjectArchitectureFingerprint | null {
  const resolvedPath = path.resolve(projectPath);
  if (!pathExists(resolvedPath)) {
    return null;
  }

  const name = path.basename(resolvedPath);
  const projectJson = readJsonFile<{
    kit_name?: string;
    runtime?: string;
    module_support?: boolean;
  }>(path.join(resolvedPath, '.rapidkit', 'project.json'));

  let kit = projectJson?.kit_name?.trim() || 'unknown';
  if (kit === 'unknown' && analyzeSlice) {
    kit = analyzeSlice.framework !== 'unknown' ? analyzeSlice.framework : kit;
  }

  const { runtime, framework } = analyzeSlice
    ? { runtime: analyzeSlice.runtime, framework: analyzeSlice.framework }
    : deriveRuntimeFromKit(kit);

  const { count, slugs } = readInstalledModules(resolvedPath);
  const entryPoints = detectEntryPoints(resolvedPath, kit);
  const hasRapidKitMarker =
    analyzeSlice?.hasRapidKitMarker ??
    pathExists(path.join(resolvedPath, '.rapidkit', 'project.json'));
  const hasExamplesDir = pathExists(path.join(resolvedPath, 'src', 'examples'));
  const hasDomainLayer = pathExists(path.join(resolvedPath, 'src', 'app', 'domain'));
  const hasDockerfile =
    analyzeSlice?.hasDockerfile ?? pathExists(path.join(resolvedPath, 'Dockerfile'));
  const hasTests =
    analyzeSlice?.hasTests ??
    (pathExists(path.join(resolvedPath, 'test')) ||
      pathExists(path.join(resolvedPath, 'tests')) ||
      pathExists(path.join(resolvedPath, 'src', 'test')));

  const moduleSupport =
    typeof projectJson?.module_support === 'boolean'
      ? projectJson.module_support
      : resolveKitId(kit)?.startsWith('fastapi') || resolveKitId(kit)?.startsWith('nestjs')
        ? true
        : false;

  if (
    kit === 'unknown' &&
    entryPoints.length === 0 &&
    !hasRapidKitMarker &&
    count === 0 &&
    !analyzeSlice
  ) {
    return null;
  }

  return {
    name,
    path: resolvedPath,
    relativePath: analyzeSlice?.relativePath,
    kit: resolveKitId(kit) ?? kit,
    runtime,
    framework,
    moduleSupport,
    installedModuleCount: count,
    installedModuleSlugs: slugs,
    entryPoints,
    hasRapidKitMarker,
    hasExamplesDir,
    hasDomainLayer,
    hasDockerfile,
    hasTests,
    source: analyzeSlice ? 'merged' : 'disk',
  };
}

async function discoverProjectPaths(
  workspacePath: string,
  analyze?: AnalyzeEvidenceSlice | null
): Promise<string[]> {
  const discovered = new Set<string>();

  for (const project of analyze?.projects ?? []) {
    if (project.path?.trim()) {
      discovered.add(path.resolve(project.path.trim()));
    }
  }

  if (pathExists(path.join(workspacePath, '.rapidkit', 'project.json'))) {
    discovered.add(path.resolve(workspacePath));
  }
  if (pathExists(path.join(workspacePath, 'registry.json'))) {
    discovered.add(path.resolve(workspacePath));
  }

  try {
    const entries = await fs.promises.readdir(workspacePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const candidate = path.join(workspacePath, entry.name);
      const hasProjectMarker =
        pathExists(path.join(candidate, '.rapidkit', 'project.json')) ||
        pathExists(path.join(candidate, 'registry.json')) ||
        pathExists(path.join(candidate, 'pyproject.toml')) ||
        pathExists(path.join(candidate, 'package.json')) ||
        pathExists(path.join(candidate, 'go.mod')) ||
        pathExists(path.join(candidate, 'pom.xml'));
      if (hasProjectMarker) {
        discovered.add(path.resolve(candidate));
      }
    }
  } catch {
    // unreadable workspace
  }

  return [...discovered].slice(0, MAX_PROJECTS_SCANNED);
}

function collectCrossProjectModules(
  projects: ProjectArchitectureFingerprint[]
): Array<{ slug: string; projects: string[] }> {
  const map = new Map<string, Set<string>>();
  for (const project of projects) {
    for (const slug of project.installedModuleSlugs) {
      if (!map.has(slug)) {
        map.set(slug, new Set<string>());
      }
      map.get(slug)!.add(project.name);
    }
  }
  return [...map.entries()]
    .map(([slug, projectSet]) => ({ slug, projects: [...projectSet].sort() }))
    .sort((a, b) => b.projects.length - a.projects.length || a.slug.localeCompare(b.slug))
    .slice(0, 24);
}

export async function buildWorkspaceArchitectureAtlas(
  workspacePath: string,
  analyze?: AnalyzeEvidenceSlice | null,
  activeProjectPath?: string
): Promise<WorkspaceArchitectureAtlas | null> {
  if (!workspacePath?.trim()) {
    return null;
  }

  const root = path.resolve(workspacePath.trim());
  const projectPaths = await discoverProjectPaths(root, analyze);

  const analyzeByPath = new Map<string, AnalyzeProjectEvidenceSlice>();
  for (const project of analyze?.projects ?? []) {
    if (project.path?.trim()) {
      analyzeByPath.set(path.resolve(project.path.trim()), project);
    }
  }

  const projects: ProjectArchitectureFingerprint[] = [];
  for (const projectPath of projectPaths) {
    const fingerprint = scanProjectArchitectureFingerprint(
      projectPath,
      analyzeByPath.get(projectPath) ?? null
    );
    if (fingerprint) {
      projects.push(fingerprint);
    }
  }

  if (projects.length === 0) {
    return null;
  }

  const kitIds = [...new Set(projects.map((p) => resolveKitId(p.kit) ?? p.kit).filter(Boolean))];
  const runtimeFamilies = [
    ...new Set(projects.map((p) => p.runtime).filter((r) => r !== 'unknown')),
  ];

  return {
    workspacePath: root,
    projectCount: projects.length,
    isPolyglot: kitIds.length > 1 || runtimeFamilies.length > 1,
    runtimeFamilies,
    kitIds: kitIds as string[],
    projects,
    crossProjectModules: collectCrossProjectModules(projects),
    activeProjectPath: activeProjectPath?.trim()
      ? path.resolve(activeProjectPath.trim())
      : undefined,
  };
}

export function buildWorkspaceArchitectureAtlasBlock(
  atlas: WorkspaceArchitectureAtlas | null,
  ctx: AIModalContext,
  scanned?: ScannedProjectContext
): string {
  if (!atlas) {
    return [
      'WORKSPACE ARCHITECTURE ATLAS:',
      '- No multi-project topology detected. Treat current path as single project or minimal workspace shell.',
      '- Run `rapidkit analyze` at workspace root to refresh project inventory.',
    ].join('\n');
  }

  const activePath =
    ctx.projectRootPath?.trim() ||
    (ctx.type === 'project' ? ctx.path?.trim() : undefined) ||
    atlas.activeProjectPath;
  const normalizedActive = activePath ? path.resolve(activePath) : undefined;

  const lines: string[] = [
    'WORKSPACE ARCHITECTURE ATLAS (dynamic — authoritative project inventory):',
    `- Workspace: ${atlas.workspacePath}`,
    `- Projects discovered: ${atlas.projectCount}${atlas.isPolyglot ? ' (polyglot workspace)' : ''}`,
  ];

  if (atlas.runtimeFamilies.length > 0) {
    lines.push(`- Runtime families: ${atlas.runtimeFamilies.join(', ')}`);
  }
  if (atlas.kitIds.length > 0) {
    lines.push(`- Kit IDs present: ${atlas.kitIds.join(', ')}`);
  }

  lines.push('- Project inventory:');
  for (const project of atlas.projects) {
    const isActive = normalizedActive && path.resolve(project.path) === normalizedActive;
    const flags = [
      project.hasRapidKitMarker ? 'rapidkit' : 'no-marker',
      project.moduleSupport ? 'catalog-modules' : 'no-catalog',
      project.hasDockerfile ? 'docker' : 'no-docker',
      project.hasTests ? 'tests' : 'no-tests',
      project.hasExamplesDir ? 'examples' : '',
      project.hasDomainLayer ? 'ddd-layers' : '',
    ]
      .filter(Boolean)
      .join(', ');
    const entry = project.entryPoints.length > 0 ? project.entryPoints.join(', ') : 'no-entry-yet';
    const modules =
      project.installedModuleCount > 0
        ? `${project.installedModuleCount} (${project.installedModuleSlugs.slice(0, 4).join(', ')}${project.installedModuleCount > 4 ? '…' : ''})`
        : '0';
    lines.push(
      `    • ${project.name}${isActive ? ' ← ACTIVE' : ''} | kit=${project.kit} | runtime=${project.runtime} | modules=${modules} | entry=${entry} | ${flags}`
    );
    lines.push(`      path=${project.path}`);
  }

  if (atlas.crossProjectModules.length > 0) {
    lines.push('- Cross-project catalog modules (reuse before reinstalling):');
    for (const entry of atlas.crossProjectModules.slice(0, 12)) {
      lines.push(`    • ${entry.slug} → ${entry.projects.join(', ')}`);
    }
  }

  if (atlas.isPolyglot) {
    lines.push(
      '- POLYGLOT GUARD: When answering workspace questions, name which project each command targets. Do not apply NestJS patterns to Go/Spring/.NET projects.'
    );
  }

  const minimalProjects = atlas.projects.filter(
    (p) =>
      !p.hasRapidKitMarker &&
      p.entryPoints.length === 0 &&
      !p.hasDockerfile &&
      (p.runtime === 'python' || p.framework === 'python')
  );
  if (minimalProjects.length > 0 && minimalProjects.length === atlas.projectCount) {
    lines.push(
      '- GUARD: Entire workspace is minimal shell without deployable services. Recommend `rapidkit create project <kit> <name>` before deploy/Docker/module guidance.'
    );
  }

  const activeKit = resolveActiveKitId(ctx, scanned);
  if (atlas.isPolyglot) {
    const index = buildPlatformTeachingIndex(activeKit, atlas.kitIds, { polyglotOnly: true });
    if (index) {
      lines.push('', index);
    }
  }

  return lines.join('\n');
}

export async function buildWorkspaceArchitectureAtlasPromptBlock(
  ctx: AIModalContext,
  scanned?: ScannedProjectContext,
  analyze?: AnalyzeEvidenceSlice | null,
  workspacePath?: string
): Promise<string> {
  const root = workspacePath?.trim();
  if (!root) {
    return buildWorkspaceArchitectureAtlasBlock(null, ctx, scanned);
  }

  const activeProjectPath =
    ctx.projectRootPath ?? (ctx.type === 'project' ? ctx.path : undefined) ?? undefined;

  const atlas = await buildWorkspaceArchitectureAtlas(root, analyze ?? null, activeProjectPath);
  return buildWorkspaceArchitectureAtlasBlock(atlas, ctx, scanned);
}
