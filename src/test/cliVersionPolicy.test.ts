import { describe, expect, it } from 'vitest';

import {
  assessCliVersion,
  compareSemver,
  formatCliVersionMismatchMessage,
  isCliVersionCompatible,
  MIN_RAPIDKIT_CLI_VERSION,
  parseSemver,
} from '../core/cliVersionPolicy';

describe('cliVersionPolicy', () => {
  describe('parseSemver', () => {
    it('parses plain and prefixed semver', () => {
      expect(parseSemver('0.38.0')).toEqual({ major: 0, minor: 38, patch: 0, prerelease: [] });
      expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    });

    it('parses prerelease and ignores build metadata', () => {
      expect(parseSemver('0.39.0-rc.1')).toEqual({
        major: 0,
        minor: 39,
        patch: 0,
        prerelease: ['rc', '1'],
      });
      expect(parseSemver('0.39.0+build.5')?.prerelease).toEqual([]);
    });

    it('returns null for invalid input', () => {
      expect(parseSemver('not-a-version')).toBeNull();
      expect(parseSemver('')).toBeNull();
      expect(parseSemver(null)).toBeNull();
    });
  });

  describe('compareSemver', () => {
    it('orders by major/minor/patch', () => {
      expect(compareSemver('0.38.0', '0.38.1')).toBe(-1);
      expect(compareSemver('0.39.0', '0.38.9')).toBe(1);
      expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    });

    it('treats a prerelease as lower precedence than its release', () => {
      expect(compareSemver('0.38.0-rc.1', '0.38.0')).toBe(-1);
      expect(compareSemver('0.38.0', '0.38.0-rc.1')).toBe(1);
      expect(compareSemver('0.38.0-rc.1', '0.38.0-rc.2')).toBe(-1);
    });

    it('sorts unparseable versions last', () => {
      expect(compareSemver('bad', '0.1.0')).toBe(-1);
      expect(compareSemver('0.1.0', 'bad')).toBe(1);
    });
  });

  describe('assessCliVersion', () => {
    it('flags versions below the minimum', () => {
      const result = assessCliVersion('0.37.9');
      expect(result.status).toBe('below-minimum');
      expect(result.reason).toBe('below-minimum');
      expect(result.minimumVersion).toBe(MIN_RAPIDKIT_CLI_VERSION);
    });

    it('accepts the exact minimum and newer versions', () => {
      expect(assessCliVersion(MIN_RAPIDKIT_CLI_VERSION).status).toBe('compatible');
      expect(assessCliVersion('0.99.0').status).toBe('compatible');
      expect(isCliVersionCompatible('1.0.0')).toBe(true);
    });

    it('reports missing and unparseable versions as unknown', () => {
      expect(assessCliVersion(null).reason).toBe('missing');
      expect(assessCliVersion('').reason).toBe('missing');
      expect(assessCliVersion('garbage').reason).toBe('unparseable');
      expect(isCliVersionCompatible(null)).toBe(false);
    });
  });

  describe('formatCliVersionMismatchMessage', () => {
    it('produces actionable copy for mismatches and empty string when compatible', () => {
      expect(formatCliVersionMismatchMessage(assessCliVersion('0.1.0'))).toContain(
        MIN_RAPIDKIT_CLI_VERSION
      );
      expect(formatCliVersionMismatchMessage(assessCliVersion(null))).toContain('detect');
      expect(formatCliVersionMismatchMessage(assessCliVersion('2.0.0'))).toBe('');
    });
  });
});
