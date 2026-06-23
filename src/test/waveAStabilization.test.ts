import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveDashboardCommandContract } from '../core/dashboardCommandContracts';

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('project selection sync (Wave A)', () => {
  it('syncs sidebar project selection into WelcomePanel and dashboard state', () => {
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');
    const extensionSource = read('src/extension.ts');

    expect(welcomePanelSource).toContain('syncProjectSelectionFromSidebar');
    expect(welcomePanelSource).toContain("source: 'sidebar-sync'");
    expect(welcomePanelSource).toContain("dashboardSection: 'console'");
    expect(extensionSource).toContain('WelcomePanel.syncProjectSelectionFromSidebar');
    expect(extensionSource).toContain("item.contextValue === 'project'");
  });

  it('routes explicit project surfaces without reopening legacy Studio by default', () => {
    const extensionSource = read('src/extension.ts');
    const projectContextSource = read('src/commands/projectContextAndLogs.ts');
    const welcomePanelSource = read('src/ui/panels/welcomePanel.ts');

    expect(extensionSource).toContain('workspai.openDashboardSection');
    expect(extensionSource).toContain('buildSecondaryScopePayload');
    expect(extensionSource).toContain('revealSecondaryTab(');
    expect(projectContextSource).toContain('workspai.openDashboardSection');
    expect(projectContextSource).toContain("section: 'console'");
    expect(projectContextSource).not.toContain(
      "workspai.openIncidentStudio', {\n          workspace:"
    );
    expect(welcomePanelSource).toContain('openDashboardSectionTab');
    expect(welcomePanelSource).toContain('_pendingDashboardSectionOpen');
  });

  it('registers workspaceSync in package manifest and governance submenu', () => {
    const packageJson = JSON.parse(read('package.json'));

    const commandIds = packageJson.contributes.commands.map(
      (entry: { command: string }) => entry.command
    );
    expect(commandIds).toContain('workspai.workspaceSync');

    const governanceSubmenu = packageJson.contributes.submenus.find(
      (entry: { id: string }) => entry.id === 'workspai.workspace.governance'
    );
    expect(governanceSubmenu).toBeDefined();

    const governanceCommands = packageJson.contributes.menus['workspai.workspace.governance'].map(
      (entry: { command: string }) => entry.command
    );
    expect(governanceCommands).toContain('workspai.workspaceSync');
  });

  it('aligns workspace verify and context agent contract cli args with dispatch', () => {
    const intelligenceSource = read('src/commands/workspaceIntelligence.ts');
    const verifyContract = resolveDashboardCommandContract('workspaceVerify');
    const contextContract = resolveDashboardCommandContract('workspaceContextAgent');

    expect(verifyContract?.cliArgs).toEqual([
      'workspace',
      'verify',
      '--from-impact',
      '.rapidkit/reports/workspace-impact-last-run.json',
      '--json',
    ]);
    expect(contextContract?.cliArgs).toEqual([
      'workspace',
      'context',
      '--for-agent',
      '--json',
      '--write',
    ]);
    expect(intelligenceSource).toContain('buildWorkspaceAgentContextCliArgs');
    expect(intelligenceSource).not.toContain("'cursor',");
  });

  it('warns when palette lifecycle commands have no project target', () => {
    const lifecycleSource = read('src/commands/projectLifecycle.ts');

    expect(lifecycleSource).toContain('warnMissingProjectSelection');
    expect(lifecycleSource).toContain('getSelectedProjectPath');
    expect(lifecycleSource).toContain("warnMissingProjectSelection('Project Dev')");
  });
});
