import fs from 'fs-extra';

export type StudioWorkspaceAvailability = {
  status: 'available' | 'missing' | 'not-directory' | 'inaccessible';
  reason?: string;
};
export async function inspectStudioWorkspaceAvailability(
  root: string
): Promise<StudioWorkspaceAvailability> {
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      return {
        status: 'not-directory',
        reason: 'The selected filesystem scope is not a directory.',
      };
    }
    await fs.access(root, fs.constants.R_OK | fs.constants.X_OK);
    return { status: 'available' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      status: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'inaccessible',
      reason:
        code === 'ENOENT' || code === 'ENOTDIR'
          ? 'The selected filesystem scope no longer exists.'
          : `The selected filesystem scope could not be accessed (${code ?? 'unknown error'}).`,
    };
  }
}
export function studioWorkspaceUnavailableMessage(state: StudioWorkspaceAvailability): string {
  return `${state.reason} This is not an empty workspace. For an existing-project task, select its actual location; for new software, the model can choose an independent managed workspace with create-workspace or select an existing managed destination with bind-workspace. CLI architecture/catalog inspection and other independent tools remain available. Do not create files in a missing scope or diagnose redaction tokens as literal paths.`;
}
export async function requireStudioWorkspaceDirectory(root: string): Promise<void> {
  const state = await inspectStudioWorkspaceAvailability(root);
  if (state.status !== 'available') {
    throw new Error(studioWorkspaceUnavailableMessage(state));
  }
}

/** Read-only CLI help/inventory does not depend on the selected project existing. */
export async function resolveStudioCliInspectionCwd(
  candidates: Array<string | undefined>
): Promise<string> {
  for (const root of candidates) {
    if (root && (await inspectStudioWorkspaceAvailability(root)).status === 'available') {
      return root;
    }
  }
  throw new Error(
    'No accessible directory is available for CLI inspection. Bundled architecture knowledge remains available.'
  );
}
