import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_COMMAND_CONTRACTS } from '../core/dashboardCommandContracts';

type MenuEntry = { command?: string; submenu?: string; when?: string };

const WORKSPACE_ITEM_WHEN = 'view == rapidkitWorkspaces && viewItem == workspace';

/** Dashboard commands intentionally surfaced elsewhere (view title, palette-only, system). */
const CONTEXT_MENU_EXCLUDED_IDS = new Set([
  'importWorkspace',
  'openSetup',
  'openCreateWorkspace',
  'refreshModules',
  'quickSwitchWorkspace',
]);

/** Workspace menu helpers that are intentionally not dashboard command contracts. */
const NON_DASHBOARD_WORKSPACE_MENU_COMMANDS = new Set([
  'workspai.copyCopilotContextPrompt',
  'workspai.copyWorkspacePath',
  'workspai.exportVerifyPackContract',
  'workspai.importWorkspaceShareBundle',
  'workspai.openCreateWithAI',
  'workspai.openWorkspace',
  'workspai.openWorkspaceFolder',
  'workspai.removeWorkspace',
  'workspai.resetTelemetry',
  'workspai.showOnboardingExperimentStats',
  'workspai.showTelemetrySummary',
]);

/** Accept alternate vscode commands for equivalent dashboard actions. */
const CONTEXT_MENU_ALIASES: Record<string, string[]> = {
  workspaceImpactLens: ['workspai.openWorkspaceAdvisor', 'workspai.workspaceImpactLens'],
  workspaceImpactLensCli: ['workspai.workspaceImpactLens', 'workspai.openWorkspaceAdvisor'],
  workspaceShare: ['workspai.exportWorkspaceShareBundle'],
  workspaceInfra: ['workspai.infraPlan', 'workspai.infra'],
};

function collectWorkspaceItemContextCommands(menus: Record<string, MenuEntry[]>): Set<string> {
  const commands = new Set<string>();
  for (const entry of menus['view/item/context'] ?? []) {
    if (entry.when !== WORKSPACE_ITEM_WHEN) {
      continue;
    }
    if (entry.command) {
      commands.add(entry.command);
    }
    if (entry.submenu) {
      for (const submenuEntry of menus[entry.submenu] ?? []) {
        if (submenuEntry.command) {
          commands.add(submenuEntry.command);
        }
      }
    }
  }
  return commands;
}

function resolveExpectedCommands(
  dashboardId: string,
  contract: { vscodeCommand?: string }
): string[] {
  if (CONTEXT_MENU_ALIASES[dashboardId]) {
    return CONTEXT_MENU_ALIASES[dashboardId];
  }
  return contract.vscodeCommand ? [contract.vscodeCommand] : [];
}

describe('workspace sidebar context menu parity', () => {
  it('exposes every workspace-scoped dashboard command on the workspace tree item menu', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      contributes?: {
        menus?: Record<string, MenuEntry[]>;
      };
    };

    const menuCommands = collectWorkspaceItemContextCommands(manifest.contributes?.menus ?? {});
    const missing: string[] = [];

    for (const [dashboardId, contract] of Object.entries(DASHBOARD_COMMAND_CONTRACTS)) {
      if (contract.scope !== 'workspace' || CONTEXT_MENU_EXCLUDED_IDS.has(dashboardId)) {
        continue;
      }

      const expected = resolveExpectedCommands(dashboardId, contract);
      if (expected.length === 0) {
        continue;
      }

      if (!expected.some((commandId) => menuCommands.has(commandId))) {
        missing.push(`${dashboardId} -> ${expected.join(' | ')}`);
      }
    }

    expect(menuCommands.has('workspai.workspaceAnalyze')).toBe(true);
    expect(menuCommands.has('workspai.workspacePipeline')).toBe(true);
    expect(menuCommands.has('workspai.workspaceExplain')).toBe(true);
    expect(missing, `missing workspace context menu commands:\n${missing.join('\n')}`).toEqual([]);
  });

  it('keeps workspace operational menu commands covered by dashboard contracts', () => {
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      contributes?: {
        menus?: Record<string, MenuEntry[]>;
      };
    };

    const menuCommands = collectWorkspaceItemContextCommands(manifest.contributes?.menus ?? {});
    const contractCommands = new Set<string>();

    for (const [dashboardId, contract] of Object.entries(DASHBOARD_COMMAND_CONTRACTS)) {
      for (const commandId of resolveExpectedCommands(dashboardId, contract)) {
        contractCommands.add(commandId);
      }
    }

    const missingContracts = [...menuCommands]
      .filter((commandId) => commandId.startsWith('workspai.'))
      .filter((commandId) => !NON_DASHBOARD_WORKSPACE_MENU_COMMANDS.has(commandId))
      .filter((commandId) => !contractCommands.has(commandId))
      .sort();

    expect(
      missingContracts,
      `workspace context menu commands without dashboard contracts:\n${missingContracts.join('\n')}`
    ).toEqual([]);
  });
});
