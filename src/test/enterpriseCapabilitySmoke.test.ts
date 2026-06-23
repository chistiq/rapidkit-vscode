import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  MODULE_CAPABLE_KIT_IDS,
  MODULE_CAPABLE_PROJECT_TYPES,
  MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES,
  isModuleCapableKit,
  isUnsupportedModuleProjectType,
  readModuleSupportContract,
} from '../core/moduleSupportContract';
import { buildModuleSupportContractFromRuntimeSurface } from '../contracts/module-support-contract';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('module support contract (extension host)', () => {
  it('pins module-capable runtimes to FastAPI and NestJS only', () => {
    const contract = readModuleSupportContract();
    expect(contract.schemaVersion).toBe('rapidkit-module-support-v1');
    expect(MODULE_CAPABLE_PROJECT_TYPES).toEqual(['fastapi', 'nestjs']);
    expect(MODULE_CAPABLE_KIT_IDS).toEqual(['fastapi.standard', 'fastapi.ddd', 'nestjs.standard']);
    expect(isModuleCapableKit('nestjs.standard')).toBe(true);
    expect(isModuleCapableKit('frontend.nextjs')).toBe(false);
  });

  it('lists frontend scaffolds as module-unsupported', () => {
    expect(MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES).toContain('nextjs');
    expect(MODULE_UNSUPPORTED_FRONTEND_PROJECT_TYPES).toContain('sveltekit');
    expect(isUnsupportedModuleProjectType('vite-react')).toBe(true);
    expect(isUnsupportedModuleProjectType('fastapi')).toBe(false);
  });

  it('keeps host, webview, and Front contracts aligned', () => {
    const hostContractPath = path.join(repoRoot, 'contracts', 'module-support.v1.json');
    const frontContractPath = path.resolve(repoRoot, '..', 'contracts', 'module-support.v1.json');
    const webviewSource = read('webview-ui/src/lib/moduleSupport.ts');
    const runtimeSurfacePath = path.join(repoRoot, 'contracts', 'runtime-command-surface.v1.json');

    const hostContract = JSON.parse(fs.readFileSync(hostContractPath, 'utf8'));
    const runtimeSurface = JSON.parse(fs.readFileSync(runtimeSurfacePath, 'utf8'));
    expect(hostContract).toEqual(buildModuleSupportContractFromRuntimeSurface(runtimeSurface));

    if (fs.existsSync(frontContractPath)) {
      const frontContract = JSON.parse(fs.readFileSync(frontContractPath, 'utf8'));
      expect(hostContract).toEqual(frontContract);
    }

    expect(webviewSource).toContain("from '../../../contracts/module-support.v1.json'");
    expect(read('src/core/aiCoreModuleCatalog.ts')).toContain("from './moduleSupportContract'");
  });
});

describe('enterprise capability smoke', () => {
  it('pins sidebar lifecycle menus to capability context keys', () => {
    const packageJson = read('package.json');
    expect(packageJson).toContain('workspai:projectSupportsInit');
    expect(packageJson).toContain('workspai:projectSupportsDev');
    expect(packageJson).toContain('workspai:projectSupportsModules');
    expect(packageJson).toContain('workspai:projectSupportsBuild');
  });

  it('wires capability invalidation into mutation commands', () => {
    expect(read('src/commands/addModule.ts')).toContain('invalidateAndRefreshProjectCapabilities');
    expect(read('src/commands/importProject.ts')).toContain(
      'refreshExtensionAfterNpmProjectOnboard'
    );
    expect(read('src/commands/adoptProject.ts')).toContain(
      'refreshExtensionAfterNpmProjectOnboard'
    );
    expect(read('src/core/npmProjectOnboardRefresh.ts')).toContain(
      'invalidateAndRefreshProjectCapabilities'
    );
    expect(read('src/core/projectCapabilityContext.ts')).toContain(
      'clearProjectCommandCapabilitiesCache'
    );
  });

  it('syncs project capability context from explorer selection', () => {
    const explorer = read('src/ui/treeviews/projectExplorer.ts');
    expect(explorer).toContain('clearProjectCapabilityContext');
    expect(explorer).toContain('if (nextPath === currentPath)');
    expect(explorer).toContain('_scheduleTreeRefresh');
  });

  it('selectWorkspace delegates project tree sync to workspaceSelected handler only', () => {
    const selection = read('src/commands/workspaceSelection.ts');
    const workspaceSelectedCalls = selection.match(/projectExplorer\.setWorkspace/g) || [];
    expect(workspaceSelectedCalls).toHaveLength(0);
  });

  it('does not auto-run workspace intelligence chain when a workspace is selected', () => {
    const extension = read('src/extension.ts');
    expect(extension).not.toContain('scheduleAutoWorkspaceIntelligenceChain');
    expect(extension).toContain('shouldRefreshEvidenceOnTerminalClose');
    expect(extension).toContain('WelcomePanel.refreshDashboardForWorkspacePath(workspacePath)');
  });

  it('surfaces framework and module badge in console project actions', () => {
    expect(read('webview-ui/src/components/ProjectActions.tsx')).toContain('modules enabled');
    expect(read('webview-ui/src/components/ProjectActions.tsx')).toContain('no modules');
  });

  it('collects enable-modules choice in dashboard import/adopt modal', () => {
    const flow = read('webview-ui/src/components/EnterpriseDashboardFlow.tsx');
    expect(flow).toContain('ImportAdoptOptionsModal');
    expect(flow).toContain('enableModules');
    expect(flow).toContain("source: 'local-folder'");
    expect(read('src/commands/importProject.ts')).toContain('resolveEnableModulesPreference');
    expect(read('src/commands/adoptProject.ts')).toContain('resolveEnableModulesPreference');
  });
});
