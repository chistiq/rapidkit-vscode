import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';

export const WORKSPACE_ARCHIVE_MANIFEST_PATH = '.rapidkit/archive-manifest.json';

export interface WorkspaceArchiveManifest {
  version: 1;
  kind: 'workspai.workspace.archive';
  workspaceName: string;
  exportedAt: string;
  exportedBy?: 'workspai-cli' | 'workspai-vscode' | 'rapidkit-npm';
  archiveFormat?: 'zip-deflate' | 'zip-store';
  security?: {
    envFilesIncluded: boolean;
    excludedByDefault: string[];
  };
  files: Array<{
    path: string;
    size: number;
    sha256: string;
  }>;
}

export interface WorkspaceArchiveExtractionResult {
  tempRoot: string;
  workspaceRoot: string;
}

export interface DownloadedWorkspaceArchive {
  archivePath: string;
  tempRoot: string;
  finalUrl: string;
  bytes: number;
}

export type WorkspaceArchiveVerificationStatus = 'passed' | 'failed';

export interface WorkspaceArchiveVerificationResult {
  status: WorkspaceArchiveVerificationStatus;
  manifest: WorkspaceArchiveManifest;
  fileCount: number;
  verifiedFiles: number;
  missingChecksumFiles: string[];
  missingArchiveEntries: string[];
  extraArchiveEntries: string[];
  mismatches: Array<{
    path: string;
    expected: { size?: number; sha256?: string };
    actual: { size: number; sha256: string };
  }>;
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

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function assertWorkspaceArchiveUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Enter a valid HTTPS or HTTP archive URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Archive URL must use HTTPS or HTTP.');
  }
  return parsed;
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

function parseWorkspaceArchiveManifest(zip: AdmZip): WorkspaceArchiveManifest {
  const manifestEntry = zip.getEntry(WORKSPACE_ARCHIVE_MANIFEST_PATH);
  if (!manifestEntry) {
    throw new Error('Archive is missing .rapidkit/archive-manifest.json.');
  }
  const manifest = JSON.parse(
    manifestEntry.getData().toString('utf-8')
  ) as WorkspaceArchiveManifest;
  if (manifest.kind !== 'workspai.workspace.archive') {
    throw new Error('Archive manifest kind is not a Workspai workspace archive.');
  }
  return manifest;
}

export function verifyWorkspaceArchive(input: {
  archivePath: string;
}): WorkspaceArchiveVerificationResult {
  const zip = new AdmZip(input.archivePath);
  const entries = zip.getEntries();
  validateWorkspaceArchiveEntries(entries.map((entry) => entry.entryName));
  const manifest = parseWorkspaceArchiveManifest(zip);
  const entryByName = new Map(
    entries
      .filter((entry) => entry.entryName !== WORKSPACE_ARCHIVE_MANIFEST_PATH && !entry.isDirectory)
      .map((entry) => [entry.entryName, entry])
  );
  const manifestPaths = new Set(manifest.files.map((file) => file.path));
  const missingChecksumFiles: string[] = [];
  const missingArchiveEntries: string[] = [];
  const extraArchiveEntries = [...entryByName.keys()]
    .filter((entryName) => !manifestPaths.has(entryName))
    .sort();
  const mismatches: WorkspaceArchiveVerificationResult['mismatches'] = [];
  let verifiedFiles = 0;

  for (const file of manifest.files) {
    validateWorkspaceArchiveEntries([file.path]);
    const entry = entryByName.get(file.path);
    if (!entry) {
      missingArchiveEntries.push(file.path);
      continue;
    }
    const data = entry.getData();
    const actual = { size: data.length, sha256: sha256(data) };
    if (!file.sha256) {
      missingChecksumFiles.push(file.path);
      continue;
    }
    if (actual.size !== file.size || actual.sha256 !== file.sha256) {
      mismatches.push({
        path: file.path,
        expected: { size: file.size, sha256: file.sha256 },
        actual,
      });
      continue;
    }
    verifiedFiles += 1;
  }

  const failed =
    missingChecksumFiles.length > 0 ||
    missingArchiveEntries.length > 0 ||
    extraArchiveEntries.length > 0 ||
    mismatches.length > 0;
  return {
    status: failed ? 'failed' : 'passed',
    manifest,
    fileCount: manifest.files.length,
    verifiedFiles,
    missingChecksumFiles,
    missingArchiveEntries,
    extraArchiveEntries,
    mismatches,
  };
}

