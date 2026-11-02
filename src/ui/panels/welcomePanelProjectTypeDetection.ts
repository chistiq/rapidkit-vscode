import * as fs from 'fs-extra';
import * as path from 'path';
import type { WorkspaiProjectType } from '../../types';

export type WelcomePanelProjectType = WorkspaiProjectType | null;

const PROJECT_TYPES: ReadonlySet<WorkspaiProjectType> = new Set([
  'fastapi',
  'django',
  'flask',
  'nestjs',
  'express',
  'koa',
  'go',
  'springboot',
  'rails',
  'dotnet',
  'rust',
  'laravel',
  'tauri',
  'electron',
  'vscode-extension',
  'agent',
  'gateway',
  'nextjs',
  'react',
  'vite',
  'vue',
  'nuxt',
  'remix',
  'sveltekit',
  'svelte',
  'angular',
  'astro',
  'solid',
  'unknown',
]);

function canonicalProjectType(metadata: unknown): WorkspaiProjectType | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const record = metadata as Record<string, unknown>;
  const candidates = [
    record.project_type,
    record.type,
    record.kind,
    record.category,
    record.framework,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const normalized = candidate.trim().toLowerCase();
    if (normalized === 'google-adk' || normalized.includes('agent-framework')) {
      return 'agent';
    }
    if (normalized !== 'unknown' && PROJECT_TYPES.has(normalized as WorkspaiProjectType)) {
      return normalized as WorkspaiProjectType;
    }
  }
  return undefined;
}

export async function detectProjectTypeFromPath(
  projectPath: string
): Promise<WelcomePanelProjectType> {
  try {
    const canonicalProjectPath = path.join(projectPath, '.workspai', 'project.json');
    if (await fs.pathExists(canonicalProjectPath)) {
      const canonicalType = canonicalProjectType(await fs.readJson(canonicalProjectPath));
      if (canonicalType) {
        return canonicalType;
      }
    }

    const goModPath = path.join(projectPath, 'go.mod');
    if (await fs.pathExists(goModPath)) {
      return 'go';
    }

    const pomXmlPath = path.join(projectPath, 'pom.xml');
    const gradlePath = path.join(projectPath, 'build.gradle');
    const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');
    if (
      (await fs.pathExists(pomXmlPath)) ||
      (await fs.pathExists(gradlePath)) ||
      (await fs.pathExists(gradleKtsPath))
    ) {
      return 'springboot';
    }

    const entries = await fs.readdir(projectPath, { withFileTypes: true }).catch(() => []);
    if (
      entries.some(
        (entry) => entry.isFile() && (entry.name.endsWith('.csproj') || entry.name.endsWith('.sln'))
      )
    ) {
      return 'dotnet';
    }

    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (await fs.pathExists(pyprojectPath)) {
      const content = await fs.readFile(pyprojectPath, 'utf8');
      if (content.includes('fastapi') || content.includes('uvicorn')) {
        return 'fastapi';
      }
    }

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const content = await fs.readFile(packageJsonPath, 'utf8');
      if (content.includes('@nestjs/core') || content.includes('@nestjs/common')) {
        return 'nestjs';
      }
    }

    return null;
  } catch {
    return null;
  }
}
