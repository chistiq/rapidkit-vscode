#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const DEFAULT_MATRIX_PATH = 'releases/enterprise-validation-matrix.json';

function parseArgs(argv) {
  const options = {
    matrix: DEFAULT_MATRIX_PATH,
    requireCanonical: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--matrix') {
      options.matrix = argv[index + 1] ?? DEFAULT_MATRIX_PATH;
      index += 1;
    } else if (arg === '--require-canonical') {
      options.requireCanonical = true;
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compareSemver(left, right) {
  const parts = (value) =>
    String(value)
      .split('-')[0]
      .split('.')
      .map((entry) => Number.parseInt(entry, 10) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length, 3); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function requireFile(repoRoot, relativePath, errors) {
  const filePath = path.resolve(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing evidence file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function validateScenario(repoRoot, scenario, errors) {
  if (!scenario || typeof scenario !== 'object') {
    errors.push('Scenario must be an object.');
    return;
  }
  for (const key of ['id', 'label', 'category', 'priority']) {
    if (typeof scenario[key] !== 'string' || !scenario[key].trim()) {
      errors.push(`Scenario ${scenario.id ?? '<unknown>'} is missing ${key}.`);
    }
  }
  if (!Array.isArray(scenario.evidence) || scenario.evidence.length === 0) {
    errors.push(`Scenario ${scenario.id ?? '<unknown>'} has no evidence files.`);
    return;
  }
  if (!Array.isArray(scenario.requiredSnippets)) {
    errors.push(`Scenario ${scenario.id ?? '<unknown>'} has no requiredSnippets array.`);
    return;
  }

  const evidenceText = scenario.evidence
    .map((relativePath) => requireFile(repoRoot, relativePath, errors))
    .join('\n');
  for (const snippet of scenario.requiredSnippets) {
    if (typeof snippet !== 'string' || !snippet.trim()) {
      errors.push(`Scenario ${scenario.id} contains an empty snippet.`);
      continue;
    }
    if (!evidenceText.includes(snippet)) {
      errors.push(`Scenario ${scenario.id} missing snippet "${snippet}".`);
    }
  }
}

function validatePackageScripts(repoRoot, errors) {
  const packageJson = readJson(path.resolve(repoRoot, 'package.json'));
  const scripts = packageJson.scripts ?? {};
  const requiredScripts = {
    typecheck: 'tsc --noEmit && corepack npm run webview:typecheck',
    lint: 'eslint src --ext ts',
    test: 'vitest run',
    'package:ci':
      'corepack npm run build && node scripts/vsce-package-runner.mjs package --no-dependencies --out rapidkit-vscode-${npm_package_version}.vsix',
    'smoke:vsix-artifact':
      'node scripts/inspect-vsix-artifact.mjs --artifact rapidkit-vscode-${npm_package_version}.vsix',
    'release:audit-gate': 'node scripts/npm-audit-gate.mjs --level high',
    'publish:ci':
      'corepack npm run publish:guard && vsce publish --packagePath rapidkit-vscode-${npm_package_version}.vsix',
  };

  for (const [scriptName, expected] of Object.entries(requiredScripts)) {
    if (scripts[scriptName] !== expected) {
      errors.push(`package.json script ${scriptName} drifted. Expected: ${expected}`);
    }
  }
}

function validateNpmBaseline(repoRoot, matrix, errors, options = {}) {
  const workspaiCliRoot = options.workspaiCliRoot
    ? path.resolve(options.workspaiCliRoot)
    : process.env.WORKSPAI_CLI_REPO_PATH
      ? path.resolve(process.env.WORKSPAI_CLI_REPO_PATH)
      : path.resolve(repoRoot, '..', 'workspai', 'packages', 'cli');
  const npmPackagePath = path.resolve(workspaiCliRoot, 'package.json');
  const npmCompatibilityPath = path.resolve(
    workspaiCliRoot,
    'contracts',
    'extension-cli-compatibility.v1.json'
  );
  const extensionCompatibilityPath = path.resolve(
    repoRoot,
    'contracts',
    'extension-cli-compatibility.v1.json'
  );

  if (!fs.existsSync(extensionCompatibilityPath)) {
    errors.push('Extension compatibility contract is missing.');
    return;
  }

  const extensionCompatibility = readJson(extensionCompatibilityPath).minimumVerifiedCliVersion;

  if (!fs.existsSync(npmPackagePath) || !fs.existsSync(npmCompatibilityPath)) {
    if (options.requireCanonical) {
      errors.push(
        `Cannot verify canonical CLI truth baseline at ${workspaiCliRoot}. ` +
          'Set WORKSPAI_CLI_REPO_PATH to the checked-out workspai/packages/cli directory.'
      );
    }
    return;
  }

  const npmVersion = readJson(npmPackagePath).version;
  const npmCompatibility = readJson(npmCompatibilityPath).minimumVerifiedCliVersion;
  if (matrix.npmTruthBaseline !== npmVersion) {
    errors.push(
      `Matrix npmTruthBaseline ${matrix.npmTruthBaseline} does not match npm ${npmVersion}.`
    );
  }
  if (extensionCompatibility !== npmCompatibility) {
    errors.push(
      `extension compatibility ${extensionCompatibility} does not match npm compatibility ${npmCompatibility}.`
    );
  }
  if (compareSemver(matrix.npmTruthBaseline, extensionCompatibility) < 0) {
    errors.push(
      `Matrix npmTruthBaseline ${matrix.npmTruthBaseline} is below extension minimum ${extensionCompatibility}.`
    );
  }
}

export function validateEnterpriseValidationMatrix(
  repoRoot,
  matrixPath = DEFAULT_MATRIX_PATH,
  options = {}
) {
  const errors = [];
  const resolvedMatrixPath = path.resolve(repoRoot, matrixPath);
  const matrix = readJson(resolvedMatrixPath);

  if (matrix.schemaVersion !== 'workspai-enterprise-validation-matrix.v1') {
    errors.push(`Unexpected matrix schemaVersion: ${matrix.schemaVersion}`);
  }
  if (!Array.isArray(matrix.scenarios) || matrix.scenarios.length === 0) {
    errors.push('Enterprise validation matrix must contain scenarios.');
  } else {
    const seenIds = new Set();
    for (const scenario of matrix.scenarios) {
      if (seenIds.has(scenario.id)) {
        errors.push(`Duplicate scenario id: ${scenario.id}`);
      }
      seenIds.add(scenario.id);
      validateScenario(repoRoot, scenario, errors);
    }
  }

  validatePackageScripts(repoRoot, errors);
  validateNpmBaseline(repoRoot, matrix, errors, options);

  return {
    ok: errors.length === 0,
    errors,
    scenarioCount: Array.isArray(matrix.scenarios) ? matrix.scenarios.length : 0,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const result = validateEnterpriseValidationMatrix(repoRoot, options.matrix, {
    requireCanonical: options.requireCanonical,
  });
  if (!result.ok) {
    console.error('Enterprise validation matrix failed:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log(`Enterprise validation matrix passed (${result.scenarioCount} scenarios).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
