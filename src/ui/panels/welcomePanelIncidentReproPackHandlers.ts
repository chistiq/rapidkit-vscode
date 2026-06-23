import path from 'node:path';
import * as vscode from 'vscode';

import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import {
  buildIncidentReplayQuery,
  buildLinkSafeExportBundle,
  parseImportedReproBundle,
} from './incidentReproPackUtils';
import type { WebviewFromExtensionMessage } from '../../contracts/webviewProtocol';
import type { ImportedIncidentReplay } from './welcomePanelChatBrainLifecycle';
import type { IncidentMemoryInfluenceAuditEntry } from './welcomePanel.shared.js';

export type IncidentReproPackHost = {
  resolveIncidentReplayWorkspacePath: (
    preferredWorkspacePath?: string
  ) => Promise<{ workspacePath: string; workspaceName: string } | null>;
  pendingImportedIncidentReplayByWorkspace: Map<string, ImportedIncidentReplay>;
  postChatBrainWebviewMessage: (message: WebviewFromExtensionMessage) => void;
  routeStudioToSecondarySidebar: (data: {
    workspacePath: string;
    workspaceName: string;
    initialQuery: string;
    composerHandoff: 'prefill' | 'submit';
    studioMode: 'investigate' | 'verify' | 'prepare';
    source: string;
    trigger: string;
  }) => Promise<void>;
  trackStudioEvent: (
    eventName: string,
    workspacePath: string | undefined,
    properties: Record<string, unknown>
  ) => void;
};

export async function handleExportIncidentReproPack(
  host: IncidentReproPackHost,
  data: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const reproPack =
    data &&
    typeof data === 'object' &&
    data.incidentReproPack &&
    typeof data.incidentReproPack === 'object'
      ? (data.incidentReproPack as {
          packId?: string;
          status?: string;
          capturedAt?: string;
          schemaVersion?: string;
          workspacePath?: string;
          conversationId?: string;
          actionId?: string;
          redaction?: {
            policy?: string;
            applied?: boolean;
            redactedFields?: string[];
          };
          summary?: {
            historyTurns?: number;
            hasDoctorEvidence?: boolean;
            hasRollbackEvidence?: boolean;
            hasSandboxEvidence?: boolean;
            hasPredictiveWarning?: boolean;
            verifySuccess?: boolean;
            affectedFilesCount?: number;
            blockedReasonCount?: number;
          };
          replayPayload?: {
            workspacePath?: string;
            conversationId?: string;
            actionType?: string;
            riskLevel?: 'low' | 'medium' | 'high' | 'critical';
            likelyFailureMode?: string;
            verifyChecklist?: string[];
            blockedReasons?: string[];
            relatedFiles?: string[];
          };
          exportHint?: string;
          sensitivityLabel?: 'internal' | 'restricted' | 'confidential';
          memoryInfluenceAuditTimeline?: IncidentMemoryInfluenceAuditEntry[];
        })
      : undefined;

  const messageAuditTimeline = Array.isArray(data?.memoryInfluenceAuditTimeline)
    ? (data.memoryInfluenceAuditTimeline as IncidentMemoryInfluenceAuditEntry[])
    : [];

  if (!reproPack?.packId || !reproPack.replayPayload) {
    vscode.window.showWarningMessage('No incident repro pack is available to export.');
    return;
  }

  const workspacePathInput =
    typeof data?.workspacePath === 'string' && data.workspacePath.trim()
      ? data.workspacePath.trim()
      : typeof reproPack.workspacePath === 'string' && reproPack.workspacePath.trim()
        ? reproPack.workspacePath.trim()
        : undefined;

  const exportProjectPath =
    typeof data?.projectPath === 'string' && data.projectPath.trim()
      ? data.projectPath.trim()
      : undefined;

  const workspaceResolution = await host.resolveIncidentReplayWorkspacePath(workspacePathInput);
  const defaultFileName = `${reproPack.packId}-redacted-bundle.json`;
  const defaultUri = workspaceResolution
    ? vscode.Uri.file(
        path.join(workspaceResolution.workspacePath, '.rapidkit', 'reports', defaultFileName)
      )
    : undefined;

  const outputUri = await vscode.window.showSaveDialog({
    title: 'Export Incident Repro Pack (Redacted)',
    saveLabel: 'Export Redacted Bundle',
    defaultUri,
    filters: {
      JSON: ['json'],
    },
  });

  if (!outputUri) {
    return;
  }

  const redactedBundle = buildLinkSafeExportBundle(
    {
      ...reproPack,
      packId: reproPack.packId,
      replayPayload: {
        ...reproPack.replayPayload,
        riskLevel:
          reproPack.replayPayload.riskLevel === 'low' ||
          reproPack.replayPayload.riskLevel === 'medium' ||
          reproPack.replayPayload.riskLevel === 'high' ||
          reproPack.replayPayload.riskLevel === 'critical'
            ? reproPack.replayPayload.riskLevel
            : 'high',
      },
      redaction: reproPack.redaction ?? {},
      summary: reproPack.summary ?? {},
      sensitivityLabel: reproPack.sensitivityLabel,
      memoryInfluenceAuditTimeline:
        reproPack.memoryInfluenceAuditTimeline && reproPack.memoryInfluenceAuditTimeline.length > 0
          ? reproPack.memoryInfluenceAuditTimeline
          : messageAuditTimeline,
    },
    workspaceResolution?.workspaceName || path.basename(workspacePathInput || '') || 'workspace'
  );

  await vscode.workspace.fs.writeFile(
    outputUri,
    Buffer.from(JSON.stringify(redactedBundle, null, 2), 'utf8')
  );

  await WorkspaceUsageTracker.getInstance().trackCommandEvent(
    'workspai.studio.incident_repro_pack_exported',
    workspaceResolution?.workspacePath || workspacePathInput,
    {
      packId: redactedBundle.incident_repro_pack.packId,
      redactionApplied: true,
      verifyChecklistCount: redactedBundle.incident_repro_pack.replayPayload.verifyChecklist.length,
      blockedReasonCount: redactedBundle.incident_repro_pack.replayPayload.blockedReasons.length,
      ...(exportProjectPath ? { projectPath: exportProjectPath } : {}),
    }
  );

  vscode.window.showInformationMessage(`Incident repro bundle exported: ${outputUri.fsPath}`);

  host.postChatBrainWebviewMessage({
    command: 'aiChatActionProgress',
    data: {
      stage: 'repro-exported',
      progress: 100,
      note: `Redacted bundle exported: ${path.basename(outputUri.fsPath)}`,
    },
    meta: { requestId, version: 'v1' },
  });
}