export async function downloadWorkspaceArchiveToTemp(input: {
  url: string;
  maxBytes?: number;
  redirectsRemaining?: number;
}): Promise<DownloadedWorkspaceArchive> {
  const parsed = assertWorkspaceArchiveUrl(input.url);
  const maxBytes = input.maxBytes ?? 1024 * 1024 * 1024;
  const redirectsRemaining = input.redirectsRemaining ?? 3;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workspai-archive-download-'));
  const archivePath = path.join(
    tempRoot,
    sanitizeWorkspaceArchiveName(path.basename(parsed.pathname))
  );

  try {
    const result = await new Promise<DownloadedWorkspaceArchive>((resolve, reject) => {
      const client = parsed.protocol === 'https:' ? https : http;
      const request = client.get(parsed, (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          if (redirectsRemaining <= 0) {
            reject(new Error('Too many redirects while downloading workspace archive.'));
            return;
          }
          const redirectedUrl = new URL(location, parsed).toString();
          void fs.remove(tempRoot).catch(() => undefined);
          downloadWorkspaceArchiveToTemp({
            url: redirectedUrl,
            maxBytes,
            redirectsRemaining: redirectsRemaining - 1,
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Failed to download workspace archive: HTTP ${statusCode}.`));
          return;
        }

        const output = fs.createWriteStream(archivePath);
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            request.destroy(new Error('Workspace archive download exceeded the size limit.'));
          }
        });
        response.on('error', reject);
        output.on('error', reject);
        output.on('finish', () => {
          resolve({
            archivePath,
            tempRoot,
            finalUrl: parsed.toString(),
            bytes,
          });
        });
        response.pipe(output);
      });
      request.on('error', reject);
      request.setTimeout(60_000, () => {
        request.destroy(new Error('Workspace archive download timed out.'));
      });
    });

    return result;
  } catch (error) {
    await fs.remove(tempRoot).catch(() => undefined);
    throw error;
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

    const data = await fs.readFile(fullPath);
    files.push({
      path: relativePath,
      size: data.length,
      sha256: sha256(data),
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

export type WorkspaceShipHandoffManifestRecord = WorkspaceArchiveManifest & {
  generatedAt: string;
  summary: string;
  exportArchivePath?: string;
};

/** Persist ship-handoff manifest on the workspace so the Archive evidence card can refresh. */
export async function persistWorkspaceShipHandoffManifest(input: {
  workspacePath: string;
  workspaceName: string;
  manifest?: WorkspaceArchiveManifest;
  exportArchivePath?: string;
  exportedAt?: string;
}): Promise<string> {
  const manifest =
    input.manifest ??
    (await buildWorkspaceArchiveManifest({
      workspacePath: input.workspacePath,
      workspaceName: input.workspaceName,
      exportedAt: input.exportedAt,
    }));
  const generatedAt = manifest.exportedAt;
  const fileCount = manifest.files.length;
  const summary = input.exportArchivePath
    ? `${fileCount} file(s) · exported to ${path.basename(input.exportArchivePath)}`
    : `${fileCount} file(s) · ship handoff manifest ready`;
  const record: WorkspaceShipHandoffManifestRecord = {
    ...manifest,
    generatedAt,
    summary,
    ...(input.exportArchivePath ? { exportArchivePath: input.exportArchivePath } : {}),
  };
  const manifestPath = path.join(input.workspacePath, WORKSPACE_ARCHIVE_MANIFEST_PATH);
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJson(manifestPath, record, { spaces: 2 });
  return manifestPath;
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
