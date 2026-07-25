import * as fs from 'fs-extra';
import * as path from 'path';

export type ImportedProjectStack =
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'nestjs'
  | 'express'
  | 'koa'
  | 'go'
  | 'springboot'
  | 'rails'
  | 'dotnet'
  | 'nextjs'
  | 'react'
  | 'vite'
  | 'vue'
  | 'nuxt'
  | 'remix'
  | 'sveltekit'
  | 'svelte'
  | 'angular'
  | 'astro'
  | 'solid'
  | 'unknown';

export interface ImportedProjectRegistryEntry {
  name: string;
  path: string;
  relativePath?: string;
  relationship?: 'imported' | 'adopted';
  stack: ImportedProjectStack;
  runtime?: string;
  framework?: string;
  frameworkDisplayName?: string;
  supportTier?: string;
  moduleSupport?: boolean;
  confidence: 'high' | 'medium' | 'low';
  source?: 'local-folder' | 'git-url' | 'drag-drop' | 'adopted-local';
  importedAt: string;
}

interface ImportedProjectsRegistryFile {
  version: 1;
  updatedAt: string;
  projects: ImportedProjectRegistryEntry[];
}

function registryFilePath(workspacePath: string): string {
  return path.join(workspacePath, '.workspai', 'imported-projects.json');
}

function registryFileCandidates(workspacePath: string): string[] {
  return [
    registryFilePath(workspacePath),
    path.join(workspacePath, '.rapidkit', 'imported-projects.json'),
  ];
}

export function resolveImportedProjectPath(workspacePath: string, projectPath: string): string {
  return path.resolve(
    path.isAbsolute(projectPath) ? projectPath : path.join(workspacePath, projectPath)
  );
}

export async function readImportedProjectsRegistry(
  workspacePath: string
): Promise<ImportedProjectRegistryEntry[]> {
  for (const filePath of registryFileCandidates(workspacePath)) {
    if (!(await fs.pathExists(filePath))) {
      continue;
    }
    try {
      const raw: unknown = await fs.readJSON(filePath);
      const projects: unknown[] = Array.isArray((raw as { projects?: unknown[] })?.projects)
        ? ((raw as { projects?: unknown[] }).projects as unknown[])
        : [];

      return projects.filter((item: unknown): item is ImportedProjectRegistryEntry => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const candidate = item as ImportedProjectRegistryEntry;
        return (
          typeof candidate.name === 'string' &&
          typeof candidate.path === 'string' &&
          typeof candidate.stack === 'string' &&
          typeof candidate.confidence === 'string' &&
          typeof candidate.importedAt === 'string'
        );
      });
    } catch {
      continue;
    }
  }
  return [];
}

export async function upsertImportedProjectsRegistry(
  workspacePath: string,
  entries: ImportedProjectRegistryEntry[]
): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const existing = await readImportedProjectsRegistry(workspacePath);
  const byPath = new Map<string, ImportedProjectRegistryEntry>();

  for (const item of existing) {
    byPath.set(item.path, item);
  }

  for (const item of entries) {
    byPath.set(item.path, item);
  }

  const projects = Array.from(byPath.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ ...item }));

  const payload: ImportedProjectsRegistryFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects,
  };

  const filePath = registryFilePath(workspacePath);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJSON(filePath, payload, { spaces: 2 });
}
