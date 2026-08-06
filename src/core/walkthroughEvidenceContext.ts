import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';

import {
  AGENT_REPORTS_INDEX_PATH,
  AGENTS_MD_PATH,
  AGENT_CUSTOMIZATION_PACK_REPORT_PATH,
  WORKSPACE_MODEL_REPORT_PATH,
  workspaceArtifactCandidates,
} from './workspaceIntelligencePaths';
import {
  evaluateAgentCustomizationPackSynced,
  parseAgentCustomizationPack,
} from './agentCustomizationPack';
import { recordTtfvIfNeeded } from './ttfvBridge';

/**
 * Evidence-driven Getting Started walkthrough (roadmap item 2.7). Each checklist
 * step is marked done only when its canonical `.workspai/reports/` artifact
 * exists (and, for doctor, has no blocking error) — not merely when the user clicks "Run".
 * Completion is surfaced to VS Code via `setContext` keys consumed by the
 * walkthrough `completionEvents` (`onContext:...`).
 */
export const WALKTHROUGH_HAS_MODEL_CONTEXT = 'workspai:hasWorkspaceModel';
export const WALKTHROUGH_DOCTOR_GREEN_CONTEXT = 'workspai:doctorGreen';
export const WALKTHROUGH_AGENT_SYNC_CONTEXT = 'workspai:agentGroundingSynced';

export interface WalkthroughEvidenceState {
  hasWorkspaceModel: boolean;
  doctorGreen: boolean;
  agentGroundingSynced: boolean;
}

const EMPTY_STATE: WalkthroughEvidenceState = {
  hasWorkspaceModel: false,
  doctorGreen: false,
  agentGroundingSynced: false,
};

/**
 * Pure: the legacy "doctorGreen" walkthrough context means Doctor has current,
 * scored evidence with no blocking error. Warnings remain visible advisories and
 * do not trap users in onboarding unless workspace policy promotes them to a
 * blocking verification finding.
 */
export function evaluateDoctorGreen(report: unknown): boolean {
  if (!report || typeof report !== 'object') {
    return false;
  }
  const healthScore = (report as Record<string, unknown>).healthScore;
  if (!healthScore || typeof healthScore !== 'object') {
    return false;
  }
  const score = healthScore as Record<string, unknown>;
  const total = Number(score.total ?? 0);
  const errors = Number(score.errors ?? 0);
  return total > 0 && errors === 0;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return await fs.pathExists(filePath);
  } catch {
    return false;
  }
}

async function readJsonSafe(filePath: string): Promise<unknown> {
  try {
    if (!(await fs.pathExists(filePath))) {
      return null;
    }
    return await fs.readJSON(filePath);
  } catch {
    return null;
  }
}

async function firstExistingArtifactPath(
  workspacePath: string,
  relativePath: string
): Promise<string> {
  for (const candidate of workspaceArtifactCandidates(relativePath)) {
    const absolutePath = path.join(workspacePath, candidate);
    if (await fileExists(absolutePath)) {
      return absolutePath;
    }
  }
  return path.join(workspacePath, relativePath);
}

/** Resolve the walkthrough checklist state from on-disk evidence. */
export async function resolveWalkthroughEvidenceState(
  workspacePath: string | null | undefined
): Promise<WalkthroughEvidenceState> {
  if (!workspacePath) {
    return { ...EMPTY_STATE };
  }

  const [modelPath, doctorPath, indexPath, packPath] = await Promise.all([
    firstExistingArtifactPath(workspacePath, WORKSPACE_MODEL_REPORT_PATH),
    firstExistingArtifactPath(workspacePath, '.workspai/reports/doctor-last-run.json'),
    firstExistingArtifactPath(workspacePath, AGENT_REPORTS_INDEX_PATH),
    firstExistingArtifactPath(workspacePath, AGENT_CUSTOMIZATION_PACK_REPORT_PATH),
  ]);

  const [hasWorkspaceModel, doctorReport, hasIndex, hasAgentsMd, packRaw] = await Promise.all([
    fileExists(modelPath),
    readJsonSafe(doctorPath),
    fileExists(indexPath),
    fileExists(path.join(workspacePath, AGENTS_MD_PATH)),
    readJsonSafe(packPath),
  ]);

  const pack = parseAgentCustomizationPack(packRaw);

  return {
    hasWorkspaceModel,
    doctorGreen: evaluateDoctorGreen(doctorReport),
    agentGroundingSynced: evaluateAgentCustomizationPackSynced(pack, {
      hasIndex,
      hasAgentsMd,
    }),
  };
}

/**
 * Resolve and publish the walkthrough completion context keys. Safe to call from
 * any evidence refresh path; missing workspace clears all steps.
 *
 * When `options.context` is supplied, also attempts a one-time TTFV record
 * (roadmap item 2.9) from the canonical on-disk `.workspai/reports/`
 * authority, with the legacy report directory retained as a read-only fallback.
 */
export async function syncWalkthroughEvidenceContext(
  workspacePath: string | null | undefined,
  options?: { context?: vscode.ExtensionContext; extensionVersion?: string }
): Promise<WalkthroughEvidenceState> {
  const state = await resolveWalkthroughEvidenceState(workspacePath);
  await Promise.all([
    vscode.commands.executeCommand(
      'setContext',
      WALKTHROUGH_HAS_MODEL_CONTEXT,
      state.hasWorkspaceModel
    ),
    vscode.commands.executeCommand(
      'setContext',
      WALKTHROUGH_DOCTOR_GREEN_CONTEXT,
      state.doctorGreen
    ),
    vscode.commands.executeCommand(
      'setContext',
      WALKTHROUGH_AGENT_SYNC_CONTEXT,
      state.agentGroundingSynced
    ),
  ]);
  if (options?.context) {
    await recordTtfvIfNeeded(options.context, workspacePath, {
      extensionVersion: options.extensionVersion,
    });
  }
  return state;
}
