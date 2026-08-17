import * as crypto from 'node:crypto';
import * as path from 'node:path';

import fs from 'fs-extra';

import type { FilePatch, MultiFilePatchResult } from './patchApplyEngine.js';
import { studioSourcePathDenialReason } from './studioWorkspacePathPolicy.js';

const STUDIO_EXACT_EDIT_MAX_FILE_BYTES = 16 * 1024 * 1024;

function normalizedWorkspacePath(workspacePath: string, requestedPath: string): string | undefined {
  const absolutePath = path.resolve(workspacePath, requestedPath);
  const relativePath = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
  return relativePath && !relativePath.startsWith('../') && !path.isAbsolute(relativePath)
    ? relativePath
    : undefined;
}

function isInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return (
    relativePath === '' ||
    (!!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function normalizedAuthorizedPatchPath(input: {
  workspacePath: string;
  projectPath?: string;
  requestedPath: string;
}): string | undefined {
  const workspacePath = path.resolve(input.workspacePath);
  const absolutePath = path.resolve(workspacePath, input.requestedPath);
  const authorized =
    isInside(workspacePath, absolutePath) ||
    Boolean(input.projectPath && isInside(path.resolve(input.projectPath), absolutePath));
  if (!authorized) {
    return undefined;
  }
  return path.relative(workspacePath, absolutePath).replace(/\\/g, '/') || undefined;
}

export async function authorizeStudioWorkspacePatchTargets(input: {
  workspacePath: string;
  projectPath?: string;
  patches: FilePatch[];
  inspectedSource: Map<string, string | null>;
}): Promise<FilePatch[]> {
  const unauthorized: FilePatch[] = [];
  for (const patch of input.patches) {
    const relativePath = normalizedAuthorizedPatchPath({
      workspacePath: input.workspacePath,
      projectPath: input.projectPath,
      requestedPath: patch.relativePath,
    });
    if (!relativePath || studioSourcePathDenialReason(relativePath)) {
      unauthorized.push(patch);
      continue;
    }
    patch.relativePath = relativePath;
    if (input.inspectedSource.has(relativePath)) {
      continue;
    }
    const absolutePath = relativePath ? path.resolve(input.workspacePath, relativePath) : '';
    if (relativePath && patch.baseSha256 === null && !(await fs.pathExists(absolutePath))) {
      input.inspectedSource.set(relativePath, null);
      patch.relativePath = relativePath;
      continue;
    }
    unauthorized.push(patch);
  }
  return unauthorized;
}

/**
 * Compile bounded exact-text edits into the same complete-file patch contract
 * used by the CLI Repair Engine. The full file never enters the model context;
 * the host reconstructs it after proving the target is the inspected regular
 * file and that its content hash is still current.
 */
export async function compileInspectedStudioTextEdits(input: {
  workspacePath: string;
  projectPath?: string;
  edits: Array<{ relativePath: string; oldText: string; newText: string }>;
  inspectedSource: Map<string, string | null>;
}): Promise<FilePatch[]> {
  const workspacePath = path.resolve(input.workspacePath);
  const sourceRoot = path.resolve(input.projectPath ?? input.workspacePath);
  const grouped = new Map<string, Array<{ oldText: string; newText: string }>>();

  for (const edit of input.edits) {
    const requestedPath = edit.relativePath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const absolutePath = path.resolve(sourceRoot, requestedPath);
    const relativePath = path.relative(sourceRoot, absolutePath).replace(/\\/g, '/');
    const workspaceRelative = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
    const inspectedSha =
      input.inspectedSource.get(relativePath) ?? input.inspectedSource.get(workspaceRelative);
    if (
      !requestedPath ||
      !relativePath ||
      !isInside(sourceRoot, absolutePath) ||
      studioSourcePathDenialReason(relativePath) ||
      typeof inspectedSha !== 'string'
    ) {
      throw new Error(`Exact edit target is not authorized: ${requestedPath || edit.relativePath}`);
    }
    grouped.set(relativePath, [
      ...(grouped.get(relativePath) ?? []),
      { oldText: edit.oldText, newText: edit.newText },
    ]);
  }

  const patches: FilePatch[] = [];
  for (const [relativePath, edits] of grouped) {
    const absolutePath = path.resolve(sourceRoot, relativePath);
    const stat = await fs.lstat(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Exact edit target is not a regular source file: ${relativePath}`);
    }
    if (stat.size > STUDIO_EXACT_EDIT_MAX_FILE_BYTES) {
      throw new Error(`Exact edit target exceeds the 16 MiB safety boundary: ${relativePath}`);
    }
    const original = await fs.readFile(absolutePath);
    if (original.includes(0)) {
      throw new Error(`Exact edit target is not UTF-8 text: ${relativePath}`);
    }
    const inspectedSha =
      input.inspectedSource.get(relativePath) ??
      input.inspectedSource.get(path.relative(workspacePath, absolutePath).replace(/\\/g, '/'));
    const currentSha = crypto.createHash('sha256').update(original).digest('hex');
    if (currentSha !== inspectedSha) {
      throw new Error(`Source changed after inspection: ${relativePath}`);
    }

    let content = original.toString('utf8');
    for (const edit of edits) {
      const first = content.indexOf(edit.oldText);
      const second = first >= 0 ? content.indexOf(edit.oldText, first + edit.oldText.length) : -1;
      if (first < 0 || second >= 0) {
        throw new Error(
          first < 0
            ? `Exact edit context is stale in ${relativePath}; inspect the relevant lines again.`
            : `Exact edit context is ambiguous in ${relativePath}; provide a larger unique oldText block.`
        );
      }
      content = `${content.slice(0, first)}${edit.newText}${content.slice(first + edit.oldText.length)}`;
    }
    patches.push({
      relativePath,
      operation: 'write',
      isNewFile: false,
      baseSha256: currentSha,
      patchedContent: content,
      hunks: [],
      status: 'pending',
    });
  }
  return patches;
}

export async function deleteInspectedStudioWorkspaceFiles(input: {
  workspacePath: string;
  paths: string[];
  inspectedSource: Map<string, string | null>;
  actionId: string;
}): Promise<MultiFilePatchResult> {
  const patches: FilePatch[] = [];
  const seen = new Set<string>();
  for (const requestedPath of input.paths) {
    const relativePath = normalizedWorkspacePath(input.workspacePath, requestedPath);
    if (!relativePath || studioSourcePathDenialReason(relativePath) || seen.has(relativePath)) {
      throw new Error(`Studio Agent delete target is not authorized: ${requestedPath}`);
    }
    const expectedSha = input.inspectedSource.get(relativePath);
    if (!expectedSha) {
      throw new Error(`Inspect the exact file before deleting it: ${relativePath}`);
    }
    const absolutePath = path.resolve(input.workspacePath, relativePath);
    const stat = await fs.lstat(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Studio Agent delete target is not a regular file: ${relativePath}`);
    }
    const originalContent = await fs.readFile(absolutePath, 'utf8');
    const currentSha = crypto.createHash('sha256').update(originalContent).digest('hex');
    if (currentSha !== expectedSha) {
      throw new Error(`Source changed after inspection: ${relativePath}`);
    }
    seen.add(relativePath);
    patches.push({
      relativePath,
      operation: 'delete',
      baseSha256: expectedSha,
      isNewFile: false,
      originalContent,
      patchedContent: '',
      hunks: [{ startLine: 1, removedLines: originalContent.split('\n'), addedLines: [] }],
      status: 'pending',
    });
  }

  const deleted: FilePatch[] = [];
  try {
    for (const patch of patches) {
      await fs.remove(path.join(input.workspacePath, patch.relativePath));
      patch.status = 'applied';
      deleted.push(patch);
    }
  } catch (error) {
    for (const patch of [...deleted].reverse()) {
      await fs.outputFile(
        path.join(input.workspacePath, patch.relativePath),
        patch.originalContent ?? '',
        'utf8'
      );
      patch.status = 'failed';
      patch.failReason = 'Delete transaction rolled back after a later delete failed.';
    }
    throw error;
  }

  return {
    patchId: input.actionId,
    generatedAt: new Date().toISOString(),
    actionId: input.actionId,
    patches,
    appliedCount: patches.length,
    rejectedCount: 0,
    failedCount: 0,
  };
}
