/**
 * Classify blockers that describe an observed dependency-security failure.
 * Missing audit tooling is a governance/tooling gap, not proof that the
 * dependency tree is vulnerable, and must stay on the contract repair path.
 */
export function isDependencySecurityBlocker(blocker: string): boolean {
  const normalized = blocker.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    /(?:no|missing|without)\b[^.]*\b(?:security|dependency)?\s*audit\b[^.]*\b(?:tool|tooling|command|script|marker|surface)/i.test(
      normalized
    )
  ) {
    return false;
  }

  if (/\bvulnerabilit(?:y|ies)\b/i.test(normalized)) {
    return true;
  }

  return (
    /\b(?:dependency|package)\s+(?:security\s+)?audit\s+(?:failed|blocked|reported|found)/i.test(
      normalized
    ) ||
    /\b(?:npm|pnpm|yarn|bun|pip|poetry|cargo|composer|bundle|dotnet|go)\s+audit\b[^.]*\b(?:failed|advisory|advisories)/i.test(
      normalized
    )
  );
}
