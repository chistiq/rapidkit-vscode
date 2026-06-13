import * as vscode from 'vscode';
import fs from 'fs-extra';
import path from 'path';

import { WorkspaceUsageTracker } from '../../utils/workspaceUsageTracker';
import type { IncidentMemoryInfluenceAuditEntry } from './welcomePanel.shared.js';
import {
  buildIncidentReplayQuery,
  buildLinkSafeExportBundle,
  parseImportedReproBundle,
} from './incidentReproPackUtils';

export async function resolveIncidentReplayWorkspacePath(
  preferredWorkspacePath?: string,
  fallbackWorkspacePath?: string
): Promise<{ workspacePath: string; workspaceName: string } | null> {
  const candidatePaths: string[] = [];

  if (preferredWorkspacePath?.trim()) {
    candidatePaths.push(preferredWorkspacePath.trim());
  }
  if (fallbackWorkspacePath?.trim()) {
    candidatePaths.push(fallbackWorkspacePath.trim());
  }
  if (vscode.workspace.workspaceFolders?.length) {
    candidatePaths.push(vscode.workspace.workspaceFolders[0].uri.fsPath);
  }

  for (const candidate of candidatePaths) {
    if (candidate && (await fs.pathExists(candidate))) {
      return {
        workspacePath: candidate,
        workspaceName: path.basename(candidate),
      };
    }
  }

  return null;
}

export async function exportIncidentReproPack(
  data: Record<string, unknown> | undefined,
  options?: {
    fallbackWorkspacePath?: string;
    projectPath?: string;
    requestId?: string;
  }
): Promise<{ outputPath?: string; replayQuery?: string }> {
  const reproPack =
    data &&
    typeof data === 'object' &&
    data.incidentReproPack &&
    typeof data.incidentReproPack === 'object'
      ? (data.incidentReproPack as Record<string, unknown>)
      : undefined;

  const messageAuditTimeline = Array.isArray(data?.memoryInfluenceAuditTimeline)
    ? (data.memoryInfluenceAuditTimeline as IncidentMemoryInfluenceAuditEntry[])
    : [];

  if (
    !reproPack ||
    typeof reproPack.packId !== 'string' ||
    !reproPack.replayPayload ||
    typeof reproPack.replayPayload !== 'object'
  ) {
    vscode.window.showWarningMessage('No incident repro pack is available to export.');
    return {};
  }

  const workspacePathInput =
    typeof data?.workspacePath === 'string' && data.workspacePath.trim()
      ? data.workspacePath.trim()
      : typeof reproPack.workspacePath === 'string' && reproPack.workspacePath.trim()
        ? reproPack.workspacePath.trim()
        : options?.fallbackWorkspacePath;

  const workspaceResolution = await resolveIncidentReplayWorkspacePath(workspacePathInput);
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
    return {};
  }

  const replayPayload = reproPack.replayPayload as Record<string, unknown>;
  const redactedBundle = buildLinkSafeExportBundle(
    {
      ...reproPack,
      packId: reproPack.packId,
      replayPayload: {
        ...replayPayload,
        riskLevel:
          replayPayload.riskLevel === 'low' ||
          replayPayload.riskLevel === 'medium' ||
          replayPayload.riskLevel === 'high' ||
          replayPayload.riskLevel === 'critical'
            ? replayPayload.riskLevel
            : 'high',
      },
      redaction:
        reproPack.redaction && typeof reproPack.redaction === 'object' ? reproPack.redaction : {},
      summary: reproPack.summary && typeof reproPack.summary === 'object' ? reproPack.summary : {},
      sensitivityLabel: reproPack.sensitivityLabel as
        | 'internal'
        | 'restricted'
        | 'confidential'
        | undefined,
      memoryInfluenceAuditTimeline:
        Array.isArray(reproPack.memoryInfluenceAuditTimeline) &&
        reproPack.memoryInfluenceAuditTimeline.length > 0
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
      ...(options?.projectPath ? { projectPath: options.projectPath } : {}),
    }
  );

  vscode.window.showInformationMessage(`Incident repro bundle exported: ${outputUri.fsPath}`);
  return { outputPath: outputUri.fsPath };
}

export async function importIncidentReproPack(options?: {
  fallbackWorkspacePath?: string;
}): Promise<{ initialQuery?: string; workspacePath?: string; workspaceName?: string }> {
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
    return {};
  }

  const rawBuffer = await vscode.workspace.fs.readFile(fileUri);
  const rawText = Buffer.from(rawBuffer).toString('utf8');
  const parsed = JSON.parse(rawText) as Record<string, unknown>;
  const normalizedReproPack = parseImportedReproBundle(parsed);
  const rawReplayWorkspacePath =
    typeof normalizedReproPack.replayPayload.workspacePath === 'string'
      ? normalizedReproPack.replayPayload.workspacePath.trim()
      : '';
  const workspaceResolution = await resolveIncidentReplayWorkspacePath(
    rawReplayWorkspacePath,
    options?.fallbackWorkspacePath
  );

  if (!workspaceResolution) {
    throw new Error(
      'No local workspace is available for replay. Select or open a workspace first.'
    );
  }

  const initialQuery = buildIncidentReplayQuery(normalizedReproPack);

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

  return {
    initialQuery,
    workspacePath: workspaceResolution.workspacePath,
    workspaceName: workspaceResolution.workspaceName,
  };
}
