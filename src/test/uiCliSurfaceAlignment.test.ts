import { describe, expect, it } from 'vitest';

import runtimeSurface from '../../contracts/runtime-command-surface.v1.json';
import { DASHBOARD_COMMAND_SURFACE } from '../contracts/dashboardCommandSurface.js';
import { SIDEBAR_ACTION_SURFACE } from '../contracts/sidebarActionSurface.js';
import {
  DASHBOARD_COMMAND_CONTRACTS,
  resolveDashboardCommandContractByVscodeCommand,
} from '../core/dashboardCommandContracts.js';
import {
  isDashboardCommandCapabilityAdvertised,
  resolveDashboardCommandCapabilityRequirement,
} from '../core/dashboardCommandCapabilityGate.js';
import { STUDIO_EVIDENCE_REFRESH_COMMAND_IDS } from '../core/sidebarStudioAgentRuntime.js';
import type { RuntimeCommandSurfaceSnapshot } from '../core/runtimeCommandSurface.js';

function bundledRuntimeSnapshot(): RuntimeCommandSurfaceSnapshot {
  return {
    schemaVersion: 'rapidkit-command-capabilities-v1',
    cli: 'workspai',
    version: '0.56.0',
    contracts: {},
    topLevelCommands: [
      ...new Set([
        ...runtimeSurface.globalCommands,
        ...runtimeSurface.universalCommands,
        ...runtimeSurface.npmOwnedTopLevelCommands,
      ]),
    ],
    projectScopedCommands: [
      ...new Set([
        ...runtimeSurface.lifecycleCommands,
        ...runtimeSurface.moduleMutationCommands,
        ...runtimeSurface.coreProjectCommands,
      ]),
    ],
    coreBackedCommands: runtimeSurface.coreProjectCommands,
    workspaceSubcommands: runtimeSurface.workspaceSubcommands,
    workspaceIntelligenceSubcommands: runtimeSurface.workspaceIntelligenceSubcommands,
  };
}

describe('UI to CLI surface alignment', () => {
  it('backs every CLI-bound Dashboard command with an advertised runtime capability', () => {
    const runtime = bundledRuntimeSnapshot();
    const failures = Object.values(DASHBOARD_COMMAND_CONTRACTS)
      .filter((contract) => (contract.cliArgs?.length ?? 0) > 0)
      .flatMap((contract) => {
        const requirement = resolveDashboardCommandCapabilityRequirement(contract);
        return !requirement || !isDashboardCommandCapabilityAdvertised(runtime, requirement)
          ? [`${contract.id}: ${requirement?.label ?? 'missing requirement'}`]
          : [];
      });

    expect(failures).toEqual([]);
  });

  it('keeps Dashboard metadata and host execution contracts one-to-one', () => {
    expect(Object.keys(DASHBOARD_COMMAND_SURFACE).sort()).toEqual(
      Object.keys(DASHBOARD_COMMAND_CONTRACTS).sort()
    );
  });

  it('routes CLI-backed sidebar actions through the same host command contracts', () => {
    const failures = Object.values(SIDEBAR_ACTION_SURFACE).flatMap((action) => {
      if (action.handler !== 'vscode-command' || !action.vscodeCommand) {
        return [];
      }
      const contract = resolveDashboardCommandContractByVscodeCommand(action.vscodeCommand);
      if (!contract?.cliArgs?.length) {
        return [];
      }
      return resolveDashboardCommandCapabilityRequirement(contract)
        ? []
        : [`${action.id}: ${action.vscodeCommand}`];
    });

    expect(failures).toEqual([]);
  });

  it('keeps every Studio governed producer on the Dashboard host execution plane', () => {
    const failures = STUDIO_EVIDENCE_REFRESH_COMMAND_IDS.filter(
      (commandId) =>
        commandId !== 'workspaceIntelligenceChain' &&
        !(DASHBOARD_COMMAND_CONTRACTS as Record<string, { cliArgs?: string[] }>)[commandId]?.cliArgs
          ?.length
    );

    expect(failures).toEqual([]);
  });
});
