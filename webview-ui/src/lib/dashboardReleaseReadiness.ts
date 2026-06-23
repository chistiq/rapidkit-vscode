import type { DashboardEvidencePayload, DashboardEvidenceStatus } from './dashboardEvidence';
import { findEvidenceCard, releaseHubStageStatus } from './dashboardEvidence';

export type DashboardReleaseGateReadiness = {
  releaseReady: boolean;
  projectCount: number | null;
  blockedReason?: string;
  needsStudioVerify: boolean;
  verifyStatus: DashboardEvidenceStatus;
};

function stageGreenEnough(status: DashboardEvidenceStatus): boolean {
  return status === 'pass' || status === 'warn';
}

export function workspaceRegisteredProjectCount(
  evidence: DashboardEvidencePayload | null | undefined
): number | null {
  const syncCard = findEvidenceCard(evidence, 'workspaceSync');
  const syncCount = Number(syncCard?.metrics?.projectCount ?? syncCard?.metrics?.projects);
  if (Number.isFinite(syncCount)) {
    return syncCount;
  }

  const modelCard = findEvidenceCard(evidence, 'workspaceModel');
  const raw = modelCard?.metrics?.projectCount;
  if (raw === undefined || raw === null) {
    return null;
  }
  const count = Number(raw);
  return Number.isFinite(count) ? count : null;
}

export function isWorkspaceEmptyForRelease(
  evidence: DashboardEvidencePayload | null | undefined
): boolean {
  const count = workspaceRegisteredProjectCount(evidence);
  return count === 0;
}

/**
 * Shared release-gate posture for Release Hub.
 * Studio ship loop additionally enforces telemetry verify-gates before archive/autopilot.
 */
export function deriveDashboardReleaseGateReadiness(
  evidence: DashboardEvidencePayload | null | undefined
): DashboardReleaseGateReadiness {
  const verifyStatus = findEvidenceCard(evidence, 'workspaceVerify')?.status ?? 'missing';
  const projectCount = workspaceRegisteredProjectCount(evidence);

  if (projectCount === 0) {
    return {
      releaseReady: false,
      projectCount: 0,
      blockedReason: 'Scaffold or import a project before release gates.',
      needsStudioVerify: false,
      verifyStatus,
    };
  }

  const readinessStatus = releaseHubStageStatus(evidence, 'readiness');
  const analyzeStatus = releaseHubStageStatus(evidence, 'analyze');

  const analyzeReady = stageGreenEnough(analyzeStatus);
  const readinessReady = stageGreenEnough(readinessStatus);
  const verifyReady = verifyStatus !== 'fail';
  const needsStudioVerify =
    analyzeReady && readinessReady && verifyReady && verifyStatus === 'missing';

  if (!analyzeReady || !readinessReady) {
    return {
      releaseReady: false,
      projectCount,
      blockedReason: 'Complete readiness and analyze first.',
      needsStudioVerify: false,
      verifyStatus,
    };
  }

  if (!verifyReady) {
    return {
      releaseReady: false,
      projectCount,
      blockedReason: 'Workspace verify failed — open Studio to re-run verify gates.',
      needsStudioVerify: true,
      verifyStatus,
    };
  }

  if (needsStudioVerify) {
    return {
      releaseReady: false,
      projectCount,
      blockedReason: 'Run verify gates in Studio before autopilot release.',
      needsStudioVerify: true,
      verifyStatus,
    };
  }

  return {
    releaseReady: true,
    projectCount,
    needsStudioVerify: false,
    verifyStatus,
  };
}
