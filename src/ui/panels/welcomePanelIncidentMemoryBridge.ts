import path from 'node:path';
import fs from 'fs-extra';
import * as vscode from 'vscode';

import { isWorkspacePathAncestor } from '../../core/aiContextResolver';
import { WorkspaceMemoryService } from '../../core/workspaceMemoryService';
import { readDoctorEvidenceSnapshot } from './incidentStudioDoctorEvidence';
import {
  buildIncidentMemoryReuseSnapshot,
  detectRepeatedIncident,
  mergeIncidentReplayLearningIntoMemory,
} from './incidentStudioMemory';

export type IncidentMemoryBridgeHost = {
  getSelectedWorkspaceInfo: () => { name: string; path: string } | null;
  getSelectedProject: () => { path: string; name?: string } | null | undefined;
};

export async function resolveIncidentReplayWorkspacePath(
  host: IncidentMemoryBridgeHost,
  preferredWorkspacePath?: string
): Promise<{ workspacePath: string; workspaceName: string } | null> {
  const candidatePaths: string[] = [];

  if (preferredWorkspacePath?.trim()) {
    candidatePaths.push(preferredWorkspacePath.trim());
  }

  const selectedWorkspace = host.getSelectedWorkspaceInfo();
  if (selectedWorkspace?.path) {
    candidatePaths.push(selectedWorkspace.path);
  }

  if (vscode.workspace.workspaceFolders?.length) {
    candidatePaths.push(vscode.workspace.workspaceFolders[0].uri.fsPath);
  }

  for (const candidate of candidatePaths) {
    if (!candidate) {
      continue;
    }
    if (await fs.pathExists(candidate)) {
      return {
        workspacePath: candidate,
        workspaceName:
          selectedWorkspace?.path === candidate ? selectedWorkspace.name : path.basename(candidate),
      };
    }
  }

  return null;
}

export async function readDoctorEvidenceSnapshotForPanel(
  host: IncidentMemoryBridgeHost,
  workspacePath?: string,
  options?: { projectPath?: string }
) {
  const selectedProject = host.getSelectedProject();
  const selectedProjectPath =
    options?.projectPath?.trim() ||
    (selectedProject?.path &&
    workspacePath &&
    isWorkspacePathAncestor(workspacePath, selectedProject.path)
      ? selectedProject.path
      : undefined);
  return readDoctorEvidenceSnapshot(workspacePath, { projectPath: selectedProjectPath });
}

export async function readDoctorEvidenceSummaryForPanel(
  host: IncidentMemoryBridgeHost,
  workspacePath?: string
) {
  const snapshot = await readDoctorEvidenceSnapshotForPanel(host, workspacePath);
  if (!snapshot) {
    return undefined;
  }

  return {
    healthScoreText: `${snapshot.health.percent}% (${snapshot.health.passed} passed, ${snapshot.health.warnings} warnings, ${snapshot.health.errors} errors)`,
    generatedAt: snapshot.generatedAt,
    passed: snapshot.health.passed,
    warnings: snapshot.health.warnings,
    errors: snapshot.health.errors,
  };
}

export async function buildIncidentMemoryReuseSnapshotForPanel(
  host: IncidentMemoryBridgeHost,
  input: {
    workspacePath?: string;
    queryText?: string;
    actionType?: string;
  }
) {
  const workspacePath = input.workspacePath;
  if (!workspacePath) {
    return null;
  }

  try {
    const memoryService = WorkspaceMemoryService.getInstance();
    const [memory, doctorSummary] = await Promise.all([
      memoryService.readNearest(workspacePath),
      readDoctorEvidenceSnapshotForPanel(host, workspacePath),
    ]);

    return buildIncidentMemoryReuseSnapshot({
      workspaceMemoryContext: memory.context,
      conventions: memory.conventions,
      decisions: memory.decisions,
      doctorFixCommands: doctorSummary?.fixCommands,
      queryText: input.queryText,
      actionType: input.actionType,
    });
  } catch {
    return null;
  }
}

export async function detectIncidentRepeatSignalForPanel(
  _host: IncidentMemoryBridgeHost,
  input: {
    workspacePath: string;
    queryText?: string;
    actionType?: string;
  }
) {
  try {
    const memoryService = WorkspaceMemoryService.getInstance();
    const memory = await memoryService.readNearest(input.workspacePath);
    return detectRepeatedIncident({
      decisions: memory.decisions,
      queryText: input.queryText,
      actionType: input.actionType,
    });
  } catch {
    return null;
  }
}

export async function persistIncidentReplayLearningForPanel(
  _host: IncidentMemoryBridgeHost,
  input: {
    workspacePath: string;
    packId: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    likelyFailureMode?: string;
    verifyChecklist: string[];
    blockedReasons: string[];
    relatedFiles: string[];
  }
): Promise<boolean> {
  try {
    const memoryService = WorkspaceMemoryService.getInstance();
    const currentMemory = await memoryService.read(input.workspacePath);
    const nextMemory = mergeIncidentReplayLearningIntoMemory(currentMemory, {
      packId: input.packId,
      actionType: input.actionType,
      riskLevel: input.riskLevel,
      likelyFailureMode: input.likelyFailureMode,
      verifyChecklist: input.verifyChecklist,
      blockedReasons: input.blockedReasons,
      relatedFiles: input.relatedFiles,
    });

    if (JSON.stringify(nextMemory) === JSON.stringify(currentMemory)) {
      return false;
    }

    await memoryService.write(input.workspacePath, nextMemory, {
      actor: 'incident-studio.replay-learning',
      operation: 'incident-replay-learning',
      mode: 'system-enrichment',
      reason: 'Persist replay learning from incident repro pack evidence.',
      approvedByUser: false,
    });
    return true;
  } catch {
    return false;
  }
}
