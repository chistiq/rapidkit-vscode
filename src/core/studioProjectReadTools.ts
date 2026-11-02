import path from 'node:path';
import { constants } from 'node:fs';
import fs from 'fs-extra';
import {
  resolveStudioReadProject,
  requireStudioReadNotCancelled,
  type StudioReadScope,
} from './studioReadProject.js';
import type { StudioAgentToolDefinition } from './studioAgentToolRegistry.js';

const textExtension = /\.(?:json|md|mdx|txt|rst|html)$/i;
function packageDocPath(value: string): boolean {
  return textExtension.test(value) && /^(?:docs\/|dist\/docs\/|README(?:\.|$))/i.test(value);
}
const evidencePath =
  /^\.(?:workspai|rapidkit)\/(?:(?:reports|goals)\/(?!.*(?:^|\/)(?:cache|snapshots|secrets?|credentials?)(?:\/|\.))[^\0]+\.(?:json|md|txt)|(?:agent-entry\.v1|workspace(?:\.contract)?|project|registry|workspace-registry\.v1)\.json)$/i;
function isEvidencePath(value: string): boolean {
  return (
    evidencePath.test(value) &&
    !/(?:^|\/)(?:cache|snapshots|[^/]*(?:secret|credential)[^/]*)(?:\/|$)/i.test(value)
  );
}
function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}
function relative(value: string): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2000 ||
    /[\0\r\n]/.test(value) ||
    path.isAbsolute(value) ||
    value.replace(/\\/g, '/').split('/').includes('..')
  ) {
    throw new Error('A bounded relative document path is required.');
  }
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}
function offset(value: unknown): number {
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid document offset.');
  }
  return value;
}
async function readText(
  root: string,
  locator: string,
  start: number,
  signal?: AbortSignal,
  permitted?: (value: string) => boolean
) {
  requireStudioReadNotCancelled(signal);
  const canonicalRoot = await fs.realpath(root);
  const canonicalFile = await fs.realpath(path.join(root, locator));
  if (!within(canonicalRoot, canonicalFile)) {
    throw new Error('Document resolves outside its authorized root.');
  }
  if (permitted && !permitted(path.relative(canonicalRoot, canonicalFile).replace(/\\/g, '/'))) {
    throw new Error('Document resolves outside the permitted document paths.');
  }
  const handle = await fs.open(
    canonicalFile,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const stat = await fs.fstat(handle);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) {
      throw new Error('Document must be a regular text file no larger than 2 MiB.');
    }
    if (start > stat.size) {
      throw new Error('Document offset exceeds its size.');
    }
    // Keep a complete page below the model observation's per-string bound.
    const buffer = Buffer.alloc(Math.min(4000, stat.size - start));
    const { bytesRead } = await fs.read(handle, buffer, 0, buffer.length, start);
    const bytes = buffer.subarray(0, bytesRead);
    if (bytes.includes(0)) {
      throw new Error('Document is not text.');
    }
    if (bytes.some((byte) => byte < 32 && ![9, 10, 13].includes(byte))) {
      throw new Error('Document contains unsupported text control characters.');
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
      stream: start + bytesRead < stat.size,
    });
    requireStudioReadNotCancelled(signal);
    const next = start + Buffer.byteLength(content, 'utf8');
    return {
      content,
      offset: start,
      nextOffset: next < stat.size ? next : null,
      truncated: next < stat.size,
    };
  } finally {
    await fs.close(handle);
  }
}

