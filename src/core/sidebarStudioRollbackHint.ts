export function buildSidebarPatchRollbackHint(appliedPaths: string[]): string | null {
  const paths = appliedPaths
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (paths.length === 0) {
    return null;
  }
  return `git checkout -- ${paths.map((entry) => `"${entry}"`).join(' ')}`;
}

export function collectAppliedPatchPaths(
  appliedFixes: Array<{ path?: string; action?: string; outcome?: string }> | undefined
): string[] {
  if (!appliedFixes?.length) {
    return [];
  }
  return appliedFixes
    .filter(
      (entry) =>
        entry.outcome === 'applied' &&
        (entry.action === 'apply-debug-patch' ||
          entry.action === 'file-create' ||
          entry.action === 'file-append' ||
          entry.action === 'file-copy' ||
          entry.action === 'package-json-script' ||
          entry.action === 'json-edit' ||
          entry.action === 'env-key-add' ||
          entry.action === 'makefile-target') &&
        typeof entry.path === 'string' &&
        entry.path.trim().length > 0
    )
    .map((entry) => entry.path!.trim());
}
