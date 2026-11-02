import fs from 'fs-extra';
import path from 'node:path';
import {
  inspectStudioWorkspaceAvailability,
  studioWorkspaceUnavailableMessage,
} from './studioWorkspaceAvailability.js';
import { readImportedProjectsRegistry } from '../utils/importedProjectsRegistry.js';
import { readWorkspaceRegistrySummaryFromDisk } from './workspaceRegistrySummary.js';
import {
  resolveStudioInventoryScope,
  studioPathWithin,
  studioRegisteredProjectPath,
} from './studioInventoryScope.js';

export async function inspectStudioWorkspaceInventory(workspacePath: string) {
  const availability = await inspectStudioWorkspaceAvailability(workspacePath);
  if (availability.status !== 'available') {
    return {
      observedAt: new Date().toISOString(),
      workspace: { name: path.basename(workspacePath), path: workspacePath },
      availability,
      management: 'unknown' as const,
      projects: [],
      sources: [],
      completeness: 'unavailable',
      instruction: studioWorkspaceUnavailableMessage(availability),
    };
  }
  const scope = await resolveStudioInventoryScope(workspacePath);
  if (scope.resolution === 'unresolved') {
    return {
      observedAt: new Date().toISOString(),
      workspace: null,
      availability,
      scope,
      management: 'unknown' as const,
      projects: [],
      sources: [],
      completeness: 'unresolved-ownership',
      instruction: `${scope.error} Inspect workspai project workspace status --json or the canonical registry. No workspace was selected and no execution permissions changed. An unresolved binding is not an empty or unmanaged workspace.`,
    };
  }
  workspacePath = scope.workspacePath ?? scope.entryPath;
  const projects = new Map<string, { id: string; name: string; path: string; source: string }>();
  const sources: string[] = [];
  let name = path.basename(workspacePath);
  for (const relative of ['.workspai/workspace.json', '.rapidkit/workspace.json']) {
    const marker = await fs.readJSON(path.join(workspacePath, relative)).catch(() => undefined);
    if (typeof marker?.workspace_name === 'string') {
      name = marker.workspace_name;
      break;
    }
  }
  let authoritative = false;
  const add = (value: unknown, source: string) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    const item = value as Record<string, unknown>;
    const absolutePath = studioRegisteredProjectPath(workspacePath, item);
    if (!absolutePath) {
      return;
    }
    projects.set(absolutePath, {
      id: String(item.slug ?? item.id ?? item.name ?? path.basename(absolutePath)),
      name: String(item.name ?? item.slug ?? path.basename(absolutePath)),
      path: absolutePath,
      source,
    });
  };
  for (const relative of [
    '.workspai/workspace.contract.json',
    '.rapidkit/workspace.contract.json',
    'workspace.json',
  ]) {
    const record = await fs.readJSON(path.join(workspacePath, relative)).catch(() => undefined);
    if (!record || !Array.isArray(record.projects)) {
      continue;
    }
    name = record.workspace?.name ?? record.name ?? name;
    record.projects.forEach((project: unknown) => add(project, relative));
    sources.push(relative);
    authoritative = true;
    break;
  }
  if (!authoritative) {
    const summary = await readWorkspaceRegistrySummaryFromDisk(workspacePath);
    if (summary) {
      name = summary.workspaceName;
      summary.projects.forEach((project) => add(project, summary.registrySummaryPath));
      sources.push(summary.registrySummaryPath);
    }
  }
  if (!authoritative) {
    for (const project of await readImportedProjectsRegistry(workspacePath)) {
      add(project, 'imported-projects registry');
    }
  }
  const managed = Boolean(scope.workspacePath);
  const entryProject = [...projects.values()]
    .filter((project) => studioPathWithin(project.path, scope.entryPath))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return {
    observedAt: new Date().toISOString(),
    workspace: { name, path: workspacePath },
    availability,
    scope: {
      ...scope,
      kind: entryProject
        ? 'project'
        : managed
          ? scope.resolution === 'self'
            ? 'workspace'
            : 'workspace-directory'
          : 'unmanaged-directory',
      ...(entryProject ? { projectPath: entryProject.path, projectName: entryProject.name } : {}),
      executionScopeChanged: false,
    },
    management: managed ? ('workspai' as const) : ('unmanaged' as const),
    projectCount: projects.size,
    projects: [...projects.values()],
    sources,
    completeness: authoritative ? 'registered-projects' : 'available-registry-entries',
    instruction:
      'These are current registry entries read from disk, independent of cached health reports. Workspace ownership and project source location are distinct; adopted projects may be external. Observation does not switch the execution scope. For ordinary project edits stay in that project; use an exact-approved destination selection only when the task requires changing workspace scope. If no registry exists, discover relevant manifests instead of claiming there are no projects. ' +
      (managed
        ? 'This scope already has Workspai metadata; inspect its ownership before proposing adoption again.'
        : 'If useful for the requested work, offer Workspai adopt/import as a nonblocking suggestion with concrete benefits. Do not adopt without user acceptance or exact adoption-command approval, block the original task, or repeat a declined offer. Respect an explicit choice to work independently.'),
  };
}
