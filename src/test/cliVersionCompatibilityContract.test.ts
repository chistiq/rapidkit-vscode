import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION,
  EXTENSION_CLI_RELEASE_POLICY_SCHEMA_VERSION,
  MIN_RAPIDKIT_CLI_VERSION,
  PUBLISHED_CLI_CONTRACT_SCHEMAS,
  VERIFIED_RAPIDKIT_CLI_VERSION,
} from '../core/cliVersionCompatibilityContract';
import { compareSemver } from '../core/cliVersionPolicy';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('cliVersionCompatibilityContract', () => {
  it('loads the minimum CLI version from the extension-owned release policy', () => {
    expect(MIN_RAPIDKIT_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(VERIFIED_RAPIDKIT_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(EXTENSION_CLI_RELEASE_POLICY_SCHEMA_VERSION).toBe(
      'workspai-vscode-cli-release-policy.v1'
    );
    expect(EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION).toBe(
      'rapidkit-extension-cli-compatibility.v1'
    );
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS.runtimeCommandSurface).toBeTruthy();
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS.cliLogEvent).toBeTruthy();
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS.freshnessMetadata).toBeTruthy();
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS.blockerResolution).toBe('rapidkit-blocker-resolution-v1');
  });

  it('accepts a newer compatible CLI without forcing another extension release', () => {
    const npmPackagePath = path.resolve(
      repoRoot,
      '..',
      'workspai',
      'packages',
      'cli',
      'package.json'
    );
    if (!fs.existsSync(npmPackagePath)) {
      return;
    }

    const npmVersion = (JSON.parse(fs.readFileSync(npmPackagePath, 'utf8')) as { version: string })
      .version;
    expect(compareSemver(npmVersion, MIN_RAPIDKIT_CLI_VERSION)).toBeGreaterThanOrEqual(0);
  });

  it('matches canonical published schemas without inheriting the CLI-owned version floor', () => {
    const npmContractPath = path.resolve(
      repoRoot,
      '..',
      'workspai',
      'packages',
      'cli',
      'contracts',
      'extension-cli-compatibility.v1.json'
    );
    if (!fs.existsSync(npmContractPath)) {
      return;
    }

    const contract = JSON.parse(fs.readFileSync(npmContractPath, 'utf8')) as {
      minimumVerifiedCliVersion: string;
      publishedContractSchemas: Record<string, unknown>;
    };
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS).toEqual(contract.publishedContractSchemas);
    expect(
      compareSemver(MIN_RAPIDKIT_CLI_VERSION, contract.minimumVerifiedCliVersion)
    ).toBeGreaterThanOrEqual(0);
  });
});
