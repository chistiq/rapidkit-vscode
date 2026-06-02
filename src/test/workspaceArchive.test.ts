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
  verifyWorkspaceArchive,
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
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
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

  it('verifies archive manifests before import', async () => {
    const archiveRoot = await makeTempDir('workspai-archive-verify-');
    const archivePath = path.join(archiveRoot, 'verified.rapidkit-archive.zip');
    const zip = new AdmZip();
    const workspaceMarker = Buffer.from('{}');
    const packageJson = Buffer.from('{"name":"api"}');
    zip.addFile('.rapidkit-workspace', workspaceMarker);
    zip.addFile('api/package.json', packageJson);
    zip.addFile(
      WORKSPACE_ARCHIVE_MANIFEST_PATH,
      Buffer.from(
        JSON.stringify({
          version: 1,
          kind: 'workspai.workspace.archive',
          workspaceName: 'verified',
          exportedAt: '2026-06-02T00:00:00.000Z',
          files: [
            {
              path: '.rapidkit-workspace',
              size: workspaceMarker.length,
              sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
            },
            {
              path: 'api/package.json',
              size: packageJson.length,
              sha256: '131cbbc05e91cf54ce9aa2aa6a7d0e86b9d1d66f4bf69d6de02a0a9e19d0633c',
            },
          ],
        })
      )
    );
    zip.writeZip(archivePath);

    const result = verifyWorkspaceArchive({ archivePath });
    expect(result.status).toBe('passed');
    expect(result.verifiedFiles).toBe(2);
  });

  it('rejects archive payloads that do not match manifest checksums', async () => {
    const archiveRoot = await makeTempDir('workspai-archive-tampered-');
    const archivePath = path.join(archiveRoot, 'tampered.rapidkit-archive.zip');
    const zip = new AdmZip();
    zip.addFile('.rapidkit-workspace', Buffer.from('{}'));
    zip.addFile('api/package.json', Buffer.from('{"name":"changed"}'));
    zip.addFile(
      WORKSPACE_ARCHIVE_MANIFEST_PATH,
      Buffer.from(
        JSON.stringify({
          version: 1,
          kind: 'workspai.workspace.archive',
          workspaceName: 'tampered',
          exportedAt: '2026-06-02T00:00:00.000Z',
          files: [
            {
              path: '.rapidkit-workspace',
              size: 2,
              sha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
            },
            {
              path: 'api/package.json',
              size: 14,
              sha256: 'bdf0a94f800b65a622939ad945bd2ed660b3f25b6d7b68419e73c00352dfa5db',
            },
          ],
        })
      )
    );
    zip.writeZip(archivePath);

    const result = verifyWorkspaceArchive({ archivePath });
    expect(result.status).toBe('failed');
    expect(result.mismatches.map((item) => item.path)).toContain('api/package.json');
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
