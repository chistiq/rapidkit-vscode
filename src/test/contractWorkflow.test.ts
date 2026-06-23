import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listJsonContracts(dir: string, prefix = ''): string[] {
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

describe('shared contracts workflow (Wave A + B)', () => {
  const canonicalContractFiles = [
    'analyze-last-run.v1.json',
    'backend-import-stack-parity.snapshot.json',
    'cli-log-event.v1.json',
    'create-planner-capabilities.v1.json',
    'doctor-project-evidence.v1.json',
    'doctor-workspace-evidence.v1.json',
    'infra-stack.v1.json',
    'module-layout.v1.json',
    'module-support.v1.json',
    'pipeline-last-run.v1.json',
    'release-readiness.v1.json',
    'runtime-command-surface.v1.json',
    'workspace-registry.v1.json',
    'workspace-run-last.v1.json',
  ];

  it('checks extension copies against rapidkit-npm canonical contracts', () => {
    const packageJson = JSON.parse(read('package.json'));
    const syncScript = read('scripts/sync-import-stack-parity-snapshot.mjs');
    const preCommit = read('.husky/pre-commit');
    const npmSyncScriptPath = path.resolve(
      repoRoot,
      '..',
      'rapidkit-npm',
      'scripts',
      'sync-shared-contracts.mjs'
    );

    expect(packageJson.scripts['sync:shared-contracts']).toBe(
      'node scripts/sync-import-stack-parity-snapshot.mjs'
    );
    expect(packageJson.scripts['check:shared-contracts']).toBe(
      'node scripts/sync-import-stack-parity-snapshot.mjs --check'
    );
    expect(packageJson.scripts['sync:parity-snapshot']).toBe('npm run sync:shared-contracts');
    expect(packageJson.scripts['check:parity-snapshot']).toBe('npm run check:shared-contracts');
    expect(packageJson.scripts['validate:contracts']).toContain('check:shared-contracts');
    expect(packageJson.scripts['validate:contracts']).toContain(
      'runtimeCommandSurfaceParity.test.ts'
    );
    expect(packageJson.scripts['validate:contracts']).toContain('npmContractSupportMatrix.test.ts');
    expect(syncScript).toContain('rapidkit-npm/contracts/');
    expect(syncScript).toContain('listJsonContracts');
    expect(syncScript).toContain('SRC_CONTRACT_MIRROR_FILES');
    expect(preCommit).toContain('npm run validate:contracts');
    expect(preCommit).toContain('npm run sync:shared-contracts');
    if (fs.existsSync(npmSyncScriptPath)) {
      const npmSyncScript = fs.readFileSync(npmSyncScriptPath, 'utf8');
      expect(npmSyncScript).toContain('rapidkit-vscode/contracts');
      expect(npmSyncScript).toContain('rapidkit-vscode/src/contracts');
      expect(npmSyncScript).toContain('listJsonContracts');
    }
  });

  it('ships every canonical npm contract consumed by the enterprise dashboard', () => {
    const npmContractsRoot = path.resolve(repoRoot, '..', 'rapidkit-npm', 'contracts');
    const contractFiles = listJsonContracts(npmContractsRoot);

    expect(contractFiles.length).toBeGreaterThanOrEqual(canonicalContractFiles.length);
    for (const contractFile of contractFiles) {
      const extensionContractPath = path.join(repoRoot, 'contracts', contractFile);
      const npmContractPath = path.join(npmContractsRoot, contractFile);

      expect(fs.existsSync(extensionContractPath), contractFile).toBe(true);
      expect(JSON.parse(read(path.join('contracts', contractFile))), contractFile).toEqual(
        JSON.parse(fs.readFileSync(npmContractPath, 'utf8'))
      );
    }
  });

  it('keeps runtime-consumed src contract copies aligned with rapidkit-npm', () => {
    const srcMirroredContracts = [
      'create-planner-capabilities.v1.json',
      'release-readiness.v1.json',
      'workspace-registry.v1.json',
    ];

    for (const contractFile of srcMirroredContracts) {
      const srcContractPath = path.join(repoRoot, 'src', 'contracts', contractFile);
      const npmContractPath = path.resolve(
        repoRoot,
        '..',
        'rapidkit-npm',
        'contracts',
        contractFile
      );

      expect(fs.existsSync(srcContractPath), contractFile).toBe(true);
      expect(JSON.parse(fs.readFileSync(srcContractPath, 'utf8')), contractFile).toEqual(
        JSON.parse(fs.readFileSync(npmContractPath, 'utf8'))
      );
    }
  });
});
