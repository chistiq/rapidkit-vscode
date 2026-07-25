#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const REQUIRED_FILES = [
  'extension/package.json',
  'extension/dist/extension.js',
  'extension/dist/webview.js',
  'extension/dist/webview.css',
  'extension/dist/graphWorker.js',
  'extension/dist/sidebar.js',
  'extension/dist/sidebar.css',
  'extension/contracts/runtime-command-surface.v1.json',
  'extension/contracts/extension-cli-compatibility.v1.json',
  'extension/contracts/workspace-intelligence/workspace-model.v1.json',
  'extension/contracts/workspace-intelligence/workspace-graph-recording.v1.json',
  'extension/contracts/workspace-intelligence/workspace-verify.v1.json',
  'extension/contracts/workspace-intelligence/studio-blocker-handoff.v1.json',
  'extension/media/icons/icon.png',
  'extension/walkthroughs/open-dashboard.md',
];

const DENIED_PATTERNS = [
  /^extension\/src\//,
  /^extension\/scripts\//,
  /^extension\/\.github\//,
  /^extension\/test-results\//,
  /^extension\/artifacts\//,
  /^extension\/coverage\//,
  /^extension\/releases\//,
  /^extension\/webview-ui\//,
  /\.map$/,
  /\.test\.(js|ts|tsx)$/,
  /\.spec\.(js|ts|tsx)$/,
];

const ALLOWED_NODE_MODULE_METADATA = /^extension\/node_modules\/[^/]+\/(?:package\.json|README\.md)$/;

function parseArgs(argv) {
  const options = {
    artifact: '',
    strictSizeMb: 25,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact') {
      options.artifact = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--strict-size-mb') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.strictSizeMb = value;
      }
      index += 1;
      continue;
    }
  }

  return options;
}

function findSingleVsix(cwd) {
  const matches = fs
    .readdirSync(cwd)
    .filter((entry) => entry.endsWith('.vsix'))
    .map((entry) => path.join(cwd, entry));

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one VSIX artifact in ${cwd}, found ${matches.length}: ${matches
        .map((entry) => path.basename(entry))
        .join(', ')}`
    );
  }

  return matches[0];
}

function readPackageJson(zip) {
  const entry = zip.getEntry('extension/package.json');
  if (!entry) {
    throw new Error('VSIX is missing extension/package.json.');
  }
  return JSON.parse(entry.getData().toString('utf8'));
}

function inspectVsix(options) {
  const artifactPath = options.artifact
    ? path.resolve(process.cwd(), options.artifact)
    : findSingleVsix(process.cwd());

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`VSIX artifact not found: ${artifactPath}`);
  }

  const sizeBytes = fs.statSync(artifactPath).size;
  const maxBytes = options.strictSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new Error(
      `VSIX artifact is ${(sizeBytes / 1024 / 1024).toFixed(2)}MB, above ${options.strictSizeMb}MB.`
    );
  }

  const zip = new AdmZip(artifactPath);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const names = new Set(entries.map((entry) => entry.entryName));
  const missing = REQUIRED_FILES.filter((file) => !names.has(file));
  if (missing.length > 0) {
    throw new Error(`VSIX missing required files: ${missing.join(', ')}`);
  }

  const denied = entries
    .map((entry) => entry.entryName)
    .filter((name) => {
      if (name.startsWith('extension/node_modules/')) {
        return !ALLOWED_NODE_MODULE_METADATA.test(name);
      }
      return DENIED_PATTERNS.some((pattern) => pattern.test(name));
    });
  if (denied.length > 0) {
    throw new Error(`VSIX contains denied development files: ${denied.slice(0, 20).join(', ')}`);
  }

  const packageJson = readPackageJson(zip);
  if (packageJson.main !== './dist/extension.js') {
    throw new Error(`VSIX package.json main must be ./dist/extension.js, got ${packageJson.main}`);
  }
  if (!packageJson.contributes?.commands?.length) {
    throw new Error('VSIX package.json is missing contributed commands.');
  }
  if (!packageJson.contributes?.views || Object.keys(packageJson.contributes.views).length === 0) {
    throw new Error('VSIX package.json is missing contributed views.');
  }

  const summary = {
    artifact: path.basename(artifactPath),
    sizeMb: Number((sizeBytes / 1024 / 1024).toFixed(2)),
    files: entries.length,
    requiredFiles: REQUIRED_FILES.length,
  };
  console.log(`VSIX artifact smoke passed: ${JSON.stringify(summary)}`);
}

try {
  inspectVsix(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
