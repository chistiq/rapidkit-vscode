import * as vscode from 'vscode';

import {
  appendDashboardActivity,
  resolveDashboardCommandActivity,
} from '../../core/dashboardActivityBridge';
import {
  blockDashboardOpsChain,
  getDashboardOpsChain,
  getNextOpsChainCommand,
  startDashboardOpsChain,
} from '../../core/dashboardOpsChainBridge';
import type { DashboardEvidenceRefreshContext } from './doctorTelemetryRefresh';
import { resolveDashboardProjectContext } from './welcomePanelDashboardEvidence';
import type { DashboardSelectedProject } from './welcomePanelDashboardCommands';

export type DashboardOpsChainHost = {
  context: vscode.ExtensionContext;
  getSelectedProject: () => DashboardSelectedProject;
  executeDashboardContractCommand: (
    command: string,
    data?: Record<string, unknown>
  ) => Promise<boolean>;
  sendDashboardEvidence: (context?: DashboardEvidenceRefreshContext | string) => Promise<void>;
};

export async function runDashboardOpsChainCommand(
  host: DashboardOpsChainHost,
  command: string,
  workspacePath: string,
  workspaceName?: string
): Promise<void> {
  const payload = { path: workspacePath, name: workspaceName };
  const resolved = resolveDashboardCommandActivity(command);
  await appendDashboardActivity(host.context, {
    command,
    label: resolved.label,
    scope: resolved.scope,
  });

  const handled = await host.executeDashboardContractCommand(
    command,
    command === 'checkWorkspaceHealth'
      ? { ...payload, preferredAction: 'check' }
      : command === 'workspaceBootstrap'
        ? { ...payload, preferExistingProfile: true }
        : payload
  );
  if (!handled) {
    await blockDashboardOpsChain(
      host.context,
      workspacePath,
      `Could not dispatch ${command}. Select workspace/project context and retry.`
    );
    await host.sendDashboardEvidence({ workspacePath });
    return;
  }

  const projectContext = resolveDashboardProjectContext(workspacePath, host.getSelectedProject());
  await host.sendDashboardEvidence({
    workspacePath,
    projectPath: projectContext.projectPath,
    projectName: projectContext.projectName,
  });
}

export async function beginGovernanceChainForWorkspace(
  host: DashboardOpsChainHost,
  workspacePath: string,
  workspaceName: string | undefined,
  triggeredBy: 'clone' | 'ai-create' | 'import' | 'create' | 'add'
): Promise<void> {
  await startDashboardOpsChain(host.context, {
    workspacePath,
    workspaceName,
    triggeredBy,
  });
  const chain = getDashboardOpsChain(host.context);
  const firstCommand = getNextOpsChainCommand(chain);
  if (firstCommand) {
    await runDashboardOpsChainCommand(host, firstCommand, workspacePath, workspaceName);
  }
  await host.sendDashboardEvidence({ workspacePath });
}
