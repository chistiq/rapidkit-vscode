import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION,
  MIN_RAPIDKIT_CLI_VERSION,
  PUBLISHED_CLI_CONTRACT_SCHEMAS,
} from '../core/cliVersionCompatibilityContract';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('cliVersionCompatibilityContract', () => {
  it('loads the minimum CLI version from the bundled npm-synced contract', () => {
    expect(MIN_RAPIDKIT_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(EXTENSION_CLI_COMPATIBILITY_SCHEMA_VERSION).toBe(
      'rapidkit-extension-cli-compatibility.v1'
    );
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS.runtimeCommandSurface).toBeTruthy();
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS.cliLogEvent).toBeTruthy();
    expect(PUBLISHED_CLI_CONTRACT_SCHEMAS.freshnessMetadata).toBeTruthy();
  });

  it('matches rapidkit-npm package version in sibling monorepo layout', () => {
    const npmPackagePath = path.resolve(repoRoot, '..', 'rapidkit-npm', 'package.json');
    if (!fs.existsSync(npmPackagePath)) {
      return;
    }

    const npmVersion = (JSON.parse(fs.readFileSync(npmPackagePath, 'utf8')) as { version: string })
      .version;
    expect(MIN_RAPIDKIT_CLI_VERSION).toBe(npmVersion);
  });

  it('matches the canonical npm contracts/extension-cli-compatibility.v1.json mirror', () => {
    const npmContractPath = path.resolve(
      repoRoot,
      '..',
      'rapidkit-npm',
      'contracts',
      'extension-cli-compatibility.v1.json'
    );
    if (!fs.existsSync(npmContractPath)) {
      return;
    }

    const contract = JSON.parse(fs.readFileSync(npmContractPath, 'utf8')) as {
      minimumVerifiedCliVersion: string;
    };
    expect(MIN_RAPIDKIT_CLI_VERSION).toBe(contract.minimumVerifiedCliVersion);
  });
});
