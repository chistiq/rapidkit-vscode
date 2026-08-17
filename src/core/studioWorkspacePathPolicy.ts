const PORTABLE_SEPARATORS = /\\/g;

const SENSITIVE_OR_GENERATED_SEGMENT =
  /(?:^|\/)(?:\.git|node_modules|vendor|dist|build|coverage|\.env(?:\.|$)|\.npmrc$|\.pypirc$|[^/]*(?:secret|credential)[^/]*)(?:\/|$)/i;

const WORKSPAI_CONTROL_PLANE =
  /(?:^|\/)(?:\.workspai|\.rapidkit)\/(?:reports|repair|cache|snapshots|transactions|goals)(?:\/|$)/i;

const WORKSPAI_CANONICAL_STATE =
  /(?:^|\/)(?:\.workspai|\.rapidkit)\/(?:workspace(?:\.contract)?\.json|workspace-registry\.v1\.json|project\.json|registry\.json|adopt-readiness\.json)(?:$|\/)/i;

export function normalizeStudioWorkspaceRelativePath(value: string): string {
  return value.trim().replace(PORTABLE_SEPARATORS, '/').replace(/^\.\//, '');
}

/**
 * Paths that can never be treated as model-owned source. They are either
 * sensitive build material or canonical Workspai control-plane state. The
 * same predicate is shared by inspect, write, and delete authorization so an
 * earlier read can never bypass a later mutation boundary.
 */
export function studioSourcePathDenialReason(value: string): string | undefined {
  const normalized = normalizeStudioWorkspaceRelativePath(value);
  if (!normalized || normalized === '.') {
    return 'the workspace root is not a source file';
  }
  if (SENSITIVE_OR_GENERATED_SEGMENT.test(normalized)) {
    return 'the path is generated, dependency-owned, build output, or sensitive';
  }
  if (WORKSPAI_CONTROL_PLANE.test(normalized)) {
    return 'Workspai control-plane evidence is CLI-owned';
  }
  if (WORKSPAI_CANONICAL_STATE.test(normalized)) {
    return 'canonical Workspai state is CLI-owned';
  }
  return undefined;
}

export function isStudioModelOwnedSourcePath(value: string): boolean {
  return studioSourcePathDenialReason(value) === undefined;
}
