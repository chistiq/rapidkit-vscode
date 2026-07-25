import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

import {
  readImportedProjectsRegistry,
  upsertImportedProjectsRegistry,
} from '../utils/importedProjectsRegistry';

describe('importedProjectsRegistry', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((dirPath) => fs.remove(dirPath)));
    tempRoots.length = 0;
  });

  async function createWorkspace(): Promise<string> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-registry-'));
    tempRoots.push(workspacePath);
    return workspacePath;
  }

  it('returns empty list when registry file does not exist', async () => {
    const workspacePath = await createWorkspace();
    const entries = await readImportedProjectsRegistry(workspacePath);
    expect(entries).toEqual([]);
  });

  it('upserts entries by path and keeps latest record', async () => {
    const workspacePath = await createWorkspace();

    await upsertImportedProjectsRegistry(workspacePath, [
      {
        name: 'api-a',
        path: path.join(workspacePath, 'api-a'),
        stack: 'unknown',
        confidence: 'medium',
        source: 'local-folder',
        importedAt: '2026-05-04T10:00:00.000Z',
      },
    ]);

    await upsertImportedProjectsRegistry(workspacePath, [
      {
        name: 'api-a-renamed',
        path: path.join(workspacePath, 'api-a'),
        stack: 'fastapi',
        confidence: 'high',
        source: 'drag-drop',
        importedAt: '2026-05-04T11:00:00.000Z',
      },
      {
        name: 'api-b',
        path: path.join(workspacePath, 'api-b'),
        stack: 'unknown',
        confidence: 'low',
        source: 'git-url',
        importedAt: '2026-05-04T11:05:00.000Z',
      },
    ]);

    const entries = await readImportedProjectsRegistry(workspacePath);
    expect(entries).toHaveLength(2);

    const byPath = new Map(entries.map((item) => [item.path, item] as const));
    expect(byPath.get(path.join(workspacePath, 'api-a'))?.name).toBe('api-a-renamed');
    expect(byPath.get(path.join(workspacePath, 'api-a'))?.stack).toBe('fastapi');
    expect(byPath.get(path.join(workspacePath, 'api-b'))?.source).toBe('git-url');
  });

  it('accepts adopted frontend project metadata from the npm registry contract', async () => {
    const workspacePath = await createWorkspace();
    const projectPath = path.join(os.tmpdir(), 'rk-adopted-next-app');

    await upsertImportedProjectsRegistry(workspacePath, [
      {
        name: 'next-app',
        path: projectPath,
        relativePath: '../../rk-adopted-next-app',
        relationship: 'adopted',
        stack: 'nextjs',
        runtime: 'node',
        framework: 'nextjs',
        frameworkDisplayName: 'Next.js',
        supportTier: 'extended',
        moduleSupport: false,
        confidence: 'high',
        source: 'adopted-local',
        importedAt: '2026-06-15T10:00:00.000Z',
      },
    ]);

    const entries = await readImportedProjectsRegistry(workspacePath);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'next-app',
      path: projectPath,
      relationship: 'adopted',
      stack: 'nextjs',
      runtime: 'node',
      frameworkDisplayName: 'Next.js',
      source: 'adopted-local',
    });
  });

  it('ignores malformed registry payloads safely', async () => {
    const workspacePath = await createWorkspace();
    const malformedPath = path.join(workspacePath, '.rapidkit', 'imported-projects.json');

    await fs.ensureDir(path.dirname(malformedPath));
    await fs.writeJSON(
      malformedPath,
      {
        version: 1,
        updatedAt: '2026-05-04T12:00:00.000Z',
        projects: [{ bogus: true }, { name: 'x', path: '/tmp/x' }],
      },
      { spaces: 2 }
    );

    const entries = await readImportedProjectsRegistry(workspacePath);
    expect(entries).toEqual([]);
  });

  it('prefers the canonical .workspai registry and writes new state there', async () => {
    const workspacePath = await createWorkspace();
    const canonicalPath = path.join(workspacePath, '.workspai', 'imported-projects.json');
    const legacyPath = path.join(workspacePath, '.rapidkit', 'imported-projects.json');
    const baseEntry = {
      path: path.join(workspacePath, 'web'),
      stack: 'nextjs' as const,
      confidence: 'high' as const,
      importedAt: '2026-07-21T00:00:00.000Z',
    };
    await fs.ensureDir(path.dirname(legacyPath));
    await fs.writeJSON(legacyPath, {
      version: 1,
      updatedAt: '2026-07-21T00:00:00.000Z',
      projects: [{ ...baseEntry, name: 'legacy' }],
    });
    await fs.ensureDir(path.dirname(canonicalPath));
    await fs.writeJSON(canonicalPath, {
      version: 1,
      updatedAt: '2026-07-21T00:00:00.000Z',
      projects: [{ ...baseEntry, name: 'canonical' }],
    });

    expect(await readImportedProjectsRegistry(workspacePath)).toMatchObject([
      { name: 'canonical' },
    ]);

    await upsertImportedProjectsRegistry(workspacePath, [
      { ...baseEntry, name: 'updated', source: 'adopted-local' },
    ]);
    expect(await fs.pathExists(canonicalPath)).toBe(true);
    expect((await fs.readJSON(canonicalPath)).projects[0].name).toBe('updated');
  });
});
