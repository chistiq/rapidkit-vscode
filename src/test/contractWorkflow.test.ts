import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { NPM_CONTRACT_SUPPORT_MATRIX } from '../core/npmContractSupportMatrix';

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
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
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
    'agent-customization-pack.v1.json',
    'analyze-last-run.v1.json',
    'backend-import-stack-parity.snapshot.json',
    'cli-log-event.v1.json',
    'create-planner-capabilities.v1.json',
    'doctor-project-evidence.v1.json',
    'doctor-workspace-evidence.v1.json',
    'extension-cli-compatibility.v1.json',
    'infra-stack.v1.json',
    'module-layout.v1.json',
    'module-support.v1.json',
    'pipeline-last-run.v1.json',
    'release-readiness.v1.json',
    'runtime-command-surface.v1.json',
    'studio-card-repair-capabilities.v1.json',
    'workspace-registry.v1.json',
    'workspace-run-last.v1.json',
  ];

  it('checks extension copies against Workspai CLI canonical contracts', () => {
    const packageJson = JSON.parse(read('package.json'));
    const syncScript = read('scripts/sync-import-stack-parity-snapshot.mjs');
    const parityWorkflow = read('.github/workflows/extension-smoke-matrix.yml');
    const preCommit = read('.husky/pre-commit');
    const npmSyncScriptPath = path.resolve(
      repoRoot,
      '..',
      'workspai',
      'packages',
      'cli',
      'scripts',
      'sync-shared-contracts.mjs'
    );

    expect(packageJson.scripts['sync:shared-contracts']).toBe(
      'node scripts/sync-import-stack-parity-snapshot.mjs'
    );
    expect(packageJson.scripts['check:shared-contracts']).toBe(
      'node scripts/sync-import-stack-parity-snapshot.mjs --check'
    );
    expect(packageJson.scripts['sync:parity-snapshot']).toBe(
      'corepack npm run sync:shared-contracts'
    );
    expect(packageJson.scripts['check:parity-snapshot']).toBe(
      'corepack npm run check:shared-contracts'
    );
    expect(packageJson.scripts['validate:contracts']).toContain('check:shared-contracts');
    expect(packageJson.scripts['validate:contracts']).toContain(
      'runtimeCommandSurfaceParity.test.ts'
    );
    expect(packageJson.scripts['validate:contracts']).toContain('npmContractSupportMatrix.test.ts');
    expect(syncScript).toContain('Workspai CLI contracts');
    expect(syncScript).toContain('listJsonContracts');
    expect(syncScript).toContain('SRC_CONTRACT_MIRROR_FILES');
    expect(syncScript).toContain('agent-customization-pack.v1.json');
    expect(parityWorkflow).toContain('repository: ${{ github.repository_owner }}/workspai');
    expect(parityWorkflow).toContain(
      'WORKSPAI_CLI_REPO_PATH: ${{ github.workspace }}/workspai-cli-canonical/packages/cli'
    );
    expect(parityWorkflow).toContain('npm run release:enterprise-matrix -- --require-canonical');
    expect(parityWorkflow).not.toContain('RAPIDKIT_NPM_REPO_PATH');
    expect(parityWorkflow).not.toContain('rapidkit-npm-canonical');
    expect(parityWorkflow).not.toContain('Checkout workspai-front');
    expect(parityWorkflow).not.toContain('WORKSPAI_FRONT_PATH');
    expect(parityWorkflow).toContain('uses: actions/checkout@v5');
    expect(parityWorkflow).toContain('uses: actions/setup-node@v6');
    expect(parityWorkflow).toContain('node-version: 24');
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
    const contractFiles = NPM_CONTRACT_SUPPORT_MATRIX.map((entry) => entry.contractPath);

    expect(contractFiles.length).toBeGreaterThanOrEqual(canonicalContractFiles.length);
    for (const contractFile of contractFiles) {
      const extensionContractPath = path.join(repoRoot, 'contracts', contractFile);

      expect(fs.existsSync(extensionContractPath), contractFile).toBe(true);
      expect(
        () => JSON.parse(read(path.join('contracts', contractFile))),
        contractFile
      ).not.toThrow();
    }
  });

  it('keeps runtime-consumed src contract copies aligned with Workspai CLI', () => {
    const srcMirroredContracts = [
      'agent-customization-pack.v1.json',
      'create-planner-capabilities.v1.json',
      'release-readiness.v1.json',
      'studio-card-repair-capabilities.v1.json',
      'workspace-registry.v1.json',
    ];

    for (const contractFile of srcMirroredContracts) {
      const srcContractPath = path.join(repoRoot, 'src', 'contracts', contractFile);
      const shippedContractPath = path.join(repoRoot, 'contracts', contractFile);

      expect(fs.existsSync(srcContractPath), contractFile).toBe(true);
      expect(JSON.parse(fs.readFileSync(srcContractPath, 'utf8')), contractFile).toEqual(
        JSON.parse(fs.readFileSync(shippedContractPath, 'utf8'))
      );
    }
  });

  it('includes Phase 4 operational intelligence schemas in npm contract mirror', () => {
    const phase4 = [
      'workspace-intelligence/workspace-explain.v1.json',
      'workspace-intelligence/workspace-skills-index.v1.json',
      'workspace-intelligence/agent-action-outcome.v1.json',
    ];
    for (const contractFile of phase4) {
      expect(fs.existsSync(path.join(repoRoot, 'contracts', contractFile)), contractFile).toBe(
        true
      );
    }
  });

  it('accounts for every extension-owned contract outside the CLI canonical mirror', () => {
    const npmContracts = new Set(NPM_CONTRACT_SUPPORT_MATRIX.map((entry) => entry.contractPath));
    const extensionContracts = listJsonContracts(path.join(repoRoot, 'contracts'));
    const extensionOwned = extensionContracts.filter((contract) => !npmContracts.has(contract));

    expect(extensionOwned).toEqual([
      'workspace-intelligence/workspace-graph-recording.v1.json',
      'workspai-ai-narrative.v1.json',
    ]);
    expect(read('src/core/workspaceGraphRecordingManager.ts')).toContain(
      'WORKSPACE_GRAPH_RECORDING_SCHEMA_VERSION'
    );
    expect(read('src/core/workspaiAiNarrative.ts')).toContain(
      '../../contracts/workspai-ai-narrative.v1.json'
    );
    expect(read('webview-ui/src/lib/workspaiAiNarrative.ts')).toContain(
      '../../../contracts/workspai-ai-narrative.v1.json'
    );
  });
});
