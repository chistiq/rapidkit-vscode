/**
 * Scaffold vs release-blocker semantics for empty workspaces — extension evidence bridge.
 * Keep patterns aligned with rapidkit-npm/src/workspace-scaffold.ts.
 */

export function isEmptyWorkspaceScaffoldBlocker(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    lower.includes('corrupt artifact') ||
    lower.includes('artifact is unreadable') ||
    lower.includes('artifact read error')
  ) {
    return false;
  }
  return (
    lower.includes('stale') ||
    lower.includes('missing evidence') ||
    lower.includes('missing required report') ||
    lower.includes('agents.md not synced') ||
    lower.includes('no projects') ||
    lower.includes('projects.empty') ||
    lower.includes('projects discovered') ||
    lower.includes('projects.missing') ||
    lower.includes('not yet run') ||
    lower.includes('doctor-last-run') ||
    lower.includes('pipeline-last-run') ||
    lower.includes('release-readiness') ||
    lower.includes('analyze-last-run') ||
    lower.includes('analyze reported') ||
    lower.includes('analyze verdict') ||
    lower.includes('analyze needs attention') ||
    lower.includes('toolchain.lock') ||
    lower.includes('not pinned') ||
    lower.includes('readiness:') ||
    lower.includes('env:') ||
    lower.includes('workspace-run-last') ||
    lower.includes('pre-project') ||
    lower.includes('before adding projects') ||
    lower.includes('workspace.projects.missing') ||
    lower.includes('no backend projects') ||
    lower.includes('index.json') ||
    lower.includes('workspace-intelligence-history') ||
    lower.includes('validation warning') ||
    lower.includes('workspace model validation') ||
    lower.includes('workspace.marker') ||
    lower.includes('no project roots') ||
    lower.includes('no infrastructure services') ||
    lower.includes('infra/overrides') ||
    lower.includes('infra dependencies') ||
    lower.includes('contract verify') ||
    lower.includes('contract inspect') ||
    lower.includes('publish verify evidence')
  );
}

export function filterEmptyWorkspaceScaffoldBlockers(blockers: string[]): string[] {
  return blockers.filter((blocker) => !isEmptyWorkspaceScaffoldBlocker(blocker));
}

export function areScaffoldOnlyBlockers(blockers: string[]): boolean {
  return (
    blockers.length === 0 || blockers.every((blocker) => isEmptyWorkspaceScaffoldBlocker(blocker))
  );
}

export function filterBlockersForEmptyWorkspace(
  workspaceProjectCount: number,
  blockers: string[]
): string[] {
  if (workspaceProjectCount > 0) {
    return blockers;
  }
  return filterEmptyWorkspaceScaffoldBlockers(blockers);
}

export function cardCountsAsReleaseBlocker(input: {
  status: string;
  blockers: string[];
  workspaceProjectCount: number;
}): boolean {
  const effectiveBlockers = filterBlockersForEmptyWorkspace(
    input.workspaceProjectCount,
    input.blockers
  );
  if (input.workspaceProjectCount === 0) {
    return effectiveBlockers.length > 0;
  }
  if (input.status === 'fail') {
    return true;
  }
  return effectiveBlockers.length > 0;
}
