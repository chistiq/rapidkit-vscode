const ABSOLUTE_PATH_PATTERN =
  /(^|[\s"'`(])((?:~|\/(?:home|Users|tmp|private|var|opt|mnt|Volumes|workspace|workspaces)[^\s"'`)]+|[A-Za-z]:\\[^\s"'`)]+))/g;

function compactAbsolutePath(pathText: string, keepSegments = 3): string {
  const normalized = pathText.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= keepSegments) {
    return normalized;
  }
  return `.../${parts.slice(-keepSegments).join('/')}`;
}

export function compactStudioPathText(
  value: string | null | undefined,
  options: { keepSegments?: number } = {}
): string {
  if (!value) {
    return '';
  }
  const keepSegments = Math.max(1, options.keepSegments ?? 3);
  return value.replace(ABSOLUTE_PATH_PATTERN, (_match, prefix: string, pathText: string) => {
    return `${prefix}${compactAbsolutePath(pathText, keepSegments)}`;
  });
}
