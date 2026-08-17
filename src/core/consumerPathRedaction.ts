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
