import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import {
  buildWorkspaceArchiveManifest,
  extractWorkspaceArchiveToTemp,
  isSafeArchiveEntryName,
  sanitizeWorkspaceArchiveName,
  shouldExcludeWorkspaceArchivePath,
  validateWorkspaceArchiveEntries,
  WORKSPACE_ARCHIVE_MANIFEST_PATH,
} from '../utils/workspaceArchive';

describe('workspaceArchive', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((dirPath) => fs.remove(dirPath)));
    tempRoots.length = 0;
  });

  async function makeTempDir(prefix: string): Promise<string> {
    const dirPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const dirPathStr = dirPath.toString();
    tempRoots.push(dirPathStr);
    return dirPathStr;
  }

  it('rejects unsafe archive entry names across operating systems', () => {
    expect(isSafeArchiveEntryName('.rapidkit-workspace')).toBe(true);
    expect(isSafeArchiveEntryName('api/package.json')).toBe(true);
    expect(isSafeArchiveEntryName('../escape.txt')).toBe(false);
    expect(isSafeArchiveEntryName('nested/../../escape.txt')).toBe(false);
    expect(isSafeArchiveEntryName('/tmp/escape.txt')).toBe(false);
    expect(isSafeArchiveEntryName('C:/Users/Public/escape.txt')).toBe(false);

    expect(() => validateWorkspaceArchiveEntries(['.rapidkit-workspace', '../escape.txt'])).toThrow(
      'unsafe path'
    );
  });

  it('uses stable archive names and exclusion rules', () => {
    expect(sanitizeWorkspaceArchiveName('My Workspace.rapidkit-archive.zip')).toBe('my-workspace');
    expect(sanitizeWorkspaceArchiveName('  ')).toBe('imported-workspace');

    expect(shouldExcludeWorkspaceArchivePath('api/node_modules/pkg/index.js')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/.venv/bin/python')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/.env')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/.env.example')).toBe(false);
    expect(shouldExcludeWorkspaceArchivePath('api/private.key')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/server.log')).toBe(true);
    expect(shouldExcludeWorkspaceArchivePath('api/src/main.ts')).toBe(false);
  });

  it('builds a manifest without excluded dependency/cache paths', async () => {
    const workspacePath = await makeTempDir('workspai-archive-ws-');
    await fs.writeFile(path.join(workspacePath, '.rapidkit-workspace'), '{}');
    await fs.ensureDir(path.join(workspacePath, 'api', 'src'));
    await fs.writeFile(path.join(workspacePath, 'api', 'src', 'main.ts'), 'export {};');
    await fs.ensureDir(path.join(workspacePath, 'api', 'node_modules', 'pkg'));
    await fs.writeFile(path.join(workspacePath, 'api', 'node_modules', 'pkg', 'index.js'), '');

    const manifest = await buildWorkspaceArchiveManifest({
      workspacePath,
      workspaceName: 'demo',
      exportedAt: '2026-05-26T00:00:00.000Z',
    });

    expect(manifest.kind).toBe('workspai.workspace.archive');
    expect(manifest.exportedBy).toBe('workspai-vscode');
    expect(manifest.security?.envFilesIncluded).toBe(false);
    expect(manifest.files.map((file) => file.path)).toEqual([
      '.rapidkit-workspace',
      'api/src/main.ts',
    ]);
  });

  it('extracts only validated Workspai workspace archives to a temporary root', async () => {
    const archiveRoot = await makeTempDir('workspai-archive-src-');
    const archivePath = path.join(archiveRoot, 'demo.rapidkit-archive.zip');
    const zip = new AdmZip();
    zip.addFile('.rapidkit-workspace', Buffer.from('{}'));
    zip.addFile('api/package.json', Buffer.from('{"name":"api"}'));
    zip.addFile(WORKSPACE_ARCHIVE_MANIFEST_PATH, Buffer.from('{"version":1}'));
    zip.writeZip(archivePath);

    const extracted = await extractWorkspaceArchiveToTemp({ archivePath });
    tempRoots.push(extracted.tempRoot);

    expect(await fs.pathExists(path.join(extracted.workspaceRoot, '.rapidkit-workspace'))).toBe(
      true
    );
    expect(await fs.pathExists(path.join(extracted.workspaceRoot, 'api', 'package.json'))).toBe(
      true
    );
  });

  it('cleans up temp extraction when archive validation fails', async () => {
    const archiveRoot = await makeTempDir('workspai-archive-invalid-');
    const archivePath = path.join(archiveRoot, 'invalid.rapidkit-archive.zip');
    const zip = new AdmZip();
    zip.addFile('api/package.json', Buffer.from('{"name":"api"}'));
    zip.writeZip(archivePath);

    await expect(extractWorkspaceArchiveToTemp({ archivePath })).rejects.toThrow(
      'not a valid Workspai workspace'
    );
  });
});
