import * as path from 'path';
import * as vscode from 'vscode';

import type { DashboardEvidenceRefreshContext } from './doctorTelemetryRefresh';
import { resolveDashboardCommandContract } from '../../core/dashboardCommandContracts';
import { enrichDashboardEvidenceCommandData } from '../../core/dashboardEvidenceDirectRun';
import { runDashboardEvidenceContractCli } from '../../core/evidenceCommandRunner';
import { gateCompatibleCliVersion } from '../../core/cliVersionGate';
import { resolveEvidenceCardIdsForDashboardCommand } from '../../core/dashboardReportRegistry';

export type DashboardSelectedProject = {
  name: string;
  path: string;
  type?: string;
  workspacePath?: string;
  workspaceName?: string;
} | null;

export type DashboardCommandHost = {
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProject: () => DashboardSelectedProject;
  postDashboardCommandFailed: (
    command: string,
    reason: string,
    details?: {
      exitCode?: number;
      stderrTail?: string;
      suggestedNextAction?: string;
    }
  ) => void;
  sendDashboardEvidence: (context: DashboardEvidenceRefreshContext) => Promise<void>;
  refreshWorkspaceStatus: () => Promise<void>;
};

function getDashboardWorkspacePayload(
  host: DashboardCommandHost,
  command: string,
  data?: Record<string, unknown>
): ({ path: string; name?: string } & Record<string, unknown>) | null {
  if (data?.useDefaultWorkspace === true) {
    return null;
  }

  const contract = resolveDashboardCommandContract(command);
  const explicitPath = typeof data?.path === 'string' && data.path.trim() ? data.path.trim() : '';
  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  const selectedPath = selectedWorkspace?.path || '';
  const workspacePath = selectedPath || explicitPath || '';
  const workspaceName =
    (workspacePath === selectedPath ? selectedWorkspace?.name : undefined) ||
    (typeof data?.name === 'string' && data.name.trim()) ||
    selectedWorkspace?.name ||
    (workspacePath ? path.basename(workspacePath) : undefined);

  if (contract?.requiresWorkspace && !workspacePath) {
    vscode.window.showWarningMessage('Select a workspace first.');
    return null;
  }

  return workspacePath ? { ...data, path: workspacePath, name: workspaceName } : null;
}

function getDashboardProjectPayload(
  host: DashboardCommandHost,
  command: string
): { projectPath: string } | null {
  const contract = resolveDashboardCommandContract(command);
  const selectedProject = host.getSelectedProject();
  if (contract?.requiresProject && !selectedProject?.path) {
    vscode.window.showWarningMessage('Select a project in the sidebar first.');
    return null;
  }

  return selectedProject?.path ? { projectPath: selectedProject.path } : null;
}

function getSelectedProjectCommandContext(host: DashboardCommandHost): {
  workspace?: { name?: string; path?: string };
  project: {
    name?: string;
    path: string;
    type?: string;
    workspacePath?: string;
  };
} | null {
  const selectedProject = host.getSelectedProject();
  if (!selectedProject?.path) {
    vscode.window.showWarningMessage('Select a project first.');
    return null;
  }

  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  const workspacePath =
    selectedWorkspace?.path ||
    selectedProject.workspacePath ||
    (selectedProject.path ? path.dirname(selectedProject.path) : undefined);

  return {
    workspace: selectedWorkspace
      ? {
          name: selectedWorkspace.name,
          path: selectedWorkspace.path,
        }
      : workspacePath
        ? {
            name: selectedProject.workspaceName || path.basename(workspacePath),
            path: workspacePath,
          }
        : undefined,
    project: {
      name: selectedProject.name,
      path: selectedProject.path,
      type: selectedProject.type,
      workspacePath,
    },
  };
}

function failDashboardContractCommand(
  host: DashboardCommandHost,
  command: string,
  reason: string
): boolean {
  void vscode.window.showWarningMessage(reason);
  host.postDashboardCommandFailed(command, reason);
  return false;
}

