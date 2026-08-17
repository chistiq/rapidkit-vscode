const ABSOLUTE_PATH_PATTERN =
  /(^|[\s"'`(=])((?:file:\/\/)?(?:~|\/(?:home|Users|tmp|private|var|opt|mnt|Volumes|workspace|workspaces)[^\s"'`),;]*|[A-Za-z]:[\\/][^\s"'`),;]*))/gi;
const TRAVERSAL_PATH_PATTERN = /(^|[\s"'`(=])((?:\.\.[\\/])+[^\s"'`),;]*)/g;

export function compactStudioPathText(
  value: string | null | undefined,
  _options: { keepSegments?: number } = {}
): string {
  if (!value) {
    return '';
  }
  return value
    .replace(ABSOLUTE_PATH_PATTERN, (_match, prefix: string) => `${prefix}$LOCAL_PATH`)
    .replace(TRAVERSAL_PATH_PATTERN, (_match, prefix: string) => `${prefix}$EXTERNAL_PATH`);
}
