import fs from 'fs-extra';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { resolveDashboardCommandContract } from '../core/dashboardCommandContracts';
import {
  DASHBOARD_WORKSPACE_COMMAND_SOURCE,
  WORKSPACE_COMMAND_PRESET_GROUPS,
  getWorkspaceCommandPreset,
  shouldPromptForWorkspaceCommandPreset,
} from '../core/workspaceCommandPresets';

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

  it('registers workspaceSync in package manifest and run submenu', () => {
    const packageJson = JSON.parse(read('package.json'));

    const commandIds = packageJson.contributes.commands.map(
      (entry: { command: string }) => entry.command
    );
    expect(commandIds).toContain('workspai.workspaceSync');

    const runCommands = packageJson.contributes.menus['workspai.workspace.run'].map(
      (entry: { command: string }) => entry.command
    );
    expect(runCommands).toContain('workspai.workspaceSync');
  });

  it('aligns workspace verify and context agent contract cli args with dispatch', () => {
    const intelligenceSource = read('src/commands/workspaceIntelligence.ts');
    const verifyContract = resolveDashboardCommandContract('workspaceVerify');
    const contextContract = resolveDashboardCommandContract('workspaceContextAgent');

    expect(verifyContract?.cliArgs).toEqual(['workspace', 'verify', '--json']);
    expect(intelligenceSource).toContain("const command: string[] = ['workspace', 'verify'];");
    expect(intelligenceSource).toContain("command.push('--from-impact', resolvedFromImpact);");
    expect(contextContract?.cliArgs).toEqual([
      'workspace',
      'context',
      '--for-agent',
      '--json',
      '--write',
    ]);
    expect(intelligenceSource).toContain("commandId: 'workspaceContextAgent'");
    expect(intelligenceSource).not.toContain("'cursor',");
  });

  it('keeps dashboard workspace intelligence deterministic while sidebar commands can prompt for presets', () => {
    const dashboardCommands = [
      'workspaceBootstrap',
      'workspaceModel',
      'workspaceContextAgent',
      'workspaceAgentSync',
      'workspaceVerify',
    ];

    for (const command of dashboardCommands) {
      const contract = resolveDashboardCommandContract(command);
      expect(contract?.payloadKind, command).toBe('workspace');
      expect(contract?.payloadDefaults?.source, command).toBe(DASHBOARD_WORKSPACE_COMMAND_SOURCE);
    }

    expect(getWorkspaceCommandPreset('workspaceModel', 'incremental')?.args).toEqual([
      'workspace',
      'model',
      '--incremental',
      '--json',
      '--write',
    ]);
    expect(getWorkspaceCommandPreset('workspaceVerify', 'strict')?.args).toEqual([
      'workspace',
      'verify',
      '--strict',
      '--json',
    ]);
    expect(getWorkspaceCommandPreset('workspaceAgentSync', 'enterprise')?.args).toEqual([
      'workspace',
      'agent-sync',
      '--write',
      '--refresh-context',
      '--json',
      '--preset',
      'enterprise',
      '--target',
      'vscode',
    ]);
    expect(getWorkspaceCommandPreset('workspaceAgentSync', 'hooks')?.args).toContain(
      '--experimental-hooks'
    );
    expect(getWorkspaceCommandPreset('workspaceDiff', 'default')?.args).toEqual([
      'workspace',
      'diff',
      '--from',
      '<baseline-report>',
      '--json',
    ]);
    expect(getWorkspaceCommandPreset('workspaceImpact', 'default')?.args).toEqual([
      'workspace',
      'impact',
      '--from',
      '<change-report>',
      '--json',
    ]);
    expect(getWorkspaceCommandPreset('workspaceExplain', 'preview')?.args).toEqual([
      'workspace',
      'explain',
      '<target>',
      '--json',
    ]);
    expect(getWorkspaceCommandPreset('workspaceWhy', 'default')?.args).toEqual([
      'workspace',
      'why',
      '<target>',
      '--json',
      '--write',
    ]);
    expect(getWorkspaceCommandPreset('workspaceTrace', 'default')?.args).toEqual([
      'workspace',
      'trace',
      '--from',
      '<diff-report>',
      '--json',
      '--write',
    ]);
    expect(getWorkspaceCommandPreset('workspaceRemediationPlan', 'default')?.args).toEqual([
      'workspace',
      'remediation-plan',
      '--ci',
      '--json',
      '--write',
      '--include-paths',
    ]);
    expect(getWorkspaceCommandPreset('workspaceRemediationPlan', 'preview')?.args).toEqual([
      'workspace',
      'remediation-plan',
      '--ci',
      '--json',
      '--include-paths',
    ]);
    expect(read('src/commands/workspaceIntelligence.ts')).not.toContain('trace:${');

    expect(
      shouldPromptForWorkspaceCommandPreset({ source: DASHBOARD_WORKSPACE_COMMAND_SOURCE })
    ).toBe(false);
    expect(shouldPromptForWorkspaceCommandPreset({ source: 'sidebar' })).toBe(true);
    expect(shouldPromptForWorkspaceCommandPreset({ preset: 'strict' })).toBe(false);
  });

  it('keeps workspace command presets aligned with dashboard command contracts', () => {
    const failures: string[] = [];

    for (const [commandId, group] of Object.entries(WORKSPACE_COMMAND_PRESET_GROUPS)) {
      const contract = resolveDashboardCommandContract(commandId);
      if (!contract) {
        failures.push(`${commandId}: missing dashboard command contract`);
        continue;
      }
      if (group.commandId !== commandId) {
        failures.push(`${commandId}: preset group commandId mismatch`);
      }
      if (!contract.cliArgs?.length) {
        failures.push(`${commandId}: preset group command has no contract cli args`);
        continue;
      }
      if (group.presets.length === 0) {
        failures.push(`${commandId}: preset group has no presets`);
        continue;
      }

      for (const preset of group.presets) {
        if (preset.args[0] !== contract.cliArgs[0]) {
          failures.push(`${commandId}/${preset.id}: root command mismatch`);
        }
        if (contract.cliArgs[0] === 'workspace' && preset.args[1] !== contract.cliArgs[1]) {
          failures.push(`${commandId}/${preset.id}: workspace subcommand mismatch`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('warns when palette lifecycle commands have no project target', () => {
    const lifecycleSource = read('src/commands/projectLifecycle.ts');

    expect(lifecycleSource).toContain('warnMissingProjectSelection');
    expect(lifecycleSource).toContain('getSelectedProjectPath');
    expect(lifecycleSource).toContain("warnMissingProjectSelection('Project Dev')");
  });
});
