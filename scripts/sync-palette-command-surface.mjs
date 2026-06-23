import fs from 'fs';
import path from 'path';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const extensionRoot = path.resolve(process.cwd());
const packageJsonPath = path.join(extensionRoot, 'package.json');
const contractPath = path.join(
  extensionRoot,
  'src/contracts/palette-command-surface.v1.json'
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function buildCommandPalette(packageJson, contract) {
  const coreCommands = contract.coreCommands.map((entry) => entry.command);
  const coreCommandSet = new Set(coreCommands);

  if (coreCommands.length < 5 || coreCommands.length > 10) {
    console.error(
      `Palette core command count must be 5–10 (got ${coreCommands.length}). Update palette-command-surface.v1.json.`
    );
    process.exit(1);
  }

  const contributedWorkspaiCommands = (packageJson.contributes?.commands ?? [])
    .map((entry) => entry.command)
    .filter((command) => typeof command === 'string' && command.startsWith('workspai.'))
    .sort();

  const palette = [];

  for (const command of coreCommands) {
    if (!contributedWorkspaiCommands.includes(command)) {
      console.error(`Core palette command is not contributed in package.json: ${command}`);
      process.exit(1);
    }
    palette.push({ command });
  }

  for (const command of contributedWorkspaiCommands) {
    if (coreCommandSet.has(command)) {
      continue;
    }
    palette.push({ command, when: 'false' });
  }

  return palette;
}

function main() {
  const packageJson = readJson(packageJsonPath);
  const contract = readJson(contractPath);
  const nextPalette = buildCommandPalette(packageJson, contract);
  const currentPalette = packageJson.contributes?.menus?.commandPalette ?? [];

  if (JSON.stringify(currentPalette) === JSON.stringify(nextPalette)) {
    console.log(
      `Palette command surface is in sync (${contract.coreCommands.length} core / ${nextPalette.length} total).`
    );
    return;
  }

  if (checkOnly) {
    console.error('package.json commandPalette is out of sync with palette-command-surface.v1.json');
    console.error('Run: npm run sync:palette-surface');
    process.exit(1);
  }

  packageJson.contributes ??= {};
  packageJson.contributes.menus ??= {};
  packageJson.contributes.menus.commandPalette = nextPalette;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8');
  console.log(
    `Synced commandPalette (${contract.coreCommands.length} core / ${nextPalette.length} total).`
  );
}

main();
