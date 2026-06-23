import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildKitBlueprintSection,
  buildPlatformTeachingIndex,
  resolveKitId,
} from '../core/aiKitArchitectureCatalog';
import {
  buildWorkspaceArchitectureAtlas,
  scanProjectArchitectureFingerprint,
} from '../core/aiWorkspaceArchitectureAtlas';

describe('aiKitArchitectureCatalog', () => {
  it('resolves kit aliases to canonical ids', () => {
    expect(resolveKitId('nestjs')).toBe('nestjs.standard');
    expect(resolveKitId('fastapi.ddd')).toBe('fastapi.ddd');
    expect(resolveKitId('gin')).toBe('gogin.standard');
  });

  it('builds blueprint section for nestjs.standard without engine repo paths', () => {
    const section = buildKitBlueprintSection('nestjs.standard');
    expect(section).toContain('nestjs.standard');
    expect(section).toContain('ACTIVE KIT ARCHITECTURE');
    expect(section).toContain('<<<inject:module-imports>>>');
    expect(section).not.toContain('core/src/');
  });

  it('platform index only when polyglot', () => {
    const empty = buildPlatformTeachingIndex('nestjs.standard', ['nestjs.standard'], {
      polyglotOnly: true,
    });
    expect(empty).toBe('');

    const polyglot = buildPlatformTeachingIndex(
      'nestjs.standard',
      ['nestjs.standard', 'fastapi.standard'],
      { polyglotOnly: true }
    );
    expect(polyglot).toContain('fastapi.standard');
  });
});

describe('aiWorkspaceArchitectureAtlas', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('scans project fingerprint from project.json and registry', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-proj-'));
    tempDirs.push(project);
    fs.mkdirSync(path.join(project, '.rapidkit'), { recursive: true });
    fs.writeFileSync(
      path.join(project, '.rapidkit', 'project.json'),
      JSON.stringify({ kit_name: 'nestjs.standard', module_support: true })
    );
    fs.mkdirSync(path.join(project, 'src', 'examples'), { recursive: true });
    fs.writeFileSync(path.join(project, 'src', 'main.ts'), 'bootstrap();');
    fs.writeFileSync(
      path.join(project, 'registry.json'),
      JSON.stringify({
        installed_modules: [{ slug: 'free/cache/redis' }, { slug: 'free/essentials/settings' }],
      })
    );

    const fingerprint = scanProjectArchitectureFingerprint(project);
    expect(fingerprint?.kit).toBe('nestjs.standard');
    expect(fingerprint?.installedModuleCount).toBe(2);
    expect(fingerprint?.entryPoints).toContain('src/main.ts');
    expect(fingerprint?.hasExamplesDir).toBe(true);
  });

  it('scans frontend scaffold projects from project.json without degrading to unknown', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-next-'));
    tempDirs.push(project);
    fs.mkdirSync(path.join(project, '.rapidkit'), { recursive: true });
    fs.mkdirSync(path.join(project, 'src', 'app'), { recursive: true });
    fs.writeFileSync(
      path.join(project, '.rapidkit', 'project.json'),
      JSON.stringify({
        kit_name: 'frontend.nextjs',
        runtime: 'node',
        framework: 'nextjs',
        module_support: false,
      })
    );
    fs.writeFileSync(path.join(project, 'next.config.ts'), 'export default {};');

    const fingerprint = scanProjectArchitectureFingerprint(project);
    expect(fingerprint?.kit).toBe('frontend.nextjs');
    expect(fingerprint?.runtime).toBe('node');
    expect(fingerprint?.framework).toBe('nextjs');
    expect(fingerprint?.hasRapidKitMarker).toBe(true);
  });

  it('builds polyglot workspace atlas from multiple projects', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-ws-'));
    tempDirs.push(workspace);

    const nestProject = path.join(workspace, 'admin-api');
    fs.mkdirSync(path.join(nestProject, '.rapidkit'), { recursive: true });
    fs.mkdirSync(path.join(nestProject, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(nestProject, '.rapidkit', 'project.json'),
      JSON.stringify({ kit_name: 'nestjs.standard', module_support: true })
    );
    fs.writeFileSync(path.join(nestProject, 'src', 'main.ts'), '');

    const pyProject = path.join(workspace, 'api-service');
    fs.mkdirSync(path.join(pyProject, '.rapidkit'), { recursive: true });
    fs.writeFileSync(
      path.join(pyProject, '.rapidkit', 'project.json'),
      JSON.stringify({ kit_name: 'fastapi.standard', module_support: true })
    );
    fs.mkdirSync(path.join(pyProject, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pyProject, 'src', 'main.py'), 'def create_app(): ...');

    const atlas = await buildWorkspaceArchitectureAtlas(workspace);
    expect(atlas?.projectCount).toBe(2);
    expect(atlas?.isPolyglot).toBe(true);
    expect(atlas?.kitIds).toContain('nestjs.standard');
    expect(atlas?.kitIds).toContain('fastapi.standard');
  });

  it('prefers workspace-model.json as canonical atlas source when present', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-canonical-'));
    tempDirs.push(workspace);
    const reportsDir = path.join(workspace, '.rapidkit', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, 'workspace-model.json'),
      JSON.stringify({
        schemaVersion: 'workspace-model.v1',
        summary: { projectCount: 1 },
        projects: [
          {
            name: 'admin-api',
            path: 'admin-api',
            runtime: 'node',
            framework: 'nestjs',
            kit: 'nestjs.standard',
            moduleSupport: true,
            importantFiles: ['src/main.ts'],
            commands: { fleetStages: ['test'] },
          },
        ],
      })
    );

    const atlas = await buildWorkspaceArchitectureAtlas(workspace);
    expect(atlas?.canonicalSource).toBe('workspace-model.v1');
    expect(atlas?.projectCount).toBe(1);
    expect(atlas?.projects[0]?.source).toBe('merged');
    expect(atlas?.projects[0]?.kit).toBe('nestjs.standard');
  });
});
