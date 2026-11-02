#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src/contracts/workspai-assistant-knowledge.v1.json');
const documents = [
  ['overview', 'Workspace Intelligence and package ownership', 'README.md'],
  ['creation', 'Creating workspaces and projects', 'docs/creating-workspaces-and-projects.md'],
  [
    'create-lanes',
    'Native, official-generator and existing-project lanes',
    'docs/create-planner-capabilities.md',
  ],
  [
    'operations',
    'Adopt, import, connect, archives and workspace operations',
    'docs/workspace-operations.md',
  ],
  [
    'intelligence',
    'Canonical intelligence chain and status semantics',
    'docs/workspace-intelligence-runner.md',
  ],
  [
    'graph',
    'Canonical Model, derived Graph, evidence and query semantics',
    'docs/workspace-knowledge-graph.md',
  ],
  ['goals', 'Goal planning, scope, freshness and verification', 'docs/goal-packs.md'],
  ['agent-entry', 'Agent grounding and host projections', 'docs/agent-entry.md'],
  [
    'proof-carrying-change',
    'Authorization, effects, verification and capsules',
    'docs/proof-carrying-change.md',
  ],
  ['commands', 'CLI command reference', 'docs/commands-reference.md'],
  ['live', 'Live activity and telemetry boundaries', 'docs/workspace-live-activity.md'],
  ['agent-frameworks', 'Agent framework adapters', 'docs/agent-framework-adapters.md'],
  ['gateways', 'Model gateways', 'docs/model-gateways.md'],
  [
    'qualification',
    'Real-world qualification and evidence limits',
    'docs/real-world-qualification.md',
  ],
  ['doctor', 'Diagnostics, environments and dependency repair', 'docs/doctor-command.md'],
  ['repair', 'Workspace repair engine and validation', 'docs/workspace-repair-engine.md'],
  ['run', 'Running scoped project tasks', 'docs/workspace-run.md'],
  ['configuration', 'Workspace and project configuration', 'docs/config-file-guide.md'],
  ['ci', 'CI workflows, contract and readiness checks', 'docs/ci-workflows.md'],
  ['glossary', 'Workspai concepts and terminology', 'docs/GLOSSARY.md'],
  ['kit-baselines', 'Native kit baselines and support boundaries', 'docs/native-kit-baselines.md'],
  ['scenarios', 'Open source user scenarios', 'docs/OPEN_SOURCE_USER_SCENARIOS.md'],
];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const version = JSON.parse(
  fs.readFileSync(path.join(root, 'contracts/official-cli-closure.v1.json'), 'utf8')
).cli.version;
if (process.argv.includes('--verify')) {
  const bundled = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (
    bundled.schemaVersion !== 'workspai.assistant-knowledge.v1' ||
    bundled.version !== version ||
    bundled.documents.length !== documents.length
  ) {
    throw Error('Bundled assistant knowledge does not match the reference contract.');
  }
  for (const [id, title, sourcePath] of documents) {
    const document = bundled.documents.find((entry) => entry.id === id);
    if (
      !document ||
      document.title !== title ||
      document.sourcePath !== sourcePath ||
      !/^[a-f0-9]{64}$/.test(document.sourceSha256) ||
      hash(document.content) !== document.contentSha256
    ) {
      throw Error(`Invalid bundled assistant knowledge document: ${id}`);
    }
  }
  process.stdout.write(
    `Bundled assistant knowledge verified (${version}, ${documents.length} documents).\n`
  );
  process.exit(0);
}
// Documentation examples must not publish machine identities in extension assets.
const portable = (value) =>
  value
    .replace(/\b[A-Za-z]:[\\/]Users[\\/][^\s"'`),;]+/g, '$LOCAL_PATH')
    .replace(/\/(?:home|Users)\/[^\s"'`),;]+/g, '$LOCAL_PATH');
const index = process.argv.indexOf('--source');
const configured = path.join(root, '.workspai-cli-local.json');
const source =
  index >= 0
    ? path.resolve(process.argv[index + 1] ?? '')
    : process.env.WORKSPAI_CLI_PACKAGE_PATH?.trim()
      ? path.resolve(process.env.WORKSPAI_CLI_PACKAGE_PATH)
      : fs.existsSync(configured)
        ? JSON.parse(fs.readFileSync(configured, 'utf8')).cliPackagePath
        : path.join(root, 'node_modules/workspai');
const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
if (pkg.name !== 'workspai' || pkg.version !== version)
  throw Error('Knowledge source must match the reference Workspai CLI package and version.');
const snapshot = {
  schemaVersion: 'workspai.assistant-knowledge.v1',
  version,
  license: 'MIT',
  source:
    'Workspai CLI documentation; repository: chistiq/workspai, packages/cli. Content hashes identify the exact source; version alone does not prove runtime state.',
  documents: documents.map(([id, title, file]) => {
    const bytes = fs.readFileSync(path.join(source, file));
    const content = portable(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    return {
      id,
      title,
      sourcePath: file,
      sourceSha256: hash(bytes),
      contentSha256: hash(content),
      content,
    };
  }),
};
const output = `${JSON.stringify(snapshot, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output)
    throw Error('Assistant knowledge is stale; sync from the matching CLI source.');
  process.stdout.write(
    `Assistant knowledge matches Workspai ${version} (${documents.length} documents).\n`
  );
} else {
  fs.writeFileSync(target, output);
  process.stdout.write(
    `Synced Workspai ${version} assistant knowledge (${documents.length} documents).\n`
  );
}
