#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(repoRoot, 'contracts', 'extension-cli-release-policy.v1.json');
const outputPath = path.join(repoRoot, 'contracts', 'official-cli-closure.v1.json');
const checkOnly = process.argv.includes('--check');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildClosure() {
  const policy = readJson(policyPath);
  const version = String(policy.verifiedCliVersion);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-official-cli-closure-'));
  try {
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      `${JSON.stringify({ private: true, dependencies: { workspai: version } }, null, 2)}\n`
    );
    const install = spawnSync(
      'npm',
      [
        'install',
        '--package-lock-only',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--omit=dev',
      ],
      { cwd: tempRoot, encoding: 'utf8' }
    );
    if (install.status !== 0) {
      throw new Error(
        `Could not resolve the official Workspai CLI ${version} closure.\n${install.stderr || install.stdout}`
      );
    }
    const lock = readJson(path.join(tempRoot, 'package-lock.json'));
    const packages = Object.entries(lock.packages ?? {})
      .filter(([key, value]) => key.startsWith('node_modules/') && value && !value.link)
      .map(([key, value]) => ({
        path: key,
        name: typeof value.name === 'string' ? value.name : key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length),
        version: String(value.version ?? ''),
        resolved: String(value.resolved ?? ''),
        integrity: String(value.integrity ?? ''),
        optional: value.optional === true,
      }))
      .filter((entry) => entry.version && entry.resolved && entry.integrity)
      .sort((left, right) => left.path.localeCompare(right.path));

    const workspai = packages.find((entry) => entry.path === 'node_modules/workspai');
    if (!workspai || workspai.version !== version || workspai.name !== 'workspai') {
      throw new Error(`The official closure did not resolve workspai@${version}.`);
    }
    if (!workspai.resolved.startsWith('https://registry.npmjs.org/workspai/-/')) {
      throw new Error('The official Workspai CLI tarball must come from the npm registry.');
    }
    if (!workspai.integrity.startsWith('sha512-')) {
      throw new Error('The official Workspai CLI tarball is missing a sha512 integrity.');
    }

    return {
      schemaVersion: 'workspai-vscode-official-cli-closure.v1',
      cli: { name: 'workspai', version },
      registry: 'https://registry.npmjs.org',
      packages,
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const closure = buildClosure();
const serialized = `${JSON.stringify(closure, null, 2)}\n`;
if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== serialized) {
    console.error('Official CLI closure drifted. Run npm run sync:official-cli.');
    process.exit(1);
  }
  console.log(
    `Official Workspai CLI ${closure.cli.version} closure matches (${closure.packages.length} packages).`
  );
} else {
  fs.writeFileSync(outputPath, serialized);
  console.log(
    `Wrote official Workspai CLI ${closure.cli.version} closure (${closure.packages.length} packages).`
  );
}
