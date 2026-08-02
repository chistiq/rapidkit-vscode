import fs from 'fs-extra';
import path from 'path';

import { readWorkspaceVerifyReport } from './workspaceVerifyReader';
import { resolveWorkspaceReportsDir } from './workspaceIntelligencePaths';

export type AutopilotReleaseSnapshot = {
  approved: boolean;
  verdict?: string;
  exitCode?: number;
  generatedAt?: string;
  artifactPath?: string;
};

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    if (!(await fs.pathExists(filePath))) {
      return undefined;
    }
    const raw = await fs.readJSON(filePath);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export async function readAutopilotReleaseSnapshot(
  workspacePath: string
): Promise<AutopilotReleaseSnapshot | null> {
  const reportsDir = await resolveWorkspaceReportsDir(workspacePath);
  const aliasPath = path.join(reportsDir, 'autopilot-release.json');
  const lastRunPath = path.join(reportsDir, 'autopilot-release-last-run.json');
  const raw = (await readJsonIfExists(lastRunPath)) ?? (await readJsonIfExists(aliasPath));
  if (!raw) {
    return null;
  }

  const summary =
    raw.summary && typeof raw.summary === 'object' ? (raw.summary as Record<string, unknown>) : {};
  const verdictRaw = summary.verdict ?? raw.overallStatus ?? raw.status ?? raw.result;
  const verdict = typeof verdictRaw === 'string' ? verdictRaw.trim().toLowerCase() : undefined;
  const exitCode = Number.isFinite(Number(summary.exitCode))
    ? Number(summary.exitCode)
    : Number.isFinite(Number(raw.exitCode))
      ? Number(raw.exitCode)
      : undefined;
  const approved =
    verdict === 'approved' ||
    verdict === 'pass' ||
    verdict === 'ready' ||
    verdict === 'go' ||
    exitCode === 0;

  return {
    approved,
    verdict,
    exitCode,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    artifactPath: (await readJsonIfExists(lastRunPath)) ? lastRunPath : aliasPath,
  };
}

export async function isWorkspaceVerifyArtifactPassing(workspacePath: string): Promise<boolean> {
  const verifyReport = await readWorkspaceVerifyReport(workspacePath);
  if (!verifyReport) {
    return false;
  }

  const verifyBlockingReasons = verifyReport.blockingReasons ?? [];
  const verifyVerdict =
    typeof verifyReport.summary?.verdict === 'string'
      ? verifyReport.summary.verdict.trim().toLowerCase()
      : undefined;

  return (
    verifyVerdict === 'pass' ||
    verifyVerdict === 'go' ||
    (verifyVerdict === 'warn' && verifyBlockingReasons.length === 0) ||
    ((verifyReport.summary?.stepsPassed ?? 0) > 0 && verifyBlockingReasons.length === 0)
  );
}

export async function isWorkspaceReleaseArtifactReady(workspacePath: string): Promise<boolean> {
  const [autopilot, verifyPass] = await Promise.all([
    readAutopilotReleaseSnapshot(workspacePath),
    isWorkspaceVerifyArtifactPassing(workspacePath),
  ]);
  return autopilot?.approved === true && verifyPass;
}
