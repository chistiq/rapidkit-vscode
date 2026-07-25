import * as crypto from 'node:crypto';
import * as path from 'node:path';

import fs from 'fs-extra';

import type { FilePatch, MultiFilePatchResult } from './patchApplyEngine.js';

const DENIED_TRANSACTION_PATH =
  /(?:^|\/)(?:\.git|node_modules|vendor|dist|build|coverage|\.workspai\/(?:reports|cache|snapshots)|\.rapidkit\/reports|\.env(?:\.|$)|\.npmrc$|\.pypirc$|[^/]*(?:secret|credential)[^/]*)(?:\/|$)/i;

function normalizedWorkspacePath(workspacePath: string, requestedPath: string): string | undefined {
  const absolutePath = path.resolve(workspacePath, requestedPath);
  const relativePath = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
  return relativePath && !relativePath.startsWith('../') && !path.isAbsolute(relativePath)
    ? relativePath
    : undefined;
}

export async function authorizeStudioWorkspacePatchTargets(input: {
  workspacePath: string;
  patches: FilePatch[];
  inspectedSource: Map<string, string | null>;
}): Promise<FilePatch[]> {
  const unauthorized: FilePatch[] = [];
  for (const patch of input.patches) {
    if (input.inspectedSource.has(patch.relativePath)) {
      continue;
    }
    const relativePath = normalizedWorkspacePath(input.workspacePath, patch.relativePath);
    const absolutePath = relativePath ? path.resolve(input.workspacePath, relativePath) : '';
    if (
      relativePath &&
      patch.baseSha256 === null &&
      !DENIED_TRANSACTION_PATH.test(relativePath) &&
      !(await fs.pathExists(absolutePath))
    ) {
      input.inspectedSource.set(relativePath, null);
      patch.relativePath = relativePath;
      continue;
    }
    unauthorized.push(patch);
  }
  return unauthorized;
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
    if (!relativePath || DENIED_TRANSACTION_PATH.test(relativePath) || seen.has(relativePath)) {
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
