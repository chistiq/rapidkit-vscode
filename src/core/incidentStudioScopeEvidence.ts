import * as path from 'path';

import type { WorkspaceImpactReport } from './workspaceImpactReader';

export type IncidentScopeEvidenceInput = {
  requiresImpactReview: boolean;
  graphScopeKnown: boolean;
  c07ScopeBlocked: boolean;
  affectedFiles: string[];
  affectedModules: string[];
  affectedTests: string[];
  explicitScopeFilePaths: string[];
  selectedProjectPath?: string;
  workspaceImpactReport: WorkspaceImpactReport | null;
  actionType: string;
};

export type IncidentScopeEvidenceResult = {
  scopeKnown: boolean;
  scopeSource: 'graph' | 'explicit-paths' | 'npm-impact' | 'none';
  supplementalAffectedFiles: string[];
  useNpmImpactReview: boolean;
};

function normalizeProjectRelativePath(projectPath: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(projectPath, filePath);
}

function isProjectScopedMutationAction(actionType: string): boolean {
  const normalized = actionType.trim().toLowerCase();
  return (
    normalized === 'apply-debug-patch' ||
    normalized === 'apply-module-gen' ||
    normalized === 'fix-preview-lite' ||
    normalized === 'doctor-fix' ||
    normalized === 'inline-command'
  );
}

export function resolveIncidentScopeEvidence(
  input: IncidentScopeEvidenceInput
): IncidentScopeEvidenceResult {
  const hasAffectedInventory =
    input.affectedFiles.length > 0 ||
    input.affectedModules.length > 0 ||
    input.affectedTests.length > 0;

  const graphResolved = input.graphScopeKnown && !input.c07ScopeBlocked && hasAffectedInventory;

  if (graphResolved) {
    return {
      scopeKnown: true,
      scopeSource: 'graph',
      supplementalAffectedFiles: [],
      useNpmImpactReview: false,
    };
  }

  const explicitPaths = input.explicitScopeFilePaths
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const resolvedExplicitPaths =
    input.selectedProjectPath && explicitPaths.length > 0
      ? explicitPaths.map((entry) =>
          normalizeProjectRelativePath(input.selectedProjectPath as string, entry)
        )
      : explicitPaths;

  if (
    !input.c07ScopeBlocked &&
    resolvedExplicitPaths.length > 0 &&
    Boolean(input.selectedProjectPath)
  ) {
    return {
      scopeKnown: true,
      scopeSource: 'explicit-paths',
      supplementalAffectedFiles: resolvedExplicitPaths,
      useNpmImpactReview: false,
    };
  }

  const report = input.workspaceImpactReport;
  const impactArtifactPresent = Boolean(report?.summary);
  const selectedProjectName = input.selectedProjectPath
    ? path.basename(input.selectedProjectPath)
    : undefined;
  const npmImpactNames = (report?.affectedProjects ?? [])
    .map((entry) => entry.project?.name?.trim())
    .filter((name): name is string => Boolean(name));
  const npmImpactMatchesProject =
    !selectedProjectName ||
    npmImpactNames.length === 0 ||
    npmImpactNames.some((name) => name === selectedProjectName);

  const useNpmImpactReview =
    impactArtifactPresent &&
    Boolean(input.selectedProjectPath) &&
    npmImpactMatchesProject &&
    (isProjectScopedMutationAction(input.actionType) || input.requiresImpactReview);

  if (useNpmImpactReview && !input.c07ScopeBlocked) {
    const affectedFromNpm = (report?.affectedProjects ?? [])
      .flatMap((entry) => {
        if (
          selectedProjectName &&
          entry.project?.name &&
          entry.project.name !== selectedProjectName
        ) {
          return [];
        }
        return entry.project?.path ? [entry.project.path] : [];
      })
      .filter((entry): entry is string => Boolean(entry));

    return {
      scopeKnown: true,
      scopeSource: 'npm-impact',
      supplementalAffectedFiles: affectedFromNpm,
      useNpmImpactReview: true,
    };
  }

  return {
    scopeKnown: false,
    scopeSource: 'none',
    supplementalAffectedFiles: [],
    useNpmImpactReview: false,
  };
}

export function filterScopeBlockedReasons(
  blockedReasons: string[],
  scopeEvidence: IncidentScopeEvidenceResult
): string[] {
  if (!scopeEvidence.scopeKnown) {
    return blockedReasons;
  }

  return blockedReasons.filter(
    (reason) =>
      !/scope is unknown|affected scope is unknown while impact review is required/i.test(reason)
  );
}

export function boostConfidenceForResolvedScope(
  confidence: number,
  scopeEvidence: IncidentScopeEvidenceResult,
  requiresImpactReview: boolean
): number {
  if (!scopeEvidence.scopeKnown || scopeEvidence.scopeSource === 'graph') {
    return confidence;
  }

  const floor = requiresImpactReview ? 68 : 55;
  return Math.max(confidence, floor);
}

export function resolveScopeSeedFilePaths(input: {
  selectedProjectPath?: string;
  explicitScopeFilePaths: string[];
}): string[] {
  const explicitPaths = input.explicitScopeFilePaths
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (!input.selectedProjectPath) {
    return explicitPaths;
  }

  const resolvedExplicit = explicitPaths.map((entry) =>
    normalizeProjectRelativePath(input.selectedProjectPath as string, entry)
  );

  return Array.from(new Set(resolvedExplicit));
}
