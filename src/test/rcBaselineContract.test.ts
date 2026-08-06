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
  it('pins the current release line while preserving the historical RC record', () => {
    const packageJson = readJson<{ version: string }>('package.json');
    const matrix = readJson<{ npmTruthBaseline: string }>(
      'releases/enterprise-validation-matrix.json'
    );
    const baseline = readRoadmapFile('WORKSPAI_EXTENSION_RC_BASELINE_2026-06-28.md');

    expect(packageJson.version).toBe('0.37.0');
    expect(MIN_RAPIDKIT_CLI_VERSION).toBe('0.53.0');
    expect(matrix.npmTruthBaseline).toBe('0.53.0');
    expect(baseline).toContain('rapidkit@0.42.0');
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
