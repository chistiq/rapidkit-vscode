import crypto from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import fs from 'fs-extra';
import linkContract from '../../contracts/project-workspace-link.v1.json';

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

/** Metadata only: bounded regular files, never arbitrary source bodies or a symlink target. */
async function metadata(file: string): Promise<JsonRecord | undefined> {
  let handle;
  try {
    const before = await lstat(file);
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new Error('Workspace metadata must be a regular file, not a symbolic link.');
    }
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.dev !== before.dev ||
      stat.ino !== before.ino ||
      stat.size > 2 * 1024 * 1024
    ) {
      throw new Error('Workspace metadata is not a bounded regular file.');
    }
    return record(JSON.parse(await handle.readFile('utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function exactFields(
  value: JsonRecord,
  schema: { required: string[]; properties: object }
): boolean {
  return (
    schema.required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => Object.hasOwn(schema.properties, key))
  );
}

export function studioPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function studioRegisteredProjectPath(root: string, value: JsonRecord): string | undefined {
  const candidate =
    value.externalPath ?? value.path ?? value.relativePath ?? value.slug ?? value.name;
  return typeof candidate === 'string' && candidate.trim()
    ? path.resolve(root, candidate)
    : undefined;
}

async function canonical(input: string): Promise<string> {
  const value = await realpath(input);
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

async function workspaceExists(root: string): Promise<boolean> {
  for (const file of [
    '.workspai/workspace.json',
    '.rapidkit/workspace.json',
    '.workspai/workspace.contract.json',
    '.rapidkit/workspace.contract.json',
  ]) {
    if (await metadata(path.join(root, file))) {
      return true;
    }
  }
  return false;
}

export type StudioInventoryScope = {
  entryPath: string;
  resolution: 'self' | 'parent' | 'local-link' | 'unmanaged' | 'unresolved';
  workspacePath?: string;
  projectPath?: string;
  error?: string;
};

/** Observe ownership, without selecting a new execution target or changing permissions.
 * Reverse-registry recovery remains CLI-owned; never guess among registrations.
 */
export async function resolveStudioInventoryScope(entry: string): Promise<StudioInventoryScope> {
  const entryPath = await realpath(entry);
  let current = entryPath;
  let projectPath: string | undefined;
  let linkPath: string | undefined;
  try {
    while (current.length > 0) {
      if (await workspaceExists(current)) {
        return {
          entryPath,
          workspacePath: current,
          projectPath,
          resolution: current === entryPath ? 'self' : 'parent',
        };
      }
      for (const directory of ['.workspai', '.rapidkit']) {
        const candidate = path.join(current, directory, 'workspace-link.local.json');
        if (!linkPath && (await fs.pathExists(candidate))) {
          linkPath = candidate;
          projectPath ??= current;
        }
        if (!projectPath && (await fs.pathExists(path.join(current, directory, 'project.json')))) {
          projectPath = current;
        }
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    if (linkPath && projectPath) {
      const link = await metadata(linkPath);
      const workspace = record(link?.workspace);
      const project = record(link?.project);
      const integrity = record(link?.integrity);
      if (
        !exactFields(record(link), linkContract) ||
        !exactFields(workspace, linkContract.properties.workspace) ||
        !exactFields(project, linkContract.properties.project) ||
        !exactFields(integrity, linkContract.properties.integrity) ||
        typeof link?.generatedAt !== 'string' ||
        !Number.isFinite(Date.parse(link.generatedAt))
      ) {
        throw new Error('Project workspace link does not match the versioned CLI fields.');
      }
      if (
        link?.schemaVersion !== linkContract.properties.schemaVersion.const ||
        link.kind !== linkContract.properties.kind.const ||
        link.state !== 'active' ||
        typeof workspace.name !== 'string' ||
        !workspace.name ||
        typeof workspace.root !== 'string' ||
        !path.isAbsolute(workspace.root) ||
        !['.workspai-workspace', '.workspai/workspace.json'].includes(String(workspace.marker)) ||
        workspace.contract !== '.workspai/workspace.contract.json' ||
        typeof project.name !== 'string' ||
        !project.name ||
        typeof project.relativePath !== 'string' ||
        !project.relativePath ||
        path.isAbsolute(project.relativePath) ||
        project.relativePath.split(/[\\/]/).includes('..') ||
        !['managed', 'adopted', 'imported', 'linked', 'restored'].includes(
          String(project.relationship)
        ) ||
        integrity.algorithm !== 'sha256'
      ) {
        throw new Error(
          'Malformed project workspace link; inspect canonical CLI ownership before choosing a destination.'
        );
      }
      const workspacePath = await canonical(workspace.root);
      const expected = crypto
        .createHash('sha256')
        .update(
          [
            workspace.name,
            workspacePath,
            project.name,
            await canonical(projectPath),
            project.relativePath.replace(/\\/g, '/'),
            project.relationship,
          ].join('\0')
        )
        .digest('hex');
      const contract = await metadata(
        path.join(workspacePath, '.workspai/workspace.contract.json')
      );
      const projects = Array.isArray(contract?.projects) ? contract.projects : [];
      let member = false;
      for (const candidate of projects) {
        const candidatePath = studioRegisteredProjectPath(workspacePath, record(candidate));
        if (
          candidatePath &&
          (await canonical(candidatePath).catch(() => undefined)) === (await canonical(projectPath))
        ) {
          member = true;
          break;
        }
      }
      if (
        integrity.binding !== expected ||
        !member ||
        !(await workspaceExists(workspacePath)) ||
        !(await fs.pathExists(path.join(workspacePath, String(workspace.marker))))
      ) {
        throw new Error('Stale project workspace link or missing canonical contract membership.');
      }
      return { entryPath, resolution: 'local-link', workspacePath, projectPath };
    }
    if (projectPath) {
      throw new Error(
        'Workspai project has no resolved workspace binding. Use project workspace status; do not adopt it again or guess a workspace.'
      );
    }
    return { entryPath, resolution: 'unmanaged' };
  } catch (error) {
    return {
      entryPath,
      projectPath,
      resolution: 'unresolved',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
