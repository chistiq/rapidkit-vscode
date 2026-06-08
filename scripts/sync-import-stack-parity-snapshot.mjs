import fs from 'fs';
import path from 'path';

const FILE_NAMES = [
  'backend-import-stack-parity.snapshot.json',
  'runtime-command-surface.v1.json',
];
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const extensionRoot = path.resolve(process.cwd());

function normalizePath(value) {
  return path.resolve(value);
}

function pickSource(fileName) {
  const explicit = process.env.RAPIDKIT_BACKEND_IMPORT_PARITY_SNAPSHOT_SOURCE;
  const runtimeExplicit = process.env.RAPIDKIT_RUNTIME_COMMAND_SURFACE_CONTRACT_SOURCE;
  const extensionTarget = path.resolve(extensionRoot, 'contracts', fileName);
  const candidates = [
    fileName === 'backend-import-stack-parity.snapshot.json' && explicit?.trim()
      ? normalizePath(explicit.trim())
      : null,
    fileName === 'runtime-command-surface.v1.json' && runtimeExplicit?.trim()
      ? normalizePath(runtimeExplicit.trim())
      : null,
    path.resolve(extensionRoot, '..', 'contracts', fileName),
    extensionTarget,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function writeTarget(targetPath, sourceContent) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, sourceContent, 'utf-8');
}

function verifyTarget(targetPath, sourceContent) {
  if (!fs.existsSync(targetPath)) {
    console.error(`Parity snapshot is missing: ${targetPath}`);
    process.exit(1);
  }

  const targetContent = fs.readFileSync(targetPath, 'utf-8');
  if (targetContent !== sourceContent) {
    console.error(`Parity snapshot is out of sync: ${targetPath}`);
    process.exit(1);
  }
}

for (const fileName of FILE_NAMES) {
  const extensionTarget = path.resolve(extensionRoot, 'contracts', fileName);
  const sourcePath = pickSource(fileName);
  if (!sourcePath) {
    console.error(`No contract source found for ${fileName}.`);
    console.error(`Expected one of: ${path.resolve(extensionRoot, '..', 'contracts', fileName)} or ${extensionTarget}`);
    process.exit(1);
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf-8');

  if (checkOnly) {
    verifyTarget(extensionTarget, sourceContent);
    continue;
  }

  writeTarget(extensionTarget, sourceContent);
  console.log(`Contract synced from ${sourcePath}`);
  console.log(`- extension target: ${extensionTarget}`);
}

if (checkOnly) {
  console.log('Extension parity contracts are in sync.');
}
