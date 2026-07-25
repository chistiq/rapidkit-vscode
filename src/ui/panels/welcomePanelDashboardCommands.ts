import * as path from 'path';
import * as vscode from 'vscode';

import type { DashboardEvidenceRefreshContext } from './doctorTelemetryRefresh';
import { resolveDashboardCommandContract } from '../../core/dashboardCommandContracts';
import { enrichDashboardEvidenceCommandData } from '../../core/dashboardEvidenceDirectRun';
import { runDashboardEvidenceContractCli } from '../../core/evidenceCommandRunner';
import { gateCompatibleCliVersion } from '../../core/cliVersionGate';
import { resolveEvidenceCardIdsForDashboardCommand } from '../../core/dashboardReportRegistry';
import { gateDashboardCommandCapability } from '../../core/dashboardCommandCapabilityGate';

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
  const nestedWorkspace =
    data?.workspace && typeof data.workspace === 'object'
      ? (data.workspace as { path?: unknown; name?: unknown })
      : undefined;
  const explicitPath =
    typeof data?.path === 'string' && data.path.trim()
      ? data.path.trim()
      : typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : typeof nestedWorkspace?.path === 'string' && nestedWorkspace.path.trim()
          ? nestedWorkspace.path.trim()
          : '';
  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  const selectedPath = selectedWorkspace?.path || '';
  const workspacePath = explicitPath || selectedPath || '';
  const workspaceName =
    (typeof data?.name === 'string' && data.name.trim()) ||
    (typeof data?.workspaceName === 'string' && data.workspaceName.trim()) ||
    (typeof nestedWorkspace?.name === 'string' && nestedWorkspace.name.trim()) ||
    (workspacePath === selectedPath ? selectedWorkspace?.name : undefined) ||
    (workspacePath ? path.basename(workspacePath) : undefined);

  if (contract?.requiresWorkspace && !workspacePath) {
    vscode.window.showWarningMessage('Select a workspace first.');
    return null;
  }

  return workspacePath ? { ...data, path: workspacePath, name: workspaceName } : null;
}

function getDashboardProjectPayload(
  host: DashboardCommandHost,
  command: string,
  data?: Record<string, unknown>
): {
  projectPath: string;
  projectName?: string;
  projectType?: string;
  workspacePath?: string;
} | null {
  const contract = resolveDashboardCommandContract(command);
  const explicitProjectPath =
    typeof data?.projectPath === 'string' && data.projectPath.trim()
      ? data.projectPath.trim()
      : undefined;
  if (explicitProjectPath) {
    return {
      projectPath: explicitProjectPath,
      projectName:
        typeof data?.projectName === 'string' && data.projectName.trim()
          ? data.projectName.trim()
          : undefined,
      projectType:
        typeof data?.projectType === 'string' && data.projectType.trim()
          ? data.projectType.trim()
          : undefined,
      workspacePath:
        typeof data?.workspacePath === 'string' && data.workspacePath.trim()
          ? data.workspacePath.trim()
          : undefined,
    };
  }

  const selectedProject = host.getSelectedProject();
  if (contract?.requiresProject && !selectedProject?.path) {
    vscode.window.showWarningMessage('Select a project in the sidebar first.');
    return null;
  }

  return selectedProject?.path
    ? {
        projectPath: selectedProject.path,
        projectName: selectedProject.name,
        projectType: selectedProject.type,
        workspacePath: selectedProject.workspacePath,
      }
    : null;
}

function getSelectedProjectCommandContext(
  host: DashboardCommandHost,
  data?: Record<string, unknown>
): {
  workspace?: { name?: string; path?: string };
  project: {
    name?: string;
    path: string;
    type?: string;
    workspacePath?: string;
  };
} | null {
  const explicitProjectPath =
    typeof data?.projectPath === 'string' && data.projectPath.trim()
      ? data.projectPath.trim()
      : undefined;
  if (explicitProjectPath) {
    const workspacePath =
      typeof data?.workspacePath === 'string' && data.workspacePath.trim()
        ? data.workspacePath.trim()
        : host.getSelectedWorkspaceInfo()?.path;
    const workspaceName =
      typeof data?.workspaceName === 'string' && data.workspaceName.trim()
        ? data.workspaceName.trim()
        : workspacePath
          ? path.basename(workspacePath)
          : undefined;
    return {
      workspace: workspacePath ? { path: workspacePath, name: workspaceName } : undefined,
      project: {
        path: explicitProjectPath,
        name:
          typeof data?.projectName === 'string' && data.projectName.trim()
            ? data.projectName.trim()
            : path.basename(explicitProjectPath),
        type:
          typeof data?.projectType === 'string' && data.projectType.trim()
            ? data.projectType.trim()
            : undefined,
        workspacePath,
      },
    };
  }

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

function getDashboardCommandCapabilityCwd(
  host: DashboardCommandHost,
  data?: Record<string, unknown>
): string | undefined {
  const nestedWorkspace =
    data?.workspace && typeof data.workspace === 'object'
      ? (data.workspace as { path?: unknown })
      : undefined;
  const explicitWorkspacePath =
    typeof data?.workspacePath === 'string' && data.workspacePath.trim()
      ? data.workspacePath.trim()
      : typeof data?.path === 'string' && data.path.trim()
        ? data.path.trim()
        : typeof nestedWorkspace?.path === 'string' && nestedWorkspace.path.trim()
          ? nestedWorkspace.path.trim()
          : undefined;
  return (
    explicitWorkspacePath ||
    host.getSelectedProject()?.path ||
    host.getSelectedWorkspaceInfo()?.path
  );
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
  const capability = await gateDashboardCommandCapability({
    contract,
    commandId: command,
    cwd: getDashboardCommandCapabilityCwd(host, enrichedData),
  });
  if (!capability.ok) {
    void vscode.window.showWarningMessage(capability.reason, 'Open Setup').then((choice) => {
      if (choice === 'Open Setup') {
        void vscode.commands.executeCommand('workspai.openSetup');
      }
    });
    host.postDashboardCommandFailed(command, capability.reason, {
      suggestedNextAction: 'Run npx workspai commands --json and update/link Workspai if needed.',
    });
    return false;
  }

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
        `${contract.label} is blocked until the linked Workspai CLI is compatible.`
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
    const projectPayload = getDashboardProjectPayload(host, command, enrichedData);
    const selectedProject = host.getSelectedProject();
    if (!projectPayload) {
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
      project: selectedProject ?? {
        path: projectPayload.projectPath,
        name: projectPayload.projectName ?? path.basename(projectPayload.projectPath),
        type: projectPayload.projectType,
        workspacePath: projectPayload.workspacePath,
      },
      ...projectPayload,
      moduleSlug,
      module: moduleSlug ? { slug: moduleSlug } : undefined,
      preferNonInteractive: true,
    });
    await host.refreshWorkspaceStatus();
    return true;
  }

  if (contract.payloadKind === 'project-context') {
    const contextItem = getSelectedProjectCommandContext(host, enrichedData);
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
    const projectPayload = getDashboardProjectPayload(host, command, enrichedData);
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

  try {
    await executeDashboardContractCommand(host, command, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = `${contract.label} failed: ${message}`;
    host.postDashboardCommandFailed(command, reason, {
      suggestedNextAction:
        'Open the mapped evidence card, then retry the command or send the blocker to Studio.',
    });
    void vscode.window.showErrorMessage(reason);
  }
  return true;
}
