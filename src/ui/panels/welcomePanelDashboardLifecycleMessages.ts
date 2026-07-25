import * as vscode from 'vscode';

import {
  getWebviewMessageDataRecord,
  readDashboardEvidenceCardIds,
  readDashboardEvidenceRefreshMode,
  readNumberField,
  readStringField,
  readTrimmedStringField,
} from '../../contracts/webviewProtocol';
import {
  appendDashboardActivity,
  clearDashboardActivity,
  resolveDashboardCommandActivity,
} from '../../core/dashboardActivityBridge';
import { buildDashboardNavigationTelemetryCommand } from '../../core/dashboardNavigationTelemetry';
import { clearDashboardOpsChain } from '../../core/dashboardOpsChainBridge';
import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import type { DashboardEvidenceRefreshContext } from './doctorTelemetryRefresh';
import type {
  WorkspaceGraphRecordingFrameInput,
  WorkspaceGraphRecordingStartInput,
  WorkspaceGraphRecordingStopInput,
} from '../../contracts/workspaceGraphRecording.js';

export type DashboardLifecycleMessageHost = {
  context: vscode.ExtensionContext;
  sendDashboardEvidence: (context?: DashboardEvidenceRefreshContext) => Promise<void>;
  sendWorkspaceToolStatus: () => Promise<void>;
  resolveTelemetryWorkspacePath: () => string | undefined;
  startWorkspaceGraphStream?: (workspacePath: string) => void;
  stopWorkspaceGraphStream?: () => void;
  resyncWorkspaceGraphStream?: () => void;
  startWorkspaceGraphRecording?: (input: WorkspaceGraphRecordingStartInput) => Promise<void>;
  appendWorkspaceGraphRecordingFrame?: (input: WorkspaceGraphRecordingFrameInput) => Promise<void>;
  stopWorkspaceGraphRecording?: (input: WorkspaceGraphRecordingStopInput) => Promise<void>;
  openWorkspaceGraphRecording?: () => Promise<void>;
  postDashboardEvidenceRefreshFailed?: (input: {
    reason: string;
    cardIds?: DashboardEvidenceRefreshContext['cardIds'];
    requestId?: number;
    refreshMode?: DashboardEvidenceRefreshContext['refreshMode'];
  }) => void;
};

const DASHBOARD_LIFECYCLE_WEBVIEW_COMMANDS = new Set([
  'dashboardPerf',
  'requestWorkspaceToolStatus',
  'requestDashboardEvidence',
  'refreshDashboardEvidenceCard',
  'clearDashboardActivity',
  'dismissDashboardOpsChain',
  'trackDashboardCommand',
  'trackDashboardNavigation',
  'startWorkspaceGraphStream',
  'stopWorkspaceGraphStream',
  'resyncWorkspaceGraphStream',
  'startWorkspaceGraphRecording',
  'appendWorkspaceGraphRecordingFrame',
  'stopWorkspaceGraphRecording',
  'openWorkspaceGraphRecording',
]);

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendDashboardEvidenceOrPostFailure(
  host: DashboardLifecycleMessageHost,
  context: DashboardEvidenceRefreshContext
): Promise<void> {
  try {
    await host.sendDashboardEvidence(context);
  } catch (error) {
    const message = failureMessage(error);
    const cardIds =
      context.refreshMode === 'patch' && Array.isArray(context.cardIds) ? context.cardIds : [];
    host.postDashboardEvidenceRefreshFailed?.({
      reason: `Dashboard evidence refresh failed: ${message}`,
      cardIds,
      requestId: context.requestId,
      refreshMode: context.refreshMode,
    });
    void vscode.window.showErrorMessage(`Dashboard evidence refresh failed: ${message}`);
  }
}

export function isDashboardLifecycleWebviewCommand(command: string): boolean {
  return DASHBOARD_LIFECYCLE_WEBVIEW_COMMANDS.has(command);
}

