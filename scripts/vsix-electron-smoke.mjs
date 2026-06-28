#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { runTests } from '@vscode/test-electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    artifact: '',
    version: process.env.WORKSPAI_VSCODE_TEST_VERSION || 'stable',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact') {
      options.artifact = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--version') {
      options.version = argv[index + 1] ?? options.version;
      index += 1;
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

function prepareSmokeWorkspace(root) {
  const workspacePath = path.join(root, 'workspace');
  const reportsDir = path.join(workspacePath, '.rapidkit', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, '.rapidkit-workspace'),
    JSON.stringify(
      {
        schemaVersion: 'rapidkit-workspace-marker-v1',
        name: 'vsix-electron-smoke',
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  const generatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(workspacePath, '.rapidkit', 'workspace.json'),
    JSON.stringify(
      {
        schema_version: '1.0',
        workspace_name: 'vsix-electron-smoke',
        profile: 'polyglot',
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(reportsDir, 'workspace-model.json'),
    JSON.stringify(
      {
        generatedAt,
        summary: { projectCount: 1 },
        validation: { status: 'pass', errors: 0, warnings: 0 },
        projects: [
          {
            name: 'sample-app',
            path: path.join(workspacePath, 'sample-app'),
            type: 'node',
          },
        ],
      },
      null,
      2
    )
  );
  for (const [fileName, summary, sectionTitle] of [
    ['workspace-explain-last-run.json', 'Smoke release posture is explainable.', 'Release'],
    ['workspace-why-last-run.json', 'Smoke blocker rationale is explainable.', 'Why'],
    ['workspace-trace-last-run.json', 'Smoke evidence trace is explainable.', 'Trace'],
  ]) {
    fs.writeFileSync(
      path.join(reportsDir, fileName),
      JSON.stringify(
        {
          schemaVersion: 'workspace-explain.v1',
          generatedAt,
          workspacePath,
          target:
            fileName === 'workspace-trace-last-run.json'
              ? { kind: 'trace', diffRef: '.rapidkit/reports/workspace-model-diff-last-run.json' }
              : { kind: 'release-blocked' },
          summary,
          sections: [{ id: sectionTitle.toLowerCase(), title: sectionTitle, body: summary }],
          blockingReasons: [],
          releaseRisk: 'low',
        },
        null,
        2
      )
    );
  }
  return workspacePath;
}

function extractExtension(artifactPath, root) {
  const zip = new AdmZip(artifactPath);
  const extensionDir = path.join(root, 'extension');
  zip.extractAllTo(root, true);
  const packagePath = path.join(extensionDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    throw new Error(`VSIX extraction did not produce extension/package.json from ${artifactPath}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (packageJson.main !== './dist/extension.js') {
    throw new Error(`Packaged extension main must be ./dist/extension.js, got ${packageJson.main}`);
  }
  return {
    extensionDir,
    extensionId: `${packageJson.publisher}.${packageJson.name}`,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifactPath = path.resolve(
    process.cwd(),
    options.artifact || findSingleVsix(process.cwd())
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`VSIX artifact not found: ${artifactPath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspai-vsix-electron-'));
  const { extensionDir, extensionId } = extractExtension(artifactPath, tempRoot);
  const workspacePath = prepareSmokeWorkspace(tempRoot);

  await runTests({
    version: options.version,
    extensionDevelopmentPath: extensionDir,
    extensionTestsPath: path.join(repoRoot, 'scripts', 'vsix-electron-smoke-tests.cjs'),
    launchArgs: [
      workspacePath,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--disable-telemetry',
      '--disable-updates',
    ],
    extensionTestsEnv: {
      WORKSPAI_SMOKE_EXTENSION_ID: extensionId,
      WORKSPAI_SMOKE_WORKSPACE: workspacePath,
    },
  });

  console.log(
    `VSIX Electron smoke passed: ${JSON.stringify({
      artifact: path.basename(artifactPath),
      extensionId,
    })}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
