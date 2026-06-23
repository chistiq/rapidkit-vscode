import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWorkspaceModelPromptSection,
  readWorkspaceModelReport,
  workspaceModelToAnalyzeEvidenceSlice,
} from '../core/workspaceModelReader';

describe('workspaceModelReader', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
  });

  it('reads workspace model report and maps to analyze evidence slice', async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'rapidkit-ws-model-'));
    tempDirs.push(workspacePath);
    const reportPath = path.join(workspacePath, '.rapidkit', 'reports', 'workspace-model.json');
    await fs.ensureDir(path.dirname(reportPath));
    await fs.writeJSON(reportPath, {
      schemaVersion: 'workspace-model.v1',
      generatedAt: '2026-06-15T10:00:00.000Z',
      workspace: { name: 'demo', type: 'polyglot' },
      identity: { workspaceType: 'polyglot', runtimeFamilies: ['node'] },
      summary: { projectCount: 1, frameworks: ['nestjs'] },
      projects: [
        {
          name: 'api',
          path: 'api',
          kind: 'backend',
          runtime: 'node',
          framework: 'nestjs',
          kit: 'nestjs.standard',
          commands: { fleetStages: ['test', 'build'] },
          importantFiles: ['src/main.ts', 'Dockerfile'],
        },
      ],
      validation: { status: 'passed', errors: 0, warnings: 0 },
    });

    const report = await readWorkspaceModelReport(workspacePath);
    const section = buildWorkspaceModelPromptSection(report);
    const slice = workspaceModelToAnalyzeEvidenceSlice(workspacePath, report!);

    expect(report?.summary?.projectCount).toBe(1);
    expect(section).toContain('WORKSPACE MODEL');
    expect(section).toContain('nestjs.standard');
    expect(slice.projects[0]).toMatchObject({
      name: 'api',
      runtime: 'node',
      framework: 'nestjs',
      hasTests: true,
      hasDockerfile: true,
    });
  });
});
