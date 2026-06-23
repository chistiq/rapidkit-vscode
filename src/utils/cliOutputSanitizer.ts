/** Strip ANSI color / emphasis codes from CLI output shown in UI. */
export function stripAnsi(text: string): string {
  const esc = String.fromCharCode(27);
  const pattern = new RegExp(`${esc}(?:[@-Z\\-_]|\\[[0-?]*[ -/]*[@-~])`, 'g');
  return text.replace(pattern, '');
}

/** Normalize whitespace and remove ANSI for doctor / system-check lines. */
export function sanitizeToolCheckMessage(raw: string): string {
  return stripAnsi(raw).replace(/\s+/g, ' ').trim();
}

/** Extract semver from `rapidkit --version` banners like "RapidKit Version v0.35.0". */
export function normalizeRapidkitNpmVersion(raw: string): string {
  const cleaned = sanitizeToolCheckMessage(raw);
  const semverMatch = cleaned.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/);
  if (semverMatch) {
    return semverMatch[1];
  }
  return cleaned
    .replace(/^RapidKit\s+Version\s+/i, '')
    .replace(/^v+/i, '')
    .trim();
}

export function formatRapidkitNpmVersionLabel(version: string): string {
  const normalized = normalizeRapidkitNpmVersion(version);
  return normalized ? `v${normalized}` : 'unknown';
}
