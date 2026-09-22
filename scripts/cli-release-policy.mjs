#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { format, resolveConfig } from 'prettier';

const POLICY_PATH = 'contracts/extension-cli-release-policy.v1.json';
const GETTING_STARTED_PATH = 'docs/GETTING_STARTED.md';
const DOC_BLOCK_START = '<!-- WORKSPAI:CLI-RELEASE-POLICY:START -->';
const DOC_BLOCK_END = '<!-- WORKSPAI:CLI-RELEASE-POLICY:END -->';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeJson(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function compareSemver(left, right) {
  const values = (version) => version.split('-')[0].split('.').map(Number);
  const a = values(left);
  const b = values(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function managedGettingStartedBlock(policy) {
  return [
    DOC_BLOCK_START,
    '',
    `> Extension ${policy.extensionVersion} · verified with Workspai CLI ${policy.verifiedCliVersion} · minimum compatible CLI ${policy.minimumCliVersion}`,
    '',
    DOC_BLOCK_END,
  ].join('\n');
}

function replaceManagedBlock(source, replacement) {
  const start = source.indexOf(DOC_BLOCK_START);
  const end = source.indexOf(DOC_BLOCK_END);
  if (start < 0 || end < start) {
    return source.replace(/^> Extension[^\n]*$/m, replacement);
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end + DOC_BLOCK_END.length)}`;
}

function currentReleaseSection(source) {
  const firstRelease = source.search(/^## v/m);
  if (firstRelease < 0) {
    return '';
  }
  const nextRelease = source.slice(firstRelease + 1).search(/^## v/m);
  return nextRelease < 0
    ? source.slice(firstRelease)
    : source.slice(firstRelease, firstRelease + 1 + nextRelease);
}

function requireIncludes(source, expected, label, errors) {
  if (!source.includes(expected)) {
    errors.push(`${label} must contain: ${expected}`);
  }
}

export async function synchronizeCliReleasePolicy(repoRoot = process.cwd()) {
  const policy = readJson(repoRoot, POLICY_PATH);
  const packageJson = readJson(repoRoot, 'package.json');
  const matrix = readJson(repoRoot, 'releases/enterprise-validation-matrix.json');

  packageJson.version = policy.extensionVersion;
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    workspai: policy.verifiedCliVersion,
  };
  delete matrix.npmTruthBaseline;
  const matrixPath = path.join(repoRoot, 'releases/enterprise-validation-matrix.json');

  const gettingStartedPath = path.join(repoRoot, GETTING_STARTED_PATH);
  const gettingStarted = fs.readFileSync(gettingStartedPath, 'utf8');
  fs.writeFileSync(
    gettingStartedPath,
    replaceManagedBlock(gettingStarted, managedGettingStartedBlock(policy))
  );
  writeJson(repoRoot, 'package.json', packageJson);
  const prettierConfig = (await resolveConfig(matrixPath)) ?? {};
  fs.writeFileSync(
    matrixPath,
    await format(JSON.stringify(matrix), { ...prettierConfig, filepath: matrixPath })
  );
}

export function validateCliReleasePolicy(repoRoot = process.cwd()) {
  const errors = [];
  const policy = readJson(repoRoot, POLICY_PATH);
  const packageJson = readJson(repoRoot, 'package.json');
  const lock = readJson(repoRoot, 'package-lock.json');
  const matrix = readJson(repoRoot, 'releases/enterprise-validation-matrix.json');

  if (policy.schemaVersion !== 'workspai-vscode-cli-release-policy.v1') {
    errors.push(`Unexpected release policy schema: ${String(policy.schemaVersion)}`);
  }
  for (const field of ['extensionVersion', 'minimumCliVersion', 'verifiedCliVersion']) {
    if (!SEMVER.test(String(policy[field] ?? ''))) {
      errors.push(`${POLICY_PATH} has an invalid ${field}.`);
    }
  }
  if (
    SEMVER.test(String(policy.minimumCliVersion ?? '')) &&
    SEMVER.test(String(policy.verifiedCliVersion ?? '')) &&
    compareSemver(policy.verifiedCliVersion, policy.minimumCliVersion) < 0
  ) {
    errors.push('verifiedCliVersion cannot be below minimumCliVersion.');
  }

  if (packageJson.version !== policy.extensionVersion) {
    errors.push(
      `package.json version ${packageJson.version} does not match policy extensionVersion ${policy.extensionVersion}.`
    );
  }
  if (
    lock.version !== policy.extensionVersion ||
    lock.packages?.['']?.version !== policy.extensionVersion
  ) {
    errors.push(
      `package-lock.json extension version must equal policy extensionVersion ${policy.extensionVersion}.`
    );
  }
  if (packageJson.devDependencies?.workspai !== policy.verifiedCliVersion) {
    errors.push(
      `package.json workspai dependency must equal verifiedCliVersion ${policy.verifiedCliVersion}.`
    );
  }
  if (lock.packages?.['']?.devDependencies?.workspai !== policy.verifiedCliVersion) {
    errors.push(
      `package-lock.json root workspai dependency must equal verifiedCliVersion ${policy.verifiedCliVersion}.`
    );
  }
  if (lock.packages?.['node_modules/workspai']?.version !== policy.verifiedCliVersion) {
    errors.push(
      `package-lock.json installed workspai version must equal verifiedCliVersion ${policy.verifiedCliVersion}.`
    );
  }
  const lockedWorkspaiResolution = lock.packages?.['node_modules/workspai']?.resolved;
  if (
    typeof lockedWorkspaiResolution === 'string' &&
    !lockedWorkspaiResolution.includes(`/workspai-${policy.verifiedCliVersion}.tgz`)
  ) {
    errors.push(
      `package-lock.json workspai resolution must target verifiedCliVersion ${policy.verifiedCliVersion}.`
    );
  }
  if (Object.hasOwn(matrix, 'npmTruthBaseline')) {
    errors.push(
      'enterprise-validation-matrix.json must derive CLI truth from the release policy and cannot declare npmTruthBaseline.'
    );
  }

  const gettingStarted = fs.readFileSync(path.join(repoRoot, GETTING_STARTED_PATH), 'utf8');
  requireIncludes(gettingStarted, managedGettingStartedBlock(policy), GETTING_STARTED_PATH, errors);
  requireIncludes(
    gettingStarted,
    `npm install -g workspai@${policy.verifiedCliVersion}`,
    GETTING_STARTED_PATH,
    errors
  );

  const closurePath = 'contracts/official-cli-closure.v1.json';
  const closure = readJson(repoRoot, closurePath);
  const lockedWorkspai = lock.packages?.['node_modules/workspai'];
  const closureWorkspai = Array.isArray(closure.packages)
    ? closure.packages.find((entry) => entry.path === 'node_modules/workspai')
    : undefined;
  if (closure.schemaVersion !== 'workspai-vscode-official-cli-closure.v1') {
    errors.push(`${closurePath} has an unexpected schema.`);
  }
  if (closure.cli?.name !== 'workspai' || closure.cli?.version !== policy.verifiedCliVersion) {
    errors.push(`${closurePath} must pin workspai@${policy.verifiedCliVersion}.`);
  }
  if (
    !closureWorkspai ||
    closureWorkspai.version !== policy.verifiedCliVersion ||
    closureWorkspai.integrity !== lockedWorkspai?.integrity ||
    closureWorkspai.resolved !== lockedWorkspai?.resolved
  ) {
    errors.push(
      `${closurePath} workspai tarball must match the package-lock integrity for ${policy.verifiedCliVersion}.`
    );
  }

  const aggregateNotes = fs.readFileSync(path.join(repoRoot, 'RELEASE_NOTES.md'), 'utf8');
  const currentNotes = currentReleaseSection(aggregateNotes);
  requireIncludes(currentNotes, `## v${policy.extensionVersion}`, 'RELEASE_NOTES.md', errors);
  requireIncludes(
    currentNotes,
    `validated against Workspai CLI ${policy.verifiedCliVersion}`,
    'RELEASE_NOTES.md',
    errors
  );
  requireIncludes(
    currentNotes,
    `Workspai CLI ${policy.minimumCliVersion}+`,
    'RELEASE_NOTES.md',
    errors
  );

  const detailedPath = `releases/RELEASE_NOTES_v${policy.extensionVersion}.md`;
  const detailedNotesPath = path.join(repoRoot, detailedPath);
  if (!fs.existsSync(detailedNotesPath)) {
    errors.push(`Missing current release notes: ${detailedPath}`);
  } else {
    const detailedNotes = fs.readFileSync(detailedNotesPath, 'utf8');
    requireIncludes(
      detailedNotes,
      `validated against Workspai CLI ${policy.verifiedCliVersion}`,
      detailedPath,
      errors
    );
    requireIncludes(
      detailedNotes,
      `Workspai CLI ${policy.minimumCliVersion} or newer`,
      detailedPath,
      errors
    );
    requireIncludes(
      detailedNotes,
      `npm install -g workspai@${policy.verifiedCliVersion}`,
      detailedPath,
      errors
    );
  }

  return { ok: errors.length === 0, errors, policy };
}

async function main() {
  const repoRoot = process.cwd();
  if (process.argv.includes('--write')) {
    await synchronizeCliReleasePolicy(repoRoot);
    console.log(
      'Deterministic CLI release-policy projections were written. Refreshing package-lock.json is the next required step.'
    );
    return;
  }
  const result = validateCliReleasePolicy(repoRoot);
  if (!result.ok) {
    console.error('CLI release policy drift detected:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    console.error(
      'Update the canonical policy, run `npm run sync:cli-release-policy`, and commit every projection.'
    );
    process.exit(1);
  }
  console.log(
    `CLI release policy is synchronized: extension ${result.policy.extensionVersion}, minimum CLI ${result.policy.minimumCliVersion}, verified CLI ${result.policy.verifiedCliVersion}.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
