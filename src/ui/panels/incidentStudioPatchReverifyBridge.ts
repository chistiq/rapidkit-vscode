import * as vscode from 'vscode';

import type { WorkspaceContext } from './incidentStudioAnalyze';
import { executeStudioActionById } from './incidentStudioActionBridge';
import { refreshIncidentStudioShipLoopSurfaces } from './incidentStudioShipLoopBridge';

export type PostPatchShipLoopRefreshInput = {
  webview: vscode.Webview;
  context: vscode.ExtensionContext;
  workspace: WorkspaceContext;
  projectPath?: string;
  patchSucceeded: boolean;
  requestId?: string;
  autoVerifyGates?: boolean;
};

export async function runPostPatchShipLoopRefresh(
  input: PostPatchShipLoopRefreshInput
): Promise<void> {
  if (!input.patchSucceeded) {
    return;
  }

  await refreshIncidentStudioShipLoopSurfaces({
    webview: input.webview,
    context: input.context,
    workspacePath: input.workspace.workspacePath,
    projectPath: input.projectPath,
    requestId: input.requestId,
  });

  let verifySummary: string | undefined;
  let verifySuccess: boolean | undefined;

  if (input.autoVerifyGates !== false) {
    try {
      const { actionResult } = await executeStudioActionById(
        input.context,
        input.workspace,
        'verify-gates',
        { source: 'post-patch-reverify' }
      );
      verifySummary = actionResult?.summary;
      verifySuccess = actionResult?.gatePassed !== false;
      await refreshIncidentStudioShipLoopSurfaces({
        webview: input.webview,
        context: input.context,
        workspacePath: input.workspace.workspacePath,
        projectPath: input.projectPath,
        requestId: input.requestId,
      });
    } catch (error) {
      verifySummary = error instanceof Error ? error.message : String(error);
      verifySuccess = false;
    }
  }

  await input.webview.postMessage({
    command: 'shipLoopPatchReverifyHint',
    data: {
      suggestedStep: 'verify-gates',
      verifySuccess,
      verifySummary,
      message:
        verifySuccess === false
          ? 'Patch applied, but automatic verify-gates failed. Review evidence before release.'
          : 'Patch applied. Ship loop evidence and verify gates were refreshed.',
    },
    meta: input.requestId ? { requestId: input.requestId } : undefined,
  });
}
