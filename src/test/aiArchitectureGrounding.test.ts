import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildArchitectureGroundingForPrompt,
  buildArchitectureGroundingForPromptAsync,
  buildArchitectureGroundingSection,
  loadAnalyzeEvidenceSlice,
  resolveWorkspacePathForGrounding,
} from '../core/aiArchitectureGrounding';
import type { ScannedProjectContext } from '../core/aiService';

describe('aiArchitectureGrounding', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('loads analyze evidence from workspace reports', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-ground-'));
    tempDirs.push(workspace);
    const reportsDir = path.join(workspace, '.rapidkit', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, 'analyze-last-run.json'),
      JSON.stringify({
        generatedAt: '2026-06-10T12:00:00.000Z',
        workspacePath: workspace,
        summary: { score: 55, verdict: 'blocked', projectCount: 1 },
        projects: [
          {
            name: 'demo-ws',
            path: workspace,
            runtime: 'python',
            framework: 'python',
            hasRapidKitMarker: false,
            hasDockerfile: false,
            hasHealthEndpoint: false,
            hasTests: false,
          },
        ],
        findings: [],
      })
    );

    const slice = loadAnalyzeEvidenceSlice(workspace);
    expect(slice?.projectCount).toBe(1);
    expect(slice?.projects[0]?.framework).toBe('python');
  });

  it('includes minimal workspace guard for non-scaffolded python workspace', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-guard-'));
    tempDirs.push(workspace);
    const reportsDir = path.join(workspace, '.rapidkit', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportsDir, 'analyze-last-run.json'),
      JSON.stringify({
        generatedAt: '2026-06-10T12:00:00.000Z',
        workspacePath: workspace,
        summary: { score: 55, verdict: 'blocked', projectCount: 1 },
        projects: [
          {
            name: 'demo-ws',
            path: workspace,
            runtime: 'python',
            framework: 'python',
            hasRapidKitMarker: false,
            hasDockerfile: false,
            hasHealthEndpoint: false,
            hasTests: false,
          },
        ],
        findings: [],
      })
    );

    const section = buildArchitectureGroundingSection(
      { type: 'workspace', name: 'demo-ws', path: workspace, workspaceRootPath: workspace },
      undefined,
      loadAnalyzeEvidenceSlice(workspace)
    );

    expect(section).toContain('GUARD');
    expect(section).toContain('workspai create project');
    expect(section).toContain('WORKSPAI INTENT ROUTING');
    expect(section).toContain('workspai uninstall module');
  });

  it('extracts NestJS examples routing facts from scanned files', () => {
    const scanned: ScannedProjectContext = {
      kit: 'nestjs.standard',
      projectName: 'admin-api',
      projectRoot: '/tmp/admin-api',
      installedModules: [],
      productionDeps: [],
      hasAlembic: false,
      hasDocker: false,
      hasHealthDir: false,
      hasDomainLayer: false,
      hasUseCasesDir: false,
      topLevelSrcDirs: ['examples', 'modules', 'config'],
      configFiles: [],
      envFile: null,
      dirTree: '',
      relevantFiles: [
        {
          relPath: 'src/main.ts',
          content: 'await app.listen(port, host);',
        },
        {
          relPath: 'src/examples/examples.controller.ts',
          content: "@Controller('examples/notes')\nexport class ExamplesController {}",
        },
        {
          relPath: 'src/app.module.ts',
          content: '// <<<inject:module-imports>>>\nExamplesModule,\n...rapidkitModules',
        },
      ],
      gitDiff: null,
      runtime: 'node',
      engine: 'npm',
      pythonVersion: null,
      runtimeVersion: null,
      rapidkitCoreVersion: null,
      rapidkitCliVersion: null,
      workspaceHealth: null,
      detectionConfidence: 'strong',
    };

    const section = buildArchitectureGroundingForPrompt(
      {
        type: 'project',
        name: 'admin-api',
        path: '/tmp/admin-api',
        framework: 'nestjs',
        projectRootPath: '/tmp/admin-api',
      },
      scanned
    );

    expect(section).toContain('examples/notes');
    expect(section).toContain('No app.setGlobalPrefix');
    expect(section).toContain('DOMAIN FEATURE MODULE');
    expect(section).toContain('workspai add module');
  });

  it('async grounding includes workspace atlas and platform index', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-async-'));
    tempDirs.push(workspace);

    const project = path.join(workspace, 'admin-api');
    fs.mkdirSync(path.join(project, '.rapidkit'), { recursive: true });
    fs.mkdirSync(path.join(project, 'src', 'examples'), { recursive: true });
    fs.writeFileSync(
      path.join(project, '.rapidkit', 'project.json'),
      JSON.stringify({ kit_name: 'nestjs.standard' })
    );
    fs.writeFileSync(path.join(project, 'src', 'main.ts'), 'listen();');

    const section = await buildArchitectureGroundingForPromptAsync(
      {
        type: 'project',
        name: 'admin-api',
        path: project,
        framework: 'nestjs',
        projectRootPath: project,
        workspaceRootPath: workspace,
      },
      undefined
    );

    expect(section).toContain('WORKSPACE ARCHITECTURE ATLAS');
    expect(section).toContain('CATALOG MODULE ARCHITECTURE');
    expect(section).toContain('WORKSPAI PLATFORM CONTRACT');
    expect(section).not.toContain('core/src/');
    expect(section).toContain('admin-api');
    expect(section).toContain('nestjs.standard');
  });

  it('resolves workspace path from project context when parent has marker', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-parent-'));
    tempDirs.push(workspace);
    fs.writeFileSync(path.join(workspace, '.rapidkit-workspace'), '{}');
    const project = path.join(workspace, 'admin-api');
    fs.mkdirSync(project);

    expect(
      resolveWorkspacePathForGrounding({
        type: 'project',
        name: 'admin-api',
        path: project,
        projectRootPath: project,
      })
    ).toBe(workspace);
  });
});
