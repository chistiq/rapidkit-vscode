/**
 * patchApplyEngine.ts
 *
 * A02 / A03 shared infrastructure: parse AI-generated patch suggestions from
 * Markdown text, write accepted patches to the workspace (optionally on a
 * feature branch), then run the verification chain.
 *
 * Design goals:
 *  - Pure, injectable deps so every function is unit-testable without touching
 *    the real FS or Git.
 *  - All file writes go through `deps.writeFile`; callers inject `fs.writeFile`
 *    in production and a fake in tests.
 *  - Branch creation is optional; the engine degrades gracefully when the
 *    workspace is not a Git repo.
 */

import * as crypto from 'node:crypto';
import * as path from 'path';
import { WorkspaceUsageTracker } from '../utils/workspaceUsageTracker';
import { run, type ExecaResult } from '../utils/exec';

// ─── Types re-exported from payload for host-side use ─────────────────────────

export type FilePatchStatus = 'pending' | 'accepted' | 'rejected' | 'applied' | 'failed';

export type FilePatchHunk = {
  startLine: number;
  removedLines: string[];
  addedLines: string[];
};

export type FilePatch = {
  relativePath: string;
  /** Explicit delete transactions are created only by the inspected-file host. */
  operation?: 'write' | 'delete';
  /** Hash of the exact source supplied to the model; null means absent. */
  baseSha256?: string | null;
  language?: string;
  isNewFile: boolean;
  originalContent?: string;
  patchedContent: string;
  hunks: FilePatchHunk[];
  status: FilePatchStatus;
  failReason?: string;
};

export type MultiFilePatchResult = {
  patchId: string;
  generatedAt: string;
  actionId: string;
  branchCreated?: string;
  patches: FilePatch[];
  verificationPassed?: boolean;
  verificationNote?: string;
  appliedCount: number;
  rejectedCount: number;
  failedCount: number;
};

export type PatchRollbackResult = {
  ok: boolean;
  restoredPaths: string[];
  failedPaths: Array<{ path: string; reason: string }>;
};

// ─── Extraction ───────────────────────────────────────────────────────────────

/**
 * Markdown fenced-block pattern with an optional `// path: <rel-path>` hint
 * on the first line of the block, or a ` ```<lang>:<path>` fence header.
 *
 * Supported formats:
 *   ` ```typescript path: src/foo.ts `
 *   ` ```typescript `
 *   First line inside block: `// path: src/foo.ts`  (or `# path: …`)
 */
