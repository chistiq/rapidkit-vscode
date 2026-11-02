import path from 'node:path';
import os from 'node:os';

/** Resolve documented scope aliases, never arbitrary environment variables. */
export function resolveStudioScopePath(
  context: { workspacePath: string; projectPath?: string },
  candidate = '.'
): string {
  for (const [alias, root] of [
    ['$WORKSPACE', context.workspacePath],
    ['$PROJECT', context.projectPath],
  ] as const) {
    if (
      candidate === alias ||
      candidate.startsWith(`${alias}/`) ||
      candidate.startsWith(`${alias}\\`)
    ) {
      if (!root) {
        throw new Error(`${alias} is not selected. Use a workspace-relative directory.`);
      }
      return path.resolve(root, candidate.slice(alias.length).replace(/^[\\/]+/, '') || '.');
    }
  }
  if (candidate.includes('$LOCAL_PATH') || candidate.includes('$EXTERNAL_PATH')) {
    throw new Error(
      'A redacted display path is not an executable directory. Use a relative path or the owned workspace target.'
    );
  }
  if (candidate.startsWith('~/') || candidate.startsWith('~\\')) {
    return path.resolve(os.homedir(), candidate.slice(2));
  }
  return path.resolve(context.projectPath ?? context.workspacePath, candidate);
}
