import { describe, expect, it } from 'vitest';

import {
  formatRapidkitNpmVersionLabel,
  normalizeRapidkitNpmVersion,
  sanitizeToolCheckMessage,
  stripAnsi,
} from '../utils/cliOutputSanitizer';

describe('cliOutputSanitizer', () => {
  it('strips ANSI codes from tool output', () => {
    expect(stripAnsi('\x1B[1mApache Maven 3.9.9\x1B[m')).toBe('Apache Maven 3.9.9');
  });

  it('normalizes rapidkit --version banners to semver', () => {
    expect(normalizeRapidkitNpmVersion('RapidKit Version v0.5.4')).toBe('0.5.4');
    expect(formatRapidkitNpmVersionLabel('RapidKit Version v0.5.4')).toBe('v0.5.4');
  });

  it('sanitizes maven lines for system check output', () => {
    expect(sanitizeToolCheckMessage('\x1B[1mApache Maven 3.9.9\x1B[m')).toBe('Apache Maven 3.9.9');
  });
});
