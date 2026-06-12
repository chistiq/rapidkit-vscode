#!/usr/bin/env node

/**
 * Cross-repo claim parity: website catalog ↔ VS Code extension reality.
 * Run from rapidkit-vscode: npm run test:claim-parity
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vscodeRoot = path.resolve(__dirname, '..');
const workspaiFrontRoot = process.env.WORKSPAI_FRONT_PATH
  ? path.resolve(process.env.WORKSPAI_FRONT_PATH)
  : path.resolve(vscodeRoot, '../workspai-front');

const errors = [];

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing file: ${filePath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function countRegexMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function runNodeScript(label, scriptPath, cwd) {
  if (!fs.existsSync(scriptPath)) {
    errors.push(`Missing ${label} script: ${scriptPath}`);
    return;
  }

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    errors.push(`${label} failed.`);
    if (result.stderr) {
      errors.push(result.stderr.trim());
    }
    if (result.stdout) {
      errors.push(result.stdout.trim());
    }
  }
}

function extractCatalogBlock(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  if (start < 0) {
    return '';
  }
  const nextConst = source.indexOf('\nconst ', start + 1);
  return nextConst > start ? source.slice(start, nextConst) : source.slice(start);
}

function main() {
  console.log('[claim-parity] Checking website ↔ extension alignment...\n');

  const catalogPath = path.join(workspaiFrontRoot, 'lib/features/catalog.ts');
  const manifestPath = path.join(workspaiFrontRoot, 'data/rapidkit-free-modules.manifest.json');
  const aiFreeFeaturesPath = path.join(vscodeRoot, 'src/commands/aiFreeFeatures.ts');
  const contractPath = path.join(vscodeRoot, 'contracts/runtime-command-surface.v1.json');
  const packageJsonPath = path.join(vscodeRoot, 'package.json');

  const catalogSource = read(catalogPath);
  const aiFreeSource = read(aiFreeFeaturesPath);
  const packageJson = JSON.parse(read(packageJsonPath) || '{}');
  const contract = JSON.parse(read(contractPath) || '{}');

  if (!catalogSource || !aiFreeSource) {
    reportAndExit();
  }

  const aiFeaturesBlock = extractCatalogBlock(catalogSource, 'aiFeatures');
  const shippedAiFeatures = countRegexMatches(
    aiFeaturesBlock,
    /available:\s*true/g
  );
  const incidentStudioCard = /slug:\s*'incident-studio'/.test(aiFeaturesBlock);
  const coreFreeAiActions = shippedAiFeatures - (incidentStudioCard ? 1 : 0);

  if (coreFreeAiActions !== 14) {
    errors.push(
      `Expected 14 shipped core free AI features in catalog (excluding incident-studio baseline card); found ${coreFreeAiActions}.`
    );
  }

  const recipeBlock = aiFreeSource.slice(
    aiFreeSource.indexOf('const AI_RECIPES'),
    aiFreeSource.indexOf('const AI_QUICK_ACTIONS')
  );
  const recipeCount = countRegexMatches(recipeBlock, /id:\s*'[^']+'/g);
  if (recipeCount !== 11) {
    errors.push(`Expected 11 AI recipes in extension; found ${recipeCount}.`);
  }

  if (!fs.existsSync(manifestPath)) {
    errors.push(`Missing module manifest: ${manifestPath}`);
  }

  const defaultKitEnum =
    packageJson.contributes?.configuration?.properties?.['workspai.defaultKit']?.enum ?? [];
  const contractKits = contract.scaffoldKits ?? [];
  if (JSON.stringify(defaultKitEnum) !== JSON.stringify(contractKits)) {
    errors.push('Extension defaultKit enum diverges from runtime command surface contract.');
  }

  runNodeScript(
    'workspai-front check-rapidkit-module-manifest.mjs',
    path.join(workspaiFrontRoot, 'scripts/check-rapidkit-module-manifest.mjs'),
    workspaiFrontRoot
  );
  runNodeScript(
    'workspai-front check-stack-claim-parity.mjs',
    path.join(workspaiFrontRoot, 'scripts/check-stack-claim-parity.mjs'),
    workspaiFrontRoot
  );
  runNodeScript(
    'workspai-front check-feature-claim-parity.mjs',
    path.join(workspaiFrontRoot, 'scripts/check-feature-claim-parity.mjs'),
    workspaiFrontRoot
  );
  runNodeScript(
    'workspai-front check-product-surface-parity.mjs',
    path.join(workspaiFrontRoot, 'scripts/check-product-surface-parity.mjs'),
    workspaiFrontRoot
  );

  const workspaiParityScript = path.join(workspaiFrontRoot, 'scripts/check-free-claim-parity.mjs');
  runNodeScript('workspai-front check-free-claim-parity.mjs', workspaiParityScript, workspaiFrontRoot);

  const localVitest = path.join(vscodeRoot, 'node_modules/vitest/vitest.mjs');
  const vitestCommand = fs.existsSync(localVitest) ? process.execPath : 'npx';
  const vitestArgs = fs.existsSync(localVitest)
    ? [localVitest, 'run', 'src/test/runtimeCommandSurfaceParity.test.ts', 'src/test/incidentStudioConsolidation.test.ts']
    : ['vitest', 'run', 'src/test/runtimeCommandSurfaceParity.test.ts', 'src/test/incidentStudioConsolidation.test.ts'];

  const vitest = spawnSync(
    vitestCommand,
    vitestArgs,
    { cwd: vscodeRoot, encoding: 'utf8', shell: !fs.existsSync(localVitest) }
  );
  if (vitest.status !== 0) {
    errors.push('Extension runtime/incident consolidation parity tests failed.');
    if (vitest.stdout) {
      errors.push(vitest.stdout.trim());
    }
  }

  reportAndExit();
}

function reportAndExit() {
  if (errors.length > 0) {
    console.error('\n[claim-parity] FAILED:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('[claim-parity] Website ↔ extension claim parity passed.');
}

main();
