import fs from 'fs-extra';
import path from 'node:path';

const MAX_LIVE_DIFF_FILE_BYTES = 128 * 1024;
const MAX_LIVE_DIFF_LINES = 400;
const MAX_LIVE_DIFF_FILES = 40;

function normalizedRelativePath(workspacePath: string, requestedPath: string): string | undefined {
  const absolutePath = path.resolve(workspacePath, requestedPath);
  const relativePath = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
  return relativePath && !relativePath.startsWith('../') && !path.isAbsolute(relativePath)
    ? relativePath
    : undefined;
}

export function parseStudioUntrackedPaths(statusPorcelainZ: string): string[] {
  return statusPorcelainZ
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3).replace(/\\/g, '/'))
    .filter((entry) => entry.length > 0 && !entry.includes('\0'));
}

/**
 * `git diff` intentionally omits untracked files. Build a bounded live-only
 * unified diff for newly created regular text files so command-driven edits
 * have the same review surface as direct Studio patches.
 */
export async function buildStudioUntrackedFileDiffs(input: {
  workspacePath: string;
  statusPorcelainZ: string;
  includedPaths?: string[];
}): Promise<string> {
  const included = input.includedPaths?.length
    ? new Set(
        input.includedPaths
          .map((entry) => normalizedRelativePath(input.workspacePath, entry))
          .filter((entry): entry is string => Boolean(entry))
      )
    : undefined;
  const diffs: string[] = [];
  for (const requestedPath of parseStudioUntrackedPaths(input.statusPorcelainZ)) {
    if (diffs.length >= MAX_LIVE_DIFF_FILES || requestedPath.includes('\n')) {
      break;
    }
    const relativePath = normalizedRelativePath(input.workspacePath, requestedPath);
    if (!relativePath || (included && !included.has(relativePath))) {
      continue;
    }
    const absolutePath = path.resolve(input.workspacePath, relativePath);
    const stat = await fs.lstat(absolutePath).catch(() => undefined);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > MAX_LIVE_DIFF_FILE_BYTES) {
      continue;
    }
    const content = await fs.readFile(absolutePath);
    if (content.includes(0)) {
      continue;
    }
    const lines = content.toString('utf8').split(/\r?\n/).slice(0, MAX_LIVE_DIFF_LINES);
    diffs.push(
      [
        `diff --git a/${relativePath} b/${relativePath}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${relativePath}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
      ].join('\n')
    );
  }
  return diffs.join('\n');
}
