import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  MIN_RAPIDKIT_CLI_VERSION,
  VERIFIED_RAPIDKIT_CLI_VERSION,
} from '../core/cliVersionCompatibilityContract';
import releasePolicy from '../../contracts/extension-cli-release-policy.v1.json';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function readJson<T>(relPath: string): T {
  return JSON.parse(read(relPath)) as T;
}

describe('Release baseline contract', () => {
  it('pins the current release line to the repository-owned CLI policy', () => {
    const packageJson = readJson<{ version: string }>('package.json');
    const matrix = readJson<Record<string, unknown>>('releases/enterprise-validation-matrix.json');

    expect(packageJson.version).toBe(releasePolicy.extensionVersion);
    expect(MIN_RAPIDKIT_CLI_VERSION).toBe(releasePolicy.minimumCliVersion);
    expect(VERIFIED_RAPIDKIT_CLI_VERSION).toBe(releasePolicy.verifiedCliVersion);
    expect(matrix).not.toHaveProperty('npmTruthBaseline');
    expect(matrix.schemaVersion).toBe('workspai-enterprise-validation-matrix.v1');
    expect(matrix.generatedFor).toBe('rapidkit-vscode');
  });

  it('keeps shipped release documentation aligned with the current extension and CLI baseline', () => {
    const { version } = readJson<{ version: string }>('package.json');
    const notes = read('RELEASE_NOTES.md');
    const detailedNotes = read(`releases/RELEASE_NOTES_v${version}.md`);

    expect(read('CHANGELOG.md')).toContain(`## [${version}]`);
    expect(notes).toContain(`## v${version}`);
    expect(notes).toContain(`Workspai CLI ${VERIFIED_RAPIDKIT_CLI_VERSION}`);
    expect(detailedNotes).toContain(`# Workspai VS Code v${version}`);
    expect(detailedNotes).toContain(`workspai@${VERIFIED_RAPIDKIT_CLI_VERSION}`);
    expect(detailedNotes).toContain(
      `Workspai CLI ${MIN_RAPIDKIT_CLI_VERSION} or newer; verified runtime: ${VERIFIED_RAPIDKIT_CLI_VERSION}`
    );
  });
});
