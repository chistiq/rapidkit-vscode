/**
 * Workspai CLI version compatibility policy.
 *
 * Workspai bundles versioned contracts (`contracts/*.json`) and consumes the
 * CLI's machine-readable capability and log-event surfaces. Published schema
 * identities are synced from the CLI, while the minimum CLI version floor is
 * owned by `extension-cli-release-policy.v1.json`. This keeps schema parity
 * strict without coupling the CLI and extension release cycles.
 *
 * This module is the pure foundation (constant + side-effect-free comparison).
 * The runtime banner/gate that surfaces a mismatch to the user lives in the
 * version gate work (roadmap item 2.3).
 */

import { MIN_RAPIDKIT_CLI_VERSION } from './cliVersionCompatibilityContract.js';

export { MIN_RAPIDKIT_CLI_VERSION };

export type CliVersionCompatibility = 'compatible' | 'below-minimum' | 'unknown';

export type CliVersionMismatchReason = 'ok' | 'below-minimum' | 'unparseable' | 'missing';

export type CliVersionAssessment = {
  status: CliVersionCompatibility;
  detectedVersion: string | null;
  minimumVersion: string;
  /** Stable id for telemetry and UX messaging. */
  reason: CliVersionMismatchReason;
};

type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

/** Parse a normalized semver string (e.g. `0.38.0`, `0.39.0-rc.1`). */
export function parseSemver(value: string | null | undefined): ParsedSemver | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().replace(/^v+/i, '');
  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  // Per semver: a version without a prerelease has higher precedence than one with.
  if (a.length === 0 && b.length === 0) {
    return 0;
  }
  if (a.length === 0) {
    return 1;
  }
  if (b.length === 0) {
    return -1;
  }

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a[index];
    const bPart = b[index];
    if (aPart === undefined) {
      return -1;
    }
    if (bPart === undefined) {
      return 1;
    }
    if (aPart === bPart) {
      continue;
    }

    const aNum = /^\d+$/.test(aPart);
    const bNum = /^\d+$/.test(bPart);
    if (aNum && bNum) {
      const diff = Number.parseInt(aPart, 10) - Number.parseInt(bPart, 10);
      if (diff !== 0) {
        return diff < 0 ? -1 : 1;
      }
      continue;
    }
    // Numeric identifiers always have lower precedence than non-numeric.
    if (aNum) {
      return -1;
    }
    if (bNum) {
      return 1;
    }
    return aPart < bPart ? -1 : 1;
  }
  return 0;
}

/** Compare two semver strings. Returns -1, 0, or 1. Unparseable inputs sort last. */
export function compareSemver(a: string | null | undefined, b: string | null | undefined): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (!parsedA && !parsedB) {
    return 0;
  }
  if (!parsedA) {
    return -1;
  }
  if (!parsedB) {
    return 1;
  }

  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }
  return comparePrerelease(parsedA.prerelease, parsedB.prerelease);
}

/**
 * Assess a detected CLI version against {@link MIN_RAPIDKIT_CLI_VERSION}.
 * Pure function — callers decide how to surface the result.
 */
export function assessCliVersion(detectedVersion: string | null): CliVersionAssessment {
  const base = { detectedVersion, minimumVersion: MIN_RAPIDKIT_CLI_VERSION };

  if (detectedVersion === null || detectedVersion.trim() === '') {
    return { ...base, status: 'unknown', reason: 'missing' };
  }
  if (!parseSemver(detectedVersion)) {
    return { ...base, status: 'unknown', reason: 'unparseable' };
  }
  if (compareSemver(detectedVersion, MIN_RAPIDKIT_CLI_VERSION) < 0) {
    return { ...base, status: 'below-minimum', reason: 'below-minimum' };
  }
  return { ...base, status: 'compatible', reason: 'ok' };
}

export function isCliVersionCompatible(detectedVersion: string | null): boolean {
  return assessCliVersion(detectedVersion).status === 'compatible';
}

/** Human-readable mismatch message for banners/logs. Empty string when compatible. */
export function formatCliVersionMismatchMessage(assessment: CliVersionAssessment): string {
  switch (assessment.reason) {
    case 'below-minimum':
      return `The linked Workspai CLI (v${assessment.detectedVersion}) is older than the minimum supported version (v${assessment.minimumVersion}). Update with \`npm i -g workspai@latest\` (or re-link the local package) and reload the window.`;
    case 'missing':
      return `Could not detect the Workspai CLI version. Install or link workspai (minimum v${assessment.minimumVersion}) and reload the window.`;
    case 'unparseable':
      return `Could not parse the Workspai CLI version "${assessment.detectedVersion}". Workspai requires at least v${assessment.minimumVersion}.`;
    case 'ok':
    default:
      return '';
  }
}
