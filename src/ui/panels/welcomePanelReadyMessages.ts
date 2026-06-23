import * as vscode from 'vscode';

import type { ModuleData } from '../../data/modules';
import { SetupPanel } from './setupExperiencePanel.js';

export type DashboardSection =
  | 'overview'
  | 'repair'
  | 'evidence'
  | 'operate'
  | 'console'
  | 'catalog';

export type WorkspaceShareDashboardPayload = {
  summary: {
    sourceFile: string;
    workspaceName: string;
    workspaceProfile?: string;
    generatedAt?: string;
    schemaVersion: string;
    projectCount: number;
    runtimes: string[];
    doctorEvidenceIncluded: boolean;
    healthTotals: {
      passed: number;
      warnings: number;
      errors: number;
    };
  };
};

export type ReadyMessageHost = {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  postWebviewMessage: (command: string, data?: unknown) => void;
  markPanelReady: () => void;
  sendInitialData: () => void;
  takePendingFrameworkModal: () => string | null;
  getPendingAICreateMode: () => 'workspace' | 'project';
  getAICreateTargetWorkspace: () => { name?: string; path?: string } | undefined;
  takePendingModuleModal: () => ModuleData | null;
  takePendingWorkspaceShareDashboardOpen: () => WorkspaceShareDashboardPayload | null;
  takePendingSetupTabOpen: () => boolean;
  takePendingDashboardSectionOpen: () => DashboardSection | null;
};

export function isReadyWebviewCommand(command: string): boolean {
  return command === 'ready';
}

function flushPendingQueuedModals(host: ReadyMessageHost): void {
  const pending = host.takePendingFrameworkModal();
  if (pending) {
    if (pending === '__workspace__') {
      host.postWebviewMessage('openWorkspaceModal');
    } else if (pending === '__ai_create__') {
      const selectedWs = host.getAICreateTargetWorkspace();
      host.postWebviewMessage('openAICreateModal', {
        mode: host.getPendingAICreateMode(),
        targetWorkspaceName: selectedWs?.name,
        targetWorkspacePath: selectedWs?.path,
      });
    } else {
      host.postWebviewMessage('openProjectModal', { framework: pending });
    }
  }

  const moduleData = host.takePendingModuleModal();
  if (moduleData) {
    host.postWebviewMessage('openModuleInstallModal', moduleData);
  }

  const shareData = host.takePendingWorkspaceShareDashboardOpen();
  if (shareData) {
    host.postWebviewMessage('openWorkspaceShareDashboard', shareData);
  }

  if (host.takePendingSetupTabOpen()) {
    host.postWebviewMessage('setActiveView', { view: 'setup' });
    SetupPanel.bootstrapEmbedded(host.context, host.webview);
  }

  const section = host.takePendingDashboardSectionOpen();
  if (section) {
    host.postWebviewMessage('setActiveView', {
      view: 'dashboard',
      dashboardSection: section,
    });
  }
}

export function handleReadyWebviewMessage(host: ReadyMessageHost): void {
  host.markPanelReady();
  host.sendInitialData();
  flushPendingQueuedModals(host);
}
