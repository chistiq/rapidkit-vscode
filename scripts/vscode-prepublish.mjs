#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channel = process.env.WORKSPAI_VSIX_CHANNEL?.trim() || 'release';
if (channel !== 'release' && channel !== 'local-candidate') {
  throw new Error(`Unsupported VSIX build channel: ${channel}`);
}

const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const buildScript = channel === 'release' ? 'build:release' : 'build';
const result = spawnSync(corepack, ['npm', 'run', buildScript], {
  env: process.env,
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`${buildScript} failed with exit code ${String(result.status)}.`);
}

// vsce runs this script immediately before it walks dist/. Marketplace
// release VSIX must ship the official CLI closure only — not a second
// embedded runtime. build:release still produces dist/workspai-runtime for
// local smoke/F5; strip it here so the packed artifact stays channel-correct.
if (channel === 'release') {
  fs.rmSync(path.join(repositoryRoot, 'dist', 'workspai-runtime'), {
    recursive: true,
    force: true,
  });
}
