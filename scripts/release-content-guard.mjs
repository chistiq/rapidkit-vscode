// Report locations and categories only; never include credential contents.
export function findReleaseContentViolations(content, file) {
  const patterns = [
    ['private-key', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g],
    ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{50,255})\b/g],
    ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/g],
    ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,200}\b/g],
    ['provider-token', /\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{40,255}\b/g],
    ['credentialed-url', /\b(?:https?|ftp):\/\/[^\s/@:]+:[^\s/@]+@/g],
  ];
  return patterns.flatMap(([kind, pattern]) =>
    [...content.matchAll(pattern)].map((match) => ({
      file,
      line: content.slice(0, match.index).split('\n').length,
      kind,
    }))
  );
}

export function isPrivateReleaseFile(file) {
  const name = file.replace(/\\/g, '/').replace(/^extension\//, '');
  return (
    /^(?:review-artifacts|\.agents|\.codex|\.claude|\.cursor|\.idea|\.workspai|\.rapidkit|\.workspai-runtime-packaging-stash)\//.test(
      name
    ) ||
    /^(?:media\/README\.md$|media\/screenshots\/archive\/|(?:CONTRIBUTING|AGENTS|BUILD_SUMMARY|READY_TO_TEST)\.md$)/.test(
      name
    ) ||
    /^(?:\.mcp\.json|\.DS_Store)$/.test(name) ||
    /(?:^|\/)(?:\.env(?:\.[^/]+)?|\.npmrc|\.netrc|id_rsa|id_ed25519|credentials\.json|\.workspai-cli-local\.json)$/.test(
      name
    ) ||
    /\.(?:pem|key|p12|pfx|vsix)$/i.test(name)
  );
}