export async function handleImportIncidentReproPack(
  host: IncidentReproPackHost,
  _requestId?: string
): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: {
      JSON: ['json'],
      'All Files': ['*'],
    },
    openLabel: 'Import Incident Repro Bundle',
    title: 'Select incident repro bundle (JSON)',
  });

  const fileUri = picked?.[0];
  if (!fileUri) {
    return;
  }

  try {
    const rawBuffer = await vscode.workspace.fs.readFile(fileUri);
    const rawText = Buffer.from(rawBuffer).toString('utf8');
    const parsed = JSON.parse(rawText) as Record<string, unknown>;

    const normalizedReproPack = parseImportedReproBundle(parsed);
    const rawReplayWorkspacePath =
      typeof normalizedReproPack.replayPayload.workspacePath === 'string'
        ? normalizedReproPack.replayPayload.workspacePath.trim()
        : '';
    const workspaceResolution =
      await host.resolveIncidentReplayWorkspacePath(rawReplayWorkspacePath);

    if (!workspaceResolution) {
      throw new Error(
        'No local workspace is available for replay. Select or open a workspace first.'
      );
    }

    const initialQuery = buildIncidentReplayQuery(normalizedReproPack);
    host.pendingImportedIncidentReplayByWorkspace.set(workspaceResolution.workspacePath, {
      packId: normalizedReproPack.packId,
      actionType: normalizedReproPack.replayPayload.actionType,
      riskLevel: normalizedReproPack.replayPayload.riskLevel,
      likelyFailureMode: normalizedReproPack.replayPayload.likelyFailureMode,
      verifyChecklist: normalizedReproPack.replayPayload.verifyChecklist,
      blockedReasons: normalizedReproPack.replayPayload.blockedReasons,
      relatedFiles: normalizedReproPack.replayPayload.relatedFiles,
      importedFrom: path.basename(fileUri.fsPath),
    });

    await host.routeStudioToSecondarySidebar({
      workspacePath: workspaceResolution.workspacePath,
      workspaceName: workspaceResolution.workspaceName,
      initialQuery,
      composerHandoff: 'prefill',
      studioMode: 'investigate',
      source: 'incident-repro-import',
      trigger: 'import-repro-bundle',
    });

    await WorkspaceUsageTracker.getInstance().trackCommandEvent(
      'workspai.studio.incident_repro_pack_imported',
      workspaceResolution.workspacePath,
      {
        packId: normalizedReproPack.packId,
        sourceFile: path.basename(fileUri.fsPath),
        verifyChecklistCount: normalizedReproPack.replayPayload.verifyChecklist.length,
        blockedReasonCount: normalizedReproPack.replayPayload.blockedReasons.length,
      }
    );

    // Importing a repro pack from an external file is a team-expansion signal:
    // the bundle originated from a different session/user and is now being replayed here.
    host.trackStudioEvent(
      'workspai.studio.team_expansion_triggered',
      workspaceResolution.workspacePath,
      {
        packId: normalizedReproPack.packId,
        sourceFile: path.basename(fileUri.fsPath),
        actionType: normalizedReproPack.replayPayload.actionType ?? 'unknown',
        expansionType: 'repro_pack_import',
      }
    );

    host.trackStudioEvent(
      'workspai.studio.incident_replay_ready',
      workspaceResolution.workspacePath,
      {
        packId: normalizedReproPack.packId,
        actionType: normalizedReproPack.replayPayload.actionType,
        verifyChecklistCount: normalizedReproPack.replayPayload.verifyChecklist.length,
        blockedReasonCount: normalizedReproPack.replayPayload.blockedReasons.length,
      }
    );

    vscode.window.showInformationMessage(
      `Incident repro bundle imported and queued for replay: ${path.basename(fileUri.fsPath)}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to import incident repro bundle: ${message}`);
  }
}
