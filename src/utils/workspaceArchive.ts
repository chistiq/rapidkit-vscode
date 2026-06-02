import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';

export const WORKSPACE_ARCHIVE_MANIFEST_PATH = '.rapidkit/archive-manifest.json';

export interface WorkspaceArchiveManifest {
  version: 1;
  kind: 'workspai.workspace.archive';
  workspaceName: string;
  exportedAt: string;
  exportedBy?: 'workspai-vscode' | 'rapidkit-npm';
  archiveFormat?: 'zip-deflate' | 'zip-store';
  security?: {
    envFilesIncluded: boolean;
    excludedByDefault: string[];
  };
  files: Array<{
    path: string;
    size: number;
    sha256?: string;
  }>;
}

export interface WorkspaceArchiveExtractionResult {
  tempRoot: string;
  workspaceRoot: string;
}

const EXCLUDED_SEGMENTS = new Set([
  '__pycache__',
  '.venv',
  'venv',
  'node_modules',
  '.git',
  'dist',
  'build',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'htmlcov',
]);

const EXCLUDED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', '.coverage']);

const SECRET_BASENAME_PATTERNS = [
  /^\.env$/i,
  /^\.env\.(?!example$|sample$|template$).+/i,
  /^.*\.pem$/i,
  /^.*\.key$/i,
  /^id_rsa$/i,
  /^id_ed25519$/i,
];

function toArchivePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

export function sanitizeWorkspaceArchiveName(rawName: string): string {
  const stripped = rawName
    .replace(/\.rapidkit-archive\.zip$/i, '')
    .replace(/\.zip$/i, '')
    .trim();
  const normalized = stripped
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 64);
  return normalized || 'imported-workspace';
}

export function isSafeArchiveEntryName(entryName: string): boolean {
  const normalized = toArchivePath(entryName).trim();
  if (!normalized || normalized.startsWith('/') || normalized.startsWith('~')) {
    return false;
  }

  if (/^[a-zA-Z]:\//.test(normalized) || normalized.includes('\0')) {
    return false;
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 && !segments.some((segment) => segment === '..' || segment === '.');
}

export function validateWorkspaceArchiveEntries(entryNames: string[]): void {
  const unsafeEntry = entryNames.find((entryName) => !isSafeArchiveEntryName(entryName));
  if (unsafeEntry) {
    throw new Error(`Archive contains an unsafe path: ${unsafeEntry}`);
  }
}

export function shouldExcludeWorkspaceArchivePath(relativePath: string): boolean {
  const normalized = toArchivePath(relativePath);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) {
    return true;
  }

  const basename = segments[segments.length - 1] || '';
  if (EXCLUDED_BASENAMES.has(basename)) {
    return true;
  }
  if (SECRET_BASENAME_PATTERNS.some((pattern) => pattern.test(basename))) {
    return true;
  }

  return basename.endsWith('.pyc') || basename.endsWith('.log');
}

async function walkWorkspaceFiles(
  workspacePath: string,
  currentPath: string,
  files: WorkspaceArchiveManifest['files']
): Promise<void> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = toArchivePath(path.relative(workspacePath, fullPath));
    if (!relativePath || shouldExcludeWorkspaceArchivePath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walkWorkspaceFiles(workspacePath, fullPath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stat = await fs.stat(fullPath);
    files.push({
      path: relativePath,
      size: stat.size,
    });
  }
}

export async function buildWorkspaceArchiveManifest(input: {
  workspacePath: string;
  workspaceName: string;
  exportedAt?: string;
}): Promise<WorkspaceArchiveManifest> {
  const files: WorkspaceArchiveManifest['files'] = [];
  await walkWorkspaceFiles(input.workspacePath, input.workspacePath, files);

  return {
    version: 1,
    kind: 'workspai.workspace.archive',
    workspaceName: input.workspaceName,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    exportedBy: 'workspai-vscode',
    archiveFormat: 'zip-deflate',
    security: {
      envFilesIncluded: false,
      excludedByDefault: [
        '.git',
        'node_modules',
        '.venv',
        'dist',
        'build',
        'target',
        '.env',
        '*.pem',
        '*.key',
        '*.log',
      ],
    },
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

async function findWorkspaceRoot(extractRoot: string): Promise<string> {
  const rootMarkerPath = path.join(extractRoot, '.rapidkit-workspace');
  if (await fs.pathExists(rootMarkerPath)) {
    return extractRoot;
  }

  const entries = await fs.readdir(extractRoot, { withFileTypes: true });
  const candidateRoots: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidatePath = path.join(extractRoot, entry.name);
    if (await fs.pathExists(path.join(candidatePath, '.rapidkit-workspace'))) {
      candidateRoots.push(candidatePath);
    }
  }

  if (candidateRoots.length === 1) {
    return candidateRoots[0];
  }

  throw new Error('Extracted archive is not a valid Workspai workspace.');
}

export async function extractWorkspaceArchiveToTemp(input: {
  archivePath: string;
}): Promise<WorkspaceArchiveExtractionResult> {
  const zip = new AdmZip(input.archivePath);
  const entries = zip.getEntries();
  validateWorkspaceArchiveEntries(entries.map((entry) => entry.entryName));

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-archive-import-'));
  try {
    zip.extractAllTo(tempRoot, true);
    const workspaceRoot = await findWorkspaceRoot(tempRoot);
    return {
      tempRoot,
      workspaceRoot,
    };
  } catch (error) {
    await fs.remove(tempRoot).catch(() => undefined);
    throw error;
  }
}
