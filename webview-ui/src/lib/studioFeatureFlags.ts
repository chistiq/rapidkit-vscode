/**
 * Feature flags for Studio UI versions.
 * Enterprise default: vNext. Legacy remains available only as a fallback.
 */

export type StudioUIVersion = 'legacy' | 'vnext';

const STORAGE_KEY = 'incident-studio-ui-version';

/**
 * Read feature flag from localStorage. Defaults to vNext for the production Studio path.
 */
export function getStudioUIVersion(): StudioUIVersion {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'vnext' || stored === 'legacy') {
      return stored;
    }
  }
  return 'vnext';
}

/**
 * Set feature flag.
 */
export function setStudioUIVersion(version: StudioUIVersion): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(STORAGE_KEY, version);
  }
}

/**
 * vNext UI is the default production Studio unless explicitly forced to legacy.
 */
export function isStudioVNextEnabled(): boolean {
  return getStudioUIVersion() === 'vnext';
}