export async function executeDashboardContractCommand(
  host: DashboardCommandHost,
  command: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  const contract = resolveDashboardCommandContract(command);
  if (!contract?.vscodeCommand) {
    return false;
  }
  const enrichedData = enrichDashboardEvidenceCommandData(command, data);

  if (command === 'importProject' || command === 'adoptProject') {
    const useDefaultWorkspace = enrichedData?.useDefaultWorkspace === true;
    const workspacePayload = useDefaultWorkspace
      ? null
      : getDashboardWorkspacePayload(host, command, enrichedData);
    const seed = {
      ...enrichedData,
      ...(workspacePayload
        ? {
            path: workspacePayload.path,
            name: workspacePayload.name,
            workspacePath: workspacePayload.path,
            useDefaultWorkspace: false,
          }
        : { useDefaultWorkspace: enrichedData?.useDefaultWorkspace ?? true }),
    };
    try {
      await vscode.commands.executeCommand(contract.vscodeCommand, seed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`${contract.label} failed: ${message}`);
      return false;
    }
    await host.refreshWorkspaceStatus();
    return true;
  }

  if (
    enrichedData?.evidenceDirectRun === true &&
    contract.executionMode === 'terminal-rapidkit' &&
    contract.cliArgs?.length
  ) {
    const workspacePayload = getDashboardWorkspacePayload(host, command, enrichedData);
    if (!workspacePayload?.path) {
      return failDashboardContractCommand(
        host,
        command,
        'Select a workspace before running this dashboard command.'
      );
    }

    const versionAllowed = await gateCompatibleCliVersion({
      cwd: workspacePayload.path,
      featureLabel: contract.label,
    });
    if (!versionAllowed) {
      host.postDashboardCommandFailed(
        command,
        `${contract.label} is blocked until the linked rapidkit CLI is compatible.`
      );
      return false;
    }

    const cliResult = await runDashboardEvidenceContractCli({
      command,
      workspacePath: workspacePayload.path,
      workspaceName: workspacePayload.name,
      data: enrichedData,
    });

    if (cliResult && cliResult.exitCode !== 0) {
      const stderrTail = cliResult.stderr.trim().split(/\r?\n/).slice(-3).join(' ').trim();
      const reason = `${contract.label} failed (exit ${cliResult.exitCode}).${stderrTail ? ` ${stderrTail}` : ''} See Workspai Evidence output.`;
      host.postDashboardCommandFailed(command, reason, {
        exitCode: cliResult.exitCode,
        stderrTail,
        suggestedNextAction: 'Repair evidence or open the Workspai Evidence output.',
      });
      void vscode.window.showWarningMessage(reason);
      return false;
    }

    const affectedCardIds = resolveEvidenceCardIdsForDashboardCommand(command);
    if (affectedCardIds.length > 0) {
      await host.sendDashboardEvidence({
        workspacePath: workspacePayload.path,
        cardIds: affectedCardIds as DashboardEvidenceRefreshContext['cardIds'],
        refreshMode: 'patch',
      });
    }

    await host.refreshWorkspaceStatus();
    return true;
  }

  if (contract.scope === 'module' || contract.payloadKind === 'module-maintenance') {
    const projectPayload = getDashboardProjectPayload(host, command);
    const selectedProject = host.getSelectedProject();
    if (!projectPayload || !selectedProject) {
      return failDashboardContractCommand(
        host,
        command,
        'Select a project before running module maintenance commands.'
      );
    }
    const moduleSlug =
      typeof enrichedData?.moduleSlug === 'string' ? enrichedData.moduleSlug : undefined;
    await vscode.commands.executeCommand(contract.vscodeCommand, {
      ...contract.payloadDefaults,
      project: selectedProject,
      ...projectPayload,
      moduleSlug,
      module: moduleSlug ? { slug: moduleSlug } : undefined,
      preferNonInteractive: true,
    });
    await host.refreshWorkspaceStatus();
    return true;
  }

  if (contract.payloadKind === 'project-context') {
    const contextItem = getSelectedProjectCommandContext(host);
    if (!contextItem) {
      return failDashboardContractCommand(
        host,
        command,
        'Select a project before running this dashboard command.'
      );
    }
    await vscode.commands.executeCommand(contract.vscodeCommand, {
      ...contextItem,
      ...contract.payloadDefaults,
      ...enrichedData,
    });
    return true;
  }

  if (contract.payloadKind === 'project-path' || contract.requiresProject) {
    const projectPayload = getDashboardProjectPayload(host, command);
    if (!projectPayload) {
      return failDashboardContractCommand(
        host,
        command,
        'Select a project before running this dashboard command.'
      );
    }
    await vscode.commands.executeCommand(contract.vscodeCommand, {
      ...contract.payloadDefaults,
      ...projectPayload,
      ...enrichedData,
    });
    return true;
  }

  if (contract.payloadKind === 'workspace' || contract.requiresWorkspace) {
    const workspacePayload = getDashboardWorkspacePayload(host, command, enrichedData);
    if (!workspacePayload) {
      return failDashboardContractCommand(
        host,
        command,
        'Select a workspace before running this dashboard command.'
      );
    }
    await vscode.commands.executeCommand(contract.vscodeCommand, {
      ...contract.payloadDefaults,
      ...workspacePayload,
      workspacePath: workspacePayload.path,
      workspaceName: workspacePayload.name,
      workspace: {
        name: workspacePayload.name,
        path: workspacePayload.path,
      },
    });
    return true;
  }

  await vscode.commands.executeCommand(contract.vscodeCommand);
  return true;
}

const DASHBOARD_WEBVIEW_DEBUG_LOG_COMMANDS = new Set(['checkWorkspaceHealth', 'exportWorkspace']);

export async function tryDispatchDashboardContractWebviewMessage(
  host: DashboardCommandHost,
  command: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  const contract = resolveDashboardCommandContract(command);
  if (!contract?.vscodeCommand) {
    return false;
  }

  if (DASHBOARD_WEBVIEW_DEBUG_LOG_COMMANDS.has(command)) {
    const debugLabel =
      command === 'checkWorkspaceHealth' ? 'Check Workspace Health' : 'Export Workspace';
    console.log(`[WelcomePanel] ${debugLabel} requested for:`, data?.path);
  }

  await executeDashboardContractCommand(host, command, data);
  return true;
}
