#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { findLocalPathViolations, looksBinary } from './local-path-guard.mjs';

const REQUIRED_FILES = [
  'extension/package.json',
  'extension/dist/extension.js',
  'extension/dist/webview.js',
  'extension/dist/webview.css',
  'extension/dist/graphWorker.js',
  'extension/dist/sidebar.js',
  'extension/dist/sidebar.css',
  'extension/contracts/official-cli-closure.v1.json',
  'extension/contracts/runtime-command-surface.v1.json',
  'extension/contracts/extension-cli-compatibility.v1.json',
  'extension/contracts/extension-cli-release-policy.v1.json',
  'extension/contracts/repository-analysis.v1.json',
  'extension/contracts/workspace-intelligence/workspace-model.v1.json',
  'extension/contracts/workspace-intelligence/workspace-graph-recording.v1.json',
  'extension/contracts/workspace-intelligence/workspace-verify.v1.json',
  'extension/contracts/workspace-intelligence/studio-blocker-handoff.v1.json',
  'extension/media/icons/icon.png',
  'extension/walkthroughs/open-dashboard.md',
];

const DENIED_PATTERNS = [
  /^extension\/\.workspai-cli-local\.json$/,
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

const EMBEDDED_RUNTIME_FILES = [
  'extension/dist/workspai-runtime/manifest.json',
  'extension/dist/workspai-runtime/launcher.cjs',
  'extension/dist/workspai-runtime/dist/index.mjs',
  'extension/dist/workspai-runtime/terminal-bin/workspai',
  'extension/dist/workspai-runtime/terminal-bin/workspai.cmd',
];

const ALLOWED_NODE_MODULE_METADATA =
  /^extension\/node_modules\/[^/]+\/(?:package\.json|README\.md)$/;

function parseArgs(argv) {
  const options = {
    artifact: '',
    strictSizeMb: 25,
    channel: 'release',
    cliVersion: '',
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
    if (arg === '--channel') {
      options.channel = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--cli-version') {
      options.cliVersion = argv[index + 1] ?? '';
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

function readJsonEntry(zip, entryName) {
  const entry = zip.getEntry(entryName);
  if (!entry) {
    throw new Error(`VSIX is missing ${entryName}.`);
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
  const requiredFiles =
    options.channel === 'local-candidate'
      ? [...REQUIRED_FILES, ...EMBEDDED_RUNTIME_FILES]
      : REQUIRED_FILES;
  const missing = requiredFiles.filter((file) => !names.has(file));
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

  const localPathViolations = entries.flatMap((entry) => {
    if (entry.entryName.startsWith('extension/node_modules/')) {
      return [];
    }
    const data = entry.getData();
    return looksBinary(data)
      ? []
      : findLocalPathViolations(data.toString('utf8'), entry.entryName, {
          repositoryRoot: process.cwd(),
          homeDirectory: process.env.HOME || process.env.USERPROFILE || '',
        });
  });
  if (localPathViolations.length > 0) {
    throw new Error(
      `VSIX contains machine-local paths: ${localPathViolations
        .slice(0, 20)
        .map((entry) => `${entry.file}:${entry.line} [${entry.kind}]`)
        .join(', ')}`
    );
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

  const releasePolicy = readJsonEntry(
    zip,
    'extension/contracts/extension-cli-release-policy.v1.json'
  );
  if (options.channel !== 'release' && options.channel !== 'local-candidate') {
    throw new Error(`Unsupported VSIX inspection channel: ${options.channel}`);
  }
  const closure = readJsonEntry(zip, 'extension/contracts/official-cli-closure.v1.json');
  const closureWorkspai = Array.isArray(closure.packages)
    ? closure.packages.find((entry) => entry.path === 'node_modules/workspai')
    : undefined;
  if (
    closure.schemaVersion !== 'workspai-vscode-official-cli-closure.v1' ||
    closure.cli?.name !== 'workspai' ||
    closure.cli?.version !== releasePolicy.verifiedCliVersion ||
    closureWorkspai?.version !== releasePolicy.verifiedCliVersion ||
    !String(closureWorkspai?.integrity ?? '').startsWith('sha512-')
  ) {
    throw new Error('VSIX official CLI closure does not match the verified Workspai CLI pin.');
  }

  const runtimePrefix = 'extension/dist/workspai-runtime/';
  let bundledCliVersion = releasePolicy.verifiedCliVersion;
  let reportedChannel = options.channel;
  if (options.channel === 'release') {
    const embeddedRuntime = entries.filter((entry) => entry.entryName.startsWith(runtimePrefix));
    if (embeddedRuntime.length > 0) {
      throw new Error('Release VSIX must not embed a second Workspai CLI runtime.');
    }
  } else {
    const runtimeManifest = readJsonEntry(zip, 'extension/dist/workspai-runtime/manifest.json');
    const expectedRuntimeVersion = options.cliVersion;
    const expectedDistribution = options.channel === 'release' ? 'release' : 'local-vsix';
    if (!expectedRuntimeVersion) {
      throw new Error('Local candidate inspection requires --cli-version.');
    }
    if (
      runtimeManifest.schemaVersion !== 'workspai-vscode-bundled-cli-runtime.v1' ||
      runtimeManifest.channel !== options.channel ||
      runtimeManifest.distribution !== expectedDistribution ||
      runtimeManifest.cli?.name !== 'workspai' ||
      runtimeManifest.cli?.version !== expectedRuntimeVersion ||
      runtimeManifest.entry !== 'launcher.cjs' ||
      runtimeManifest.terminal?.bin !== 'terminal-bin' ||
      runtimeManifest.terminal?.command !== 'workspai' ||
      runtimeManifest.integrity !== 'sha256' ||
      !Array.isArray(runtimeManifest.files) ||
      runtimeManifest.files.length === 0
    ) {
      throw new Error(
        `VSIX bundled CLI runtime is incompatible with the ${options.channel} packaging contract.`
      );
    }

    const declaredRuntimePaths = runtimeManifest.files.map((file) => file.path);
    const duplicateRuntimePaths = declaredRuntimePaths.filter(
      (file, index) => declaredRuntimePaths.indexOf(file) !== index
    );
    if (
      duplicateRuntimePaths.length > 0 ||
      declaredRuntimePaths.some(
        (file) =>
          typeof file !== 'string' ||
          file.length === 0 ||
          file.startsWith('/') ||
          file.split('/').includes('..')
      )
    ) {
      throw new Error('VSIX bundled CLI manifest contains duplicate or unsafe paths.');
    }

    const actualRuntimePaths = entries
      .map((entry) => entry.entryName)
      .filter(
        (entryName) =>
          entryName.startsWith(runtimePrefix) && entryName !== `${runtimePrefix}manifest.json`
      )
      .map((entryName) => entryName.slice(runtimePrefix.length))
      .sort((left, right) => left.localeCompare(right));
    const expectedRuntimePaths = [...declaredRuntimePaths].sort((left, right) =>
      left.localeCompare(right)
    );
    if (JSON.stringify(actualRuntimePaths) !== JSON.stringify(expectedRuntimePaths)) {
      throw new Error('VSIX bundled CLI file inventory does not exactly match its manifest.');
    }

    for (const file of runtimeManifest.files) {
      const entryName = `${runtimePrefix}${file.path}`;
      const entry = zip.getEntry(entryName);
      const data = entry?.getData();
      const digest = data ? crypto.createHash('sha256').update(data).digest('hex') : '';
      if (
        !entry ||
        !data ||
        data.length !== file.size ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        digest !== file.sha256
      ) {
        throw new Error(`VSIX bundled CLI inventory mismatch: ${entryName}`);
      }
    }
    bundledCliVersion = runtimeManifest.cli.version;
    reportedChannel = runtimeManifest.channel;
  }

  const summary = {
    artifact: path.basename(artifactPath),
    sizeMb: Number((sizeBytes / 1024 / 1024).toFixed(2)),
    files: entries.length,
    requiredFiles: REQUIRED_FILES.length,
    bundledCliVersion,
    channel: reportedChannel,
  };
  console.log(`VSIX artifact smoke passed: ${JSON.stringify(summary)}`);
}

try {
  inspectVsix(parseArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
