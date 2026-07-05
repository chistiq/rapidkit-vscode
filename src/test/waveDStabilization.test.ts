import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { buildModuleSupportContractFromRuntimeSurface } from '../contracts/module-support-contract';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): unknown {
  return JSON.parse(read(relativePath));
}

describe('Wave D stabilization', () => {
  it('mirrors npm contracts (including module-support) in the vscode sync script', () => {
    const syncScript = read('scripts/sync-import-stack-parity-snapshot.mjs');
    expect(syncScript).toContain('listJsonContracts');
    expect(syncScript).toContain('rapidkit-npm/contracts');
    expect(fs.existsSync(path.join(repoRoot, 'contracts', 'module-support.v1.json'))).toBe(true);
  });

  it('derives module-support contract from runtime command surface', () => {
    const runtimeSurface = readJson('contracts/runtime-command-surface.v1.json') as {
      moduleSuggestionFrameworks: string[];
      moduleUnsupportedFrameworks: string[];
      scaffoldKits: string[];
    };
    const moduleSupport = readJson('contracts/module-support.v1.json');

    expect(buildModuleSupportContractFromRuntimeSurface(runtimeSurface)).toEqual(moduleSupport);
  });

  it('does not block activation on AI onboarding tips', () => {
    const extension = read('src/extension.ts');
    expect(extension).toContain('void showAIFeatureOnboarding(context)');
    expect(extension).not.toContain('await showAIFeatureOnboarding(context)');
    expect(extension).toContain("config.get('showWelcomeOnStartup', true)");
    expect(extension).toContain("config.get<boolean>('showOnboardingTips', true)");
    expect(extension).toContain('workspai.onboarding.primary.dashboard_discovery');
    expect(extension).toContain('The dashboard owns day-0 AI discovery');
  });

  it('removes unregistered template explorer tree view', () => {
    expect(fs.existsSync(path.join(repoRoot, 'src/ui/treeviews/templateExplorer.ts'))).toBe(false);
    const extension = read('src/extension.ts');
    expect(extension).toContain('templateExplorer removed');
  });
});
