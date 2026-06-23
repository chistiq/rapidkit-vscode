import * as vscode from 'vscode';

import { getWebviewMessageDataRecord, readStringField } from '../../contracts/webviewProtocol';
import { openWorkspacePath } from '../../utils/workspacePathNavigation';
import {
  analyzeReportExists,
  loadAnalyzeReport,
  runWorkspaceAnalyze,
} from './incidentStudioAnalyze';

export type AnalyzeReportMessageHost = {
  postWebviewMessage: (command: string, data?: unknown, options?: { error?: unknown }) => void;
};

const ANALYZE_REPORT_WEBVIEW_COMMANDS = new Set([
  'runAnalyze',
  'checkReportExists',
  'loadReport',
  'revealEvidence',
  'copyText',
]);

export function isAnalyzeReportWebviewCommand(command: string): boolean {
  return ANALYZE_REPORT_WEBVIEW_COMMANDS.has(command);
}

function readWorkspaceContext(data: unknown): {
  workspacePath: string;
  workspaceName: string;
} {
  const payload = getWebviewMessageDataRecord({ command: 'runAnalyze', data });
  return {
    workspacePath: readStringField(payload, 'workspacePath') ?? '',
    workspaceName: readStringField(payload, 'workspaceName') ?? 'Unknown Workspace',
  };
}

export async function tryDispatchAnalyzeReportWebviewMessage(
  host: AnalyzeReportMessageHost,
  command: string,
  data: unknown
): Promise<boolean> {
  if (!isAnalyzeReportWebviewCommand(command)) {
    return false;
  }

  switch (command) {
    case 'runAnalyze': {
      const { workspacePath, workspaceName } = readWorkspaceContext(data);
      if (!workspacePath.trim()) {
        vscode.window.showWarningMessage('Workspace path is required to run analyze.');
        break;
      }
      await runWorkspaceAnalyze({ workspacePath, workspaceName });
      const { report, error } = loadAnalyzeReport({ workspacePath, workspaceName });
      host.postWebviewMessage('reportLoaded', report, { error });
      host.postWebviewMessage('reportExistsResult', {
        exists: Boolean(report),
        workspacePath,
      });
      break;
    }
    case 'checkReportExists': {
      const { workspacePath } = readWorkspaceContext(data);
      const exists = workspacePath.trim() ? analyzeReportExists(workspacePath) : false;
      host.postWebviewMessage('reportExistsResult', { exists, workspacePath });
      break;
    }
    case 'loadReport': {
      const { workspacePath, workspaceName } = readWorkspaceContext(data);
      const { report, error } = loadAnalyzeReport({ workspacePath, workspaceName });
      host.postWebviewMessage('reportLoaded', report, { error });
      break;
    }
    case 'revealEvidence': {
      const payload = getWebviewMessageDataRecord({ command, data });
      const evidencePath = readStringField(payload, 'path') ?? '';
      const workspacePath = readStringField(payload, 'workspacePath') ?? '';

      if (!evidencePath.trim() || !workspacePath.trim()) {
        vscode.window.showWarningMessage('Evidence path is not available.');
        break;
      }

      try {
        await openWorkspacePath({ workspacePath, path: evidencePath });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Unable to open workspace path: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      break;
    }
    case 'copyText': {
      const payload = getWebviewMessageDataRecord({ command, data });
      const text = readStringField(payload, 'text') ?? '';
      if (text.trim()) {
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('Copied to clipboard.');
      }
      break;
    }
  }

  return true;
}
