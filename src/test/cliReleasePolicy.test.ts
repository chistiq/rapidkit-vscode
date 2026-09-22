import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  synchronizeCliReleasePolicy,
  validateCliReleasePolicy,
} from '../../scripts/cli-release-policy.mjs';
import releasePolicy from '../../contracts/extension-cli-release-policy.v1.json';

const repoRoot = path.resolve(__dirname, '..', '..');

function policyFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-cli-policy-'));
  const files = [
    'contracts/extension-cli-release-policy.v1.json',
    'contracts/official-cli-closure.v1.json',
    'docs/GETTING_STARTED.md',
    'releases/enterprise-validation-matrix.json',
    `releases/RELEASE_NOTES_v${releasePolicy.extensionVersion}.md`,
    'RELEASE_NOTES.md',
    'package.json',
    'package-lock.json',
  ];
  for (const relativePath of files) {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, relativePath), destination);
  }
  return root;
}

describe('CLI release policy projections', () => {
  it('keeps every operational and current-release projection on one canonical policy', () => {
    const result = validateCliReleasePolicy(repoRoot);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails closed when the npm dependency drifts from the verified runtime', () => {
    const root = policyFixture();
    try {
      const packagePath = path.join(root, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      packageJson.devDependencies.workspai = '0.0.0';
      fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

      const result = validateCliReleasePolicy(root);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain(
        `package.json workspai dependency must equal verifiedCliVersion ${releasePolicy.verifiedCliVersion}.`
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('regenerates deterministic projections from the canonical policy', async () => {
    const root = policyFixture();
    try {
      const packagePath = path.join(root, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      packageJson.version = '0.0.0';
      packageJson.devDependencies.workspai = '0.0.0';
      fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

      const matrixPath = path.join(root, 'releases/enterprise-validation-matrix.json');
      const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
      matrix.npmTruthBaseline = '0.0.0';
      fs.writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);

      await synchronizeCliReleasePolicy(root);
      expect(validateCliReleasePolicy(root)).toMatchObject({ ok: true, errors: [] });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