/** Current scope, not an allowlist captured before a workspace was created or selected. */
export async function readStudioWorkspaiEvidence(
  request: StudioReadScope & { paths?: string[]; offset?: number }
) {
  const selected = await resolveStudioReadProject(request);
  const workspace = selected.inventory.workspace;
  if (!workspace || selected.inventory.management !== 'workspai') {
    throw new Error(
      'No canonical Workspai workspace is resolved. Continue with applicable source or other tools.'
    );
  }
  const workspaceRoot = workspace.path;
  const projectRoot = selected.projectPath;
  const resolve = (raw: string) => {
    if (typeof raw !== 'string') {
      throw new Error('Evidence locators must be strings.');
    }
    if (raw.startsWith('project:')) {
      if (!projectRoot) {
        throw new Error('Supply project from inspect-workspace before using project: evidence.');
      }
      return { root: projectRoot, locator: relative(raw.slice(8)) };
    }
    const locator = relative(raw.replace(/^workspace:/, ''));
    if (isEvidencePath(locator)) {
      return { root: workspaceRoot, locator };
    }
    const member = selected.inventory.projects.find((entry) => {
      const prefix = path.relative(workspaceRoot, entry.path).replace(/\\/g, '/');
      return prefix && !prefix.startsWith('../') && locator.startsWith(`${prefix}/`);
    });
    if (member && (!projectRoot || path.resolve(member.path) === path.resolve(projectRoot))) {
      return {
        root: member.path,
        locator: locator.slice(
          path.relative(workspaceRoot, member.path).replace(/\\/g, '/').length + 1
        ),
      };
    }
    throw new Error('Evidence locator is outside the selected workspace/project membership.');
  };
  if (request.paths) {
    if (!Array.isArray(request.paths) || !request.paths.length || request.paths.length > 16) {
      throw new Error('Read 1 to 16 evidence documents at a time.');
    }
    const observations = [];
    const omittedPaths: string[] = [];
    let returnedChars = 0;
    for (const raw of request.paths) {
      const target = resolve(raw);
      if (!isEvidencePath(target.locator)) {
        throw new Error(
          'Only published Workspai evidence documents are readable here; private state and dependency files are excluded.'
        );
      }
      let document;
      try {
        document = {
          exists: true,
          ...(await readText(
            target.root,
            target.locator,
            offset(request.offset),
            request.signal,
            isEvidencePath
          )),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        document = {
          exists: false,
          content: '',
          offset: offset(request.offset),
          nextOffset: null,
          truncated: false,
        };
      }
      const observation = {
        path: raw,
        authority: 'workspai-evidence',
        ...document,
      };
      const size = JSON.stringify(observation).length;
      if (returnedChars + size > 9000) {
        omittedPaths.push(raw);
      } else {
        observations.push(observation);
        returnedChars += size;
      }
    }
    return {
      observations,
      omittedPaths,
      instruction:
        'Evidence is read-only, not source-edit authorization. Follow nextOffset for remaining bytes of a document and read omittedPaths separately. Preserve freshness and coverage limits; retrieval is not completed verification.',
    };
  }
  const roots = [
    { root: workspaceRoot, prefix: '' },
    ...(projectRoot ? [{ root: projectRoot, prefix: 'project:' }] : []),
  ];
  const documents: string[] = [];
  let visited = 0;
  for (const entry of roots) {
    const queue = ['.workspai', '.rapidkit'];
    while (queue.length && visited < 512 && documents.length < 128) {
      requireStudioReadNotCancelled(request.signal);
      const directory = queue.shift()!;
      const stat = await fs.lstat(path.join(entry.root, directory)).catch(() => undefined);
      if (!stat?.isDirectory() || stat.isSymbolicLink()) {
        continue;
      }
      for (const item of await fs.readdir(path.join(entry.root, directory), {
        withFileTypes: true,
      })) {
        visited += 1;
        const locator = `${directory}/${item.name}`;
        if (
          item.isDirectory() &&
          locator.split('/').length < 7 &&
          /^(?:\.workspai|\.rapidkit)\/(?:reports|goals)(?:\/|$)/.test(locator) &&
          !/(?:cache|snapshots|secret|credential)/i.test(locator)
        ) {
          queue.push(locator);
        }
        if (item.isFile() && isEvidencePath(locator)) {
          documents.push(`${entry.prefix}${locator}`);
        }
        if (visited >= 512 || documents.length >= 128) {
          break;
        }
      }
    }
  }
  return {
    documents,
    truncated: visited >= 512 || documents.length >= 128,
    projects: selected.inventory.projects.map((entry) => ({ id: entry.id, name: entry.name })),
    instruction:
      'Read an exact returned locator with paths. Supply project=<registered id> to list/read that project, including externally adopted sources. No setup or full intelligence chain is required for unrelated work.',
  };
}

/** Dependency documentation never grants mutation authority for dependency-owned files. */
export const studioProjectDocsTool: StudioAgentToolDefinition = {
  name: 'inspect-project-docs',
  title: 'Read installed dependency documentation',
  activity: 'inspect',
  risk: 'read',
  description:
    'Read installed Node package docs without treating dependencies as editable source. Choose project by registered identity in workspace chats. Omit path to discover docs; use path and offset to read. Missing installation returns a prerequisite and alternatives, not a task stop. Other runtimes can use source, host, terminal or vendor documentation tools.',
  inputSchema: {
    type: 'object',
    required: ['package'],
    additionalProperties: false,
    properties: {
      project: { type: 'string', maxLength: 2000 },
      package: { type: 'string', maxLength: 200 },
      path: { type: 'string', maxLength: 2000 },
      offset: { type: 'integer', minimum: 0 },
    },
  },
  async execute(raw, context) {
    const value = raw as { project?: string; package: string; path?: string; offset?: number };
    if (
      !value ||
      typeof value.package !== 'string' ||
      !/^(?:@[a-z0-9_.-]+\/)?[a-z0-9][a-z0-9_.-]*$/i.test(value.package)
    ) {
      throw new Error('Invalid package identity.');
    }
    const selected = await resolveStudioReadProject({ ...context, project: value.project });
    if (!selected.projectPath) {
      throw new Error(
        'Supply project with an exact registered identity, or select a project entry.'
      );
    }
    const root = selected.projectPath;
    const workspace = selected.inventory.workspace?.path ?? root;
    let directory = root;
    let packageRoot: string | undefined;
    while (within(workspace, directory) || directory === root) {
      const candidate = path.join(directory, 'node_modules', value.package);
      const canonical = await fs.realpath(candidate).catch(() => undefined);
      if (
        canonical &&
        (within(await fs.realpath(root), canonical) ||
          within(await fs.realpath(workspace), canonical))
      ) {
        packageRoot = canonical;
        break;
      }
      const parent = path.dirname(directory);
      if (parent === directory || !within(workspace, parent)) {
        break;
      }
      directory = parent;
    }
    if (!packageRoot) {
      return {
        ok: true,
        output: {
          available: false,
          reason: 'dependency-not-installed',
          package: value.package,
          nextActions: [
            'Inspect the project manifest and lockfile; choose the matching package manager and install dependencies with applicable approval when needed.',
            'Use the matching official vendor docs or other applicable tools. Do not repeatedly search a missing node_modules directory.',
          ],
          instruction:
            'Missing local docs are not proof of unsupported framework or a reason to abandon the task. Never use npm ci unless a compatible lockfile exists.',
        },
      };
    }
    if (value.path !== undefined) {
      const locator = relative(value.path);
      if (!packageDocPath(locator)) {
        throw new Error('Only package documentation paths are allowed.');
      }
      return {
        ok: true,
        output: {
          available: true,
          package: value.package,
          path: locator,
          ...(await readText(
            packageRoot,
            locator,
            offset(value.offset),
            context.signal,
            packageDocPath
          )),
          instruction: 'Read-only vendor documentation, not workspace proof or edit authorization.',
        },
      };
    }
    const documents: string[] = [];
    const queue = ['docs', 'dist/docs'];
    let visited = 0;
    while (queue.length && visited < 512 && documents.length < 80) {
      requireStudioReadNotCancelled(context.signal);
      const dir = queue.shift()!;
      const stat = await fs.lstat(path.join(packageRoot, dir)).catch(() => undefined);
      if (!stat?.isDirectory() || stat.isSymbolicLink()) {
        continue;
      }
      for (const item of await fs.readdir(path.join(packageRoot, dir), { withFileTypes: true })) {
        visited += 1;
        const locator = `${dir}/${item.name}`;
        if (item.isDirectory() && locator.split('/').length < 12) {
          queue.push(locator);
        }
        if (item.isFile() && textExtension.test(locator)) {
          documents.push(locator);
        }
        if (visited >= 512 || documents.length >= 80) {
          break;
        }
      }
    }
    return {
      ok: true,
      output: {
        available: true,
        package: value.package,
        documents,
        truncated: visited >= 512 || documents.length >= 80,
        instruction:
          'Read a relevant exact path. If this package ships no applicable docs, use its official version-matched documentation or another tool.',
      },
    };
  },
};
