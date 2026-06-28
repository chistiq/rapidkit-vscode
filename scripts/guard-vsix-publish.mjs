#!/usr/bin/env node

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const options = {
    artifact: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact') {
      options.artifact = argv[index + 1] ?? '';
      index += 1;
    }
  }

  return options;
}

function fail(message) {
  console.error(`[guard-vsix-publish] ${message}`);
  process.exitCode = 1;
}

function guardPublish(options) {
  const artifact = options.artifact ? path.resolve(process.cwd(), options.artifact) : '';
  if (!artifact || !fs.existsSync(artifact)) {
    throw new Error(`VSIX artifact not found: ${artifact || '(missing --artifact)'}`);
  }

  if (process.env.CI !== 'true' && process.env.WORKSPAI_ALLOW_LOCAL_PUBLISH !== '1') {
    throw new Error(
      'Publishing requires CI=true. Set WORKSPAI_ALLOW_LOCAL_PUBLISH=1 only for an explicitly approved emergency release.'
    );
  }

  const expectedCommit = process.env.WORKSPAI_EXPECTED_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if (!expectedCommit) {
    throw new Error('Missing WORKSPAI_EXPECTED_COMMIT_SHA or GITHUB_SHA for publish provenance.');
  }

  const artifactName = process.env.WORKSPAI_VSIX_ARTIFACT_NAME || '';
  const expectedArtifactName = `workspai-vsix-${expectedCommit}`;
  if (artifactName !== expectedArtifactName) {
    throw new Error(
      `VSIX artifact name must be ${expectedArtifactName}, got ${artifactName || '(unset)'}.`
    );
  }

  execFileSync(process.execPath, ['scripts/inspect-vsix-artifact.mjs', '--artifact', artifact], {
    stdio: 'inherit',
  });

  console.log(
    `[guard-vsix-publish] Publish provenance accepted: ${path.basename(
      artifact
    )} from ${expectedArtifactName}.`
  );
}

try {
  guardPublish(parseArgs(process.argv.slice(2)));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