const FENCE_RE = /^```(\w*)(?: path:[ \t]*(\S+))?\s*\n([\s\S]*?)^```/gm;
const INLINE_PATH_RE = /^(?:\/\/|#)\s*path:\s*(\S+)/;

export type PatchExtractOptions = {
  actionId: string;
  workspacePath: string;
};

/**
 * Parse all fenced code blocks from an AI response text.
 * Returns one `FilePatch` per distinct file path found.
 * If the same file appears multiple times, the last block wins.
 */
export function extractPatchesFromAiResponse(
  responseText: string,
  opts: PatchExtractOptions
): FilePatch[] {
  const byPath = new Map<string, FilePatch>();

  let match: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;

  while ((match = FENCE_RE.exec(responseText)) !== null) {
    const lang = (match[1] ?? '').trim();
    let relPath = match[2] ? match[2].trim() : '';
    const rawBody = match[3] ?? '';

    // Try extracting path from the first line of the body
    const firstLine = rawBody.split('\n')[0] ?? '';
    const inlineMatch = INLINE_PATH_RE.exec(firstLine);
    if (!relPath && inlineMatch) {
      relPath = inlineMatch[1].trim();
    }

    if (!relPath) {
      // Skip blocks without a discernible file path
      continue;
    }

    // Security: prevent path traversal outside workspace
    const resolved = path.resolve(opts.workspacePath, relPath);
    if (!isChildPathOf(opts.workspacePath, resolved)) {
      continue;
    }

    const patchedContent = inlineMatch
      ? rawBody.slice(firstLine.length + 1) // strip the `// path:` line
      : rawBody;

    const patch: FilePatch = {
      relativePath: relPath,
      language: lang || undefined,
      isNewFile: false, // determined later when reading existing file
      patchedContent,
      hunks: buildHunks(patchedContent),
      status: 'pending',
    };

    byPath.set(relPath, patch);
  }

  return Array.from(byPath.values());
}

function isChildPathOf(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return (
    relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

export function normalizePatchesForWorkspaceScope(input: {
  workspacePath: string;
  projectPath?: string;
  patches: FilePatch[];
}): FilePatch[] {
  const workspacePath = path.resolve(input.workspacePath);
  const projectPath = input.projectPath?.trim() ? path.resolve(input.projectPath) : undefined;
  const projectIsInsideWorkspace = Boolean(
    projectPath && isChildPathOf(workspacePath, projectPath)
  );

  const normalizedByPath = new Map<string, FilePatch>();

  for (const patch of input.patches) {
    const rawRelativePath = patch.relativePath.trim();
    const absoluteFromWorkspace = path.isAbsolute(rawRelativePath)
      ? path.resolve(rawRelativePath)
      : path.resolve(workspacePath, rawRelativePath);

    if (
      projectPath &&
      (!projectIsInsideWorkspace || !isChildPathOf(projectPath, absoluteFromWorkspace))
    ) {
      const absoluteFromProject = path.isAbsolute(rawRelativePath)
        ? absoluteFromWorkspace
        : path.resolve(projectPath, rawRelativePath);
      if (isChildPathOf(projectPath, absoluteFromProject)) {
        const normalizedPatch = {
          ...patch,
          relativePath: path.relative(workspacePath, absoluteFromProject),
        };
        normalizedByPath.set(normalizedPatch.relativePath, normalizedPatch);
        continue;
      }
    }

    if (isChildPathOf(workspacePath, absoluteFromWorkspace)) {
      const normalizedPatch = {
        ...patch,
        relativePath: path.relative(workspacePath, absoluteFromWorkspace),
      };
      normalizedByPath.set(normalizedPatch.relativePath, normalizedPatch);
      continue;
    }

    normalizedByPath.set(patch.relativePath, patch);
  }

  return Array.from(normalizedByPath.values());
}

/**
 * Build a simplified hunk array from the patched content.
 * We don't parse unified diff format; instead we produce a single hunk
 * that represents the full replacement of each file (sufficient for the
 * UI review card which shows before/after, not line-level diff).
 */
function buildHunks(patchedContent: string): FilePatchHunk[] {
  return [
    {
      startLine: 1,
      removedLines: [], // populated at apply time when we read the original
      addedLines: patchedContent.split('\n'),
    },
  ];
}

// ─── Apply ────────────────────────────────────────────────────────────────────

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; reject: false }
) => Promise<ExecaResult>;

export interface PatchApplyDeps {
  readFile?: (absPath: string) => Promise<string | null>;
  writeFile?: (absPath: string, content: string) => Promise<void>;
  deleteFile?: (absPath: string) => Promise<void>;
  commandRunner?: CommandRunner;
  telemetry?: {
    trackCommandEvent: (
      command: string,
      workspacePath?: string,
      properties?: Record<string, unknown>
    ) => Promise<void>;
  };
  now?: () => Date;
  patchId?: () => string;
}

function defaultRunner(
  command: string,
  args: string[],
  opts: { cwd: string; timeout: number; reject: false }
): Promise<ExecaResult> {
  return run(command, args, {
    cwd: opts.cwd,
    timeout: opts.timeout,
    reject: opts.reject,
  } as Parameters<typeof run>[2]);
}

async function defaultReadFile(absPath: string): Promise<string | null> {
  try {
    const fs = await import('fs-extra');
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

async function defaultWriteFile(absPath: string, content: string): Promise<void> {
  const fs = await import('fs-extra');
  await fs.ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, content, 'utf8');
}

async function defaultDeleteFile(absPath: string): Promise<void> {
  const fs = await import('fs-extra');
  await fs.remove(absPath);
}

async function hasSymlinkPathComponent(
  workspacePath: string,
  targetPath: string
): Promise<boolean> {
  const fs = await import('node:fs/promises');
  const workspaceRoot = path.resolve(workspacePath);
  const relative = path.relative(workspaceRoot, targetPath);
  let cursor = workspaceRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if ((await fs.lstat(cursor)).isSymbolicLink()) {
        return true;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
  return false;
}

function contentSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface PatchApplyInput {
  actionId: string;
  workspacePath: string;
  patches: FilePatch[];
  /** If true, create a `workspai/apply-<actionId>` branch before writing files */
  branchSafeApply?: boolean;
  /** Only apply patches whose status is 'accepted'; skip all others */
  acceptedPaths?: string[];
  verificationNote?: string;
  verificationPassed?: boolean;
  /**
   * Source hashes captured before AI generation. A null value means the file
   * was absent. Writes are rejected if the source changed while the model was
   * reasoning, preventing stale full-file replacements.
   */
  expectedBaseSha256?: Record<string, string | null>;
}

/** Prepare immutable before/after data for review without writing any file. */
export async function preparePatchesForReview(
  input: Pick<PatchApplyInput, 'workspacePath' | 'patches' | 'expectedBaseSha256'>,
  deps: Pick<PatchApplyDeps, 'readFile'> = {}
): Promise<FilePatch[]> {
  const readFile = deps.readFile ?? defaultReadFile;
  const expectedHashes = new Map(
    Object.entries(input.expectedBaseSha256 ?? {}).map(
      ([relativePath, hash]) => [path.normalize(relativePath), hash] as const
    )
  );
  return Promise.all(
    input.patches.map(async (patch) => {
      const absolutePath = path.resolve(input.workspacePath, patch.relativePath);
      if (!isChildPathOf(input.workspacePath, absolutePath)) {
        return { ...patch, status: 'failed' as const, failReason: 'Outside workspace boundary.' };
      }
      const originalContent = await readFile(absolutePath);
      const expectedHash =
        patch.baseSha256 ?? expectedHashes.get(path.normalize(patch.relativePath));
      if (
        (patch.baseSha256 !== undefined ||
          expectedHashes.has(path.normalize(patch.relativePath))) &&
        (originalContent === null ? null : contentSha256(originalContent)) !== expectedHash
      ) {
        return {
          ...patch,
          status: 'failed' as const,
          failReason: 'Source changed after AI grounding.',
        };
      }
      return {
        ...patch,
        isNewFile: originalContent === null,
        originalContent: originalContent ?? undefined,
        hunks: [
          {
            startLine: 1,
            removedLines: originalContent?.split('\n') ?? [],
            addedLines: patch.patchedContent.split('\n'),
          },
        ],
        status: patch.status === 'failed' ? patch.status : ('pending' as const),
      };
    })
  );
}

/**
 * Apply accepted patches to the workspace.
 *
 * Steps:
 *  1. (Optional) create a feature branch via `git checkout -b`
 *  2. Read original file contents (to populate hunk.removedLines and isNewFile)
 *  3. Write each accepted patch to disk
 *  4. Track telemetry
 *  5. Return a `MultiFilePatchResult`
 */
export async function applyPatches(
  input: PatchApplyInput,
  deps: PatchApplyDeps = {}
): Promise<MultiFilePatchResult> {
  const runner = deps.commandRunner ?? defaultRunner;
  const readFile = deps.readFile ?? defaultReadFile;
  const writeFile = deps.writeFile ?? defaultWriteFile;
  const deleteFile =
    deps.deleteFile ?? (deps.writeFile ? async () => undefined : defaultDeleteFile);
  const telemetry = deps.telemetry ?? WorkspaceUsageTracker.getInstance();
  const now = deps.now ?? (() => new Date());
  const patchIdGen = deps.patchId ?? (() => `patch-${input.actionId}-${Date.now().toString(36)}`);

  const patchId = patchIdGen();
  const generatedAt = now().toISOString();

  let branchCreated: string | undefined;

  // Step 1: Branch-safe apply
  if (input.branchSafeApply) {
    const branchName = `workspai/apply-${input.actionId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
    const result = await runner('git', ['checkout', '-b', branchName], {
      cwd: input.workspacePath,
      timeout: 8000,
      reject: false,
    });
    if (result.exitCode === 0) {
      branchCreated = branchName;
    } else {
      const failedPatches = input.patches.map((patch) => ({
        ...patch,
        status: 'failed' as const,
        failReason: `Required Git branch isolation failed: ${result.stderr || 'unknown Git error'}`,
      }));
      return {
        patchId,
        generatedAt,
        actionId: input.actionId,
        patches: failedPatches,
        appliedCount: 0,
        rejectedCount: 0,
        failedCount: failedPatches.length,
      };
    }
  }

  const acceptedSet = input.acceptedPaths ? new Set(input.acceptedPaths) : null;
  const expectedHashes = new Map([
    ...input.patches
      .filter((patch) => patch.baseSha256 !== undefined)
      .map((patch) => [path.normalize(patch.relativePath), patch.baseSha256 ?? null] as const),
    ...Object.entries(input.expectedBaseSha256 ?? {}).map(
      ([relativePath, hash]) => [path.normalize(relativePath), hash] as const
    ),
  ]);

  // Step 2: preflight every patch before the first write. This makes path and
  // concurrent-source failures all-or-nothing instead of partially mutating a
  // workspace before a later file is rejected.
  const absolutePaths = new Map<number, string>();
  const targetCounts = new Map<string, number>();
  for (const patch of input.patches) {
    const target = path.resolve(input.workspacePath, patch.relativePath);
    targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
  }
  let resultPatches: FilePatch[] = await Promise.all(
    input.patches.map(async (patch, index): Promise<FilePatch> => {
      if (acceptedSet !== null && !acceptedSet.has(patch.relativePath)) {
        return { ...patch, status: 'rejected' };
      }
      if (patch.status === 'rejected') {
        return patch;
      }

      const absPath = path.resolve(input.workspacePath, patch.relativePath);
      if (!isChildPathOf(input.workspacePath, absPath)) {
        return {
          ...patch,
          status: 'failed',
          failReason: `Refusing to apply patch outside workspace boundary: ${patch.relativePath}`,
        };
      }
      if (
        !deps.readFile &&
        !deps.writeFile &&
        (await hasSymlinkPathComponent(input.workspacePath, absPath))
      ) {
        return {
          ...patch,
          status: 'failed',
          failReason: `Refusing patch through a symbolic link: ${patch.relativePath}`,
        };
      }
      if ((targetCounts.get(absPath) ?? 0) > 1) {
        return {
          ...patch,
          status: 'failed',
          failReason: `Duplicate patch target in one transaction: ${patch.relativePath}`,
        };
      }
      if (patch.patchedContent.includes('\u0000')) {
        return {
          ...patch,
          status: 'failed',
          failReason: `Refusing patch content containing NUL bytes: ${patch.relativePath}`,
        };
      }
      if (path.extname(absPath).toLowerCase() === '.json') {
        try {
          JSON.parse(patch.patchedContent);
        } catch (error) {
          return {
            ...patch,
            status: 'failed',
            failReason: `Invalid JSON patch for ${patch.relativePath}: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
      absolutePaths.set(index, absPath);
      const originalContent = await readFile(absPath);
      const expectedHash = expectedHashes.get(path.normalize(patch.relativePath));
      if (expectedHashes.has(path.normalize(patch.relativePath))) {
        const actualHash = originalContent === null ? null : contentSha256(originalContent);
        if (actualHash !== expectedHash) {
          return {
            ...patch,
            status: 'failed',
            failReason: `Source changed after AI grounding; refusing stale patch: ${patch.relativePath}`,
          };
        }
      }

      return {
        ...patch,
        isNewFile: originalContent === null,
        originalContent: originalContent ?? undefined,
        hunks: [
          {
            startLine: 1,
            removedLines: originalContent ? originalContent.split('\n') : [],
            addedLines: patch.patchedContent.split('\n'),
          },
        ],
        status: 'pending',
      };
    })
  );

  const preflightFailure = resultPatches.find((patch) => patch.status === 'failed');
  if (preflightFailure) {
    resultPatches = resultPatches.map((patch) =>
      patch.status === 'pending'
        ? {
            ...patch,
            status: 'failed',
            failReason: `Patch transaction aborted: ${preflightFailure.failReason}`,
          }
        : patch
    );
  } else {
    // Step 3: write sequentially and compensate every prior write if any file
    // fails. Successful return therefore means the complete patch set landed.
    const writtenIndexes: number[] = [];
    for (let index = 0; index < resultPatches.length; index += 1) {
      const patch = resultPatches[index];
      if (patch.status !== 'pending') {
        continue;
      }
      const absPath = absolutePaths.get(index);
      if (!absPath) {
        continue;
      }
      try {
        await writeFile(absPath, patch.patchedContent);
        resultPatches[index] = { ...patch, status: 'applied' };
        writtenIndexes.push(index);
      } catch (error) {
        const failure = error instanceof Error ? error.message : String(error);
        const rollbackIndexes = [...writtenIndexes, index].reverse();
        const rollbackErrors: string[] = [];
        for (const rollbackIndex of rollbackIndexes) {
          const rollbackPatch = resultPatches[rollbackIndex];
          const rollbackPath = absolutePaths.get(rollbackIndex);
          if (!rollbackPath) {
            continue;
          }
          try {
            if (rollbackPatch.isNewFile) {
              await deleteFile(rollbackPath);
            } else {
              await writeFile(rollbackPath, rollbackPatch.originalContent ?? '');
            }
          } catch (rollbackError) {
            rollbackErrors.push(
              `${rollbackPatch.relativePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
            );
          }
        }
        const rollbackSuffix =
          rollbackErrors.length > 0 ? ` Rollback errors: ${rollbackErrors.join('; ')}` : '';
        resultPatches = resultPatches.map((candidate, candidateIndex) => {
          if (candidate.status === 'rejected') {
            return candidate;
          }
          return {
            ...candidate,
            status: 'failed',
            failReason:
              candidateIndex === index
                ? `${failure}.${rollbackSuffix}`
                : `Patch transaction rolled back after ${patch.relativePath} failed.${rollbackSuffix}`,
          };
        });
        break;
      }
    }
  }

  const appliedCount = resultPatches.filter((p) => p.status === 'applied').length;
  const rejectedCount = resultPatches.filter((p) => p.status === 'rejected').length;
  const failedCount = resultPatches.filter((p) => p.status === 'failed').length;

  // Step 4: Telemetry
  await telemetry.trackCommandEvent('workspai.patch.applied', input.workspacePath, {
    actionId: input.actionId,
    patchId,
    appliedCount,
    rejectedCount,
    failedCount,
    branchCreated: branchCreated ?? null,
    verificationPassed: input.verificationPassed ?? null,
  });

  return {
    patchId,
    generatedAt,
    actionId: input.actionId,
    branchCreated,
    patches: resultPatches,
    verificationPassed: input.verificationPassed,
    verificationNote: input.verificationNote,
    appliedCount,
    rejectedCount,
    failedCount,
  };
}

/**
 * Compensate an AI patch only when every target still equals the content that
 * Studio wrote. This prevents rollback from overwriting edits made by the user
 * or by verify hooks after patch application.
 */
export async function rollbackAppliedPatches(
  input: { workspacePath: string; patches: FilePatch[] },
  deps: Pick<PatchApplyDeps, 'readFile' | 'writeFile' | 'deleteFile'> = {}
): Promise<PatchRollbackResult> {
  const readFile = deps.readFile ?? defaultReadFile;
  const writeFile = deps.writeFile ?? defaultWriteFile;
  const deleteFile =
    deps.deleteFile ?? (deps.writeFile ? async () => undefined : defaultDeleteFile);
  const candidates = input.patches.filter((patch) => patch.status === 'applied');
  const failedPaths: PatchRollbackResult['failedPaths'] = [];

  for (const patch of candidates) {
    const absolutePath = path.resolve(input.workspacePath, patch.relativePath);
    if (!isChildPathOf(input.workspacePath, absolutePath)) {
      failedPaths.push({ path: patch.relativePath, reason: 'outside workspace boundary' });
      continue;
    }
    if (
      !deps.readFile &&
      !deps.writeFile &&
      (await hasSymlinkPathComponent(input.workspacePath, absolutePath))
    ) {
      failedPaths.push({ path: patch.relativePath, reason: 'symbolic-link target refused' });
      continue;
    }
    const currentContent = await readFile(absolutePath);
    const sourceMatchesAppliedState =
      patch.operation === 'delete'
        ? currentContent === null
        : currentContent === patch.patchedContent;
    if (!sourceMatchesAppliedState) {
      failedPaths.push({
        path: patch.relativePath,
        reason: 'source changed after patch apply; automatic rollback refused',
      });
    }
  }
  if (failedPaths.length > 0) {
    return { ok: false, restoredPaths: [], failedPaths };
  }

  const restoredPaths: string[] = [];
  for (const patch of [...candidates].reverse()) {
    const absolutePath = path.resolve(input.workspacePath, patch.relativePath);
    try {
      if (patch.isNewFile) {
        await deleteFile(absolutePath);
      } else {
        await writeFile(absolutePath, patch.originalContent ?? '');
      }
      restoredPaths.push(patch.relativePath);
    } catch (error) {
      failedPaths.push({
        path: patch.relativePath,
        reason: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  return { ok: failedPaths.length === 0, restoredPaths, failedPaths };
}

// ─── Log/Trace Ingestion (A03) ────────────────────────────────────────────────

export type StackFrame = {
  raw: string;
  file?: string;
  line?: number;
  symbol?: string;
};

export type ParsedTrace = {
  language: 'python' | 'node' | 'java' | 'unknown';
  errorType?: string;
  errorMessage?: string;
  frames: StackFrame[];
  relatedFiles: string[];
};

// Python: `  File "foo.py", line 42, in bar`
const PYTHON_FRAME_RE = /File "([^"]+)", line (\d+), in (\S+)/g;
// Node.js: `    at functionName (file.ts:42:10)` or `    at file.ts:42:10`
const NODE_FRAME_RE = /at (?:(\S+) \()?([^():]+):(\d+):\d+\)?/g;
// Java: `\tat com.example.Foo.method(Foo.java:42)`
const JAVA_FRAME_RE = /\tat ([^\s(]+)\(([^:)]+):(\d+)\)/g;
// Python error line: `SomeError: message`
const PYTHON_ERROR_RE = /^([A-Z][a-zA-Z0-9_]*(?:Error|Exception|Warning|Fault)): (.+)/m;
// Node error line: `Error: message` or `TypeError: message`
const NODE_ERROR_RE = /^([A-Z][a-zA-Z0-9_]*(?:Error|Exception)): (.+)/m;

/**
 * Parse a raw log/trace string into a structured `ParsedTrace`.
 * Used by A03 to build richer debug context for the AI prompt.
 */
export function parseLogTrace(rawText: string): ParsedTrace {
  const hasPythonTraceback = /Traceback \(most recent call last\)/i.test(rawText);
  const hasNodeAt = /^\s+at /m.test(rawText);
  const hasJavaAt = /\tat [a-z]/m.test(rawText);

  let language: ParsedTrace['language'] = 'unknown';
  if (hasPythonTraceback) {
    language = 'python';
  } else if (hasJavaAt) {
    language = 'java';
  } else if (hasNodeAt) {
    language = 'node';
  }

  const frames: StackFrame[] = [];
  const relatedFiles = new Set<string>();

  if (language === 'python') {
    let m: RegExpExecArray | null;
    PYTHON_FRAME_RE.lastIndex = 0;
    while ((m = PYTHON_FRAME_RE.exec(rawText)) !== null) {
      const filePath = m[1];
      const line = parseInt(m[2], 10);
      const symbol = m[3];
      frames.push({ raw: m[0], file: filePath, line, symbol });
      relatedFiles.add(filePath);
    }
  } else if (language === 'node') {
    let m: RegExpExecArray | null;
    NODE_FRAME_RE.lastIndex = 0;
    while ((m = NODE_FRAME_RE.exec(rawText)) !== null) {
      const symbol = m[1];
      const filePath = m[2];
      const line = parseInt(m[3], 10);
      if (!filePath.startsWith('node:') && !filePath.startsWith('<')) {
        frames.push({ raw: m[0], file: filePath, line, symbol });
        relatedFiles.add(filePath);
      }
    }
  } else if (language === 'java') {
    let m: RegExpExecArray | null;
    JAVA_FRAME_RE.lastIndex = 0;
    while ((m = JAVA_FRAME_RE.exec(rawText)) !== null) {
      const symbol = m[1];
      const filePath = m[2];
      const line = parseInt(m[3], 10);
      frames.push({ raw: m[0], file: filePath, line, symbol });
      relatedFiles.add(filePath);
    }
  }

  let errorType: string | undefined;
  let errorMessage: string | undefined;

  const errorMatch = (language === 'python' ? PYTHON_ERROR_RE : NODE_ERROR_RE).exec(rawText);
  if (errorMatch) {
    errorType = errorMatch[1];
    errorMessage = errorMatch[2]?.trim();
  }

  return {
    language,
    errorType,
    errorMessage,
    frames,
    relatedFiles: Array.from(relatedFiles),
  };
}

/**
 * Read a log file from the workspace and return its contents.
 * Returns null when the file cannot be read (not found, too large, binary).
 */
export async function readLogFile(
  absPath: string,
  maxBytes = 64 * 1024,
  deps: { readRaw?: (p: string) => Promise<Buffer | null> } = {}
): Promise<string | null> {
  try {
    if (deps.readRaw) {
      const buf = await deps.readRaw(absPath);
      if (!buf) {
        return null;
      }
      return buf.slice(0, maxBytes).toString('utf8');
    }
    const fs = await import('fs-extra');
    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      return null;
    }
    const fd = await fs.open(absPath, 'r');
    const buf = Buffer.allocUnsafe(Math.min(stat.size, maxBytes));
    await fs.read(fd, buf, 0, buf.length, 0);
    await fs.close(fd);
    return buf.toString('utf8');
  } catch {
    return null;
  }
}
