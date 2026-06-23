import * as vscode from 'vscode';

import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import {
  buildDashboardEvidenceBundle,
  resolveCardForReportKind,
} from '../../core/dashboardEvidenceBridge';
import {
  finalizeDashboardActivityFromReport,
  getDashboardActivityLog,
} from '../../core/dashboardActivityBridge';
import {
  advanceDashboardOpsChain,
  filterOpsChainForWorkspace,
  getDashboardOpsChain,
  getNextOpsChainCommand,
} from '../../core/dashboardOpsChainBridge';
import { resolveReportBinding } from '../../core/dashboardReportRegistry';
import { formatTtfvLabel, getTtfvRecord } from '../../core/ttfvBridge';
import type { DashboardEvidenceRefreshContext } from './doctorTelemetryRefresh';
import type { DashboardSelectedProject } from './welcomePanelDashboardCommands';
import type { RecentWorkspaceEntry } from './welcomePanelRecentWorkspaces';

export type DashboardEvidenceHost = {
  context: vscode.ExtensionContext;
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProject: () => DashboardSelectedProject;
  getFallbackWorkspacePath: () => string | undefined;
  getRecentWorkspaces: () => Promise<RecentWorkspaceEntry[]>;
  postWebviewMessage: (command: string, data?: unknown) => void;
  runDashboardOpsChainCommand: (
    command: string,
    workspacePath: string,
    workspaceName?: string
  ) => Promise<void>;
  beginEvidenceSendGeneration: () => number;
  isCurrentEvidenceSendGeneration: (generation: number) => boolean;
};

export function resolveDashboardProjectContext(
  workspacePath: string | undefined,
  selectedProject: DashboardSelectedProject
): {
  projectPath?: string;
  projectName?: string;
} {
  if (!selectedProject?.path) {
    return {};
  }
  if (workspacePath && !isWorkspacePathAncestor(workspacePath, selectedProject.path)) {
    return {};
  }
  return {
    projectPath: selectedProject.path,
    projectName: selectedProject.name,
  };
}

export function isActiveDashboardWorkspace(
  workspacePath: string | undefined,
  selectedWorkspace: { path: string } | null,
  selectedProject: DashboardSelectedProject
): boolean {
  if (!workspacePath) {
    return false;
  }
  if (selectedWorkspace?.path) {
    return selectedWorkspace.path === workspacePath;
  }
  if (selectedProject?.workspacePath) {
    return selectedProject.workspacePath === workspacePath;
  }
  return true;
}

export async function sendDashboardEvidence(
  host: DashboardEvidenceHost,
  context?: DashboardEvidenceRefreshContext | string
): Promise<void> {
  const normalizedContext: DashboardEvidenceRefreshContext | undefined =
    typeof context === 'string' ? { workspacePath: context } : context;

  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  const selectedProject = host.getSelectedProject();
  const workspacePath =
    normalizedContext?.workspacePath ||
    selectedWorkspace?.path ||
    selectedProject?.workspacePath ||
    host.getFallbackWorkspacePath();

  if (workspacePath && selectedWorkspace?.path && workspacePath !== selectedWorkspace.path) {
    return;
  }

  const sendGeneration = host.beginEvidenceSendGeneration();

  const projectContext =
    normalizedContext?.projectPath || normalizedContext?.projectName
      ? {
          projectPath: normalizedContext.projectPath,
          projectName: normalizedContext.projectName,
        }
      : resolveDashboardProjectContext(workspacePath, selectedProject);
  const recentWorkspaces = await host.getRecentWorkspaces();
  const hasActiveWorkspace = Boolean(selectedWorkspace?.path || selectedProject?.workspacePath);
  const recentWorkspaceCount = recentWorkspaces.length;
  const isFreshInstall = recentWorkspaceCount === 0 && !hasActiveWorkspace;
  const ttfvRecord = getTtfvRecord(host.context);
  const ttfvLabel = ttfvRecord?.ttfvMs != null ? formatTtfvLabel(ttfvRecord.ttfvMs) : null;

  const isPatch =
    normalizedContext?.refreshMode === 'patch' &&
    Array.isArray(normalizedContext.cardIds) &&
    normalizedContext.cardIds.length > 0;

  const bundle = await buildDashboardEvidenceBundle({
    workspacePath,
    projectPath: projectContext.projectPath,
    projectName: projectContext.projectName,
  });

  if (!host.isCurrentEvidenceSendGeneration(sendGeneration)) {
    return;
  }

  if (
    workspacePath &&
    !isActiveDashboardWorkspace(workspacePath, selectedWorkspace, selectedProject)
  ) {
    return;
  }

  const cards = isPatch
    ? bundle.cards.filter((card) => normalizedContext!.cardIds!.includes(card.id))
    : bundle.cards;

  if (normalizedContext?.reportPath) {
    const binding = resolveReportBinding(normalizedContext.reportPath);
    const card = binding
      ? resolveCardForReportKind(bundle, binding.kind, projectContext.projectPath)
      : undefined;
    if (card) {
      await finalizeDashboardActivityFromReport(
        host.context,
        normalizedContext.reportPath,
        card.status,
        card.blockers?.[0] ?? card.summary
      );
    }
  }

  const chainBefore = getDashboardOpsChain(host.context);
  let chainAfter = chainBefore;

  if (!isPatch && workspacePath && bundle.cards.length > 0) {
    chainAfter = await advanceDashboardOpsChain(host.context, bundle.cards, workspacePath);
  }

  if (
    !isPatch &&
    chainAfter &&
    chainBefore &&
    chainAfter.status === 'running' &&
    chainAfter.currentStep !== chainBefore.currentStep &&
    workspacePath
  ) {
    const nextCommand = getNextOpsChainCommand(chainAfter);
    if (nextCommand) {
      await host.runDashboardOpsChainCommand(
        nextCommand,
        workspacePath,
        chainAfter.workspaceName ?? selectedWorkspace?.name
      );
    }
  }

  if (!host.isCurrentEvidenceSendGeneration(sendGeneration)) {
    return;
  }

  const activity = getDashboardActivityLog(host.context);
  const opsChain = filterOpsChainForWorkspace(getDashboardOpsChain(host.context), workspacePath);

  host.postWebviewMessage(
    'dashboardEvidence',
    isPatch
      ? {
          workspacePath: bundle.workspacePath,
          projectPath: bundle.projectPath,
          projectName: bundle.projectName,
          cards,
          refreshMode: 'patch',
          patchCardIds: normalizedContext?.cardIds,
          requestId: normalizedContext?.requestId,
        }
      : {
          workspacePath: bundle.workspacePath,
          projectPath: bundle.projectPath,
          projectName: bundle.projectName,
          cards,
          activity,
          opsChain,
          onboarding: {
            isFreshInstall,
            recentWorkspaceCount,
            hasActiveWorkspace,
            ttfvLabel,
          },
          trend: bundle.trend ?? null,
          refreshMode: 'full',
          requestId: normalizedContext?.requestId,
        }
  );
}
