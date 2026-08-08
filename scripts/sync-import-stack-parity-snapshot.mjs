import fs from 'fs';
import path from 'path';

const SRC_CONTRACT_MIRROR_FILES = [
  'agent-customization-pack.v1.json',
  'create-planner-capabilities.v1.json',
  'release-readiness.v1.json',
  'workspace-registry.v1.json',
  'workspace-repair-capabilities.v1.json',
];

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
// CI gate flag: fail (instead of skip) when the canonical Workspai CLI repo is
// not present. Use this in a dedicated job that checks out both repos so cross-
// repo contract drift fails the build. The default (resilient) behavior lets the
// in-repo `validate:contracts` step run in an isolated extension checkout where
// the sibling repo is absent — the self-contained contract tests still gate drift.
const requireCanonical = args.has('--require-canonical');

const extensionRoot = path.resolve(process.cwd());
const workspaiCliRoot = process.env.WORKSPAI_CLI_REPO_PATH
  ? path.resolve(process.env.WORKSPAI_CLI_REPO_PATH)
  : path.resolve(extensionRoot, '..', 'workspai', 'packages', 'cli');

function readCanonical(fileName) {
  const canonicalPath = path.resolve(workspaiCliRoot, 'contracts', fileName);
  if (!fs.existsSync(canonicalPath)) {
    console.error(`Canonical contract missing in Workspai CLI: ${canonicalPath}`);
    console.error(
      'Edit workspai/packages/cli/contracts/, then run: npm run sync:shared-contracts (from Workspai repo)'
    );
    process.exit(1);
  }
  return {
    canonicalPath,
    content: fs.readFileSync(canonicalPath, 'utf-8'),
  };
}

function writeTarget(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf-8');
}

function verifyTarget(targetPath, content) {
  if (!fs.existsSync(targetPath)) {
    console.error(`Extension contract copy is missing: ${targetPath}`);
    process.exit(1);
  }

  const targetContent = fs.readFileSync(targetPath, 'utf-8');
  if (targetContent !== content) {
    console.error(`Extension contract copy is out of sync: ${targetPath}`);
    console.error('From rapidkit-vscode run: npm run sync:shared-contracts');
    process.exit(1);
  }
}

function listJsonContracts(dir, prefix = '') {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.join(prefix, entry.name);
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonContracts(absolutePath, relativePath);
      }
      return entry.isFile() && entry.name.endsWith('.json') ? [relativePath] : [];
    })
    .sort();
}

const workspaiContractsRoot = path.resolve(workspaiCliRoot, 'contracts');
const canonicalRepoPresent = fs.existsSync(workspaiContractsRoot);

if (!canonicalRepoPresent) {
  const message = `Canonical Workspai CLI contracts not found at: ${workspaiContractsRoot}`;
  if (requireCanonical) {
    console.error(message);
    console.error(
      'This gate requires the workspai repo. Check it out next to rapidkit-vscode, ' +
        'or set WORKSPAI_CLI_REPO_PATH to packages/cli.'
    );
    process.exit(1);
  }
  console.warn(`${message}\nSkipping cross-repo parity check (canonical repo not present).`);
  console.warn(
    'Self-contained contract tests still gate drift. Use --require-canonical in the dedicated CI job.'
  );
  process.exit(0);
}

const mirrorFiles = listJsonContracts(workspaiContractsRoot);

if (mirrorFiles.length === 0) {
  console.error(`No canonical JSON contracts found in Workspai CLI: ${workspaiContractsRoot}`);
  process.exit(1);
}

for (const fileName of mirrorFiles) {
  const { canonicalPath, content } = readCanonical(fileName);
  const extensionTarget = path.resolve(extensionRoot, 'contracts', fileName);

  if (checkOnly) {
    verifyTarget(extensionTarget, content);
    continue;
  }

  writeTarget(extensionTarget, content);
  console.log(`Contract synced from ${canonicalPath}`);
  console.log(`- extension target: ${extensionTarget}`);
}

for (const fileName of SRC_CONTRACT_MIRROR_FILES) {
  const { canonicalPath, content } = readCanonical(fileName);
  const extensionTarget = path.resolve(extensionRoot, 'src', 'contracts', fileName);

  if (checkOnly) {
    verifyTarget(extensionTarget, content);
    continue;
  }

  writeTarget(extensionTarget, content);
  console.log(`Runtime contract synced from ${canonicalPath}`);
  console.log(`- extension src target: ${extensionTarget}`);
}

if (checkOnly) {
  console.log('Extension contracts match Workspai CLI contracts canonical source.');
}
