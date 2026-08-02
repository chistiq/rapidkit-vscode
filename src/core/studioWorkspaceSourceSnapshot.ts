import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';

export type StudioWorkspaceSourceSnapshot = {
  fingerprint: string;
  files: Record<string, string>;
};

const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.workspai',
  '.rapidkit',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  'node_modules',
  'coverage',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
]);

const MAX_SOURCE_FILES = 30_000;
const MAX_SOURCE_FILE_BYTES = 16 * 1024 * 1024;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isGeneratedAgentSurface(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return (
    normalized === '.workspai-workspace' ||
    normalized === 'AGENTS.md' ||
    normalized === 'CLAUDE.md' ||
    /^(?:\.claude\/rules|\.cursor\/rules|\.github\/(?:agents|instructions|prompts|skills))\//.test(
      normalized
    )
  );
}

export async function captureStudioWorkspaceSourceSnapshot(input: {
  workspacePath: string;
  scopePath?: string;
}): Promise<StudioWorkspaceSourceSnapshot | undefined> {
  const workspacePath = path.resolve(input.workspacePath);
  const scopePath = path.resolve(input.scopePath ?? workspacePath);
  if (!isInside(workspacePath, scopePath)) {
    return undefined;
  }

  const files: Record<string, string> = {};
  const pending = [scopePath];
  let visitedFiles = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      visitedFiles += 1;
      if (visitedFiles > MAX_SOURCE_FILES) {
        return undefined;
      }
      const relativePath = path.relative(workspacePath, absolutePath).replace(/\\/g, '/');
      if (isGeneratedAgentSurface(relativePath)) {
        continue;
      }
      const stat = await fs.stat(absolutePath).catch(() => undefined);
      if (!stat || stat.size > MAX_SOURCE_FILE_BYTES) {
        continue;
      }
      const content = await fs.readFile(absolutePath).catch(() => undefined);
      if (!content) {
        continue;
      }
      files[relativePath] = crypto.createHash('sha256').update(content).digest('hex');
    }
  }

  const fingerprint = crypto
    .createHash('sha256')
    .update(
      Object.entries(files)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([relativePath, sha256]) => `${relativePath}\0${sha256}`)
        .join('\n')
    )
    .digest('hex');
  return { fingerprint, files };
}

export function diffStudioWorkspaceSourceSnapshots(
  before: StudioWorkspaceSourceSnapshot | undefined,
  after: StudioWorkspaceSourceSnapshot | undefined
): string[] {
  if (!before || !after) {
    return [];
  }
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)]);
  return [...paths]
    .filter((relativePath) => before.files[relativePath] !== after.files[relativePath])
    .sort();
}
