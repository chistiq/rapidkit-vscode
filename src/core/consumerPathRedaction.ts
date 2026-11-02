/**
 * Fail-closed host-path redaction for text leaving the extension host.
 * Logical project-relative and `.workspai` artifact paths remain useful while
 * machine identity is replaced with stable consumer tokens.
 */
export function redactLocalPathsForConsumer(value: string): string {
  return value
    .replace(/file:\/\/\/?(?:[A-Za-z]:)?[^\s"'`),;]+/gi, '$LOCAL_PATH')
    .replace(/\b[A-Za-z]:[\\/][^\s"'`),;]+/g, '$LOCAL_PATH')
    .replace(/(^|[\s"'`(=])\/(?!\/)[^\s"'`),;]+/g, '$1$LOCAL_PATH')
    .replace(/(?:\.\.[\\/]){1,}[^\s"'`),;]+/g, '$EXTERNAL_PATH');
}

/** Paths actually supplied by the user, never inferred from tool output or attachments. */
export function collectAssistantUserPaths(value: string): string[] {
  const result = new Set<string>();
  const add = (candidate: string) => {
    if (candidate.length > 1 && candidate.length <= 4000 && !/[\0\r\n]/.test(candidate)) {
      result.add(candidate);
    }
  };
  const unquoted = value.replace(
    /(["'`])((?:\/(?!\/)|[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|[A-Za-z0-9_.-]+[\\/])[^"'`\r\n]+?)\1/g,
    (_match, _quote: string, candidate: string) => {
      add(candidate);
      return ' ';
    }
  );
  for (const match of unquoted.matchAll(
    /(?:^|[\s(=])((?:\/(?!\/)|[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|[A-Za-z0-9_.-]+[\\/])[^\s"'`<>),;]+)/g
  )) {
    add(match[1].replace(/[.!?:]+$/, ''));
  }
  return [...result].slice(0, 64);
}

/** Preserve explicit user destinations; other host paths retain fail-closed redaction. */
export function redactAssistantRequestForConsumer(
  value: string,
  userPaths: readonly string[] = []
): string {
  let protectedValue = value;
  const saved: Array<{ token: string; path: string }> = [];
  let prefix = '__WORKSPAI_USER_PATH_';
  while (value.includes(prefix)) {
    prefix = `_${prefix}`;
  }
  for (const localPath of [...userPaths]
    .filter((entry) => typeof entry === 'string' && entry.length > 1 && entry.length <= 4000)
    .sort((a, b) => b.length - a.length)
    .slice(0, 64)) {
    const token = `${prefix}${saved.length}__`;
    const matcher = new RegExp(`${escapeRegExp(localPath)}(?=$|[\\s"'\x60<>),;:/\\\\])`, 'g');
    protectedValue = protectedValue.replace(matcher, () => token);
    saved.push({ token, path: localPath });
  }
  let output = redactLocalPathsForConsumer(
    protectedValue.replace(
      /(?:~|[A-Za-z]:)?[\\/](?:[^\s"'`<>]*[\\/])?\.workspai[\\/]workspaces[\\/]([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?=[\\/\s"'`<>.,;:]|$)(?:[\\/]([^\s"'`<>.,;:]+))?/gi,
      (_match, name: string, relative: string | undefined) =>
        `managed workspace "${name}"${relative ? `, relative path "${relative.replace(/\\/g, '/')}"` : ''}`
    )
  );
  for (const entry of saved) {
    output = output.replaceAll(entry.token, entry.path);
  }
  return output;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace exact runtime roots before text is sent to a model provider. Unlike
 * the broad artifact redactor, this preserves legitimate route names such as
 * `/api/health` while removing the host identities known for this session.
 */
export function redactKnownRuntimePathsForConsumer(
  value: string,
  identities: ReadonlyArray<{ path?: string; token: '$WORKSPACE' | '$PROJECT' | '$LOCAL_PATH' }>
): string {
  const candidates = identities
    .flatMap((identity) => {
      const localPath = identity.path?.trim();
      if (!localPath) {
        return [];
      }
      const variants = new Set([
        localPath,
        localPath.replace(/\\/g, '/'),
        localPath.replace(/\//g, '\\'),
      ]);
      return [...variants].map((variant) => ({
        value: variant.replace(/[\\/]+$/, ''),
        token: identity.token,
      }));
    })
    .filter((entry) => entry.value.length > 1)
    .sort((left, right) => right.value.length - left.value.length);

  let redacted = value;
  for (const candidate of candidates) {
    redacted = redacted.replace(new RegExp(escapeRegExp(candidate.value), 'g'), candidate.token);
  }
  return redacted;
}
