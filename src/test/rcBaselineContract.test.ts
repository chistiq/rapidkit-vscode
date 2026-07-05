import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { MIN_RAPIDKIT_CLI_VERSION } from '../core/cliVersionCompatibilityContract';

const repoRoot = path.resolve(__dirname, '..', '..');
const roadmapRoot = path.resolve(repoRoot, '..', 'Docs', 'workspai', 'new plan');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function readJson<T>(relPath: string): T {
  return JSON.parse(read(relPath)) as T;
}

function readRoadmapFile(fileName: string): string {
  return fs.readFileSync(path.join(roadmapRoot, fileName), 'utf8');
}

describe('RC baseline contract', () => {
  it('pins the extension RC baseline to rapidkit npm 0.41.4 and extension 0.35.0', () => {
    const packageJson = readJson<{ version: string }>('package.json');
    const matrix = readJson<{ npmTruthBaseline: string }>(
      'releases/enterprise-validation-matrix.json'
    );
    const readme = read('README.md');
    const baseline = readRoadmapFile('WORKSPAI_EXTENSION_RC_BASELINE_2026-06-28.md');

    expect(packageJson.version).toBe('0.35.0');
    expect(MIN_RAPIDKIT_CLI_VERSION).toBe('0.41.4');
    expect(matrix.npmTruthBaseline).toBe('0.41.4');
    expect(readme).toContain('Workspai checks the linked RapidKit CLI capability surface');
    expect(readme).toContain(
      '| RapidKit npm CLI | Latest recommended for enterprise Dashboard, Repair, Studio'
    );
    expect(baseline).toContain('rapidkit@0.41.4');
    expect(baseline).toContain('rapidkit-vscode@0.35.0');
  });

  it('keeps the RC baseline note aligned with closed freeze and telemetry decisions', () => {
    const baseline = readRoadmapFile('WORKSPAI_EXTENSION_RC_BASELINE_2026-06-28.md');

    expect(baseline).toContain('Feature freeze decision: **accepted for RC**');
    expect(baseline).toContain('CLI analytics decision: **local-only for RC**');
    expect(baseline).toContain(
      'UX copy decision: **lock `Run`, `Repair`, and `Artifacts` through RC**'
    );
  });
});