export async function tryDispatchDashboardLifecycleWebviewMessage(
  host: DashboardLifecycleMessageHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!isDashboardLifecycleWebviewCommand(command)) {
    return false;
  }

  switch (command) {
    case 'dashboardPerf':
      console.info('[WelcomePanel] dashboard performance', data);
      break;
    case 'requestWorkspaceToolStatus':
      await host.sendWorkspaceToolStatus();
      break;
    case 'startWorkspaceGraphStream': {
      const payload = getWebviewMessageDataRecord({ command, data });
      const workspacePath = readTrimmedStringField(payload, 'workspacePath');
      if (workspacePath) {
        host.startWorkspaceGraphStream?.(workspacePath);
      }
      break;
    }
    case 'stopWorkspaceGraphStream':
      host.stopWorkspaceGraphStream?.();
      break;
    case 'resyncWorkspaceGraphStream':
      host.resyncWorkspaceGraphStream?.();
      break;
    case 'startWorkspaceGraphRecording': {
      const payload = getWebviewMessageDataRecord({ command, data });
      const workspacePath = readTrimmedStringField(payload, 'workspacePath');
      const initialRevision = readTrimmedStringField(payload, 'initialRevision');
      const mode = readTrimmedStringField(payload, 'mode');
      if (
        workspacePath &&
        initialRevision &&
        (mode === 'manual' || mode === 'change-driven' || mode === 'scenario')
      ) {
        await host.startWorkspaceGraphRecording?.({ workspacePath, initialRevision, mode });
      }
      break;
    }
    case 'appendWorkspaceGraphRecordingFrame': {
      const payload = getWebviewMessageDataRecord({ command, data });
      const sessionId = readTrimmedStringField(payload, 'sessionId');
      const revision = readTrimmedStringField(payload, 'revision');
      const capturedAt = readTrimmedStringField(payload, 'capturedAt');
      const pngDataUrl = readStringField(payload, 'pngDataUrl');
      const width = readNumberField(payload, 'width');
      const height = readNumberField(payload, 'height');
      const change =
        payload.change && typeof payload.change === 'object' && !Array.isArray(payload.change)
          ? payload.change
          : null;
      if (sessionId && revision && capturedAt && pngDataUrl && width && height && change) {
        await host.appendWorkspaceGraphRecordingFrame?.({
          sessionId,
          revision,
          capturedAt,
          pngDataUrl,
          width,
          height,
          change: change as WorkspaceGraphRecordingFrameInput['change'],
        });
      }
      break;
    }
    case 'stopWorkspaceGraphRecording': {
      const payload = getWebviewMessageDataRecord({ command, data });
      const sessionId = readTrimmedStringField(payload, 'sessionId');
      if (sessionId) {
        await host.stopWorkspaceGraphRecording?.({
          sessionId,
          webmDataUrl: readStringField(payload, 'webmDataUrl'),
        });
      }
      break;
    }
    case 'openWorkspaceGraphRecording':
      await host.openWorkspaceGraphRecording?.();
      break;
    case 'requestDashboardEvidence': {
      const payload = getWebviewMessageDataRecord({ command, data });
      await sendDashboardEvidenceOrPostFailure(host, {
        workspacePath: readStringField(payload, 'workspacePath'),
        projectPath: readStringField(payload, 'projectPath'),
        projectName: readStringField(payload, 'projectName'),
        reportPath: readStringField(payload, 'reportPath'),
        refreshMode: readDashboardEvidenceRefreshMode(payload, 'full'),
        requestId: readNumberField(payload, 'requestId'),
      });
      break;
    }
    case 'refreshDashboardEvidenceCard': {
      const payload = getWebviewMessageDataRecord({ command, data });
      await sendDashboardEvidenceOrPostFailure(host, {
        workspacePath: readStringField(payload, 'workspacePath'),
        projectPath: readStringField(payload, 'projectPath'),
        projectName: readStringField(payload, 'projectName'),
        cardIds: readDashboardEvidenceCardIds(payload),
        refreshMode: 'patch',
        requestId: readNumberField(payload, 'requestId'),
      });
      break;
    }
    case 'clearDashboardActivity':
      await clearDashboardActivity(host.context);
      await host.sendDashboardEvidence();
      break;
    case 'dismissDashboardOpsChain':
      await clearDashboardOpsChain(host.context);
      await host.sendDashboardEvidence();
      break;
    case 'trackDashboardCommand': {
      const trackedCommand =
        readTrimmedStringField(getWebviewMessageDataRecord({ command, data }), 'command') ?? '';
      if (trackedCommand.length > 0) {
        const resolved = resolveDashboardCommandActivity(trackedCommand);
        await appendDashboardActivity(host.context, {
          command: trackedCommand,
          label: resolved.label,
          scope: resolved.scope,
        });
        await host.sendDashboardEvidence();
      }
      break;
    }
    case 'trackDashboardNavigation': {
      const payload = getWebviewMessageDataRecord({ command, data });
      const section = readTrimmedStringField(payload, 'section') ?? '';
      if (section.length > 0) {
        const operateZone = readTrimmedStringField(payload, 'operateZone');
        const navigationSource = readStringField(payload, 'source') ?? 'tab';
        const telemetryCommand = buildDashboardNavigationTelemetryCommand(section, operateZone);
        void WorkspaceUsageTracker.getInstance().trackCommandEvent(
          telemetryCommand,
          host.resolveTelemetryWorkspacePath(),
          {
            source: 'dashboard',
            navigationSource,
            section,
            ...(operateZone ? { operateZone } : {}),
          }
        );
      }
      break;
    }
  }

  return true;
}
