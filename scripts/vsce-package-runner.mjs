#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

export function resolvePinnedPackageManagerBin(env = process.env) {
  const npmExecPath = typeof env.npm_execpath === 'string' ? env.npm_execpath.trim() : '';
  if (!npmExecPath) {
    throw new Error(
      'VSIX packaging must run through `corepack npm run ...` so the pinned npm executable is available.'
    );
  }
  return path.dirname(npmExecPath);
}

export function buildVSCEEnvironment(
  env = process.env,
  delimiter = path.delimiter,
  packageManagerBin = resolvePinnedPackageManagerBin(env)
) {
  const existingPath = env.PATH ?? env.Path ?? '';
  return {
    ...env,
    PATH: existingPath ? `${packageManagerBin}${delimiter}${existingPath}` : packageManagerBin,
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function createPinnedNpmShim(env) {
  const npmExecPath = typeof env.npm_execpath === 'string' ? env.npm_execpath.trim() : '';
  if (!npmExecPath) {
    resolvePinnedPackageManagerBin(env);
  }
  const nodeExecPath = env.npm_node_execpath || process.execPath;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-vsce-npm-'));
  const posixShim = path.join(directory, 'npm');
  const windowsShim = path.join(directory, 'npm.cmd');
  fs.writeFileSync(
    posixShim,
    `#!/bin/sh\nexec ${shellQuote(nodeExecPath)} ${shellQuote(npmExecPath)} "$@"\n`,
    { mode: 0o755 }
  );
  fs.writeFileSync(windowsShim, `@"${nodeExecPath}" "${npmExecPath}" %*\r\n`);
  return {
    directory,
    dispose() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function runVSCE(args, options = {}) {
  const cwd = options.cwd ?? repositoryRoot;
  const vsceCli = path.join(cwd, 'node_modules', '@vscode', 'vsce', 'vsce');
  const env = options.env ?? process.env;
  const npmShim = createPinnedNpmShim(env);
  try {
    const result = spawnSync(process.execPath, [vsceCli, ...args], {
      cwd,
      env: buildVSCEEnvironment(env, path.delimiter, npmShim.directory),
      encoding: 'utf8',
      stdio: options.stdio ?? 'inherit',
    });
    if (result.error) {
      throw result.error;
    }
    return result.status ?? 1;
  } finally {
    npmShim.dispose();
  }
}

function main() {
  try {
    process.exitCode = runVSCE(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
